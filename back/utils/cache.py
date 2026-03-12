"""
Cache optimization utilities for contact point and indentation caching.
Provides high-performance cache warm-up and retrieval functions.
"""
import json
import hashlib
from typing import Dict, List, Tuple, Optional
import duckdb
from filters.cpoints.apply_contact_point_filters import apply_cp_filters


def _json_hash(obj) -> str:
    """Create a stable hash from a JSON-serializable object."""
    json_str = json.dumps(obj, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()


def warmup_cp_cache(
    conn: duckdb.DuckDBPyConnection,
    curve_ids: List[int],
    cp_filters: Dict,
    metadata: Dict,
    batch_size: int = 50
) -> int:
    """
    Pre-compute and cache contact points for all curves that don't have them cached.
    
    Args:
        conn: DuckDB connection
        curve_ids: List of curve IDs to warm up
        cp_filters: Contact point filter configuration
        metadata: Metadata dictionary with spring_constant, tip_radius, tip_geometry
        batch_size: Number of curves to process per batch
    
    Returns:
        Number of curves that were computed (cache misses)
    """
    if not cp_filters:
        return 0
    
    # Get active CP filter
    cp_method = None
    cp_params_hash = None
    
    for name, cfg in cp_filters.items():
        cp_method = name
        cp_hash_payload = {
            "method": cp_method,
            "params": cfg,
            "spring_constant": metadata.get("spring_constant"),
            "tip_radius": metadata.get("tip_radius"),
            "tip_geometry": metadata.get("tip_geometry"),
        }
        cp_params_hash = _json_hash(cp_hash_payload)
        break
    
    if not cp_method:
        return 0
    
    # Check which curves need CP computation
    ids_csv = ",".join(map(str, curve_ids))
    cached_check = f"""
        SELECT curve_id FROM contact_points
        WHERE method = '{cp_method}'
          AND params_hash = '{cp_params_hash}'
          AND curve_id IN ({ids_csv})
    """
    cached_ids = {row[0] for row in conn.execute(cached_check).fetchall()}
    missing_ids = [cid for cid in curve_ids if cid not in cached_ids]
    
    if not missing_ids:
        # print(f"✅ CP cache: All {len(curve_ids)} curves already cached")
        return 0
    
    print(f"🔥 Warming up CP cache for {len(missing_ids)}/{len(curve_ids)} curves...")
    
    # Compute CPs in batches
    total_computed = 0
    for i in range(0, len(missing_ids), batch_size):
        batch = missing_ids[i:i+batch_size]
        
        # Build and execute CP query
        query_cp = apply_cp_filters(
            "", 
            cp_filters, 
            [str(cid) for cid in batch], 
            metadata
        )
        
        try:
            results = conn.execute(query_cp).fetchall()
            
            # Prepare cache rows
            cp_cache_rows = []
            for row in results:
                if len(row) >= 4 and row[3] is not None:  # cp_values exists
                    cp_cache_rows.append((
                        int(row[0]),  # curve_id
                        cp_method,
                        cp_params_hash,
                        row[3],  # cp_values
                        metadata.get("spring_constant"),
                        metadata.get("tip_radius"),
                        metadata.get("tip_geometry")
                    ))
            
            # Insert into cache
            if cp_cache_rows:
                conn.executemany("""
                    INSERT INTO contact_points 
                    (curve_id, method, params_hash, cp_values, spring_constant, tip_radius, tip_geometry)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (curve_id, method, params_hash) DO NOTHING
                """, cp_cache_rows)
                total_computed += len(cp_cache_rows)
            
            print(f"  📦 Batch {i//batch_size + 1}/{(len(missing_ids) + batch_size - 1)//batch_size}: Cached {len(cp_cache_rows)} CPs")
        
        except Exception as e:
            print(f"  ❌ Error warming up batch {i//batch_size + 1}: {e}")
            continue
    
    print(f"✅ CP cache warmed up: {total_computed} new entries")
    return total_computed


def get_cached_indentations(
    conn: duckdb.DuckDBPyConnection,
    curve_ids: List[int],
    cp_hash: str
) -> Dict[int, Tuple[List[float], List[float]]]:
    """
    Retrieve cached indentation data for curves with matching cp_hash.
    
    Args:
        conn: DuckDB connection
        curve_ids: List of curve IDs to check
        cp_hash: Hash of the contact point parameters
    
    Returns:
        Dictionary mapping curve_id -> (zi, fi) tuples
    """
    if not curve_ids or not cp_hash:
        return {}
    
    ids_csv = ",".join(map(str, curve_ids))
    
    try:
        query = f"""
            SELECT curve_id, zi, fi 
            FROM indentations
            WHERE curve_id IN ({ids_csv})
              AND cp_hash = '{cp_hash}'
        """
        results = conn.execute(query).fetchall()
        
        cached = {row[0]: (row[1], row[2]) for row in results}
        
        # if cached:
            # print(f"📦 Indentation cache: {len(cached)}/{len(curve_ids)} hits")
        
        return cached
    
    except Exception as e:
        print(f"⚠️ Error retrieving cached indentations: {e}")
        return {}


def cache_indentations_batch(
    conn: duckdb.DuckDBPyConnection,
    indent_cache_rows: List[Tuple]
) -> int:
    """
    Batch insert indentation cache rows.
    
    Args:
        conn: DuckDB connection
        indent_cache_rows: List of tuples (curve_id, cp_hash, zi, fi)
    
    Returns:
        Number of rows inserted
    """
    if not indent_cache_rows:
        return 0
    
    try:
        conn.executemany("""
            INSERT INTO indentations (curve_id, cp_hash, zi, fi)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (curve_id, cp_hash) DO NOTHING
        """, indent_cache_rows)
        
        return len(indent_cache_rows)
    
    except Exception as e:
        print(f"⚠️ Error caching indentations: {e}")
        return 0


def get_cp_cache_key(cp_filters: Dict, metadata: Dict) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate cache key components for contact point filters.
    
    Args:
        cp_filters: Contact point filter configuration
        metadata: Metadata dictionary
    
    Returns:
        Tuple of (method_name, params_hash) or (None, None) if no filters
    """
    if not cp_filters:
        return None, None
    
    for name, cfg in cp_filters.items():
        cp_hash_payload = {
            "method": name,
            "params": cfg,
            "spring_constant": metadata.get("spring_constant"),
            "tip_radius": metadata.get("tip_radius"),
            "tip_geometry": metadata.get("tip_geometry"),
        }
        return name, _json_hash(cp_hash_payload)
    
    return None, None


def clear_cache(
    conn: duckdb.DuckDBPyConnection,
    cache_type: Optional[str] = None
) -> Dict[str, int]:
    """
    Clear cache tables. Can clear all caches or specific cache types.
    
    Args:
        conn: DuckDB connection
        cache_type: Optional string to clear specific cache type.
                   Options: "contact_points", "indentations", "elspectra", or None for all
    
    Returns:
        Dictionary with counts of deleted rows for each cache table
    """
    results = {}
    
    cache_tables = {
        "contact_points": "contact_points",
        "indentations": "indentations",
        "elspectra": "elspectra"
    }
    
    if cache_type:
        if cache_type not in cache_tables:
            raise ValueError(f"Invalid cache_type: {cache_type}. Must be one of: {list(cache_tables.keys())}")
        tables_to_clear = {cache_type: cache_tables[cache_type]}
    else:
        tables_to_clear = cache_tables
    
    for cache_name, table_name in tables_to_clear.items():
        try:
            # Check if table exists
            table_check = conn.execute(f"""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_name = '{table_name}'
            """).fetchone()
            
            if table_check and table_check[0] > 0:
                # Get count before deletion
                count_query = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                count_before = count_query[0] if count_query else 0
                
                # Delete all rows
                conn.execute(f"DELETE FROM {table_name}")
                
                results[cache_name] = count_before
                print(f"🗑️ Cleared {cache_name} cache: {count_before} rows deleted")
            else:
                results[cache_name] = 0
                print(f"⚠️ Table {table_name} does not exist, skipping")
                
        except Exception as e:
            print(f"⚠️ Error clearing {cache_name} cache: {e}")
            results[cache_name] = -1  # Indicate error
    
    return results