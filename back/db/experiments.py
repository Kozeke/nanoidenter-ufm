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
):
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO experiments (
            user_id,
            name,
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
            youngs_modulus_std
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            name,
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
            # json.dumps(results.get("elasticity_param")),
        ),
    )


def list_experiments(user_id: int) -> List[dict]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT
            id,
            name,
            curve_id,
            created_at,
            tip_geometry,
            tip_radius,
            e_model,
            youngs_modulus_mean,
            youngs_modulus_std
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
            "curve_id": r[2],
            "created_at": r[3],
            "tip_geometry": r[4],
            "tip_radius": r[5],
            "e_model": r[6],
            "youngs_modulus_mean": r[7],
            "youngs_modulus_std": r[8]
        }
        for r in rows
    ]


def get_experiment(exp_id: int, user_id: int) -> Optional[dict]:
    conn = get_conn()

    row = conn.execute(
        """
        SELECT
            id,
            name,
            curve_id,
            spring_constant,
            tip_radius,
            tip_geometry,
            filters_json,
            elasticity_params_json,
            force_model_params_json,
            youngs_modulus_mean,
            youngs_modulus_std
        FROM experiments
        WHERE id = ? AND user_id = ?
        """,
        (exp_id, user_id),
    ).fetchone()

    
    return {
        "id": row[0],
        "name": row[1],
        "curve_id": row[2],
        "metadata": {
            "spring_constant": row[3],
            "tip_radius": row[4],
            "tip_geometry": row[5],
        },
        "filters": json.loads(row[6]),
        "elasticity_params": json.loads(row[7]),
        "force_model_params": json.loads(row[8]),
        "youngs_modulus_mean": row[9],
        "youngs_modulus_std": row[10]
    }
