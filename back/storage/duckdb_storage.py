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
                file_id TEXT,
                date TEXT,
                instrument TEXT,
                sample TEXT,
                spring_constant DOUBLE,
                inv_ols DOUBLE,
                tip_geometry TEXT,
                tip_radius DOUBLE,
                sampling_rate DOUBLE,
                velocity DOUBLE,
                no_points INTEGER,
                PRIMARY KEY (curve_id, segment_type)
            )
        """)
        batch_data = [
            (
                i,
                segment.type,
                segment.deflection.tolist(),
                segment.z_sensor.tolist(),
                curve.file_id,
                curve.date,
                curve.instrument,
                curve.sample,
                curve.spring_constant,
                curve.inv_ols,
                curve.tip_geometry,
                curve.tip_radius,
                segment.sampling_rate,
                segment.velocity,
                segment.no_points
            )
            for i, (curve_name, curve) in enumerate(curves.items())
            for segment in curve.segments
        ]
        conn.executemany(
            """
            INSERT INTO force_vs_z (
                curve_id, segment_type, force_values, z_values, file_id, date, instrument, sample,
                spring_constant, inv_ols, tip_geometry, tip_radius, sampling_rate, velocity, no_points
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        print("Query result:", result)

    except duckdb.Error as e:
        print(f"❌ DuckDB error: {e}")
        raise
    finally:
        conn.close()