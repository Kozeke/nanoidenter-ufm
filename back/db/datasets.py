# Dataset persistence helpers for creating, updating, and listing dataset records.
import hashlib
import os
import uuid
from typing import List, Optional, Tuple
from db.connection import get_conn


def create_dataset(
    user_id: int,
    name: str,
    filename: str,
    description: Optional[str] = None,
    file_hash: Optional[str] = None,
    num_curves: int = 0,
    spring_constant: Optional[float] = None,
    tip_radius: Optional[float] = None,
    tip_geometry: Optional[str] = None,
    tip_angle: Optional[float] = None,
    velocity: Optional[float] = None,
    force_scale_to_n: Optional[float] = None,
    z_scale_to_m: Optional[float] = None,
    sensor_type: Optional[str] = None,
) -> int:
    """
    Always creates a new dataset record and returns its ID.
    Every import is treated as a fresh dataset regardless of duplicate filenames or metadata,
    so re-uploading the same file never triggers a primary key conflict.
    """
    conn = get_conn()

    # Build a base content hash from the filename when none is supplied
    if file_hash is None:
        file_hash = hashlib.md5(filename.encode()).hexdigest()

    # Append a random UUID so every call produces a globally unique file_hash,
    # ensuring no two imports ever collide on the UNIQUE file_hash constraint.
    unique_file_hash = hashlib.md5(
        f"{file_hash}_{user_id}_{name}_{uuid.uuid4()}".encode()
    ).hexdigest()

    # Derive the next sequential dataset ID (no auto-increment sequence exists yet)
    result = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM datasets").fetchone()
    dataset_id = result[0] if result else 1

    conn.execute(
        """
        INSERT INTO datasets (
            id, name, description, filename, file_hash, user_id,
            num_curves, spring_constant, tip_radius, tip_geometry, tip_angle,
            velocity, force_scale_to_n, z_scale_to_m, sensor_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            dataset_id,
            name,
            description,
            filename,
            unique_file_hash,
            user_id,
            num_curves,
            spring_constant,
            tip_radius,
            tip_geometry,
            tip_angle,
            velocity,
            force_scale_to_n,
            z_scale_to_m,
            sensor_type,
        ),
    )

    return dataset_id


def get_dataset(dataset_id: int) -> Optional[dict]:
    """Get a dataset by ID."""
    conn = get_conn()
    
    row = conn.execute(
        """
        SELECT id, name, description, filename, file_hash, user_id,
               created_at, updated_at, last_accessed_at, num_curves, spring_constant,
               tip_radius, tip_geometry, tip_angle,
               velocity, force_scale_to_n, z_scale_to_m, sensor_type
        FROM datasets
        WHERE id = ?
        """,
        (dataset_id,),
    ).fetchone()
    
    if not row:
        return None
    
    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "filename": row[3],
        "file_hash": row[4],
        "user_id": row[5],
        "created_at": row[6],
        "updated_at": row[7],
        "last_accessed_at": row[8],
        "num_curves": row[9],
        "spring_constant": row[10],
        "tip_radius": row[11],
        "tip_geometry": row[12],
        "tip_angle": row[13],
        "velocity": row[14],
        "force_scale_to_n": row[15],
        "z_scale_to_m": row[16],
        "sensor_type": row[17],
    }


def update_dataset(
    dataset_id: int,
    name: Optional[str] = None,
    num_curves: Optional[int] = None,
    spring_constant: Optional[float] = None,
    tip_radius: Optional[float] = None,
    tip_geometry: Optional[str] = None,
    tip_angle: Optional[float] = None,
    velocity: Optional[float] = None,
    force_scale_to_n: Optional[float] = None,
    z_scale_to_m: Optional[float] = None,
    sensor_type: Optional[str] = None,
) -> bool:
    """Update dataset metadata."""
    conn = get_conn()
    
    updates = []
    params = []
    
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if num_curves is not None:
        updates.append("num_curves = ?")
        params.append(num_curves)
    if spring_constant is not None:
        updates.append("spring_constant = ?")
        params.append(spring_constant)
    if tip_radius is not None:
        updates.append("tip_radius = ?")
        params.append(tip_radius)
    if tip_geometry is not None:
        updates.append("tip_geometry = ?")
        params.append(tip_geometry)
    if tip_angle is not None:
        updates.append("tip_angle = ?")
        params.append(tip_angle)
    if velocity is not None:
        updates.append("velocity = ?")
        params.append(velocity)
    if force_scale_to_n is not None:
        updates.append("force_scale_to_n = ?")
        params.append(force_scale_to_n)
    if z_scale_to_m is not None:
        updates.append("z_scale_to_m = ?")
        params.append(z_scale_to_m)
    if sensor_type is not None:
        updates.append("sensor_type = ?")
        params.append(sensor_type)
    
    if not updates:
        return False
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(dataset_id)
    
    conn.execute(
        f"UPDATE datasets SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    
    return True


def list_datasets_for_user(user_id: int) -> List[dict]:
    """Return dataset summary rows for table rendering without loading curve points."""
    conn = get_conn()

    # Retrieves user-owned datasets with lightweight summary and metadata columns only.
    rows = conn.execute(
        """
        SELECT
            id,
            name,
            filename,
            num_curves,
            spring_constant,
            tip_radius,
            tip_geometry,
            tip_angle,
            velocity,
            force_scale_to_n,
            z_scale_to_m,
            sensor_type,
            created_at
        FROM datasets
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user_id,),
    ).fetchall()

    # Maps DB rows to API-friendly dictionaries expected by the frontend table.
    datasets: List[dict] = []
    for row in rows:
        # Derives file format from the stored filename extension.
        file_format = os.path.splitext(row[2] or "")[1].lstrip(".").lower() or "unknown"
        datasets.append(
            {
                "id": row[0],
                "name": row[1],
                "filename": row[2],
                "format": file_format,
                "length": row[3] if row[3] is not None else 0,
                "created_at": row[12],
                "metadata": {
                    "spring_constant": row[4],
                    "tip_radius": row[5],
                    "tip_geometry": row[6],
                    "tip_angle": row[7],
                    "velocity": row[8],
                    "force_scale_to_n": row[9],
                    "z_scale_to_m": row[10],
                    "sensor_type": row[11],
                },
            }
        )

    return datasets


# Retrieves one dataset summary row for a specific user.
def get_dataset_for_user(dataset_id: int, user_id: int) -> Optional[dict]:
    # Stores shared DB connection for secure user-scoped lookup.
    conn = get_conn()

    # Stores one matching dataset row if the record belongs to the user.
    row = conn.execute(
        """
        SELECT
            id,
            name,
            description,
            filename,
            num_curves,
            spring_constant,
            tip_radius,
            tip_geometry,
            tip_angle,
            velocity,
            force_scale_to_n,
            z_scale_to_m,
            sensor_type,
            created_at,
            last_accessed_at
        FROM datasets
        WHERE id = ? AND user_id = ?
        """,
        (dataset_id, user_id),
    ).fetchone()

    if not row:
        return None

    # Derives file format from the stored filename extension.
    file_format = os.path.splitext(row[3] or "")[1].lstrip(".").lower() or "unknown"

    return {
        "id": row[0],
        "name": row[1],
        "description": row[2],
        "filename": row[3],
        "format": file_format,
        "length": row[4] if row[4] is not None else 0,
        "created_at": row[13],
        "last_accessed_at": row[14],
        "metadata": {
            "spring_constant": row[5],
            "tip_radius": row[6],
            "tip_geometry": row[7],
            "tip_angle": row[8],
            "velocity": row[9],
            "force_scale_to_n": row[10],
            "z_scale_to_m": row[11],
            "sensor_type": row[12],
        },
    }


# Deletes one dataset and its curve rows when it belongs to the user.
def delete_dataset_for_user(dataset_id: int, user_id: int) -> Tuple[bool, str]:
    # Stores shared DB connection for ownership checks and deletion.
    conn = get_conn()
    # Stores normalized integer identifier to keep query parameter type stable.
    normalized_dataset_id = int(dataset_id)
    # Stores normalized user identifier to keep ownership checks type-consistent.
    normalized_user_id = int(user_id)

    # Stores whether the target dataset exists for the authenticated user.
    # Explicit CAST prevents DuckDB from inferring the bound parameter as DOUBLE.
    dataset_row = conn.execute(
        """
        SELECT id
        FROM datasets
        WHERE id = CAST(? AS INTEGER) AND user_id = CAST(? AS INTEGER)
        """,
        (normalized_dataset_id, normalized_user_id),
    ).fetchone()
    if not dataset_row:
        return False, "Dataset not found"

    # Stores count of experiments that still reference this dataset.
    # Explicit CAST guards against the same DOUBLE-vs-INTEGER DuckDB type error.
    referencing_experiments = conn.execute(
        """
        SELECT COUNT(*)
        FROM experiments
        WHERE dataset_id = CAST(? AS INTEGER) AND user_id = CAST(? AS INTEGER)
        """,
        (normalized_dataset_id, normalized_user_id),
    ).fetchone()[0]
    if referencing_experiments > 0:
        return (
            False,
            "Cannot delete dataset with saved experiments. Delete related experiments first.",
        )

    # Removes all curve rows tied to the dataset to keep tables consistent.
    # CAST(? AS INTEGER) prevents a DuckDB internal type-mismatch when the
    # driver infers the bound parameter as DOUBLE instead of INTEGER.
    conn.execute(
        """
        DELETE FROM force_vs_z
        WHERE dataset_id = CAST(? AS INTEGER)
        """,
        (normalized_dataset_id,),
    )
    # Removes the dataset row by primary key after ownership has already been validated.
    # Explicit cast guards against the same DOUBLE-vs-INTEGER DuckDB assertion error.
    conn.execute(
        """
        DELETE FROM datasets
        WHERE id = CAST(? AS INTEGER)
        """,
        (normalized_dataset_id,),
    )
    return True, "Dataset deleted successfully"


# Updates editable dataset metadata fields for a user-owned dataset.
def update_dataset_metadata_for_user(
    dataset_id: int,
    user_id: int,
    spring_constant: Optional[float] = None,
    tip_radius: Optional[float] = None,
    tip_geometry: Optional[str] = None,
    tip_angle: Optional[float] = None,
    velocity: Optional[float] = None,
    force_scale_to_n: Optional[float] = None,
    z_scale_to_m: Optional[float] = None,
    sensor_type: Optional[str] = None,
) -> Tuple[bool, str]:
    # Stores shared DB connection for ownership checks and update operations.
    conn = get_conn()

    # Stores whether the dataset exists for the authenticated user.
    dataset_row = conn.execute(
        """
        SELECT id
        FROM datasets
        WHERE id = ? AND user_id = ?
        """,
        (dataset_id, user_id),
    ).fetchone()
    if not dataset_row:
        return False, "Dataset not found"

    # Stores column update expressions for the dynamic metadata update query.
    update_parts: List[str] = []
    # Stores ordered query parameters matching the dynamic update expressions.
    query_params: List[object] = []

    if spring_constant is not None:
        update_parts.append("spring_constant = ?")
        query_params.append(spring_constant)
    if tip_radius is not None:
        update_parts.append("tip_radius = ?")
        query_params.append(tip_radius)
    if tip_geometry is not None:
        update_parts.append("tip_geometry = ?")
        query_params.append(tip_geometry)
    if tip_angle is not None:
        update_parts.append("tip_angle = ?")
        query_params.append(tip_angle)
    if velocity is not None:
        update_parts.append("velocity = ?")
        query_params.append(velocity)
    if force_scale_to_n is not None:
        update_parts.append("force_scale_to_n = ?")
        query_params.append(force_scale_to_n)
    if z_scale_to_m is not None:
        update_parts.append("z_scale_to_m = ?")
        query_params.append(z_scale_to_m)
    if sensor_type is not None:
        update_parts.append("sensor_type = ?")
        query_params.append(sensor_type)

    if not update_parts:
        return False, "No metadata fields provided for update"

    # Updates modification timestamp whenever metadata fields are changed.
    update_parts.append("updated_at = CURRENT_TIMESTAMP")
    query_params.extend([dataset_id, user_id])
    # Prevent crash if dynamic SQL updates fail due to database issues.
    try:
        conn.execute(
            f"""
            UPDATE datasets
            SET {", ".join(update_parts)}
            WHERE id = ? AND user_id = ?
            """,
            query_params,
        )
    except Exception:
        return False, "Failed to update dataset metadata"

    # Propagate the same changes to every curve row for this dataset so that
    # per-curve consumers (e.g. the get_metadata websocket action and the
    # fetch_curves_batch / elasticity computation pipeline, which read
    # spring_constant, tip_radius, and tip_geometry directly from force_vs_z)
    # don't keep serving the stale value captured at ingestion time.
    # NOTE: force_vs_z has no tip_angle column, so tip_angle lives only on the
    # datasets row and is intentionally excluded from this per-curve sync.
    # Stores force_vs_z column update expressions mirroring the dataset changes.
    curve_update_parts: List[str] = []
    # Stores ordered query parameters for the force_vs_z update statement.
    curve_query_params: List[object] = []

    if spring_constant is not None:
        curve_update_parts.append("spring_constant = ?")
        curve_query_params.append(spring_constant)
    if tip_radius is not None:
        curve_update_parts.append("tip_radius = ?")
        curve_query_params.append(tip_radius)
    if tip_geometry is not None:
        curve_update_parts.append("tip_geometry = ?")
        curve_query_params.append(tip_geometry)

    if curve_update_parts:
        curve_query_params.append(dataset_id)
        # Prevent crash if the per-curve sync fails after the dataset row updated.
        try:
            conn.execute(
                f"""
                UPDATE force_vs_z
                SET {", ".join(curve_update_parts)}
                WHERE dataset_id = ?
                """,
                curve_query_params,
            )
        except Exception:
            # The dataset-level metadata already updated successfully; surface a
            # distinct message so the caller/UI knows the curve rows may now be
            # out of sync and a retry may be needed.
            return (
                False,
                "Dataset metadata updated, but failed to sync curve data. Please retry.",
            )

    return True, "Dataset metadata updated successfully"
