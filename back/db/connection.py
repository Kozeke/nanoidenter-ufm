"""Shared DuckDB connection lifecycle for backend data access."""
import os
import shutil
from datetime import datetime

import duckdb
from filters.register_all import register_filters
from db.init_db import init_auth_tables
from db.init_db import init_cache_tables
from db.init_db import init_experiment_tables

DB_PATH = "data/all.db"

_conn_singleton = None


def _wal_path_for_db(db_path: str) -> str:
    """Return the DuckDB write-ahead log path for a database file."""
    return f"{db_path}.wal"


def _recover_corrupt_wal(db_path: str) -> bool:
    """Rename a corrupt WAL so DuckDB can open from the last checkpoint."""
    wal_path = _wal_path_for_db(db_path)
    if not os.path.exists(wal_path):
        return False
    # Stores a timestamped backup path for the broken WAL file.
    backup_path = f"{wal_path}.broken-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.move(wal_path, backup_path)
    return True


def _open_duckdb_connection(db_path: str) -> duckdb.DuckDBPyConnection:
    """Open DuckDB, recovering once if WAL replay fails."""
    try:
        return duckdb.connect(db_path)
    except duckdb.Error as open_error:
        error_message = str(open_error).lower()
        # Prevent crash when an interrupted migration or hard kill leaves a bad WAL.
        if "wal" not in error_message and "replay" not in error_message:
            raise
        if not _recover_corrupt_wal(db_path):
            raise
        return duckdb.connect(db_path)


# Creates and initializes a new DuckDB connection with schema/bootstrap hooks.
def _create_initialized_connection() -> duckdb.DuckDBPyConnection:
    # Stores the newly opened DuckDB connection.
    new_connection = _open_duckdb_connection(DB_PATH)
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
