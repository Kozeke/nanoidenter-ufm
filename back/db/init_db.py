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


def init_datasets_table(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Create the datasets table to store file uploads and metadata.
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS datasets (
            id INTEGER PRIMARY KEY,
            name VARCHAR NOT NULL,
            description VARCHAR,
            filename VARCHAR NOT NULL,
            file_hash VARCHAR UNIQUE,
            user_id BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            -- Metadata from file
            num_curves INTEGER DEFAULT 0,
            spring_constant DOUBLE,
            tip_radius DOUBLE,
            tip_geometry VARCHAR,
            
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)


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

            dataset_id INTEGER,
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

            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (dataset_id) REFERENCES datasets(id)
        )
    """)