import hashlib
from typing import Optional
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
) -> int:
    """
    Create a new dataset record and return its ID.
    If a dataset with the same file_hash already exists, returns the existing dataset ID.
    """
    conn = get_conn()
    
    # Generate file hash if not provided
    if file_hash is None:
        # For now, use filename as hash (can be improved to hash file contents)
        file_hash = hashlib.md5(filename.encode()).hexdigest()
    
    # Make file_hash unique per user and name combination to allow same file with different names
    # Append user_id and name to file_hash to make it unique
    unique_file_hash = hashlib.md5(f"{file_hash}_{user_id}_{name}".encode()).hexdigest()
    
    # Check if dataset with this unique_file_hash already exists
    # This allows the same file to be opened multiple times with different names as separate datasets
    existing = conn.execute(
        "SELECT id FROM datasets WHERE file_hash = ?",
        (unique_file_hash,)
    ).fetchone()
    
    if existing:
        # Return existing dataset ID (same file, same user, same name)
        existing_id = existing[0]
        # Optionally update metadata if provided
        update_dataset(
            existing_id,
            num_curves=num_curves if num_curves > 0 else None,
            spring_constant=spring_constant,
            tip_radius=tip_radius,
            tip_geometry=tip_geometry,
        )
        return existing_id
    
    # If unique_file_hash doesn't exist, create a new dataset
    # This allows the same file to be opened with different names as separate datasets
    
    # Get the next dataset ID
    result = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM datasets").fetchone()
    dataset_id = result[0] if result else 1
    
    try:
        conn.execute(
            """
            INSERT INTO datasets (
                id, name, description, filename, file_hash, user_id,
                num_curves, spring_constant, tip_radius, tip_geometry
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dataset_id,
                name,
                description,
                filename,
                unique_file_hash,  # Use unique hash that includes user_id and name
                user_id,
                num_curves,
                spring_constant,
                tip_radius,
                tip_geometry,
            ),
        )
    except Exception as e:
        # If unique constraint fails, try to get existing dataset
        # This shouldn't happen with unique_file_hash, but handle it just in case
        existing = conn.execute(
            "SELECT id FROM datasets WHERE file_hash = ?",
            (unique_file_hash,)
        ).fetchone()
        if existing:
            return existing[0]
        raise
    
    return dataset_id


def get_dataset(dataset_id: int) -> Optional[dict]:
    """Get a dataset by ID."""
    conn = get_conn()
    
    row = conn.execute(
        """
        SELECT id, name, description, filename, file_hash, user_id,
               created_at, updated_at, last_accessed_at, num_curves, spring_constant,
               tip_radius, tip_geometry
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
    }


def update_dataset(
    dataset_id: int,
    name: Optional[str] = None,
    num_curves: Optional[int] = None,
    spring_constant: Optional[float] = None,
    tip_radius: Optional[float] = None,
    tip_geometry: Optional[str] = None,
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
    
    if not updates:
        return False
    
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(dataset_id)
    
    conn.execute(
        f"UPDATE datasets SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    
    return True
