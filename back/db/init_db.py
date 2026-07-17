"""Database schema initialization and backward-compatible migrations."""
import duckdb


def _run_migration(conn: duckdb.DuckDBPyConnection, sql: str) -> None:
    """
    Execute a single DDL migration statement and, if it fails (e.g. because
    the column already exists), roll back the aborted transaction so the
    connection stays usable for all subsequent statements.

    Without the ROLLBACK, DuckDB leaves the connection in an aborted-transaction
    state and every following conn.execute() raises:
        TransactionContext Error: Current transaction is aborted (please ROLLBACK)
    """
    try:
        conn.execute(sql)
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass

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
            tip_angle DOUBLE,
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

            -- True once flip_force_sign has been applied (F -> -F) so trim_retract
            -- can detect peaks correctly (max F rather than min signed F).
            force_sign_flipped BOOLEAN DEFAULT FALSE,

            -- True once the retract phase has been trimmed; prevents the
            -- operation from being applied a second time on already-approach-only data.
            retract_trimmed BOOLEAN DEFAULT FALSE,

            -- True once z-normalization has been applied (z[i] -= z[0] per curve);
            -- prevents accidental double-shift on already-normalized data.
            z_normalized BOOLEAN DEFAULT FALSE,
            
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Backward-compatible migrations: add columns if an older DB is opened.
    # After each failed ALTER TABLE, DuckDB marks the transaction as aborted —
    # a ROLLBACK is required to clear that state before issuing further statements.
    # Rename the legacy force_absolute column (from the old |F| behaviour) to
    # force_sign_flipped now that the operation negates F instead of abs'ing it.
    _run_migration(conn, "ALTER TABLE datasets RENAME COLUMN force_absolute TO force_sign_flipped")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN force_sign_flipped BOOLEAN DEFAULT FALSE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN retract_trimmed BOOLEAN DEFAULT FALSE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN z_normalized BOOLEAN DEFAULT FALSE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN tip_angle DOUBLE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN velocity DOUBLE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN force_scale_to_n DOUBLE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN z_scale_to_m DOUBLE")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN sensor_type VARCHAR")
    _run_migration(conn, "ALTER TABLE datasets ADD COLUMN sampling_rate DOUBLE")


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
            description VARCHAR,
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

    # Backward-compatible migration: add description column to existing databases
    _run_migration(conn, "ALTER TABLE experiments ADD COLUMN description VARCHAR")