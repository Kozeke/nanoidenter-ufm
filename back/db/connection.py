import duckdb
from filters.register_all import register_filters
from db.init_db import init_auth_tables
from db.init_db import init_cache_tables

DB_PATH = "data/all.db"

_conn_singleton = None

def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn_singleton
    if _conn_singleton is None:
        _conn_singleton = duckdb.connect(DB_PATH)
        register_filters(_conn_singleton)
        init_cache_tables(_conn_singleton)
        init_auth_tables(_conn_singleton)
    return _conn_singleton
