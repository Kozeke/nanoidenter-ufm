# FastAPI application exposing REST and WebSocket endpoints for curve analytics streaming.

# Load .env variables first so all subsequent imports (e.g. cache.py) see the correct values
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import json
import duckdb
import os
import platform  
import logging
import multiprocessing
# from db import transform_hdf5_to_db
from filters.register_all import register_filters
from pipeline import fetch_curves_batch, get_metadata_for_curves, compute_elasticity_params_batched
import asyncio
from db.connection import get_conn
from db.init_db import ensure_cache_tables
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple, Any, Optional
from segment_utils import segment_types_sql, normalize_segment_type
from utils.cache import warmup_cp_cache, clear_cache, CACHE_ENABLED
# Formats mean±std dicts for model_stats WebSocket responses
from utils.stats import format_stat

# Detect OS for parallel processing strategy
IS_WINDOWS = platform.system() == 'Windows'

app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    # allow_origins=["https://nanoidenter-ufm-front-end.onrender.com/"],
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
# Read from the environment first so a Render Persistent Disk mount (e.g.
# DB_PATH=/var/data/all.db) survives redeploys instead of the container's
# ephemeral local disk, which is wiped on every deploy.
HDF5_FILE_PATH = os.environ.get("HDF5_FILE_PATH", "data/all.hdf5")  # HDF5 file path
DB_PATH = os.environ.get("DB_PATH", "data/all.db")  # DuckDB database file
BATCH_SIZE = 10  # Process 10 curves per batch (adjust based on your needs)
MAX_WORKERS = 8  # Number of parallel workers (tune based on CPU cores)

# Ensure the DB directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def _get_container_cpu_count() -> int:
    """
    Return the number of CPUs available to THIS process, respecting
    Linux cgroup v2 and cgroup v1 quota limits set by Docker / k8s.
    Falls back to os.cpu_count() when running on Windows or when the
    cgroup files are absent / unreadable.
    """
    cpu_count = os.cpu_count() or 1
    if platform.system() == 'Windows':
        return cpu_count
    # cgroup v2
    try:
        with open('/sys/fs/cgroup/cpu.max') as f:
            quota_str, period_str = f.read().strip().split()
        if quota_str != 'max':
            return max(1, int(float(quota_str) / float(period_str)))
    except Exception:
        pass
    # cgroup v1
    try:
        with open('/sys/fs/cgroup/cpu/cpu.quota_us') as qf:
            quota = int(qf.read().strip())
        with open('/sys/fs/cgroup/cpu/cpu.period_us') as pf:
            period = int(pf.read().strip())
        if quota > 0:
            return max(1, int(quota / period))
    except Exception:
        pass
    return cpu_count


def _get_available_ram_gb() -> float:
    """
    Return the available RAM in GB, honouring cgroup memory limits so
    that a container with 512 MB limit does not appear to have the
    host's full RAM.
    """
    try:
        import psutil
        available_gb = psutil.virtual_memory().available / (1024 ** 3)
    except ImportError:
        available_gb = 0.5  # conservative fallback

    if platform.system() == 'Windows':
        return available_gb

    # On Linux, cap available_gb by the cgroup memory limit (v2 then v1).
    for cgroup_mem_file in (
        '/sys/fs/cgroup/memory.max',                    # cgroup v2
        '/sys/fs/cgroup/memory/memory.limit_in_bytes',  # cgroup v1
    ):
        try:
            with open(cgroup_mem_file) as f:
                raw = f.read().strip()
            if raw not in ('max', ''):
                limit_gb = int(raw) * 0.70 / (1024 ** 3)  # use 70% of limit
                available_gb = min(available_gb, limit_gb)
                break
        except Exception:
            continue

    return available_gb


def _get_parallelism_config():
    """
    Inspect available CPU cores and free RAM (container-aware on Linux),
    then decide:
      - whether parallel processing is worthwhile
      - how many worker threads to use
      - what batch size to assign each worker

    Uses ThreadPoolExecutor on ALL platforms.  ProcessPoolExecutor is
    intentionally avoided because on Linux it relies on fork(), which
    inherits the parent's open DuckDB file handles and causes worker
    processes to be OOM-killed or crash immediately.

    Container-aware: reads cgroup v1/v2 quotas on Linux so a 1-CPU /
    0.5-GB container is not mis-identified as a multi-core machine.

    Returns:
        (can_parallelize: bool, max_workers: int, worker_batch_size: int)
    """
    cpu_count    = _get_container_cpu_count()
    available_gb = _get_available_ram_gb()

    # ── Thresholds ──────────────────────────────────────────────────────────
    # Need at least 2 logical CPUs **and** 1 GB free RAM before spawning
    # extra threads.  On a 1-CPU / 0.5-GB container the overhead of context-
    # switching threads + each thread opening its own DuckDB connection makes
    # parallel processing slower (or impossible) compared to sequential.
    MIN_CPUS_FOR_PARALLEL = 2
    MIN_RAM_GB_FOR_PARALLEL = 1.0

    can_parallelize = (cpu_count >= MIN_CPUS_FOR_PARALLEL and
                       available_gb >= MIN_RAM_GB_FOR_PARALLEL)

    if not can_parallelize:
        print(f"⚠️  Parallel processing disabled — "
              f"CPUs: {cpu_count} (need ≥{MIN_CPUS_FOR_PARALLEL}), "
              f"free RAM: {available_gb:.2f} GB (need ≥{MIN_RAM_GB_FOR_PARALLEL} GB). "
              f"Running sequentially.")
        return False, 1, BATCH_SIZE

    # ── Worker count ────────────────────────────────────────────────────────
    # Cap workers at half the logical CPUs (leave headroom for DuckDB's own
    # internal threading and the asyncio event loop).
    max_workers = max(1, min(cpu_count // 2, 4))  # hard cap at 4

    # ── Per-worker batch size ────────────────────────────────────────────────
    # Each worker opens its own DuckDB connection and loads curve data; be
    # conservative with RAM.  Scale down when memory is tight.
    if available_gb < 2.0:
        worker_batch_size = 25
    elif available_gb < 4.0:
        worker_batch_size = 50
    else:
        worker_batch_size = 100

    print(f"ℹ️  Parallel config — workers: {max_workers}, "
          f"batch: {worker_batch_size} curves/worker, "
          f"free RAM: {available_gb:.2f} GB, CPUs: {cpu_count}")
    return True, max_workers, worker_batch_size

# Configure logging
logger = logging.getLogger(__name__)


# --- PARALLEL WORKER (place near top of main.py) ---
# Each worker owns its DuckDB connection (read-only), registers UDFs,
# sets PRAGMAs, then runs the pipeline for its subset.
# Returns a dict with only what's needed by the caller.
def _parallel_worker(curve_ids, filters, compute="elasticity"):
    """
    Process-level worker function that processes a batch of curves.
    Each worker creates its own DuckDB connection, registers UDFs,
    and runs the pipeline for its subset of curve IDs.
    
    Args:
        curve_ids: List of curve IDs to process in this batch
        filters: Dictionary of filters to apply
        compute: Either a string ("fparams" or "elasticity") for backward compatibility,
                 or a dict compute_spec with keys:
                 - "compute": "fparams" or "elasticity"
                 - "emodel": (optional) elastic model name
                 - "emodel_params": (optional) elastic model parameters dict
                 - "elasticity_params": (optional) elasticity parameters dict
    
    Returns:
        For string compute: Dict containing either "fparams" or "elasticity_params" key with results
        For dict compute_spec: Tuple (True, out_dict) where out_dict contains full result structure
    """
    print(f"[Worker] Processing {len(curve_ids)} curves...")
    
    # On Windows we use ThreadPoolExecutor (not ProcessPoolExecutor), so all workers
    # run in the SAME process and would share the singleton returned by get_conn().
    # Closing that shared singleton in the finally block below would kill it for all
    # other requests.  Create a fresh, independent connection here instead.
    conn = duckdb.connect(DB_PATH)
    try:
        # Let DuckDB parallelize *inside* each query too (tune as you like)
        conn.execute(f"PRAGMA threads = {max(1, (os.cpu_count() or 2) // 4)};")  # Limit threads per worker

        # Every process must (re)register UDFs
        register_filters(conn)
        # Ensure cache tables exist
        ensure_cache_tables(conn)

        # Per-batch metadata (spring_constant, tip_radius, tip_geometry)
        # Extract dataset_id early so the metadata query is scoped to the correct dataset.
        # Without it, curve_id alone can match a curve from a different dataset, returning
        # a wrong spring_constant / tip_radius and producing badly-scaled elasticity values.
        worker_dataset_id = compute.get("dataset_id", None) if isinstance(compute, dict) else None
        metadata = get_metadata_for_curves(conn, curve_ids, dataset_id=worker_dataset_id)

        # Parse compute parameter - support both string (backward compat) and dict (new pattern)
        if isinstance(compute, dict):
            # New pattern: compute_spec dict
            compute_spec = compute
            compute_type = compute_spec.get("compute", "elasticity")
            # Note: emodel selection is handled via filters["e_models"], not via this field
            emodel = compute_spec.get("emodel")  # Optional; actual model comes from filters
            emodel_params = compute_spec.get("emodel_params", {})  # Model-specific parameters (maxInd, minInd, etc.)
            elasticity_params = compute_spec.get("elasticity_params", {})  # Elspectra parameters (window, order, interpolate)
            force_model_params = compute_spec.get("force_model_params", None)  # Force model parameters
            set_zero_force = compute_spec.get("set_zero_force", True)  # Whether to zero force at contact point
            worker_dataset_id = compute_spec.get("dataset_id", None)  # Dataset ID for cache queries
            worker_segment_type = compute_spec.get("segment_type", "segment0")

            # Extract elastic_model_params from emodel_params or use defaults
            if isinstance(emodel_params, dict):
                elastic_model_params = {
                    "maxInd": emodel_params.get("maxInd", 800),
                    "minInd": emodel_params.get("minInd", 0)
                }
            else:
                elastic_model_params = {"maxInd": 800, "minInd": 0}
            
            # Determine pipeline flags based on compute_type
            # "both"      → run force model population AND elastic model population
            # "fparams"   → run force model population only
            # "elasticity"→ run elastic model population only
            run_force_pop   = compute_type in ("fparams", "both")
            run_elastic_pop = compute_type in ("elasticity", "both")
            need_elspectra  = run_elastic_pop  # elspectra is required for elastic models

            # Use force_model_population=True (matches sequential path) instead of single=True
            # single=True is for display/UI overlays; force_model_population=True is for batch stats
            g_fvz, g_fi, g_el = fetch_curves_batch(
                conn, curve_ids, filters,
                force_model_population=run_force_pop,
                elastic_model_population=run_elastic_pop,
                metadata=metadata,
                compute_elspectra=need_elspectra,
                elasticity_params=elasticity_params if elasticity_params else None,
                elastic_model_params=elastic_model_params,
                force_model_params=force_model_params,
                set_zero_force=set_zero_force,
                dataset_id=worker_dataset_id,
                segment_type=worker_segment_type,
            )

            print(f"[Worker] Pipeline complete. g_fi type: {type(g_fi)}, g_el type: {type(g_el)}")

            # Build result dict with full structure
            out = {
                "num_curves": len(curve_ids),
                "graph_force_vs_z": g_fvz,
                "graph_force_indentation": g_fi,
                "graph_elspectra": g_el
            }

            # Extract fparams when force model was run
            if run_force_pop:
                fparams_list = []
                if g_fi and isinstance(g_fi.get("curves"), dict):
                    fparams_list = g_fi["curves"].get("curves_fparam", [])
                out["fparams"] = fparams_list
                print(f"[Worker] Extracted {len(fparams_list)} fparams")

            # Extract elasticity params when elastic model was run
            if run_elastic_pop:
                elasticity_params_list = []
                if g_el and isinstance(g_el, dict):
                    elasticity_params_list = g_el.get("curves_elasticity_param", [])
                out["elasticity_params"] = elasticity_params_list
                print(f"[Worker] Extracted {len(elasticity_params_list)} elasticity params")

            # Extract K-stiffness values whenever LinearWindowFit produced them —
            # unconditional, since it doesn't depend on any fmodel/emodel being active.
            kfit_list = []
            if g_fvz and isinstance(g_fvz.get("curves_kfit"), list):
                kfit_list = g_fvz["curves_kfit"]
            out["kfit_params"] = kfit_list
            print(f"[Worker] Extracted {len(kfit_list)} kfit params")

            # Return tuple format for streaming endpoints
            return True, out
            
        else:
            # Backward compatibility: string compute parameter
            compute_type = compute
            
            # Run your full pipeline for this subset (single=True exposes params) 
            g_fvz, g_fi, g_el = fetch_curves_batch(
                conn, curve_ids, filters, single=True, metadata=metadata, compute_elspectra=(compute_type == "elasticity")
            )

            if compute_type == "fparams":
                out = []
                if g_fi and isinstance(g_fi.get("curves"), dict):
                    out = g_fi["curves"].get("curves_fparam", [])
                return {"fparams": out}

            elif compute_type == "elasticity":
                out = []
                if g_el and isinstance(g_el, dict):
                    out = g_el.get("curves_elasticity_param", [])
                return {"elasticity_params": out}

            else:
                return {}

    except Exception as e:
        print(f"[Worker] ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise  # Re-raise to be caught by executor
    finally:
        conn.close()


@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream batches of curve data from DuckDB and send filter defaults."""
    # Validate token and extract user information
    is_valid, user_id, user, error_message = await validate_token(websocket)
    
    if not is_valid:
        print(f"WebSocket connection rejected: {error_message}")
        await websocket.close(code=1008, reason=error_message or "Authentication required")
        return
    
    # Accept the WebSocket connection after authentication
    await websocket.accept()
    conn = duckdb.connect(DB_PATH)
    print(f"Connected to database: {DB_PATH}")

    try:
        # Debug: List all tables before any operations
        tables = conn.execute("SHOW TABLES").fetchall()
        print(f"Tables in database at connection: {tables}")
        
        # Register filters
        register_filters(conn)
        # Ensure cache tables exist
        ensure_cache_tables(conn)
        
        # Optimize DuckDB for single-CPU instances
        cpu_count = os.cpu_count() or 1
        if cpu_count == 1:
            # Single CPU - disable DuckDB parallelism to reduce overhead
            conn.execute("PRAGMA threads = 1;")
            print("ℹ️ DuckDB optimized for single CPU (threads=1)")
        else:
            # Multi-CPU - let DuckDB use parallelism
            conn.execute(f"PRAGMA threads = {cpu_count};")
            print(f"ℹ️ DuckDB configured for {cpu_count} CPU cores")
        
        print("Filters registered")

        # Debug: List tables after register_filters
        tables = conn.execute("SHOW TABLES").fetchall()
        print(f"Tables in database after register_filters: {tables}")

        # Send filter defaults immediately after connection
        result = conn.execute("SELECT name, parameters FROM filters").fetchall()
        filter_defaults = {}
        for name, params_json in result:
            params = json.loads(params_json)
            filter_key = f"{name.lower()}_filter_array"
            filter_defaults[filter_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
        
        # Send contact point filter defaults
        cp_result = conn.execute("SELECT name, parameters FROM cps").fetchall()
        cp_filter_defaults = {}
        for name, params_json in cp_result:
            params = json.loads(params_json)
            cp_filter_key = f"{name.lower()}_filter_array"
            cp_filter_defaults[cp_filter_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
            
        # Send fmodel defaults
        fmodel_result = conn.execute("SELECT name, parameters FROM fmodels").fetchall()
        fmodel_defaults = {}
        for name, params_json in fmodel_result:
            params = json.loads(params_json)
            fmodel_key = f"{name.lower()}_filter_array"  # Matches UDF name from create_fmodel_udf
            fmodel_defaults[fmodel_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
        
        # Send fmodel defaults
        emodel_result = conn.execute("SELECT name, parameters FROM emodels").fetchall()
        emodel_defaults = {}
        for name, params_json in emodel_result:
            params = json.loads(params_json)
            emodel_key = f"{name.lower()}_filter_array"  # Matches UDF name from create_fmodel_udf
            emodel_defaults[emodel_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
            
        print("Prepared contact point filter defaults")
        await websocket.send_json({
            "status": "filter_defaults",             
            "data": {
                "regular_filters": filter_defaults,
                "cp_filters": cp_filter_defaults,
                "fmodels": fmodel_defaults,
                "emodels": emodel_defaults
            }})
        print("Sent filter defaults to client")

        # Check table existence
        table_exists = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'"
        ).fetchone()[0]
        print(f"force_vs_z exists: {table_exists}")
        if table_exists == 0:
            await websocket.send_text(json.dumps({
                "status": "idle",
                "message": "No experiment loaded yet. Upload a file to begin.",
                "ready": False
            }))

        # Continuously accept requests
        while True:
            try:
                # Wait for a request from the client
                request = await websocket.receive_text()
                request_data = json.loads(request)

                # Extract dataset_id from request
                dataset_id = request_data.get("dataset_id")
                
                # Validate dataset exists
                is_valid, error_message = await validate_dataset(conn, dataset_id, user_id)
                if not is_valid:
                    await websocket.send_text(json.dumps({
                        "status": "error",
                        "message": error_message
                    }))
                    continue
                
                # Update last accessed timestamp
                update_dataset_last_accessed(conn, dataset_id)

                # Selected segment (indent=segment0, retract=segment1) for curve queries.
                segment_type = request_data.get("segment_type") or "segment0"

                # --- New: action / compute_scope handling ---
                # Identifies requested operation for downstream handling
                action = request_data.get("action")
                # Indicates scope of computation for processing pipeline
                compute_scope = request_data.get("compute_scope")

                # If client asked for metadata, send it,
                # but DO NOT skip curve processing ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å" we still fall through.
                if action == "get_metadata":
                    await get_metadata(conn, websocket, dataset_id=dataset_id, segment_type=segment_type)

                # Derive compute_scope if not explicitly passed
                if compute_scope is None:
                    if action == "update_fmodel":
                        compute_scope = "fmodel_only"
                    elif action == "update_emodel":
                        compute_scope = "emodel_only"
                    elif action == "compute_stats":
                        compute_scope = "model_stats"
                    else:
                        compute_scope = "full"
                compute_scope = str(compute_scope).lower()
                
                
                curve_from = int(request_data.get("curve_from") or 0)
                curve_to   = int(request_data.get("curve_to")   or 10)
                # Clamp to sane values
                curve_from = max(0, curve_from)
                curve_to   = max(curve_from + 1, curve_to)
                filters = request_data.get("filters", {"regular": {}, "cp_filters": {}, "fmodels": {}})
                curve_id = request_data.get("curve_id", None)  # Extract curve_id
                filters_changed = request_data.get("filters_changed", False)
                set_zero_force = request_data.get("set_zero_force", True)  # Extract set_zero_force, default to True
                elasticity_params = request_data.get("elasticity_params", {
                    "interpolate": True,
                    "order": 2,
                    "window": 61
                })  # Extract elasticity parameters
                elastic_model_params = request_data.get("elastic_model_params", {
                    "maxInd": 800,
                    "minInd": 0
                })  # Extract elastic model parameters
                force_model_params = request_data.get("force_model_params", {
                    "maxInd": 800,
                    "minInd": 0,
                    "poisson": 0.5
                })  # Extract force model parameters
                print(f"Received request: curve_from={curve_from}, curve_to={curve_to}, dataset_id={dataset_id}, segment_type={segment_type}, curve_id={curve_id}, filters={filters}")

                seg_sql = segment_types_sql(segment_type)

                # --- Population stats ignore curve_id ---
                if compute_scope == "model_stats":
                    curve_ids_result = conn.execute(
                        f"""
                        SELECT DISTINCT curve_id FROM force_vs_z
                        WHERE dataset_id = ? AND {seg_sql}
                        ORDER BY curve_id
                        """,
                        (dataset_id,)
                    ).fetchall()
                    curve_ids = [str(row[0]) for row in curve_ids_result]
                    # Added before using cp_filters
                    cp_filters = filters.get("cp_filters", {})
                    # Optimization: Pre-warm CP cache for ALL curves before parallel processing
                    if cp_filters and CACHE_ENABLED:
                        print(f"ðŸ”¥ Pre-warming CP cache for {len(curve_ids)} curves before parallel processing...")
                        # Pass dataset_id so the metadata query is scoped to the correct dataset.
                        # Without it, get_metadata_for_curves picks up the first matching curve_id
                        # from any dataset in force_vs_z, producing a wrong spring_constant / tip_radius
                        # that generates a different cache hash and causes autothresh to run twice.
                        metadata_global = get_metadata_for_curves(conn, curve_ids, dataset_id=dataset_id)
                        warmup_cp_cache(
                            conn, 
                            [int(cid) for cid in curve_ids], 
                            cp_filters, 
                            metadata_global,
                            batch_size=100  # Larger batches for initial warmup
                        )
                        print(f"âœ… CP cache ready for parallel processing")

                else:
                    if curve_id:
                        curve_ids = [curve_id]
                    else:
                        limit = curve_to - curve_from
                        curve_ids_result = conn.execute(
                            f"""
                            SELECT DISTINCT curve_id FROM force_vs_z
                            WHERE dataset_id = ? AND {seg_sql}
                            ORDER BY curve_id
                            LIMIT ? OFFSET ?
                            """,
                            (dataset_id, limit, curve_from)
                        ).fetchall()
                        curve_ids = [str(row[0]) for row in curve_ids_result]

                # --- ADD THIS ---
                global_force_params = []
                global_elastic_params = []
                global_k_params = []  # NEW: stiffness (K) values from LinearWindowFit
                global_k_contact_params = []  # NEW: compliance-corrected k_contact
                global_E_params = []  # NEW: Young's modulus E
                # Added before using has_fmodel and has_emodel
                has_fmodel = bool(filters.get("f_models", {}))
                has_emodel = bool(filters.get("e_models", {}))
                
                # ── Resource check (centralised) ─────────────────────────────────────
                can_parallelize, max_par_workers, par_batch_size = _get_parallelism_config()

                # Build the compute spec once (reused for every parallel batch)
                if has_fmodel and has_emodel:
                    compute_mode = "both"
                elif has_fmodel:
                    compute_mode = "fparams"
                else:
                    compute_mode = "elasticity"

                compute_spec = {
                    "compute": compute_mode,
                    "emodel_params": elastic_model_params,
                    "elasticity_params": elasticity_params if has_emodel else None,
                    "force_model_params": force_model_params,
                    "set_zero_force": set_zero_force,
                    "dataset_id": dataset_id,
                    "segment_type": segment_type,
                }

                # ── Parallel path (model_stats only, adequate resources) ──────────────
                parallel_succeeded = False
                if compute_scope == "model_stats" and len(curve_ids) > BATCH_SIZE and can_parallelize:
                    print(
                        f"Using parallel processing for {len(curve_ids)} curves "
                        f"({max_par_workers} workers, {par_batch_size} curves/batch)..."
                    )

                    parallel_batches = [
                        curve_ids[i:i + par_batch_size]
                        for i in range(0, len(curve_ids), par_batch_size)
                    ]
                    effective_workers = min(max_par_workers, len(parallel_batches))

                    try:
                        # Always use ThreadPoolExecutor on every platform.
                        # ProcessPoolExecutor is intentionally avoided: on Linux it uses
                        # fork() which inherits the parent's open DuckDB file handles and
                        # causes worker processes to be terminated abruptly (SIGKILL / OOM).
                        # Each _parallel_worker creates its own duckdb.connect() so threads
                        # are safe here — DuckDB releases the GIL during I/O.
                        with ThreadPoolExecutor(max_workers=effective_workers) as executor:
                            futures = [
                                (executor.submit(_parallel_worker, batch, filters, compute_spec), batch)
                                for batch in parallel_batches
                            ]

                            completed = 0
                            batch_errors = 0
                            for future, batch in futures:
                                try:
                                    success, result = future.result(timeout=300)
                                    if success:
                                        if has_fmodel and "fparams" in result:
                                            for r in result["fparams"]:
                                                if is_valid_param_vector(r.get("fparam")):
                                                    global_force_params.append(r["fparam"])
                                        if has_emodel and "elasticity_params" in result:
                                            for r in result["elasticity_params"]:
                                                if is_valid_param_vector(r.get("elasticity_param")):
                                                    global_elastic_params.append(r["elasticity_param"])
                                        if "kfit_params" in result:
                                            for r in result["kfit_params"]:
                                                if r.get("k_n_per_m") is not None:
                                                    global_k_params.append(r["k_n_per_m"])
                                                if r.get("k_contact") is not None:
                                                    global_k_contact_params.append(r["k_contact"])
                                                if r.get("youngs_modulus_pa") is not None:
                                                    global_E_params.append(r["youngs_modulus_pa"])
                                    completed += len(batch)
                                    pct = (completed / len(curve_ids)) * 100
                                    print(f"  Progress: {completed}/{len(curve_ids)} curves ({pct:.1f}%)")
                                except Exception as e:
                                    batch_errors += 1
                                    print(f"  Error processing batch: {e}")

                        if batch_errors < len(parallel_batches):
                            parallel_succeeded = True
                            print(
                                f"Parallel processing complete: "
                                f"{len(global_force_params)} force params, "
                                f"{len(global_elastic_params)} elastic params, "
                                f"{len(global_k_params)} k params"
                            )
                        else:
                            print("All parallel batches failed -- falling back to sequential.")

                    except Exception as e:
                        print(f"Parallel executor failed ({e}) -- falling back to sequential.")

                # ── Sequential path ───────────────────────────────────────────────────
                # Runs when: dataset is small, resources are constrained, compute_scope
                # is not model_stats, OR all parallel workers failed.
                if not parallel_succeeded:
                    try:
                        import psutil
                        available_memory_gb = psutil.virtual_memory().available / (1024 ** 3)
                    except ImportError:
                        available_memory_gb = 0.5

                    cpu_count_seq = os.cpu_count() or 1

                    if available_memory_gb < 1.0:
                        batch_size_to_use = 10
                        print(f"Very low memory ({available_memory_gb:.1f} GB) -- batch size: {batch_size_to_use}")
                    elif available_memory_gb < 2.0:
                        batch_size_to_use = 10
                        print(f"Moderate memory ({available_memory_gb:.1f} GB) -- batch size: {batch_size_to_use}")
                    elif cpu_count_seq == 1:
                        batch_size_to_use = 20
                        print(f"Single CPU, good memory ({available_memory_gb:.1f} GB) -- batch size: {batch_size_to_use}")
                    else:
                        batch_size_to_use = BATCH_SIZE
                        print(f"Using standard batch size: {batch_size_to_use}")

                    for i in range(0, len(curve_ids), batch_size_to_use):
                        batch_ids = curve_ids[i:i + batch_size_to_use]

                        await process_and_stream_batch(
                            conn,
                            batch_ids,
                            filters,
                            websocket,
                            curve_id,
                            filters_changed,
                            set_zero_force,
                            elasticity_params,
                            elastic_model_params,
                            force_model_params,
                            compute_scope=compute_scope,
                            global_force_params=global_force_params,
                            global_elastic_params=global_elastic_params,
                            global_k_params=global_k_params,
                            global_k_contact_params=global_k_contact_params,
                            global_E_params=global_E_params,
                            dataset_id=dataset_id,
                            segment_type=segment_type,
                        )
                        await asyncio.sleep(0.01)  # Small delay to avoid overwhelming client

                # ---- Send stats + completion (runs after BOTH parallel and sequential paths) ----
                if compute_scope == "model_stats":
                    stats = {}

                    if len(global_force_params) >= 2:
                        n_params = len(global_force_params[0])
                        params_by_index = [
                            [p[i] for p in global_force_params]
                            for i in range(n_params)
                        ]
                        stats["force_params"] = {
                            f"p{i}": format_stat(values)
                            for i, values in enumerate(params_by_index)
                            if len(values) >= 2
                        }

                    if len(global_elastic_params) >= 2:
                        n_params = len(global_elastic_params[0])
                        params_by_index = [
                            [p[i] for p in global_elastic_params]
                            for i in range(n_params)
                        ]
                        stats["elasticity_params"] = {
                            f"p{i}": format_stat(values)
                            for i, values in enumerate(params_by_index)
                            if len(values) >= 2
                        }

                    if len(global_k_params) >= 2:
                        stats["k_stiffness"] = format_stat(global_k_params)
                    if len(global_k_contact_params) >= 2:
                        stats["k_contact"] = format_stat(global_k_contact_params)
                    if len(global_E_params) >= 2:
                        stats["youngs_modulus"] = format_stat(global_E_params)

                    await websocket.send_text(json.dumps({
                        "status": "model_stats",
                        "data": {
                            "stats": stats,
                            "num_curves": len(curve_ids)
                        }
                    }))

                # Signal completion of this request, including action so the
                # frontend can reliably match this "complete" to the right operation.
                await websocket.send_text(json.dumps({"status": "complete", "action": action}))

            except WebSocketDisconnect:
                # print("Client disconnected.")
                break  # Exit loop on disconnect
            except json.JSONDecodeError as e:
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": f"Invalid request format: {e}"
                }))
            except Exception as e:
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": f"Error processing request: {e}"
                }))

    except Exception as e:
        # print(f"Unexpected error: {e}")
        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
    finally:
        conn.close()
        # print("WebSocket connection closed")


async def validate_token(websocket: WebSocket) -> Tuple[bool, Optional[int], Optional[dict], str]:
    """
    Validate WebSocket token and extract user information.
    
    Args:
        websocket: WebSocket connection with token in query params
        
    Returns:
        Tuple of (is_valid, user_id, user_dict, error_message)
        If valid, returns (True, user_id, user_dict, None)
        If invalid, returns (False, None, None, error_message)
    """
    from auth.security import decode_token
    from db.users import get_user_by_email
    
    # Extract token from query parameters
    token = websocket.query_params.get("token")
    
    if not token:
        return False, None, None, "No token provided"
    
    try:
        # Decode token
        payload = decode_token(token)
        email = payload.get("sub")
        
        if not email:
            return False, None, None, "Invalid token payload"
        
        # Get user by email
        user = get_user_by_email(email)
        if not user:
            return False, None, None, f"User not found for email {email}"
        
        user_id = user["id"]
        print(f"Token validated: User ID {user_id} ({email})")
        return True, user_id, user, None
        
    except Exception as e:
        error_msg = f"Token validation failed: {str(e)}"
        print(f"WebSocket connection rejected: {error_msg}")
        return False, None, None, error_msg


async def validate_dataset(conn: duckdb.DuckDBPyConnection, dataset_id: int, user_id: int = None) -> Tuple[bool, str]:
    """
    Validate that a dataset exists and optionally belongs to the user.
    
    Args:
        conn: DuckDB connection
        dataset_id: The dataset ID to validate
        user_id: Optional user ID to verify ownership
        
    Returns:
        Tuple of (is_valid, error_message)
        If valid, returns (True, None)
        If invalid, returns (False, error_message)
    """
    if dataset_id is None:
        return False, "dataset_id is required"
    
    try:
        # Check if dataset exists
        if user_id is not None:
            # Verify dataset exists and belongs to user
            result = conn.execute(
                "SELECT id FROM datasets WHERE id = ? AND user_id = ?",
                (dataset_id, user_id)
            ).fetchone()
            if not result:
                return False, f"Dataset {dataset_id} not found or access denied"
        else:
            # Just check if dataset exists
            result = conn.execute(
                "SELECT id FROM datasets WHERE id = ?",
                (dataset_id,)
            ).fetchone()
            if not result:
                return False, f"Dataset {dataset_id} not found"
        
        return True, None
    except Exception as e:
        return False, f"Error validating dataset: {str(e)}"


def update_dataset_last_accessed(conn: duckdb.DuckDBPyConnection, dataset_id: int) -> None:
    """
    Update the last_accessed_at timestamp for a dataset.
    
    Args:
        conn: DuckDB connection
        dataset_id: The dataset ID to update
    """
    try:
        conn.execute(
            "UPDATE datasets SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (dataset_id,)
        )
    except Exception as e:
        logger.warning(f"Failed to update last_accessed_at for dataset {dataset_id}: {str(e)}")


async def get_metadata(conn, websocket, dataset_id: int = None, segment_type: str = "segment0"):
    try:
        seg_sql = segment_types_sql(segment_type)
        # Execute query to fetch one row from force_vs_z
        # Rename file_id to file_name and exclude: instrument, inv_ols, no_points, sample, sampling_rate, tip_angle, velocity
        query = """
            SELECT 
                dataset_id,
                curve_id,
                segment_type,
                force_values,
                z_values,
                indentation_values,
                elasticity_values,
                file_id AS file_name,
                date,
                spring_constant,
                tip_geometry,
                tip_radius,
                fmodel_params,
                fmodel_name,
                emodel_params,
                emodel_name,
                contact_point_z,
                contact_point_force
            FROM force_vs_z
        """
        if dataset_id is not None:
            query += f" WHERE dataset_id = ? AND {seg_sql} LIMIT 1"
            cursor = conn.execute(query, (dataset_id,))
        else:
            query += f" WHERE {seg_sql} LIMIT 1"
            cursor = conn.execute(query)
        row = cursor.fetchone()
        
        # Get column names from cursor description
        columns = [description[0] for description in cursor.description]

        # Count distinct curves for this dataset and segment.
        if dataset_id is not None:
            num_curves = conn.execute(
                f"SELECT COUNT(DISTINCT curve_id) FROM force_vs_z WHERE dataset_id = ? AND {seg_sql}",
                (dataset_id,),
            ).fetchone()[0]
            available_rows = conn.execute(
                "SELECT DISTINCT segment_type FROM force_vs_z WHERE dataset_id = ?",
                (dataset_id,),
            ).fetchall()
        else:
            num_curves = conn.execute(
                f"SELECT COUNT(DISTINCT curve_id) FROM force_vs_z WHERE {seg_sql}"
            ).fetchone()[0]
            available_rows = conn.execute(
                "SELECT DISTINCT segment_type FROM force_vs_z"
            ).fetchall()

        available_segment_types = sorted(
            {normalize_segment_type(row[0]) for row in available_rows if row[0]}
        )
        
        # If a row exists, include its data; otherwise, send only column names
        metadata = {
            "status": "metadata",
            "metadata": {
                "columns": columns,
                "sample_row": dict(zip(columns, row)) if row else None,
                "num_curves": num_curves,
                "segment_type": normalize_segment_type(segment_type),
                "available_segment_types": available_segment_types,
            }
        }
        
        # Send metadata via WebSocket
        await websocket.send_text(json.dumps(metadata))
        # print("Sent metadata:", metadata)
        
        # return metadata
    
    except Exception as e:
        error_response = {
            "status": "error",
            "message": f"Error fetching metadata: {e}"
        }
        await websocket.send_text(json.dumps(error_response))
        # print(f"Error in get_metadata: {e}")
        return error_response
    
async def process_and_stream_batch(
    conn: duckdb.DuckDBPyConnection,
    batch_ids: List[str],
    filters: Dict,
    websocket: WebSocket,
    curve_id: str = None,
    filters_changed: bool = False,
    set_zero_force: bool = True,
    elasticity_params: Dict = None,
    elastic_model_params: Dict = None,
    force_model_params: Dict = None,
    compute_scope: str = "full",  # NEW
    global_force_params: list = None,
    global_elastic_params: list = None,
    global_k_params: list = None,  # NEW: stiffness (K) values from LinearWindowFit
    global_k_contact_params: list = None,  # NEW: compliance-corrected k_contact
    global_E_params: list = None,  # NEW: Young's modulus E
    dataset_id: int = None,
    segment_type: str = "segment0",
) -> None:
    """
    Process a batch of curve IDs and optionally a single curve ID, fetch data from DuckDB,
    and stream results via WebSocket.

    compute_scope:
        - "full"         compute all graphs (current behaviour)
        - "fmodel_only"   update only force-model overlay (indentation graph)
        - "emodel_only"   update only elasticity-model overlay (elspectra graph)
    """
    try:
        loop = asyncio.get_running_loop()

        # Normalise scope
        compute_scope = (compute_scope or "full").lower()
        if compute_scope not in {"full", "fmodel_only", "emodel_only", "model_stats"}:
            compute_scope = "full"

        scope_full = compute_scope == "full"
        scope_f_only = compute_scope == "fmodel_only"
        scope_e_only = compute_scope == "emodel_only"

        # Copy filters in a safe, shallow way and normalise keys
        filters_for_call = {
            "regular": dict(filters.get("regular", {})),
            "cp_filters": dict(filters.get("cp_filters", {})),
            "f_models": dict(filters.get("f_models", {})),
            "e_models": dict(filters.get("e_models", {})),
        }
        cp_filters = filters_for_call.get("cp_filters", {})     # Added before using cp_filters
        # --- Model stats scope ---
        scope_model_stats = compute_scope == "model_stats"
        # print("scope_model_stats", scope_model_stats)
        has_fmodel = bool(filters_for_call["f_models"])
        has_emodel = bool(filters_for_call["e_models"])

        run_force_population = scope_model_stats and has_fmodel
        run_elastic_population = scope_model_stats and has_emodel

        # Decide which parts of the pipeline we actually need
        # Optimization: skip expensive elspectra when only fmodel stats needed
        if scope_model_stats and run_force_population and not run_elastic_population:
            compute_elspectra_flag = False
            # print(f"Ã¢Å¡Â¡ Optimization: Skipping elspectra for force-only population stats")
        elif scope_f_only:
            # Only force-model (uses indentation) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ no elasticity models, no elspectra
            filters_for_call["e_models"] = {}
            compute_elspectra_flag = False
        elif scope_e_only:
            # Only elasticity-model (uses elspectra) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ no force models
            filters_for_call["f_models"] = {}
            compute_elspectra_flag = True
        else:
            # Full pipeline
            compute_elspectra_flag = True

        # Decide if "single" semantics are needed (one curve with models)
        want_models = bool(filters_for_call.get("f_models") or filters_for_call.get("e_models"))
        is_single_batch = len(batch_ids) == 1

        # Init graph containers
        graph_force_vs_z = None
        graph_force_indentation = None
        graph_elspectra = None
        graph_force_vs_z_single = None
        graph_force_indentation_single = None
        graph_elspectra_single = None

        # Use ThreadPoolExecutor for blocking DuckDB ops
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            from pipeline import get_metadata_for_curves
            metadata = get_metadata_for_curves(conn, batch_ids, dataset_id=dataset_id)
            print(
                "DEBUG fetch_curves_batch metadata "
                f"(scope={compute_scope}, dataset_id={dataset_id}, batch_size={len(batch_ids)}): "
                f"{metadata}"
            )

            # ---- SINGLE-CURVE PATH (models / targeted updates) ----
            if is_single_batch and (curve_id or want_models or not scope_full):
                print(f"Single curve path ({compute_scope}):", batch_ids)
                # For single curve & model updates, call synchronously
                graph_force_vs_z_single, graph_force_indentation_single, graph_elspectra_single = fetch_curves_batch(
                    conn,
                    batch_ids,
                    filters_for_call,
                    single=True,
                    metadata=metadata,
                    set_zero_force=set_zero_force,
                    elasticity_params=elasticity_params,
                    elastic_model_params=elastic_model_params,
                    force_model_params=force_model_params,
                    compute_elspectra=compute_elspectra_flag,
                    dataset_id=dataset_id,
                    segment_type=segment_type,
                )

            # ---- BATCH PATH (full graphs) ----
            elif filters_changed or not curve_id or scope_full:
                # print(f"Batch processing ({compute_scope}):", batch_ids)
                
                # Optimization: Warm up CP cache for model stats before parallel processing
                if scope_model_stats and cp_filters and CACHE_ENABLED:
                    # print(f"ðŸ"¥ Pre-warming CP cache for {len(batch_ids)} curves...")
                    warmup_cp_cache(conn, [int(cid) for cid in batch_ids], cp_filters, metadata, batch_size=50)
                
                graph_force_vs_z, graph_force_indentation, graph_elspectra = await loop.run_in_executor(
                    executor,
                    lambda: fetch_curves_batch(
                        conn,
                        batch_ids,
                        filters_for_call,
                        metadata=metadata,
                        set_zero_force=set_zero_force,
                        elasticity_params=elasticity_params,
                        elastic_model_params=elastic_model_params,
                        force_model_params=force_model_params,
                        compute_elspectra=compute_elspectra_flag,
                        force_model_population=run_force_population,
                        elastic_model_population=run_elastic_population,
                        dataset_id=dataset_id,
                        segment_type=segment_type,
                    ),
                )

        # ---- BUILD RESPONSE ----
        response_data: Dict[str, Any] = {
            "status": "batch",
            "data": {},
        }
        # print("qwertrtt")
        if scope_model_stats:
            # Force params come from graph_force_indentation["curves"]["curves_fparam"]
            curves_block = graph_force_indentation.get("curves", {}) if graph_force_indentation else {}

            if run_force_population and "curves_fparam" in curves_block:
                for r in curves_block["curves_fparam"]:
                    if is_valid_param_vector(r.get("fparam")):
                        global_force_params.append(r["fparam"])

            # K-stiffness values come from graph_force_vs_z["curves_kfit"], populated
            # whenever LinearWindowFit is active among the Regular filters — independent
            # of whether any force/elasticity model is selected.
            if graph_force_vs_z and "curves_kfit" in graph_force_vs_z:
                for r in graph_force_vs_z["curves_kfit"]:
                    if r.get("k_n_per_m") is not None and global_k_params is not None:
                        global_k_params.append(r["k_n_per_m"])
                    if r.get("k_contact") is not None and global_k_contact_params is not None:
                        global_k_contact_params.append(r["k_contact"])
                    if r.get("youngs_modulus_pa") is not None and global_E_params is not None:
                        global_E_params.append(r["youngs_modulus_pa"])

            # Elasticity params come from graph_elspectra["curves_elasticity_param"] (top-level, not inside "curves")
            if run_elastic_population and graph_elspectra:
                elasticity_params_list = graph_elspectra.get("curves_elasticity_param", [])
                for r in elasticity_params_list:
                    if is_valid_param_vector(r.get("elasticity_param")):
                        global_elastic_params.append(r["elasticity_param"])

            # ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â´ DO NOT SEND STATS HERE
            return

        elif scope_full:
            # existing logic, unchanged
            if graph_force_vs_z:
                response_data["data"].update({
                    "graphForcevsZ": graph_force_vs_z,
                    "graphForceIndentation": graph_force_indentation,
                    "graphElspectra": graph_elspectra,
                })
            if graph_force_vs_z_single:
                response_data["data"].update({
                    "graphForcevsZSingle": graph_force_vs_z_single,
                    "graphForceIndentationSingle": graph_force_indentation_single,
                    "graphElspectraSingle": graph_elspectra_single,
                })

        elif scope_f_only:
            if graph_force_indentation_single:
                response_data["data"]["graphForceIndentationSingle"] = graph_force_indentation_single

        elif scope_e_only:
            if graph_elspectra_single:
                response_data["data"]["graphElspectraSingle"] = graph_elspectra_single
        # Send or report empty
        if response_data["data"]:
            await websocket.send_text(json.dumps(
                response_data,
                default=str,
            ))
        else:
            print(f"No data returned for batch (scope={compute_scope}): {batch_ids}")
            await websocket.send_text(json.dumps({
                "status": "batch_empty",
                "message": "No curves returned for this batch",
                "batch_ids": batch_ids,
            }))

    except Exception as e:
        print(f"Error processing batch {batch_ids} (scope={compute_scope}): {e}")
        await websocket.send_text(json.dumps({
            "status": "batch_error",
            "message": f"Error processing batch: {str(e)}",
            "batch_ids": batch_ids,
        }))
    
@app.on_event("startup")
async def startup_event():
    """Load HDF5 data into DuckDB and set up filters when the server starts."""
    # Check if DB needs initialization
    # if not os.path.exists(DB_PATH) or os.stat(DB_PATH).st_size == 0:
    #     print("ÃƒÂ°Ã…Â¸Ã…Â¡Ã¢â€šÂ¬ Loading HDF5 data into DuckDB...")
    #     transform_hdf5_to_db(HDF5_FILE_PATH, DB_PATH)
    # else:
    #     print("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ DuckDB database already exists, skipping reload.")
    print("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Startup complete.")


from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel

# Pydantic model for response
class ExperimentResponse(BaseModel):
    status: str
    message: str
    curves: int
    filename: str
    duckdb_status: str
    spring_constant: float = None
    tip_radius_um: float = None



from typing import Dict, List, Any
from file_types.hdf5 import get_hdf5_structure, process_hdf5, export_from_duckdb_to_hdf5
from fastapi import FastAPI, File, UploadFile
import json
import os
import logging
import re
from fastapi.responses import FileResponse
from pathlib import Path
from routers.opener import router as experiment_router
from routers.exporter import router as exporter_router
from routers.datasets import router as datasets_router
from routers.hdf5_ingest import ingest_router, ApiKeyMiddleware
from auth.router import router as auth_router
from auth.dependencies import get_current_user
from experiments.router import router as experiments_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("hdf5_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
# Protects all /hdf5/* endpoints with API-key authentication middleware.
app.add_middleware(ApiKeyMiddleware)
app.include_router(experiment_router)
app.include_router(exporter_router)
app.include_router(datasets_router)
app.include_router(experiments_router)
app.include_router(auth_router)
# Exposes /hdf5/ingest and /hdf5/ping routes for remote file delivery.
app.include_router(ingest_router)


# Sanitize file system paths
def sanitize_file_path(path: str) -> str:
    path = Path(path).resolve()
    if not path.is_relative_to(Path.cwd()):
        raise ValueError("Path outside allowed directory")
    return str(path)

# Validate HDF5 paths (group/dataset names)
def validate_hdf5_path(path: str) -> None:
    if not path or not isinstance(path, str):
        raise ValueError("HDF5 path must be a non-empty string")
    if path.startswith("/") or path.endswith("/"):
        raise ValueError("HDF5 path cannot start or end with '/'")
    if "//" in path:
        raise ValueError("HDF5 path cannot contain consecutive '/'")
    # Optionally, add regex to restrict to valid HDF5 group/dataset names
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_/]*[a-zA-Z0-9]$', path):
        raise ValueError("HDF5 path contains invalid characters")



# New endpoint to fetch all curves' fparams with progress streaming
@app.post("/get-all-fparams-stream")
async def get_all_fparams_stream(data: Dict[str, Any]):
    """
    Server-Sent Events endpoint to stream fparams progress and results.
    Emits progress updates during batch processing.

    Body fields:
      filters       – filter dict (regular, cp_filters, f_models, e_models)
      num_curves    – optional int, limit curves processed
      dataset_id    – optional int, restrict processing to a single dataset
    """
    async def generate():
        try:
            # Extract parameters from request
            filters = data.get("filters", {})
            dataset_id = data.get("dataset_id")  # None → all datasets
            # Receives force-model runtime parameters (maxInd/minInd/poisson) from frontend.
            force_model_params = data.get("force_model_params", {
                "maxInd": 800,
                "minInd": 0,
                "poisson": 0.5
            })
            # Receives zero-force toggle so indentation computation matches the UI setting.
            set_zero_force = data.get("set_zero_force", True)
            
            # Ensure we have fmodels to calculate fparams
            if not filters.get("f_models"):
                filters["f_models"] = {"hertz_filter_array": {"model": "hertz", "poisson": 0.5}}

            # Use the singleton connection – safe here because _parallel_worker no longer
            # closes it (each worker now opens its own independent duckdb.connect()).
            _conn = get_conn()
            if dataset_id is not None:
                curve_ids_result = _conn.execute(
                    "SELECT curve_id FROM force_vs_z WHERE dataset_id = ?", (dataset_id,)
                ).fetchall()
            else:
                curve_ids_result = _conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
            curve_ids = [str(row[0]) for row in curve_ids_result]
            
            total_curves = len(curve_ids)
            print(f"Found {total_curves} total curves in database")
            
            # Emit initial progress and yield control so the chunk flushes to the client
            yield f"data: {json.dumps({'type': 'progress', 'phase': 'Starting...', 'done': 0, 'total': total_curves})}\n\n"
            await asyncio.sleep(0)

            if not curve_ids:
                yield f"data: {json.dumps({'type': 'complete', 'status': 'success', 'fparams': [], 'message': 'No curves found'})}\n\n"
                return

            # Process curves in smaller batches to avoid memory issues
            batch_size = 50  # Process 50 curves at a time
            all_fparams = []
            total_batches = (total_curves + batch_size - 1) // batch_size
            loop = asyncio.get_event_loop()

            for i in range(0, len(curve_ids), batch_size):
                batch_curve_ids = curve_ids[i:i + batch_size]
                batch_num = i // batch_size + 1
                print(f"Processing batch {batch_num}/{total_batches}: curves {i} to {min(i + batch_size, len(curve_ids))}")

                # Emit batch progress and flush before blocking work begins
                yield f"data: {json.dumps({'type': 'progress', 'phase': f'Processing batch {batch_num}/{total_batches}...', 'done': i, 'total': total_curves, 'current_batch': batch_num, 'total_batches': total_batches})}\n\n"
                await asyncio.sleep(0)

                # On Windows DuckDB only allows connections with the same configuration,
                # so we must reuse the singleton rather than open a new connection.
                # fetch_curves_batch is synchronous; run it in an executor so the event
                # loop can keep flushing SSE chunks while the batch is processed.
                # The singleton is not closed by workers anymore, so it is safe to pass
                # to a single-threaded executor (only one batch runs at a time here).
                _batch_conn = get_conn()
                def _process_batch(_ids=batch_curve_ids, _filters=filters, _c=_batch_conn, _ds=dataset_id):
                    # Retrieves per-request metadata so indentation uses the real spring constant/tip metadata.
                    batch_metadata = get_metadata_for_curves(_c, _ids, dataset_id=_ds)
                    _fvz, g_fi, _el = fetch_curves_batch(
                        _c, _ids, _filters,
                        single=True, compute_elspectra=False,
                        metadata=batch_metadata,
                        force_model_params=force_model_params,
                        set_zero_force=set_zero_force,
                        dataset_id=_ds,
                    )
                    return g_fi

                graph_force_indentation = await loop.run_in_executor(None, _process_batch)
                
                # Extract fparams from this batch
                if graph_force_indentation and graph_force_indentation.get("curves"):
                    curves_data = graph_force_indentation["curves"]
                    if isinstance(curves_data, dict) and "curves_fparam" in curves_data:
                        batch_fparams = curves_data["curves_fparam"]
                        all_fparams.extend(batch_fparams)
                        print(f"Batch {batch_num}: Found {len(batch_fparams)} fparams")
                
                # Emit batch completion and flush
                yield f"data: {json.dumps({'type': 'progress', 'phase': f'Batch {batch_num}/{total_batches} complete', 'done': min(i + batch_size, total_curves), 'total': total_curves})}\n\n"
                await asyncio.sleep(0)

            fparams = all_fparams
            print(f"Total fparams found: {len(fparams)}")

            # Emit final result
            yield f"data: {json.dumps({'type': 'complete', 'status': 'success', 'fparams': fparams, 'message': f'Retrieved fparams for {len(fparams)} curves'})}\n\n"
            
        except Exception as e:
            logger.error(f"Failed to fetch fparams: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'status': 'error', 'message': f'Failed to fetch fparams: {str(e)}'})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


# Helper function for SSE events
def sse_event(payload: dict) -> bytes:
    """Format a dict as an SSE event line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


# New endpoint to fetch all curves' elasticity parameters with progress streaming
async def _emodels_stream_handler(req: Request):
    """
    SSE stream of elasticity model parameters with progress.
    Uses consistent DuckDB connection to avoid configuration conflicts.
    
    Body:
      {
        "filters": {
          "regular": {...},
          "cp_filters": {...},
          "f_models": {...},
          "e_models": {...}
        },
        "num_curves": <optional>,
        "dataset_id": <optional int – restrict to a single dataset>,
        "elasticity_params": {"interpolate": true, "order": 2, "window": 61},
        "emodel_params": {"maxInd": 800, "minInd": 0}
      }
    """
    body = await req.json()
    filters = (body or {}).get("filters", {})
    num_curves = (body or {}).get("num_curves")
    dataset_id = (body or {}).get("dataset_id")  # None → all datasets
    elasticity_params = (body or {}).get("elasticity_params", {"interpolate": True, "order": 2, "window": 61})
    elastic_model_params = (body or {}).get("emodel_params", {"maxInd": 800, "minInd": 0})
    
    # Ensure we have e_models to calculate elasticity
    if not filters.get("e_models"):
        filters["e_models"] = {"constant_filter_array": {"model": "constant"}}
    
    async def gen():
        # Important for proxies like nginx
        yield b": keep-alive\n\n"
        yield sse_event({"type": "initializing", "phase": "Initializing...", "done": 0, "total": 0, "total_batches": 0})
        
        # Use consistent connection from get_conn() to avoid DuckDB configuration conflicts.
        # asyncio is single-threaded so concurrent SSE coroutines won't issue queries in
        # parallel; they interleave only at 'await' points, making the singleton safe.
        conn = get_conn()
        try:
            # Use the batched async generator
            batch_iter = compute_elasticity_params_batched(
                conn,
                filters=filters,
                num_curves=num_curves,
                batch_size=50,
                elasticity_params=elasticity_params,
                elastic_model_params=elastic_model_params,
                dataset_id=dataset_id,
            )
            
            total_batches = None
            total = None
            done_global = 0
            all_rows = []
            
            async for batch_idx, tb, done, tot, rows in batch_iter:
                # Cache totals once
                total_batches = tb if total_batches is None else total_batches
                total = tot if total is None else total
                
                done_global = done
                all_rows.extend(rows)
                
                # Progress event with correct field names matching fparams stream
                yield sse_event({
                    "type": "progress",
                    "phase": f"Processing batch {batch_idx}/{tb}",
                    "current_batch": batch_idx,
                    "total_batches": tb,
                    "done": done,
                    "total": tot,
                })
                
                # Give the event loop a breath so chunks flush
                await asyncio.sleep(0)
            
            # Complete event with final payload
            yield sse_event({
                "type": "complete",
                "status": "success",
                "done": done_global,
                "total": total,
                "elasticity_params": all_rows
            })
            
        except Exception as e:
            logger.error(f"Failed to fetch elasticity params: {str(e)}")
            yield sse_event({"type": "error", "status": "error", "message": str(e)})
        # Note: Do NOT close the singleton connection here
        
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Disables nginx buffering
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)


# Two route names for the same handler: legacy name kept for backward compatibility
@app.post("/get-all-emodels-stream")
async def get_all_emodels_stream(req: Request):
    return await _emodels_stream_handler(req)


@app.post("/get-all-eparams-stream")
async def get_all_eparams_stream(req: Request):
    """Alias for /get-all-emodels-stream."""
    return await _emodels_stream_handler(req)


# New endpoint to fetch all curves' fparams (non-streaming, kept for compatibility)
@app.post("/get-all-fparams")
async def get_all_fparams(data: Dict[str, Any]):
    """HTTP endpoint to fetch fparams for all curves with current filters using process-level parallelism."""
    try:
        # Extract parameters from request
        filters = data.get("filters", {})
        
        # Ensure we have fmodels to calculate fparams
        if not filters.get("f_models"):
            filters["f_models"] = {"hertz_filter_array": {"model": "hertz", "poisson": 0.5}}
        
        # Use consistent connection to avoid DuckDB configuration conflicts
        conn = get_conn()
        try:
            # Let DuckDB parallelize scans/CTEs within queries
            conn.execute(f"PRAGMA threads = {os.cpu_count() or 2};")
            # Build the full id list once
            curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
            all_ids = [str(r[0]) for r in curve_ids_result]
        finally:
            # Don't close singleton connection
            pass
        
        if not all_ids:
            return {
                "status": "success",
                "fparams": [],
                "message": "No curves found"
            }
        
        print(f"Found {len(all_ids)} total curves in database")

        can_parallelize, max_par_workers, par_batch_size = _get_parallelism_config()

        batches = [all_ids[i:i + par_batch_size]
                   for i in range(0, len(all_ids), par_batch_size)]

        all_fparams = []

        if can_parallelize and len(batches) > 1:
            # ── Parallel path (ThreadPoolExecutor on ALL platforms) ──────────
            # ProcessPoolExecutor is intentionally avoided: on Linux it forks
            # the process, inheriting DuckDB file handles, which causes workers
            # to be OOM-killed or crash immediately.
            effective_workers = min(max_par_workers, len(batches))
            print(f"  Using ThreadPoolExecutor: {effective_workers} workers, "
                  f"{par_batch_size} curves/batch")
            try:
                with ThreadPoolExecutor(max_workers=effective_workers) as ex:
                    futs = [ex.submit(_parallel_worker, b, filters, "fparams")
                            for b in batches]
                    for fut in as_completed(futs):
                        res = fut.result()
                        if res and "fparams" in res:
                            all_fparams.extend(res["fparams"])
            except Exception as par_err:
                print(f"  Parallel path failed ({par_err}), falling back to sequential.")
                all_fparams = []
                can_parallelize = False  # trigger sequential below

        if not can_parallelize or len(batches) <= 1:
            # ── Sequential path ──────────────────────────────────────────────
            print(f"  Using sequential processing: {len(batches)} batch(es), "
                  f"{par_batch_size} curves/batch")
            _seq_conn = get_conn()
            for b in batches:
                res = _parallel_worker(b, filters, "fparams")
                if res and "fparams" in res:
                    all_fparams.extend(res["fparams"])

        print(f"Total fparams found: {len(all_fparams)}")

        return {
            "status": "success",
            "fparams": all_fparams,
            "message": f"Retrieved fparams for {len(all_fparams)} curves"
        }

    except Exception as e:
        logger.error(f"Failed to fetch fparams: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to fetch fparams: {str(e)}"
        })


# New endpoint to fetch all curves' elasticity parameters
@app.post("/get-all-elasticity-params")
async def get_all_elasticity_params(data: Dict[str, Any]):
    """HTTP endpoint to fetch elasticity parameters for all curves.

    Uses ThreadPoolExecutor on all platforms (never ProcessPoolExecutor).
    Automatically falls back to sequential processing on resource-constrained
    environments (e.g. 1-CPU / 0.5 GB Linux containers).
    """
    try:
        filters = data.get("filters", {})
        if not filters.get("e_models"):
            filters["e_models"] = {"constant_filter_array": {"model": "constant"}}

        # Use consistent singleton connection to avoid DuckDB config conflicts.
        conn = get_conn()
        curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
        all_ids = [str(r[0]) for r in curve_ids_result]

        if not all_ids:
            return {"status": "success", "elasticity_params": [], "message": "No curves found"}

        print(f"Found {len(all_ids)} total curves in database")

        can_parallelize, max_par_workers, par_batch_size = _get_parallelism_config()

        batches = [all_ids[i:i + par_batch_size]
                   for i in range(0, len(all_ids), par_batch_size)]

        all_params = []

        if can_parallelize and len(batches) > 1:
            # ── Parallel path (ThreadPoolExecutor on ALL platforms) ──────────
            # ProcessPoolExecutor is intentionally avoided: on Linux it forks
            # the process, inheriting DuckDB file handles, which causes workers
            # to be OOM-killed or crash immediately.
            effective_workers = min(max_par_workers, len(batches))
            print(f"  Using ThreadPoolExecutor: {effective_workers} workers, "
                  f"{par_batch_size} curves/batch")
            try:
                with ThreadPoolExecutor(max_workers=effective_workers) as ex:
                    futs = [ex.submit(_parallel_worker, b, filters, "elasticity")
                            for b in batches]
                    for fut in as_completed(futs):
                        res = fut.result()
                        if res and "elasticity_params" in res:
                            all_params.extend(res["elasticity_params"])
            except Exception as par_err:
                print(f"  Parallel path failed ({par_err}), falling back to sequential.")
                all_params = []
                can_parallelize = False  # trigger sequential below

        if not can_parallelize or len(batches) <= 1:
            # ── Sequential path ──────────────────────────────────────────────
            print(f"  Using sequential processing: {len(batches)} batch(es), "
                  f"{par_batch_size} curves/batch")
            for b in batches:
                res = _parallel_worker(b, filters, "elasticity")
                if res and "elasticity_params" in res:
                    all_params.extend(res["elasticity_params"])

        print(f"Total elasticity params found: {len(all_params)}")

        return {
            "status": "success",
            "elasticity_params": all_params,
            "message": f"Retrieved elasticity params for {len(all_params)} curves"
        }

    except Exception as e:
        logger.error(f"Failed to fetch elasticity params: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to fetch elasticity params: {str(e)}"
        })



# Returns the one-time operation flags for a dataset so the frontend can
# disable checkboxes that have already been applied irreversibly.
@app.get("/dataset-trim-state/{dataset_id}")
async def get_dataset_trim_state(dataset_id: int, user=Depends(get_current_user)):
    """
    Return the persistent trim-state flags for a dataset:
      - force_absolute: True once |F| has been applied to all curves.
      - retract_trimmed: True once the retract phase has been removed.
      - z_normalized: True once z-normalization (z[i] -= z[0]) has been applied.
    The frontend uses these to disable the corresponding checkboxes so the
    operations are never accidentally repeated on already-transformed data.
    """
    try:
        conn = get_conn()
        row = conn.execute(
            "SELECT force_absolute, retract_trimmed, z_normalized FROM datasets WHERE id = ?",
            [dataset_id],
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Dataset {dataset_id} not found")
        return {
            "force_absolute": bool(row[0]) if row[0] is not None else False,
            "retract_trimmed": bool(row[1]) if row[1] is not None else False,
            # Whether z-normalization has already been applied to this dataset.
            "z_normalized": bool(row[2]) if row[2] is not None else False,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trim state: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trim state: {str(e)}")


# Trim data endpoint — removes data points outside the specified force range from all curves
@app.post("/trim-data")
async def trim_data_endpoint(request: Request, user=Depends(get_current_user)):
    """
    Remove rows from all curves in a dataset where force values fall outside
    the provided [force_min, force_max] range. Both bounds are optional:
    omitting force_min skips the lower-bound check; omitting force_max skips
    the upper-bound check.
    """
    # Performs one full trim transaction attempt so the caller can retry on
    # optimistic concurrency conflicts without duplicating the core logic.
    def _run_trim_once(body: Dict[str, Any]) -> Dict[str, Any]:

        # Required dataset identifier
        dataset_id = body.get("dataset_id")
        if dataset_id is None:
            raise HTTPException(status_code=400, detail="dataset_id is required")

        # Optional force bounds (None = no constraint on that side)
        force_min = body.get("force_min")
        force_max = body.get("force_max")
        # When True, each curve is truncated at its peak-force index (argmin of
        # force), discarding the retract phase that follows the deepest indent.
        trim_retract = bool(body.get("trim_retract", False))
        # When True, the absolute value is applied to every force sample before
        # any range-based trimming so that |F| replaces F across all curves.
        absolute_force = bool(body.get("absolute_force", False))
        # When True, shift every curve's z values so the first z becomes 0:
        # z[i] -= z[0]. Applied only when all curves have positive first and last z.
        normalize_z = bool(body.get("normalize_z", False))

        if force_min is None and force_max is None and not trim_retract and not absolute_force and not normalize_z:
            raise HTTPException(
                status_code=400,
                detail="At least one of force_min, force_max, trim_retract, absolute_force, or normalize_z must be provided"
            )

        conn = get_conn()

        # Read whether forces were already made absolute in a previous call so
        # that trim_retract uses the correct peak-detection direction even when
        # absolute_force is not set in this request.
        dataset_row = conn.execute(
            "SELECT force_absolute FROM datasets WHERE id = ?",
            [dataset_id],
        ).fetchone()
        # Default False if the column is missing on a very old DB row.
        already_absolute = bool(dataset_row[0]) if dataset_row and dataset_row[0] is not None else False

        # Forces are considered absolute for this operation if either they were
        # already abs'd in a prior call or the caller requests it now.
        forces_are_absolute = already_absolute or absolute_force

        # Fetch all rows for this dataset so we can filter element-by-element
        rows = conn.execute(
            """
            SELECT curve_id, segment_type, force_values, z_values
            FROM force_vs_z
            WHERE dataset_id = ?
            """,
            [dataset_id],
        ).fetchall()

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"No curves found for dataset_id {dataset_id}"
            )

        # Pre-validate z-normalization: every curve must have positive first and
        # last z values so that the shift z[i] -= z[0] is physically meaningful.
        # If any curve fails the check, reject the whole operation rather than
        # normalizing only a subset and leaving the dataset in a mixed state.
        if normalize_z:
            for curve_id, segment_type, force_values, z_values in rows:
                if not z_values or len(z_values) < 2:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Curve {curve_id} ({segment_type}) has fewer than 2 z-values — "
                            "cannot validate z-normalization."
                        ),
                    )
                # First and last z must both be strictly positive.
                z_first = z_values[0]
                z_last = z_values[-1]
                if z_first <= 0 or z_last <= 0:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Curve {curve_id} ({segment_type}) has non-positive z values "
                            f"(first={z_first:.4g}, last={z_last:.4g}). "
                            "All curves must have positive first and last z values for normalization."
                        ),
                    )

        # Tracks how many data points were trimmed across all curves
        total_trimmed = 0

        for curve_id, segment_type, force_values, z_values in rows:
            if not force_values:
                continue

            # Apply absolute value to all force samples first so that
            # subsequent range trimming (and retract detection) operates on |F|.
            if absolute_force:
                force_values = [abs(f) for f in force_values]

            # After abs(), all values are ≥ 0 so a negative lower bound is
            # meaningless (it would let everything pass) and must be ignored to
            # avoid silently discarding data when the caller passed the original
            # signed force_min alongside absolute_force=True.
            effective_force_min = force_min
            if forces_are_absolute and force_min is not None and force_min < 0:
                effective_force_min = None

            # Build keep-mask: True for indices that satisfy both bounds
            mask = []
            for f in force_values:
                keep = True
                if effective_force_min is not None and f < effective_force_min:
                    keep = False
                if force_max is not None and f > force_max:
                    keep = False
                mask.append(keep)

            # Apply mask to both arrays in lockstep to preserve pairing
            new_force = [f for f, m in zip(force_values, mask) if m]
            new_z = (
                [z for z, m in zip(z_values, mask) if m]
                if z_values is not None
                else None
            )

            # Retract-phase trimming: keep only the approach portion of each
            # curve — everything up to and including the peak-force sample.
            # On signed data the deepest indentation point is the most-negative
            # (minimum) force value. Once forces are absolute (either from this
            # request or a prior one), all values are ≥ 0, so the deepest point
            # becomes the maximum instead. Using min() on abs'd data would
            # wrongly find the near-zero start of contact and discard almost
            # the entire approach curve.
            if trim_retract and new_force:
                peak_idx = (
                    new_force.index(max(new_force))
                    if forces_are_absolute
                    else new_force.index(min(new_force))
                )
                new_force = new_force[: peak_idx + 1]
                if new_z is not None:
                    new_z = new_z[: peak_idx + 1]

            # Shift z so the first point sits at z=0: z[i] -= z[0].
            # This collapses the absolute piezo offset and aligns all curves
            # to a common origin without changing their relative spacing.
            if normalize_z and new_z is not None and len(new_z) > 0:
                z_origin = new_z[0]
                new_z = [z - z_origin for z in new_z]

            # Count how many points were removed for this curve/segment
            total_trimmed += len(force_values) - len(new_force)

            conn.execute(
                """
                UPDATE force_vs_z
                SET force_values = ?, z_values = ?
                WHERE dataset_id = ? AND curve_id = ? AND segment_type = ?
                """,
                [new_force, new_z, dataset_id, curve_id, segment_type],
            )

        # Persist flags so the frontend can disable already-applied operations
        # and so future calls know the current data state without re-sending flags.
        #   force_absolute  — set once |F| has been written into force_vs_z.
        #   retract_trimmed — set once the retract phase has been discarded.
        #   z_normalized    — set once z values have been shifted by z[0] per curve.
        # All columns are updated in a single statement to stay consistent.
        update_cols = []
        if forces_are_absolute:
            update_cols.append("force_absolute = TRUE")
        if trim_retract:
            update_cols.append("retract_trimmed = TRUE")
        if normalize_z:
            update_cols.append("z_normalized = TRUE")
        if update_cols:
            conn.execute(
                f"UPDATE datasets SET {', '.join(update_cols)} WHERE id = ?",
                [dataset_id],
            )

        # Invalidate caches so subsequent queries use the trimmed data
        clear_cache(conn)

        logger.info(
            f"Trimmed {total_trimmed} data points from dataset {dataset_id} "
            f"(force_min={force_min}, force_max={force_max})"
        )

        return {
            "status": "success",
            "message": (
                f"Data trimmed successfully. "
                f"Removed {total_trimmed} data points across {len(rows)} curve segments."
            ),
            "trimmed_points": total_trimmed,
        }

    try:
        # Captures the client payload once so each retry uses identical inputs.
        body = await request.json()
        # Limits optimistic-concurrency retries to avoid infinite loops.
        max_retries = 3
        # Base delay (seconds) for exponential backoff between retry attempts.
        retry_delay_seconds = 0.05
        # Stores the last seen exception to preserve root-cause reporting.
        last_error = None

        for attempt in range(max_retries):
            try:
                return _run_trim_once(body)
            except Exception as trim_error:
                # Tracks the latest failure so we can re-raise after final attempt.
                last_error = trim_error
                # Normalizes DuckDB error text for robust conflict detection.
                error_text = str(trim_error).lower()
                # Prevent crash on transient concurrent updates to the same row.
                is_write_conflict = "write-write conflict" in error_text
                if not is_write_conflict or attempt == max_retries - 1:
                    raise
                # Calculates exponential backoff to reduce immediate contention.
                backoff_seconds = retry_delay_seconds * (2 ** attempt)
                logger.warning(
                    "Write-write conflict while trimming dataset; retrying "
                    f"(attempt {attempt + 1}/{max_retries}) after {backoff_seconds:.3f}s: {trim_error}"
                )
                await asyncio.sleep(backoff_seconds)

        if last_error is not None:
            raise last_error

    except HTTPException:
        # Re-raise explicit HTTP exceptions unchanged
        raise
    except Exception as e:
        logger.error(f"Error trimming data: {e}")
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Failed to trim data: {str(e)}"}
        )


# File-serving endpoint
@app.get("/exports/{file_path:path}")
async def serve_exported_file(file_path: str, user=Depends(get_current_user)):
    """Serve an exported file from the exports directory."""
    full_path = os.path.join("", file_path)
    print(full_path)
    if not os.path.exists(full_path):
        logger.error(f"File not found: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path, filename=os.path.basename(full_path))


# Cache management endpoint
@app.delete("/clear-cache")
async def clear_cache_endpoint(cache_type: str = None):
    """
    Clear cache tables. Can clear all caches or specific cache types.
    
    Query Parameters:
        cache_type: Optional. One of: "contact_points", "indentations", "elspectra"
                    If not provided, clears all cache tables.
    
    Returns:
        Dictionary with counts of deleted rows for each cache table
    """
    try:
        conn = get_conn()
        results = clear_cache(conn, cache_type)
        
        return {
            "status": "success",
            "message": f"Cache cleared successfully",
            "deleted_rows": results
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail={
            "status": "error",
            "message": str(e)
        })
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to clear cache: {str(e)}"
        })


if __name__ == '__main__':
    # Required on Windows so that spawned worker processes don't re-launch the server
    multiprocessing.freeze_support()
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)