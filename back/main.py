from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import duckdb
import os
from db import transform_hdf5_to_db
from filters.register_filters import register_filters
from db import fetch_curves_from_db

app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://nanoidenter-ufm-front-end.onrender.com/"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
HDF5_FILE_PATH = "data/all.hdf5"  # HDF5 file path
DB_PATH = "data/hdf5_data.db"  # DuckDB database file

# Ensure the DB directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    print("webscoke")
    """WebSocket endpoint to stream a requested number of transformed HDF5 data curves from DuckDB."""
    await websocket.accept()
    conn = duckdb.connect(DB_PATH)
    register_filters(conn)  # ✅ Register custom filters

    try:
        # ✅ Check if the table exists before querying
        table_exists = conn.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'").fetchone()[0]

        if table_exists == 0:
            await websocket.send_text(json.dumps({"status": "error", "message": "❌ Table force_vs_z does not exist! Load data first."}))
            return

        while True:
            request = await websocket.receive_text()
            request_data = json.loads(request)
            num_curves = request_data.get("num_curves", 100)
            filters = request_data.get("filters", {})  # ✅ Filters with parameters
            print("received filterrs", filters)
            # ✅ Fetch data with requested filters
            selected_curves, domain_range = fetch_curves_from_db(conn, num_curves, filters)

            await websocket.send_text(json.dumps({
                "status": "success",
                "data": selected_curves,
                "domain": domain_range
            }))

    except WebSocketDisconnect:
        print("Client disconnected.")
    except Exception as e:
        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
    finally:
        conn.close()


@app.on_event("startup")
async def startup_event():
    """Load HDF5 data into DuckDB when the server starts (if needed)."""
    if not os.path.exists(DB_PATH) or os.stat(DB_PATH).st_size == 0:
        print("🚀 Loading HDF5 data into DuckDB...")
        transform_hdf5_to_db(HDF5_FILE_PATH, DB_PATH)
        print("✅ Data successfully loaded into DuckDB.")
    else:
        print("✅ DuckDB database already exists, skipping reload.")
