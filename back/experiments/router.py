from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional

from auth.dependencies import get_current_user
from db.experiments import (
    create_experiment,
    update_experiment,
    list_experiments,
    get_experiment,
    delete_experiment,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])


class SaveExperimentRequest(BaseModel):
    name: str
    # Optional free-text description entered by the user in the save modal
    description: Optional[str] = None
    metadata: Dict
    filters: Dict
    elasticity_params: Dict
    force_model_params: Dict
    results: Dict
    curve_id: Optional[str] = None
    dataset_id: Optional[int] = None


def _curve_metadata_from_request(data: SaveExperimentRequest) -> dict:
    # Pulls tip/spring fields from the metadata sample row sent by the dashboard
    sample = data.metadata.get("sample_row", {})
    return {
        "spring_constant": sample.get("spring_constant"),
        "tip_radius": sample.get("tip_radius"),
        "tip_geometry": sample.get("tip_geometry"),
    }


def _status_from_results(results: Dict) -> tuple:
    # Treats any non-empty result value as a finished analysis run
    has_results = bool(results) and any(
        value is not None and value != ""
        for value in results.values()
    )
    status_code = "success" if has_results else "pending"
    return has_results, status_code


@router.post("")
def save_experiment(
    data: SaveExperimentRequest,
    user=Depends(get_current_user),
):
    # Tip geometry and spring constant extracted from dashboard metadata
    curve_metadata = _curve_metadata_from_request(data)
    # Whether results exist and the status label to return to the client
    has_results, status_code = _status_from_results(data.results)

    # Newly inserted experiment primary key so the client can update later
    experiment_id = create_experiment(
        user_id=user["id"],
        name=data.name,
        description=data.description,
        spring_constant=curve_metadata["spring_constant"],
        curve_id=data.curve_id,
        tip_radius=curve_metadata["tip_radius"],
        tip_geometry=curve_metadata["tip_geometry"],
        filters=data.filters,
        elasticity_params=data.elasticity_params,
        force_model_params=data.force_model_params,
        results=data.results,
        dataset_id=data.dataset_id,
    )

    message = "Experiment saved successfully" if has_results else "Experiment saved (pending results)"
    return {
        "status": "ok",
        "status_code": status_code,
        "message": message,
        "id": experiment_id,
    }


@router.put("/{experiment_id}")
def update_experiment_endpoint(
    experiment_id: int,
    data: SaveExperimentRequest,
    user=Depends(get_current_user),
):
    # Tip geometry and spring constant extracted from dashboard metadata
    curve_metadata = _curve_metadata_from_request(data)
    # Whether results exist and the status label to return to the client
    has_results, status_code = _status_from_results(data.results)

    # Overwrites the opened experiment when the id belongs to this user
    updated = update_experiment(
        exp_id=experiment_id,
        user_id=user["id"],
        name=data.name,
        description=data.description,
        spring_constant=curve_metadata["spring_constant"],
        curve_id=data.curve_id,
        tip_radius=curve_metadata["tip_radius"],
        tip_geometry=curve_metadata["tip_geometry"],
        filters=data.filters,
        elasticity_params=data.elasticity_params,
        force_model_params=data.force_model_params,
        results=data.results,
        dataset_id=data.dataset_id,
    )
    if not updated:
        raise HTTPException(404, "Experiment not found")

    message = (
        "Experiment updated successfully"
        if has_results
        else "Experiment updated (pending results)"
    )
    return {
        "status": "ok",
        "status_code": status_code,
        "message": message,
        "id": experiment_id,
    }


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


@router.delete("/{experiment_id}")
def delete_experiment_endpoint(
    experiment_id: int,
    user=Depends(get_current_user),
):
    deleted = delete_experiment(experiment_id, user["id"])
    if not deleted:
        raise HTTPException(404, "Experiment not found")
    
    return {"status": "ok", "message": "Experiment deleted successfully"}
