from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import duckdb
import os, asyncio
from filters.median import median_filter_array
from filters.lineardetrend import lineardetrend_filter
from db import transform_hdf5_to_db


app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
HDF5_FILE_PATH = "data/all.hdf5"  # HDF5 file path
DB_PATH = "data/hdf5_data.db"  # DuckDB database file

# Ensure the DB directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)



def fetch_curves_from_db(conn, num_curves, filter_median=False):
    """
    Fetches curve data from DuckDB.
    - If `filter_median=True`, applies median filtering on `force_values`.
    - Otherwise, returns raw `force_values`.
    """
    if filter_median:
        conn.create_function("median_filter_array", median_filter_array, return_type="DOUBLE[]")

        print("filtering")
        query = f"""
            SELECT curve_name, z_values, median_filter_array(force_values) AS force_filtered
            FROM force_vs_z 
            LIMIT {num_curves}
        """
    else:
        query = f"""
            SELECT curve_name, z_values, force_values 
            FROM force_vs_z 
            LIMIT {num_curves}
        """

    result = conn.execute(query).fetchall()
    
    # ✅ Convert result to dictionary format
    return {
        row[0]: {"x": row[1], "y": row[2]} for row in result
    }
    




@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream a requested number of transformed HDF5 data curves from DuckDB."""
    await websocket.accept()

    try:
        conn = duckdb.connect(DB_PATH)

        # ✅ Check if the table exists before querying
        table_exists = conn.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'").fetchone()[0]

        if table_exists == 0:
            await websocket.send_text(json.dumps({"status": "error", "message": "❌ Table force_vs_z does not exist! Load data first."}))
            return

        while True:
            request = await websocket.receive_text()
            request_data = json.loads(request)
            num_curves = request_data.get("num_curves", 100)
            filter_median = request_data.get("filter_median", False)  # ✅ Optional flag for median filtering

            # ✅ Fetch data using the helper function
            selected_curves = fetch_curves_from_db(conn, num_curves, filter_median)

            await websocket.send_text(json.dumps({
                "status": "success",
                "data": selected_curves
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