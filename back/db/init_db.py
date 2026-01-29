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

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY DEFAULT nextval('users_id_seq'),
            email VARCHAR UNIQUE NOT NULL,
            password_hash VARCHAR NOT NULL,
            
            full_name VARCHAR,
            affiliation VARCHAR,
            instrument_serial_number VARCHAR,

            profile_completed BOOLEAN DEFAULT FALSE,
            bio TEXT,
            phone_number VARCHAR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
# Backward-compatible alias
def ensure_cache_tables(conn):
    init_cache_tables(conn)


def init_experiment_tables(conn):
    conn.execute("""
        CREATE SEQUENCE IF NOT EXISTS experiments_id_seq
            START WITH 1
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE;
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS experiments (
            id BIGINT PRIMARY KEY DEFAULT NEXTVAL('experiments_id_seq'),
            
            user_id BIGINT NOT NULL,
            name VARCHAR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            spring_constant DOUBLE,
            curve_id VARCHAR,
            tip_radius DOUBLE,
            tip_geometry VARCHAR,

            filters_json JSON,
            elasticity_params_json JSON,
            force_model_params_json JSON,

            f_model VARCHAR,
            e_model VARCHAR,

            youngs_modulus_mean DOUBLE,
            youngs_modulus_std DOUBLE,
            elasticity_params JSON,

            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)


def migrate_database(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Apply database migrations to update schema without losing data.
    Uses a schema_version table to track which migrations have been applied.
    """
    # Initialize schema version table if it doesn't exist
    try:
        result = conn.execute("SELECT version FROM schema_version").fetchone()
        current_version = result[0] if result else 0
    except:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)")
        conn.execute("INSERT INTO schema_version VALUES (0)")
        current_version = 0
    
    # Apply migrations in order
    # Migration 1: Example - add a new column to users table
    # if current_version < 1:
    #     conn.execute("ALTER TABLE users ADD COLUMN new_field VARCHAR")
    #     conn.execute("UPDATE schema_version SET version = 1")
    
    # Migration 2: Example - add a new column to experiments table
    # if current_version < 2:
    #     conn.execute("ALTER TABLE experiments ADD COLUMN another_field DOUBLE")
    #     conn.execute("UPDATE schema_version SET version = 2")
    
    # Add future migrations here following the same pattern