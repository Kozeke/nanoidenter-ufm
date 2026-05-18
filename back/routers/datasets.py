# Dataset endpoints for last accessed lookup and table-friendly dataset summaries.
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from db.connection import get_conn
from db.datasets import (
    delete_dataset_for_user,
    get_dataset_for_user,
    list_datasets_for_user,
    update_dataset_metadata_for_user,
)
from auth.dependencies import get_current_user

router = APIRouter(prefix="/datasets", tags=["datasets"])


# Request model for editable metadata fields in the dataset preview modal.
class UpdateDatasetMetadataRequest(BaseModel):
    # Stores optional spring constant metadata submitted by the frontend.
    spring_constant: Optional[float] = None
    # Stores optional tip radius metadata submitted by the frontend.
    tip_radius: Optional[float] = None
    # Stores optional tip geometry metadata submitted by the frontend.
    tip_geometry: Optional[str] = None
    # Stores optional tip angle metadata submitted by the frontend.
    tip_angle: Optional[float] = None


@router.get("")
async def get_datasets(user=Depends(get_current_user)):
    """List lightweight dataset summaries for the current user."""
    return list_datasets_for_user(user["id"])


@router.get("/last-accessed")
async def get_last_accessed_file(user=Depends(get_current_user)):
    """Get the last accessed dataset for the current user."""
    conn = get_conn()
    
    dataset = conn.execute("""
        SELECT id, name, filename, num_curves, last_accessed_at
        FROM datasets 
        WHERE user_id = ?
        ORDER BY last_accessed_at DESC
        LIMIT 1
    """, [user["id"]]).fetchone()
    
    if not dataset:
        return {"status": "none"}
    
    return {
        "status": "success",
        "dataset_id": dataset[0],
        "name": dataset[1],
        "filename": dataset[2],
        "num_curves": dataset[3],
        "last_accessed_at": str(dataset[4])
    }


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: int, user=Depends(get_current_user)):
    """Return one dataset summary for preview details."""
    # Stores the dataset summary if the current user owns the record.
    dataset = get_dataset_for_user(dataset_id, user["id"])
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: int, user=Depends(get_current_user)):
    """Delete one dataset if it belongs to the current user."""
    # Stores delete result and reason for client-facing response handling.
    deleted, message = delete_dataset_for_user(dataset_id, user["id"])
    if not deleted:
        if message == "Dataset not found":
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    return {"status": "ok", "message": message}


@router.patch("/{dataset_id}/metadata")
async def update_dataset_metadata(
    dataset_id: int,
    payload: UpdateDatasetMetadataRequest,
    user=Depends(get_current_user),
):
    """Update editable metadata fields for one user-owned dataset."""
    # Stores update result and message for API response handling.
    updated, message = update_dataset_metadata_for_user(
        dataset_id=dataset_id,
        user_id=user["id"],
        spring_constant=payload.spring_constant,
        tip_radius=payload.tip_radius,
        tip_geometry=payload.tip_geometry,
        tip_angle=payload.tip_angle,
    )
    if not updated:
        if message == "Dataset not found":
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)

    # Stores refreshed dataset snapshot so frontend can render updated values.
    dataset = get_dataset_for_user(dataset_id, user["id"])
    return {"status": "ok", "message": message, "dataset": dataset}


