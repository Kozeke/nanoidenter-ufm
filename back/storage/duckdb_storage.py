import os
import duckdb
from typing import Dict
from models.force_curve import ForceCurve

def save_to_duckdb(curves: Dict[str, ForceCurve], db_path: str) -> None:
    """Saves ForceCurve objects to DuckDB with one row per segment."""
    print("🚀 Saving transformed data to DuckDB...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = duckdb.connect(db_path)
    try:
        conn.execute("DROP TABLE IF EXISTS force_vs_z")
        conn.execute("""
            CREATE TABLE force_vs_z (
                curve_id INTEGER,
                segment_type TEXT,
                force_values DOUBLE[],
                z_values DOUBLE[],
                indentation_values DOUBLE[],
                elasticity_values DOUBLE[],
                file_id TEXT,
                date TEXT,
                instrument TEXT,
                sample TEXT,
                spring_constant DOUBLE,
                inv_ols DOUBLE,
                tip_geometry TEXT,
                tip_radius DOUBLE,
                tip_angle DOUBLE,
                sampling_rate DOUBLE,
                velocity DOUBLE,
                no_points INTEGER,
                fmodel_params DOUBLE[],
                fmodel_name TEXT,
                emodel_params DOUBLE[],
                emodel_name TEXT,
                contact_point_z DOUBLE,
                contact_point_force DOUBLE,
                PRIMARY KEY (curve_id, segment_type)
            )
        """)
        batch_data = [
            (
                i,
                segment.type,
                segment.deflection.tolist(),
                segment.z_sensor.tolist(),
                None,  # indentation_values - will be calculated later
                None,  # elasticity_values - will be calculated later
                curve.file_id,
                curve.date,
                curve.instrument,
                curve.sample,
                curve.spring_constant,
                curve.inv_ols,
                curve.tip_geometry,
                curve.tip_radius,
                getattr(curve, 'tip_angle', 30.0),  # Default tip angle
                segment.sampling_rate,
                segment.velocity,
                segment.no_points,
                None,  # fmodel_params - will be calculated later
                None,  # fmodel_name - will be set later
                None,  # emodel_params - will be calculated later
                None,  # emodel_name - will be set later
                None,  # contact_point_z - will be calculated later
                None,  # contact_point_force - will be calculated later
            )
            for i, (curve_name, curve) in enumerate(curves.items())
            for segment in curve.segments
        ]
        conn.executemany(
            """
            INSERT INTO force_vs_z (
                curve_id, segment_type, force_values, z_values, indentation_values, elasticity_values,
                file_id, date, instrument, sample, spring_constant, inv_ols, tip_geometry, tip_radius,
                tip_angle, sampling_rate, velocity, no_points, fmodel_params, fmodel_name,
                emodel_params, emodel_name, contact_point_z, contact_point_force
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            batch_data
        )
        row_count = conn.execute("SELECT COUNT(*) FROM force_vs_z").fetchone()[0]
        print(f"✅ Inserted {row_count} rows into {db_path}!")

        # Test query to verify data
        print("Testing query for curve_id = 0:")
        result = conn.execute("""
            SELECT curve_id,
                   z_values,
                   force_values
            FROM force_vs_z
            WHERE curve_id = 0
        """).fetchall()
        # print("Query result:", result)

    except duckdb.Error as e:
        print(f"❌ DuckDB error: {e}")
        raise
    finally:
        conn.close()

def update_curve_data(db_path: str, curve_id: int, updates: Dict) -> None:
    """Update specific fields for a curve in the database."""
    conn = duckdb.connect(db_path)
    try:
        for field, value in updates.items():
            if field in ['indentation_values', 'elasticity_values', 'fmodel_params', 'emodel_params']:
                # Handle array fields
                if value is not None:
                    conn.execute(f"UPDATE force_vs_z SET {field} = ? WHERE curve_id = ?", [value, curve_id])
            elif field in ['fmodel_name', 'emodel_name']:
                # Handle text fields
                conn.execute(f"UPDATE force_vs_z SET {field} = ? WHERE curve_id = ?", [value, curve_id])
            elif field in ['contact_point_z', 'contact_point_force']:
                # Handle numeric fields
                conn.execute(f"UPDATE force_vs_z SET {field} = ? WHERE curve_id = ?", [value, curve_id])
    finally:
        conn.close()