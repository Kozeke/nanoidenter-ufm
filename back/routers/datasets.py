from fastapi import APIRouter, Depends
from db.connection import get_conn
from auth.dependencies import get_current_user

router = APIRouter(prefix="/datasets", tags=["datasets"])

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
