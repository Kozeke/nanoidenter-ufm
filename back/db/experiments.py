import json
from typing import List, Optional
from db.connection import get_conn


def create_experiment(
    user_id: int,
    name: str,
    curve_id: str,
    spring_constant: float,
    tip_radius: float,
    tip_geometry: str,
    filters: dict,
    elasticity_params: dict,
    force_model_params: dict,
    results: dict,
    dataset_id: Optional[int] = None,
    # Optional free-text description provided by the user at save time
    description: Optional[str] = None,
):
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO experiments (
            user_id,
            name,
            description,
            dataset_id,
            spring_constant,
            curve_id,
            tip_radius,
            tip_geometry,
            filters_json,
            elasticity_params_json,
            force_model_params_json,
            f_model,
            e_model,
            youngs_modulus_mean,
            youngs_modulus_std,
            k_raw_mean,
            k_raw_std,
            k_contact_mean,
            k_contact_std,
            stiffness_youngs_modulus_mean,
            stiffness_youngs_modulus_std
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            name,
            description,
            dataset_id,
            spring_constant,
            curve_id,
            tip_radius,
            tip_geometry,
            json.dumps(filters),
            json.dumps(elasticity_params),
            json.dumps(force_model_params),
            next(iter(filters.get("f_models", {})), None),
            next(iter(filters.get("e_models", {})), None),
            results.get("youngs_modulus_mean"),
            results.get("youngs_modulus_std"),
            # K_raw, K_contact, and E computed by the LinearWindowFit regular filter
            # (see linear_window_fit_filter.py / compute_derived()), distinct from the
            # Hertz-model youngs_modulus_mean/std above.
            results.get("k_raw_mean"),
            results.get("k_raw_std"),
            results.get("k_contact_mean"),
            results.get("k_contact_std"),
            results.get("stiffness_youngs_modulus_mean"),
            results.get("stiffness_youngs_modulus_std"),
        ),
    )


def list_experiments(user_id: int) -> List[dict]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT
            id,
            name,
            description,
            curve_id,
            created_at,
            tip_geometry,
            tip_radius,
            e_model,
            youngs_modulus_mean,
            youngs_modulus_std,
            k_raw_mean,
            k_raw_std,
            k_contact_mean,
            k_contact_std,
            stiffness_youngs_modulus_mean,
            stiffness_youngs_modulus_std
        FROM experiments
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user_id,),
    ).fetchall()

    return [
        {
            "id": r[0],
            "name": r[1],
            # Optional description provided at save time
            "description": r[2],
            "curve_id": r[3],
            "created_at": r[4],
            "tip_geometry": r[5],
            "tip_radius": r[6],
            "e_model": r[7],
            "youngs_modulus_mean": r[8],
            "youngs_modulus_std": r[9],
            # LinearWindowFit-derived stiffness results (see linear_window_fit_filter.py)
            "k_raw_mean": r[10],
            "k_raw_std": r[11],
            "k_contact_mean": r[12],
            "k_contact_std": r[13],
            "stiffness_youngs_modulus_mean": r[14],
            "stiffness_youngs_modulus_std": r[15],
            "status_code": "success" if any(v is not None for v in r[8:16]) else "pending"
        }
        for r in rows
    ]


def get_experiment(exp_id: int, user_id: int) -> Optional[dict]:
    conn = get_conn()

    row = conn.execute(
        """
        SELECT
            e.id,
            e.name,
            e.description,
            e.dataset_id,
            e.curve_id,
            e.spring_constant,
            e.tip_radius,
            e.tip_geometry,
            e.filters_json,
            e.elasticity_params_json,
            e.force_model_params_json,
            e.youngs_modulus_mean,
            e.youngs_modulus_std,
            d.name as dataset_name,
            e.k_raw_mean,
            e.k_raw_std,
            e.k_contact_mean,
            e.k_contact_std,
            e.stiffness_youngs_modulus_mean,
            e.stiffness_youngs_modulus_std
        FROM experiments e
        LEFT JOIN datasets d ON e.dataset_id = d.id
        WHERE e.id = ? AND e.user_id = ?
        """,
        (exp_id, user_id),
    ).fetchone()

    if not row:
        return None
    
    return {
        "id": row[0],
        "name": row[1],
        # Optional description provided at save time
        "description": row[2],
        "dataset_id": row[3],
        "curve_id": row[4],
        "metadata": {
            "spring_constant": row[5],
            "tip_radius": row[6],
            "tip_geometry": row[7],
        },
        "filters": json.loads(row[8]),
        "elasticity_params": json.loads(row[9]),
        "force_model_params": json.loads(row[10]),
        "youngs_modulus_mean": row[11],
        "youngs_modulus_std": row[12],
        "dataset_name": row[13],  # The name from the datasets table (saved from metadata file_id)
        # LinearWindowFit-derived stiffness results (see linear_window_fit_filter.py)
        "k_raw_mean": row[14],
        "k_raw_std": row[15],
        "k_contact_mean": row[16],
        "k_contact_std": row[17],
        "stiffness_youngs_modulus_mean": row[18],
        "stiffness_youngs_modulus_std": row[19],
    }


def delete_experiment(exp_id: int, user_id: int) -> bool:
    """
    Delete an experiment by ID, ensuring it belongs to the user.
    Returns True if deleted, False if not found.
    """
    conn = get_conn()
    
    # First verify the experiment exists and belongs to the user
    exp = get_experiment(exp_id, user_id)
    if not exp:
        return False
    
    # Then delete it
    conn.execute(
        """
        DELETE FROM experiments
        WHERE id = ? AND user_id = ?
        """,
        (exp_id, user_id),
    )
    
    return True