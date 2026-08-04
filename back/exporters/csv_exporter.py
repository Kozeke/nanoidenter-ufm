# Coordinates CSV export responsibilities across raw dumps, averaged curves, and scatter datasets for SoftMech-compatible tooling.
import csv
from typing import Dict, Any, List, Optional, Tuple
import logging
import duckdb
import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import savgol_filter
from .base import Exporter
from filters.calculate_elasticity import calc_elspectra
# Canonicalizes DB segment_type values ("approach"/"retract"/etc.) to segment0/segment1
# so raw exports can group and order columns consistently regardless of import source.
from segment_utils import normalize_segment_type

logger = logging.getLogger(__name__)

class CSVExporter(Exporter):
    def validate_params(self, data: Dict[str, Any]) -> None:
        # Enhanced CSV-specific validations for SoftMech-style export
        if "export_path" not in data or not isinstance(data["export_path"], str) or not data["export_path"].strip():
            raise ValueError("export_path must be a non-empty string")
        
        export_type = data.get("export_type", "raw")
        if export_type == "raw":
            # Captures provided export metadata supporting legacy `metadata` and new `softmech_metadata` payloads.
            metadata_payload = data.get("metadata") or data.get("softmech_metadata")
            if not isinstance(metadata_payload, dict):
                raise ValueError("metadata must be provided as a dictionary for raw exports")
        
        if export_type not in ["raw", "average", "scatter"]:
            raise ValueError("export_type must be one of: raw, average, scatter")
        
        if export_type == "average":
            dataset_type = data.get("dataset_type", "Force")
            if dataset_type not in ["Force", "Elasticity", "El from F"]:
                raise ValueError("dataset_type must be one of: Force, Elasticity, El from F")

    def export(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        export_type = kwargs.get("export_type", "raw")
        if export_type == "average":
            return self._export_average_curves(db_path, output_path, curve_ids, **kwargs)
        elif export_type == "scatter":
            return self._export_scatter_data(db_path, output_path, curve_ids, **kwargs)
        else:
            return self._export_raw_data(db_path, output_path, curve_ids, **kwargs)

    # ---------- RAW ----------

    def _export_raw_data(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        """Export raw curve data (original functionality)"""
        # Prevent exporter crash if underlying DuckDB access or file IO fails during raw dump.
        # Prevent exporter crash if curve aggregation or downstream file handling encounters invalid data.
        try:
            # curve_id is only unique per dataset (PK is dataset_id + curve_id + segment_type),
            # so without this filter "curve0" from one dataset can pull in "curve0" rows that
            # belong to a completely different dataset. Scoping by dataset_id keeps the export
            # limited to the dataset the user is currently working with.
            dataset_id = kwargs.get("dataset_id")
            with duckdb.connect(db_path) as conn:
                # Captures table schema to keep exports compatible with legacy databases.
                schema_columns = {row[0] for row in conn.execute("DESCRIBE force_vs_z").fetchall()}
                # Selects velocity only when present, otherwise provides a typed NULL placeholder.
                velocity_projection = "velocity" if "velocity" in schema_columns else "CAST(NULL AS DOUBLE)"
                query = """
                    SELECT curve_id, file_id, date, spring_constant,
                           tip_geometry, tip_radius, segment_type, force_values AS deflection,
                           z_values AS z_sensor, {velocity_projection} AS velocity
                    FROM force_vs_z
                """.format(velocity_projection=velocity_projection)
                conditions = []
                params: List[Any] = []
                if dataset_id is not None:
                    conditions.append("dataset_id = ?")
                    params.append(dataset_id)
                if curve_ids:
                    # Frontend passes curve_ids with "curve" prefix (e.g. "curve0", "curve1"),
                    # but the database stores just numeric IDs (0, 1, 2, ...). Strip the
                    # prefix to match the database format, or convert to int if already
                    # numeric. This ensures the WHERE IN clause actually matches.
                    db_curve_ids = []
                    for cid in curve_ids:
                        cid_str = str(cid)
                        if cid_str.startswith("curve"):
                            db_curve_ids.append(int(cid_str[5:]))  # Remove "curve" prefix
                        else:
                            try:
                                db_curve_ids.append(int(cid_str))
                            except ValueError:
                                # Fallback: keep as-is if not convertible (shouldn't happen)
                                db_curve_ids.append(cid_str)
                    conditions.append("curve_id IN ({})".format(",".join("?" for _ in db_curve_ids)))
                    params.extend(db_curve_ids)
                if conditions:
                    query += " WHERE " + " AND ".join(conditions)
                # Orders rows so segment0 (approach) is grouped ahead of segment1 (retract)
                # per curve, matching the side-by-side column layout written below.
                query += " ORDER BY curve_id, segment_type"

                results = conn.execute(query, params).fetchall()
                if not results:
                    logger.error("No curves found in database")
                    raise ValueError("No curves found in database")

            # Groups rows by curve_id so a curve's segment0 (approach) and segment1
            # (retract) data can be written side by side in one block instead of as
            # two separate stacked blocks.
            curves_by_id: Dict[Any, Dict[str, Any]] = {}
            curve_order: List[Any] = []
            for row in results:
                (curve_id, file_id, date, spring_constant,
                 tip_geometry, tip_radius, segment_type, deflection, z_sensor,
                 velocity) = row
                canonical_segment = normalize_segment_type(segment_type)

                if curve_id not in curves_by_id:
                    curves_by_id[curve_id] = {"segments": {}}
                    curve_order.append(curve_id)
                entry = curves_by_id[curve_id]

                # segment0 metadata (or whichever segment is seen first) is used for the
                # curve-level metadata rows; all segments of one curve share this metadata.
                if canonical_segment == "segment0" or "file_id" not in entry:
                    entry["file_id"] = file_id
                    entry["date"] = date
                    entry["spring_constant"] = spring_constant
                    entry["tip_geometry"] = tip_geometry
                    entry["tip_radius"] = tip_radius
                    entry["velocity"] = velocity

                entry["segments"][canonical_segment] = {
                    "z_sensor": np.asarray(z_sensor) if z_sensor is not None else np.empty(0),
                    "deflection": np.asarray(deflection) if deflection is not None else np.empty(0),
                }

            with open(output_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)

                # ---- Single dataset-level metadata block ----
                # Written ONCE for the whole export (not per curve). Previously each
                # curve re-wrote file_id/date/spring_constant/tip_geometry/tip_radius/
                # velocity, which produced confusing duplicates (e.g. two different
                # "date" rows) whenever curves had slightly different DB metadata.
                # Represents request-level metadata combining legacy `metadata` and new `softmech_metadata`.
                metadata_payload = dict(kwargs.get("metadata") or kwargs.get("softmech_metadata") or {})
                # Uses the first curve's DB row to fill in any metadata field the
                # request payload didn't already provide (e.g. plain API callers that
                # only send a partial `metadata` dict), so the file still gets one
                # complete metadata block instead of none.
                first_entry = curves_by_id[curve_order[0]] if curve_order else {}
                for field in ("file_id", "date", "spring_constant", "tip_geometry", "tip_radius", "velocity"):
                    if metadata_payload.get(field) in (None, ""):
                        db_value = first_entry.get(field)
                        if db_value is not None:
                            metadata_payload[field] = db_value

                # Defines metadata keys that should not be written into CSV exports.
                blocked_metadata_keys = {"force_scale_to_n"}
                for key, value in metadata_payload.items():
                    # Skips internal calibration keys the user doesn't want in export metadata.
                    if key in blocked_metadata_keys:
                        continue
                    writer.writerow([key, value])
                
                # Add Young's modulus formatted value from websocket stats if available
                youngs_modulus_formatted = kwargs.get("youngs_modulus_formatted")
                if youngs_modulus_formatted:
                    writer.writerow(["youngs_modulus", youngs_modulus_formatted])

                # Add K_raw / K_contact / E computed by the LinearWindowFit regular filter,
                # if that filter was active and produced a value (see linear_window_fit_filter.py).
                k_raw_formatted = kwargs.get("k_raw_formatted")
                if k_raw_formatted:
                    writer.writerow(["k_raw", k_raw_formatted])
                k_contact_formatted = kwargs.get("k_contact_formatted")
                if k_contact_formatted:
                    writer.writerow(["k_contact", k_contact_formatted])
                stiffness_youngs_modulus_formatted = kwargs.get("stiffness_youngs_modulus_formatted")
                if stiffness_youngs_modulus_formatted:
                    writer.writerow(["youngs_modulus_linfit", stiffness_youngs_modulus_formatted])

                # Per-curve K_raw / K_contact / E (see LinearWindowFit filter /
                # process_and_stream_batch's kfit_by_curve), keyed by curve_id so each
                # curve's own block below can be given its own values, distinct from
                # the dataset-level average written above. Keys are normalized (the
                # "curve" prefix stripped) since the DB's curve_id and the websocket
                # stats' curve_id ("curve3" vs 3/"3") aren't guaranteed to match as-is.
                def _norm_curve_key(cid):
                    s = str(cid)
                    return s[len("curve"):] if s.startswith("curve") else s

                kfit_by_curve_lookup = {
                    _norm_curve_key(row.get("curve_id")): row
                    for row in (kwargs.get("kfit_by_curve") or [])
                    if row.get("curve_id") is not None
                }

                num_exported = 0
                for curve_id in curve_order:
                    entry = curves_by_id[curve_id]

                    # Only a lightweight curve marker is written per block. All other
                    # metadata (file_id, date, spring_constant, tip_geometry,
                    # tip_radius, velocity) is dataset-level and already written once
                    # in the metadata block above, not repeated for every curve.
                    writer.writerow(["curve_id", curve_id])

                    # This curve's own K_raw / K_contact / E (as opposed to the
                    # dataset-level mean ± std written once at the top of the file).
                    curve_kfit = kfit_by_curve_lookup.get(_norm_curve_key(curve_id))
                    if curve_kfit:
                        k_raw_val = curve_kfit.get("k_n_per_m")
                        if k_raw_val is not None:
                            writer.writerow(["k_raw", f"{float(k_raw_val):.6g} N/m"])
                        k_contact_val = curve_kfit.get("k_contact")
                        if k_contact_val is not None:
                            writer.writerow(["k_contact", f"{float(k_contact_val):.6g} N/m"])
                        e_val = curve_kfit.get("youngs_modulus_pa")
                        if e_val is not None:
                            writer.writerow(["youngs_modulus", f"{float(e_val):.6g} Pa"])

                    # Orders segment0 (approach) ahead of segment1 (retract), with any
                    # unrecognized segment types appended afterwards, so retract data is
                    # always written to the right of approach data for the same curve.
                    segment_order = [s for s in ("segment0", "segment1") if s in entry["segments"]]
                    segment_order += sorted(s for s in entry["segments"] if s not in ("segment0", "segment1"))

                    # Labels match the units actually stored in force_vs_z: Z is
                    # micrometers (µm) and Force is micronewtons (µN) — no SI
                    # conversion is applied on export (see hdf5.py ingest notes).
                    # Maps canonical segment ids to user-facing phase labels for CSV headers.
                    segment_label_map = {
                        "segment0": "indent",
                        "segment1": "retract",
                    }
                    header = ["index"]
                    for segment_name in segment_order:
                        # Chooses a readable label while preserving unknown segment names as-is.
                        display_segment_name = segment_label_map.get(segment_name, segment_name)
                        header += [f"Z {display_segment_name} (µm)", f"Force {display_segment_name} (µN)"]
                    writer.writerow(header)

                    segment_arrays = {}
                    segment_lengths = {}
                    for segment_name in segment_order:
                        z_arr = entry["segments"][segment_name]["z_sensor"]
                        f_arr = entry["segments"][segment_name]["deflection"]
                        seg_len = min(len(z_arr), len(f_arr))
                        segment_arrays[segment_name] = (z_arr, f_arr)
                        segment_lengths[segment_name] = seg_len

                    max_len = max(segment_lengths.values(), default=0)
                    if max_len:
                        if len(segment_order) == 1:
                            # Fast vectorized path for the common single-segment case
                            # (e.g. legacy CSV imports with only an approach segment).
                            segment_name = segment_order[0]
                            z_arr, f_arr = segment_arrays[segment_name]
                            seg_len = segment_lengths[segment_name]
                            idx = np.arange(seg_len)[:, None]
                            block = np.concatenate([idx, z_arr[:seg_len, None], f_arr[:seg_len, None]], axis=1)
                            np.savetxt(f, block, delimiter=",", fmt="%.17g")
                        else:
                            # Multiple segments (segment0 + segment1): write them side by
                            # side, padding the shorter segment's trailing rows with blanks.
                            for i in range(max_len):
                                data_row = [i]
                                for segment_name in segment_order:
                                    z_arr, f_arr = segment_arrays[segment_name]
                                    seg_len = segment_lengths[segment_name]
                                    if i < seg_len:
                                        data_row.append(f"{z_arr[i]:.17g}")
                                        data_row.append(f"{f_arr[i]:.17g}")
                                    else:
                                        data_row.append("")
                                        data_row.append("")
                                writer.writerow(data_row)
                    num_exported += 1

            logger.info(f"Exported {num_exported} raw curves to CSV file at {output_path}")
            return num_exported

        except Exception as e:
            logger.error(f"Failed to export raw data to CSV file {output_path}: {str(e)}")
            raise

    # ---------- AVERAGE ----------

    def _export_average_curves(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        """Export averaged curves with statistical analysis (SoftMech average exporter)"""
        # Prevent exporter crash if averaged curve aggregation or file IO encounters unexpected issues.
        try:
            dataset_type = kwargs.get("dataset_type", "Force")
            direction = kwargs.get("direction", "V")
            loose = kwargs.get("loose", 100)
            grid_points = kwargs.get("grid_points", 4096)  # cap to avoid huge resamples

            # filters from kwargs (passed from frontend)
            filters = kwargs.get("filters", {})
            regular_filters = filters.get("regular", {})
            cp_filters = filters.get("cp_filters", {})
            f_models = filters.get("f_models", {})
            e_models = filters.get("e_models", {})

            # Convert curve_ids to string format expected by fetch_curves_batch
            if curve_ids and len(curve_ids) > 0:
                if isinstance(curve_ids[0], str) and curve_ids[0].startswith('curve'):
                    curve_id_strings = curve_ids
                else:
                    curve_id_strings = [f"{cid}" for cid in curve_ids]
            else:
                # Prevent accidental full-table scans; remove if you want "all curves"
                raise ValueError("No curve_ids provided for average export to avoid full-table processing.")
            # curve_id_strings = curve_ids
            filters_config = {
                "regular": regular_filters,
                "cp_filters": cp_filters,
                "f_models": f_models,
                "e_models": e_models
            }

            # curve_id is only unique per dataset, so scoping fetch_curves_batch and the
            # tip-metadata lookup by dataset_id keeps averaging from mixing in curves
            # (or tip parameters) that happen to share the same curve_id in another dataset.
            dataset_id = kwargs.get("dataset_id")

            # ---- single DB session + single register ----
            with duckdb.connect(db_path) as conn:
                conn.execute("PRAGMA threads=4")
                from filters.register_all import register_filters
                register_filters(conn)

                from pipeline import fetch_curves_batch
                graph_force_vs_z, graph_force_indentation, graph_elspectra = fetch_curves_batch(
                    conn, curve_id_strings, filters_config, single=True, dataset_id=dataset_id
                )

                # Cache schema once
                cols = [c[0] for c in conn.execute("DESCRIBE force_vs_z").fetchall()]
                has_tip_angle = "tip_angle" in cols

                # Tip metadata helper
                tip_meta_query_suffix = " WHERE dataset_id = ?" if dataset_id is not None else ""
                tip_meta_params = [dataset_id] if dataset_id is not None else []
                if has_tip_angle:
                    tip_meta = conn.execute(
                        f"SELECT tip_geometry, tip_radius, tip_angle, spring_constant FROM force_vs_z{tip_meta_query_suffix} LIMIT 1",
                        tip_meta_params,
                    ).fetchone()
                    if tip_meta:
                        tip_geometry, tip_radius, tip_angle, spring_constant = tip_meta
                    else:
                        tip_geometry, tip_radius, tip_angle, spring_constant = ("sphere", 1e-6, 30.0, 0.1)
                else:
                    tip_meta = conn.execute(
                        f"SELECT tip_geometry, tip_radius, spring_constant FROM force_vs_z{tip_meta_query_suffix} LIMIT 1",
                        tip_meta_params,
                    ).fetchone()
                    if tip_meta:
                        tip_geometry, tip_radius, spring_constant = tip_meta
                    else:
                        tip_geometry, tip_radius, spring_constant = ("sphere", 1e-6, 0.1)
                    tip_angle = 30.0

                if tip_geometry not in ['sphere', 'cylinder', 'cone', 'pyramid']:
                    tip_geometry = 'sphere'

                # --- OVERRIDE: payload metadata wins over DB values ---
                # Extract metadata from request payload (supports both legacy 'metadata' and new 'softmech_metadata' keys)
                payload_meta = kwargs.get("softmech_metadata") or kwargs.get("metadata") or {}
                if isinstance(payload_meta, dict):
                    # Override spring constant from payload if provided
                    if payload_meta.get("spring_constant") is not None:
                        try:
                            spring_constant = float(payload_meta["spring_constant"])
                            logger.info(f"Spring constant overridden from payload: {spring_constant}")
                        except (TypeError, ValueError):
                            pass

                    # Override tip radius from payload if provided.
                    # The export dialog (ExportButton.jsx / useExportDialog.js) collects tip radius
                    # in millimeters, matching the import/dataset-editing UI convention, so convert mm -> m here.
                    if payload_meta.get("tip_radius") is not None:
                        try:
                            tip_radius = float(payload_meta["tip_radius"]) * 1e-3
                        except (TypeError, ValueError):
                            pass

                    # Override tip angle from payload if provided (for cones/pyramids)
                    if payload_meta.get("tip_angle") is not None:
                        try:
                            tip_angle = float(payload_meta["tip_angle"])
                        except (TypeError, ValueError):
                            pass

                    # Override tip geometry from payload if provided
                    if payload_meta.get("tip_geometry"):
                        tip_geometry = str(payload_meta["tip_geometry"])

                # Final geometry sanity check to ensure valid value
                if tip_geometry not in ['sphere', 'cylinder', 'cone', 'pyramid']:
                    tip_geometry = 'sphere'

            # ---- Extract per dataset type ----
            xall, yall = [], []
            if dataset_type == "Force":
                curves_data = (graph_force_indentation or {}).get("curves", {})
                for curve in curves_data.get("curves_cp", []):
                    if "x" in curve and "y" in curve:
                        pair = self._sanitize_xy_pair(curve["x"], curve["y"])
                        if pair is not None:
                            x_data, y_data = pair
                            xall.append(x_data)
                            yall.append(y_data)

                if not xall:
                    raise ValueError("No valid Force data found")
                x, y, std = self._average_all(xall, yall, direction, loose, grid_points)

            elif dataset_type == "Elasticity":
                curves = (graph_elspectra or {}).get("curves", [])
                for curve in curves:
                    if "x" in curve and "y" in curve:
                        pair = self._sanitize_xy_pair(curve["x"], curve["y"])
                        if pair is not None:
                            x_data, y_data = pair
                            xall.append(x_data)
                            yall.append(y_data)

                if not xall:
                    raise ValueError("No valid Elasticity data found")
                x, y, std = self._average_all(xall, yall, direction, loose, grid_points)

            elif dataset_type == "El from F":
                # average Force first
                curves_data = (graph_force_indentation or {}).get("curves", {})
                for curve in curves_data.get("curves_cp", []):
                    if "x" in curve and "y" in curve:
                        pair = self._sanitize_xy_pair(curve["x"], curve["y"])
                        if pair is not None:
                            x_data, y_data = pair
                            xall.append(x_data)
                            yall.append(y_data)

                if not xall:
                    raise ValueError("No force data available for elasticity calculation")

                x2, y2, std = self._average_all(xall, yall, direction, loose, grid_points)
                # then compute E from averaged F–d
                x, y = self._calc_elspectra(x2, y2, tip_geometry, tip_radius, tip_angle, **kwargs)
                if x is None or y is None:
                    # fallback to force if elasticity fails
                    x, y = x2, y2
            else:
                raise ValueError(f"Unsupported dataset_type: {dataset_type}")

            # ---- SoftMech-style metadata (REQUEST-ONLY, no DB) ----

            raw_soft = kwargs.get("softmech_metadata")
            raw_meta = kwargs.get("metadata")

            logger.info(
                "Average export – raw metadata payloads: "
                f"softmech_metadata={raw_soft}, metadata={raw_meta}, "
                f"kwargs_keys={list(kwargs.keys())}"
            )

            payload_meta = raw_soft or raw_meta or {}
            if not isinstance(payload_meta, dict):
                logger.warning(f"Average export – payload_meta is not a dict: {type(payload_meta)} -> resetting to {{}}")
                payload_meta = {}
            else:
                logger.info(f"Average export – merged payload_meta keys: {list(payload_meta.keys())}")

            # direction / loose: prefer explicit kwargs, then payload, then defaults
            direction = kwargs.get("direction", payload_meta.get("direction", "V"))
            loose = kwargs.get("loose", payload_meta.get("loose", 100))

            # tip geometry
            tip_shape = str(payload_meta.get("tip_geometry") or "sphere")
            if tip_shape not in ["sphere", "cylinder", "cone", "pyramid"]:
                tip_shape = "sphere"

            # tip radius is expected in [mm] in the payload (matches the export dialog UI);
            # convert to [nm] here since the CSV header always reports tip radius in nanometers.
            tip_radius_nm = None
            if payload_meta.get("tip_radius") is not None:
                try:
                    tip_radius_nm = float(payload_meta["tip_radius"]) * 1e6
                except (TypeError, ValueError):
                    tip_radius_nm = None

            # tip angle [deg] – only meaningful for cone / pyramid
            tip_angle_deg = None
            if payload_meta.get("tip_angle") is not None:
                try:
                    tip_angle_deg = float(payload_meta["tip_angle"])
                except (TypeError, ValueError):
                    tip_angle_deg = None

            # spring constant / elastic constant [N/m]
            elastic_constant_nm = None
            for key in ["spring_constant", "elastic_constant_nm", "elastic_constant"]:
                value = payload_meta.get(key)
                logger.info(f"Average export – checking key '{key}' in payload_meta: {value!r}")
                if value is not None:
                    try:
                        elastic_constant_nm = float(value)
                        logger.info(
                            "Average export – parsed elastic_constant_nm from "
                            f"{key}={value!r} -> {elastic_constant_nm}"
                        )
                    except (TypeError, ValueError):
                        logger.warning(
                            f"Average export – failed to parse {key}={value!r} as float; ignoring"
                        )
                    break  # stop after the first non-None candidate

            softmech_metadata = {
                "direction": direction,
                "loose": loose,
                "tip_shape": tip_shape,
                "tip_radius_nm": tip_radius_nm,
                "tip_angle_deg": tip_angle_deg,
                "elastic_constant_nm": elastic_constant_nm,
            }

            logger.info(
                "Export metadata (request-only): "
                f"tip_shape={tip_shape}, tip_radius_nm={tip_radius_nm}, "
                f"tip_angle_deg={tip_angle_deg}, elastic_constant_nm={elastic_constant_nm}"
            )

            # ---- Write CSV (fast block write) ----
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                if dataset_type == "Force":
                    header = "#SoftMech export data\n#Average F-d curve\n"
                else:
                    header = "#SoftMech export data\n#Average E-d curve\n"
                header += f"#Direction:{softmech_metadata['direction']}\n"
                header += f"#Loose:{softmech_metadata['loose']}\n"
                header += f"#Tip shape: {softmech_metadata['tip_shape']}\n"
                if softmech_metadata['tip_radius_nm'] is not None:
                    header += f"#Tip radius [nm]: {softmech_metadata['tip_radius_nm']}\n"
                if softmech_metadata['tip_angle_deg'] is not None:
                    header += f"#Tip angle [deg]: {softmech_metadata['tip_angle_deg']}\n"
                header += f"#Elastic constant [N/m]: {softmech_metadata['elastic_constant_nm']}\n"

                # --- Hertz metadata (unchanged, still computed from curves & force_model_params) ---
                if dataset_type == "Force":
                    try:
                        curves_dict = (graph_force_indentation or {}).get("curves") or {}
                        if "curves_fparam" in curves_dict:
                            fparams = curves_dict["curves_fparam"]
                            if fparams:
                                E_values = [
                                    fp["params"][0]
                                    for fp in fparams
                                    if fp.get("params")
                                ]
                                if E_values:
                                    avg_E = float(np.average(E_values))
                                    # header += f"#Average Hertz modulus [Pa]: {avg_E}\n"

                        force_model_params = kwargs.get("force_model_params") or {}
                        max_ind_param = force_model_params.get("maxInd")

                        if max_ind_param is not None:
                            hertz_max_nm = float(max_ind_param)
                        elif x is not None and len(x) > 0:
                            hertz_max_nm = float(np.max(x)) * 1e9
                        else:
                            hertz_max_nm = 0.0

                        header += f"#Hertz max indentation [nm]: {hertz_max_nm}\n"

                    except Exception:
                        pass

                # Add Young's modulus formatted value from websocket stats if available
                youngs_modulus_formatted = kwargs.get("youngs_modulus_formatted")
                if youngs_modulus_formatted:
                    header += f"#Average Hertz modulus [Pa]: {youngs_modulus_formatted}\n"

                # Add K_raw / K_contact / E computed by the LinearWindowFit regular filter,
                # if that filter was active and produced a value (see linear_window_fit_filter.py).
                k_raw_formatted = kwargs.get("k_raw_formatted")
                if k_raw_formatted:
                    header += f"#K_raw (LinearWindowFit): {k_raw_formatted}\n"
                k_contact_formatted = kwargs.get("k_contact_formatted")
                if k_contact_formatted:
                    header += f"#K_contact (LinearWindowFit): {k_contact_formatted}\n"
                stiffness_youngs_modulus_formatted = kwargs.get("stiffness_youngs_modulus_formatted")
                if stiffness_youngs_modulus_formatted:
                    header += f"#Young's modulus E (LinearWindowFit): {stiffness_youngs_modulus_formatted}\n"

                if dataset_type == "Force":
                    header += "#Columns: Indentation <F> SigmaF\n" if direction == 'V' else "#Columns: <Indentation> F SigmaZ\n"
                else:
                    header += "#Columns: Indentation <E>\n" if direction == 'V' else "#Columns: <Indentation> E\n"

                f.write(header)
                f.write("#\n#DATA\n")

                if dataset_type == "Force":
                    data = np.column_stack([x, y, std])
                else:
                    data = np.column_stack([x, y])
                np.savetxt(f, data, delimiter="\t", fmt="%.17g")

            logger.info(f"Exported averaged {dataset_type} curves to CSV file at {output_path}")
            return 1

        except Exception as e:
            logger.error(f"Failed to export average curves to CSV file {output_path}: {str(e)}")
            raise

    # ---------- SCATTER ----------

    def _export_scatter_data(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        """Export scatter data with model parameters (SoftMech scatter exporter)"""
        try:
            dataset_type = kwargs.get("dataset_type", "Force Model")

            filters = kwargs.get("filters", {})
            regular_filters = filters.get("regular", {})
            cp_filters = filters.get("cp_filters", {})
            f_models = filters.get("f_models", {})
            e_models = filters.get("e_models", {})

            if curve_ids and len(curve_ids) > 0:
                if isinstance(curve_ids[0], str) and curve_ids[0].startswith('curve'):
                    curve_id_strings = curve_ids
                else:
                    curve_id_strings = [f"curve{cid}" for cid in curve_ids]
            else:
                raise ValueError("No curve_ids provided for scatter export to avoid full-table processing.")

            filters_config = {
                "regular": regular_filters,
                "cp_filters": cp_filters,
                "f_models": f_models,
                "e_models": e_models
            }

            # curve_id is only unique per dataset, so scope the fetch to the dataset
            # the request came from (see _export_raw_data for the same rationale).
            dataset_id = kwargs.get("dataset_id")

            with duckdb.connect(db_path) as conn:
                conn.execute("PRAGMA threads=4")
                from filters.register_all import register_filters
                register_filters(conn)

                from pipeline import fetch_curves_batch
                graph_force_vs_z, graph_force_indentation, graph_elspectra = fetch_curves_batch(
                    conn, curve_id_strings, filters_config, single=True, dataset_id=dataset_id
                )

            # Extract model parameters
            param_data = []
            model_name = dataset_type

            if dataset_type == "Force Model":
                curves_data = (graph_force_indentation or {}).get("curves", {})
                for param_info in curves_data.get("curves_fparam", []):
                    if "fparam" in param_info:
                        param_data.append(param_info["fparam"])
            else:
                for param_info in (graph_elspectra or {}).get("curves_elasticity_param", []):
                    if "elasticity_param" in param_info:
                        param_data.append(param_info["elasticity_param"])

            if len(param_data) == 0:
                raise ValueError(f"No valid {dataset_type} parameters found")

            # Reorganize parameters (similar to SoftMech engine.reorganise)
            param_length = len(param_data[0]) if param_data else 0
            reorganized_data = []
            for i in range(param_length):
                column_data = [params[i] for params in param_data if len(params) > i]
                reorganized_data.append(column_data)

            # Write to CSV
            with open(output_path, "w", newline="", encoding="utf-8") as f:
                if dataset_type == "Force Model":
                    header = "#SoftMech export data\n#Force Indentation analysis\n#\n#FModel parameters\n"
                else:
                    header = "#SoftMech export data\n#Elasticity Spectra analysis\n#\n#EModel parameters\n"

                for i, param_name in enumerate([f"param_{i}" for i in range(len(reorganized_data))]):
                    header += f"#{param_name}:{model_name}\n"

                f.write(header + "#\n#")
                param_names = [f"param_{i}" for i in range(len(reorganized_data))]
                f.write(",".join(param_names) + "\n#\n#DATA\n")

                # Write data
                max_rows = max((len(col) for col in reorganized_data), default=0)
                for row in range(max_rows):
                    row_data = []
                    for col in reorganized_data:
                        row_data.append(str(col[row]) if row < len(col) else "")
                    f.write(",".join(row_data) + "\n")

            logger.info(f"Exported {dataset_type} scatter data to CSV file at {output_path}")
            return len(param_data)

        except Exception as e:
            logger.error(f"Failed to export scatter data to CSV file {output_path}: {str(e)}")
            raise

    # ---------- HELPERS ----------

    def _sanitize_xy_pair(self, x_raw, y_raw):
        """
        Convert x/y to float64 arrays while keeping them aligned.
        - drops rows where either x or y is non-numeric or non-finite
        - sorts by x increasing and removes duplicate x (keeps first)
        - returns (x, y) or None if not enough valid points
        """
        # Prevent sanitization from crashing when inputs contain unexpected types or shapes.
        try:
            x_arr = np.asarray(x_raw, dtype=np.float64)
            y_arr = np.asarray(y_raw, dtype=np.float64)
        except Exception:
            # fallback path for object arrays with mixed types
            x_list, y_list = [], []
            for xi, yi in zip(x_raw, y_raw):
                # Skip values that cannot be coerced to float while preserving valid pairs.
                try:
                    xf = float(xi)
                    yf = float(yi)
                    x_list.append(xf)
                    y_list.append(yf)
                except (TypeError, ValueError):
                    continue
            x_arr = np.asarray(x_list, dtype=np.float64)
            y_arr = np.asarray(y_list, dtype=np.float64)

        # keep only finite pairs
        mask = np.isfinite(x_arr) & np.isfinite(y_arr)
        x_arr, y_arr = x_arr[mask], y_arr[mask]

        # need at least 2 points
        if x_arr.size < 2 or y_arr.size < 2:
            return None

        # sort by x
        order = np.argsort(x_arr)
        x_arr, y_arr = x_arr[order], y_arr[order]

        # drop duplicate x (keep first)
        uniq_x, uniq_idx = np.unique(x_arr, return_index=True)
        x_arr = uniq_x
        y_arr = y_arr[uniq_idx]

        # final length check
        if x_arr.size < 2 or y_arr.size < 2 or x_arr.size != y_arr.size:
            return None

        return x_arr, y_arr

    def _average_all(
        self,
        xall: List[np.ndarray],
        yall: List[np.ndarray],
        direction: str,
        loose: int = 100,
        grid_points: Optional[int] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Calculate average curves with interpolation (SoftMech-like, but bounded grid)"""
        if not xall:
            raise ValueError("Empty input to _average_all")

        N_raw = int(np.max([len(x) for x in xall]))
        if grid_points is None:
            grid_points = 4096
        N = max(2, min(N_raw, int(grid_points)))

        if direction == 'H':
            dset = yall
            ddep = xall
        else:
            dset = xall
            ddep = yall

        # overlap
        mins = [np.min(d) for d in dset if d is not None and len(d)]
        maxs = [np.max(d) for d in dset if d is not None and len(d)]
        if not mins or not maxs:
            raise ValueError("Invalid data ranges for averaging")

        inf = np.max(mins)
        if loose >= 100:
            sup = np.min(maxs)
        else:
            sup = np.percentile(maxs, 100 - loose)

        if not np.isfinite(inf) or not np.isfinite(sup) or sup <= inf:
            raise ValueError("Non-overlapping ranges for averaging")

        newax = np.linspace(inf, sup, N)
        neway = []
        for x, y in zip(dset, ddep):
            if len(x) < 2 or len(y) < 2 or len(x) != len(y):
                continue  # skip malformed series
            # only curves spanning the upper bound contribute (like SoftMech guard)
            if np.max(x) >= sup:
                neway.append(np.interp(newax, x, y))

        if not neway:
            raise ValueError("No curves contribute to averaged range")

        neway = np.asarray(neway)
        newyavg = np.mean(neway, axis=0)
        newstd = np.std(neway, axis=0)

        if direction == 'H':
            return newyavg, newax, newstd
        else:
            return newax, newyavg, newstd

    def _calculate_softmech_metadata(
        self,
        x: np.ndarray,
        y: np.ndarray,
        tip_geometry: str,
        tip_radius: float,
        tip_angle: float,
        spring_constant: float,
        direction: str,
        loose: int
    ) -> Dict[str, Any]:
        """Calculate SoftMech-style metadata fields"""
        metadata = {
            "direction": direction,
            "loose": loose,
            "tip_shape": tip_geometry,
            "tip_radius_nm": tip_radius * 1e9 if tip_geometry in ['sphere', 'cylinder'] and tip_radius else None,
            "tip_angle_deg": tip_angle if tip_geometry in ['cone', 'pyramid'] else None,
            "elastic_constant_nm": spring_constant,
        }

        if len(x) > 0 and len(y) > 0:
            max_indentation_nm = float(np.max(x)) * 1e9
            metadata["hertz_max_indentation_nm"] = max_indentation_nm
            if tip_geometry == 'sphere' and tip_radius and np.any(x > 0):
                mid_idx = len(x) // 2
                if 0 <= mid_idx < len(x) and 0 <= mid_idx < len(y):
                    F = float(y[mid_idx])
                    d = float(x[mid_idx])
                    if d > 0 and F > 0:
                        E = (3.0 / 4.0) * F / (np.sqrt(tip_radius) * (d ** 1.5))
                        metadata["average_hertz_modulus_pa"] = float(E)
                    else:
                        metadata["average_hertz_modulus_pa"] = 0.0
                else:
                    metadata["average_hertz_modulus_pa"] = 0.0
            else:
                metadata["average_hertz_modulus_pa"] = 0.0
        else:
            metadata["hertz_max_indentation_nm"] = 0.0
            metadata["average_hertz_modulus_pa"] = 0.0

        return metadata


    def _calc_elspectra(self, x: np.ndarray, y: np.ndarray, tip_geometry: str, tip_radius: float, tip_angle: float, **kwargs) -> Tuple[np.ndarray, np.ndarray]:
        """Calculate elasticity spectra from force data using centralized function"""
        win = kwargs.get("win", 61)
        order = kwargs.get("order", 2)
        interp = kwargs.get("interp", True)
        
        # Call the centralized function
        result = calc_elspectra(
            z_values=x.tolist(),
            force_values=y.tolist(),
            win=win,
            order=order,
            tip_geometry=tip_geometry,
            tip_radius=tip_radius,
            tip_angle=tip_angle,
            interp=interp
        )
        
        # Convert result to expected format
        if result is None or result is False:
            return None, None
        
        # result is [Ex, Ey] as lists
        Ex, Ey = result
        return np.array(Ex), np.array(Ey)

    def _safe_convert_to_float_array(self, data) -> Optional[np.ndarray]:
        """Safely convert data to float64 array, handling mixed types and None values"""
        if data is None:
            return None

        # Prevent data conversion helper from crashing when unexpected or mixed input types arrive.
        try:
            # Convert to numpy array first
            arr = np.asarray(data)
            
            # Handle empty arrays
            if arr.size == 0:
                return None
            
            # If already numeric, convert to float64
            if np.issubdtype(arr.dtype, np.number):
                return arr.astype(np.float64)
            
            # If object dtype, try to convert each element
            if arr.dtype == object:
                # Filter out None values and non-numeric elements
                numeric_data = []
                for item in arr:
                    if item is not None:
                        # Skip entries that fail float conversion to continue processing remaining values.
                        try:
                            numeric_data.append(float(item))
                        except (ValueError, TypeError):
                            continue
                
                if not numeric_data:
                    return None
                
                return np.array(numeric_data, dtype=np.float64)
            
            # For other dtypes, try direct conversion
            return arr.astype(np.float64)
            
        except (ValueError, TypeError, OverflowError) as e:
            logger.warning(f"Failed to convert data to float array: {e}")
            return None