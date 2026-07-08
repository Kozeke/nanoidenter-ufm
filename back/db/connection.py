"""Shared DuckDB connection lifecycle for backend data access."""
import duckdb
from filters.register_all import register_filters
from db.init_db import init_auth_tables
from db.init_db import init_cache_tables
from db.init_db import init_experiment_tables

DB_PATH = "data/all.db"

_conn_singleton = None


# Creates and initializes a new DuckDB connection with schema/bootstrap hooks.
def _create_initialized_connection() -> duckdb.DuckDBPyConnection:
    # Stores the newly opened DuckDB connection.
    new_connection = duckdb.connect(DB_PATH)
    register_filters(new_connection)
    init_cache_tables(new_connection)
    init_auth_tables(new_connection)
    from db.init_db import init_datasets_table

    init_datasets_table(new_connection)
    init_experiment_tables(new_connection)
    return new_connection


# Returns a healthy shared DuckDB connection and recreates it after fatal invalidation.
def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn_singleton
    if _conn_singleton is None:
        _conn_singleton = _create_initialized_connection()
        return _conn_singleton

    # Verifies singleton connection health before reuse across requests.
    try:
        _conn_singleton.execute("SELECT 1")
    # Prevent crash if DuckDB invalidated the singleton after a prior internal fatal error.
    except duckdb.Error as connection_error:
        # Stores normalized message used to identify fatal invalidation state.
        error_message = str(connection_error).lower()
        if "database has been invalidated" in error_message or "fatal error" in error_message:
            # Best-effort close before recreating the connection object.
            try:
                _conn_singleton.close()
            except Exception:
                pass
            _conn_singleton = _create_initialized_connection()
        else:
            raise
    return _conn_singleton


# No-op release hook kept for backward compatibility; the shared singleton stays open for reuse.
def release_conn(conn: duckdb.DuckDBPyConnection = None) -> None:
    # The connection is a process-wide singleton, so callers must not close it here.
    return None


# Backward-compatible re-export so importers of db.connection still find the cache bootstrap helper.
def ensure_cache_tables(conn: duckdb.DuckDBPyConnection) -> None:
    # Delegates to the canonical cache-table initializer defined in db.init_db.
    init_cache_tables(conn)
