#!/usr/bin/env python3
"""
Improved cache clearing script that directly executes SQL commands.

Usage:
    python clear_cache_fixed.py                    # Clear all caches
    python clear_cache_fixed.py --type contact_points
    python clear_cache_fixed.py --type indentations
    python clear_cache_fixed.py --type elspectra
    python clear_cache_fixed.py --inspect           # Just show what's in cache
"""
import argparse
import sys
import os
import duckdb


def get_db_path():
    """Get the database path from environment or use default."""
    return os.environ.get("DB_PATH", "data/all.db")


def inspect_cache(conn):
    """Show current cache contents without deleting."""
    print("\n" + "="*60)
    print("📊 CURRENT CACHE CONTENTS:")
    print("="*60)
    
    tables = {
        "contact_points": "Contact Points Cache",
        "indentations": "Indentations Cache",
        "elspectra": "Elspectra Cache"
    }
    
    total_rows = 0
    for table_name, display_name in tables.items():
        try:
            # Get count
            count_result = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            count = count_result[0] if count_result else 0
            total_rows += count
            
            print(f"\n{display_name} ({table_name}):")
            print(f"  Total rows: {count}")
            
            if count > 0:
                # Show sample of unique curve_ids
                sample_query = f"""
                    SELECT DISTINCT curve_id 
                    FROM {table_name} 
                    ORDER BY curve_id 
                    LIMIT 10
                """
                curve_ids = conn.execute(sample_query).fetchall()
                curve_ids_str = ", ".join([str(row[0]) for row in curve_ids])
                
                if len(curve_ids) == 10:
                    print(f"  Sample curve_ids: {curve_ids_str}... (showing first 10)")
                else:
                    print(f"  Curve_ids: {curve_ids_str}")
                
                # For contact_points, show unique methods
                if table_name == "contact_points":
                    methods = conn.execute(f"""
                        SELECT method, COUNT(*) as cnt 
                        FROM {table_name} 
                        GROUP BY method 
                        ORDER BY cnt DESC
                    """).fetchall()
                    print(f"  Methods cached:")
                    for method, cnt in methods:
                        print(f"    - {method}: {cnt} entries")
                        
        except Exception as e:
            print(f"  ⚠️  Error querying {table_name}: {e}")
    
    print(f"\n{'='*60}")
    print(f"Total cached rows across all tables: {total_rows}")
    print("="*60 + "\n")
    
    return total_rows


def clear_cache_table(conn, table_name, display_name):
    """Clear a specific cache table and return count of deleted rows."""
    try:
        # Get count before deletion
        before_count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        
        if before_count == 0:
            print(f"  {display_name}: Already empty (0 rows)")
            return 0
        
        # Delete all rows
        conn.execute(f"DELETE FROM {table_name}")
        
        # Verify deletion
        after_count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        deleted = before_count - after_count
        
        if after_count == 0:
            print(f"  ✅ {display_name}: {deleted} rows deleted")
        else:
            print(f"  ⚠️  {display_name}: {deleted}/{before_count} rows deleted ({after_count} remain)")
        
        return deleted
        
    except Exception as e:
        print(f"  ❌ {display_name}: Error - {e}")
        return -1


def clear_all_caches(conn):
    """Clear all cache tables."""
    tables = {
        "contact_points": "Contact Points Cache",
        "indentations": "Indentations Cache",
        "elspectra": "Elspectra Cache"
    }
    
    print("\n🗑️  Clearing caches...\n")
    
    total_deleted = 0
    for table_name, display_name in tables.items():
        deleted = clear_cache_table(conn, table_name, display_name)
        if deleted >= 0:
            total_deleted += deleted
    
    return total_deleted


def clear_specific_cache(conn, cache_type):
    """Clear a specific cache type."""
    table_map = {
        "contact_points": ("contact_points", "Contact Points Cache"),
        "indentations": ("indentations", "Indentations Cache"),
        "elspectra": ("elspectra", "Elspectra Cache")
    }
    
    if cache_type not in table_map:
        raise ValueError(f"Invalid cache type: {cache_type}")
    
    table_name, display_name = table_map[cache_type]
    
    print(f"\n🗑️  Clearing {display_name}...\n")
    deleted = clear_cache_table(conn, table_name, display_name)
    
    return deleted


def main():
    parser = argparse.ArgumentParser(
        description="Clear cache tables in the DuckDB database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python clear_cache_fixed.py                      # Clear all caches
  python clear_cache_fixed.py --inspect            # Just show cache contents
  python clear_cache_fixed.py --type contact_points
  python clear_cache_fixed.py --type indentations
  python clear_cache_fixed.py --type elspectra
        """
    )
    
    parser.add_argument(
        "-t", "--type",
        choices=["contact_points", "indentations", "elspectra"],
        help="Specific cache type to clear. If not specified, all caches will be cleared."
    )
    
    parser.add_argument(
        "--inspect",
        action="store_true",
        help="Just inspect cache contents without clearing"
    )
    
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Skip confirmation prompt (useful for automation)"
    )
    
    parser.add_argument(
        "--db-path",
        help=f"Path to DuckDB database (default: from DB_PATH env or data/all.db)"
    )
    
    args = parser.parse_args()
    
    # Get database path
    db_path = args.db_path or get_db_path()
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)
    
    # Connect to database (NOT read-only)
    try:
        print(f"🔌 Connecting to database: {db_path}")
        conn = duckdb.connect(db_path, read_only=False)
        print("✅ Connected successfully\n")
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
        sys.exit(1)
    
    try:
        # Inspect mode - just show what's there
        if args.inspect:
            inspect_cache(conn)
            sys.exit(0)
        
        # Show current state
        total_before = inspect_cache(conn)
        
        if total_before == 0:
            print("ℹ️  All caches are already empty. Nothing to clear.")
            sys.exit(0)
        
        # Confirmation prompt
        if not args.confirm:
            cache_desc = args.type if args.type else "all caches"
            response = input(f"\n⚠️  Are you sure you want to clear {cache_desc}? (yes/no): ")
            if response.lower() not in ["yes", "y"]:
                print("❌ Operation cancelled.")
                sys.exit(0)
        
        # Clear the cache
        if args.type:
            total_deleted = clear_specific_cache(conn, args.type)
        else:
            total_deleted = clear_all_caches(conn)
        
        # Show summary
        print("\n" + "="*60)
        print("📊 SUMMARY:")
        print("="*60)
        print(f"  Rows before: {total_before}")
        print(f"  Rows deleted: {total_deleted}")
        print("="*60)
        
        # Verify by inspecting again
        print("\nVerifying deletion...")
        total_after = inspect_cache(conn)
        
        if total_after == 0:
            print("\n✅ All selected caches cleared successfully!")
        else:
            print(f"\n⚠️  Warning: {total_after} rows still remain in cache")
            
    except ValueError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()