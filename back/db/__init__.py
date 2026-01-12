"""
Database package.
Exposes DB-related utilities only.
"""

from db.connection import get_conn
from db.init_db import ensure_cache_tables

__all__ = [
    "get_conn",
    "ensure_cache_tables",
]
