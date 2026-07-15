import os
import duckdb

DB_PATH = os.environ.get("DB_PATH", "data/all.db")
conn = duckdb.connect(DB_PATH)

cursor = conn.execute("SELECT * FROM users;")
columns = [desc[0] for desc in cursor.description]
rows = cursor.fetchall()

print("COLUMNS:", columns)
print("-" * 80)

for row in rows:
    print(dict(zip(columns, row)))

conn.close()
