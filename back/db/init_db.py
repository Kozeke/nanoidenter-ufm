import duckdb

def init_cache_tables(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Cache tables used by the analysis pipeline.
    """

    conn.execute("""
        CREATE TABLE IF NOT EXISTS contact_points (
            curve_id INTEGER,
            method VARCHAR,
            params_hash VARCHAR,
            cp_values DOUBLE[][],
            spring_constant DOUBLE,
            tip_radius DOUBLE,
            tip_geometry VARCHAR,
            PRIMARY KEY (curve_id, method, params_hash)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS indentations (
            curve_id INTEGER,
            cp_hash VARCHAR,
            zi DOUBLE[],
            fi DOUBLE[],
            PRIMARY KEY (curve_id, cp_hash)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS elspectra (
            curve_id INTEGER,
            spec_hash VARCHAR,
            ze DOUBLE[],
            ee DOUBLE[],
            PRIMARY KEY (curve_id, spec_hash)
        )
    """)


def init_auth_tables(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Auth-related tables with proper auto-incrementing BIGINT primary key.
    """
    # Create sequence if it doesn't exist
    conn.execute("""
        CREATE SEQUENCE IF NOT EXISTS users_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE;
    """)

    # Create/re-create table with DEFAULT nextval
    # (Drop first if needed in dev; in prod use ALTER TABLE if column exists)
    conn.execute("DROP TABLE IF EXISTS users;")  # ← only in dev/testing!

    conn.execute("""
        CREATE TABLE users (
            id BIGINT PRIMARY KEY DEFAULT nextval('users_id_seq'),
            email VARCHAR UNIQUE NOT NULL,
            password_hash VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
# Backward-compatible alias
def ensure_cache_tables(conn):
    init_cache_tables(conn)
