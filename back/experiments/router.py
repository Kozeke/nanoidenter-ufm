from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional

from auth.dependencies import get_current_user
from db.experiments import (
    create_experiment,
    list_experiments,
    get_experiment,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


class SaveExperimentRequest(BaseModel):
    name: str
    metadata: Dict
    filters: Dict
    elasticity_params: Dict
    force_model_params: Dict
    results: Dict
    curve_id: Optional[str] = None


@router.post("")
def save_experiment(
    data: SaveExperimentRequest,
    user=Depends(get_current_user),
):
    sample = data.metadata.get("sample_row", {})
    curve_metadata = {
        "spring_constant": sample.get("spring_constant"),
        "tip_radius": sample.get("tip_radius"),
        "tip_geometry": sample.get("tip_geometry"),
    }
    

    create_experiment(
        user_id=user["id"],
        name=data.name,
        spring_constant=curve_metadata["spring_constant"],
        curve_id=data.curve_id,
        tip_radius=curve_metadata["tip_radius"],
        tip_geometry=curve_metadata["tip_geometry"],
        filters=data.filters,
        elasticity_params=data.elasticity_params,
        force_model_params=data.force_model_params,
        results=data.results,
    )

    return {"status": "ok"}


@router.get("")
def get_my_experiments(user=Depends(get_current_user)):
    return list_experiments(user["id"])


@router.get("/{experiment_id}")
def load_experiment(
    experiment_id: int,
    user=Depends(get_current_user),
):
    exp = get_experiment(experiment_id, user["id"])
    if not exp:
        raise HTTPException(404, "Experiment not found")

    return exp
