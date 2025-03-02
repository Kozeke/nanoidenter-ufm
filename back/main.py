from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import duckdb
import os
from db import transform_hdf5_to_db
from filters.register_filters import register_filters
from db import fetch_curves_batch
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple


app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://nanoidenter-ufm-front-end.onrender.com/"],
    # allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
HDF5_FILE_PATH = "data/all.hdf5"  # HDF5 file path
DB_PATH = "data/hdf5_data.db"  # DuckDB database file
BATCH_SIZE = 10  # Process 10 curves per batch (adjust based on your needs)
MAX_WORKERS = 8  # Number of parallel workers (tune based on CPU cores)

# Ensure the DB directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream batches of curve data from DuckDB."""
    print("WebSocket connected")
    await websocket.accept()
    conn = duckdb.connect(DB_PATH)
    # register_filters(conn)  # Uncomment if you have filter registration

    try:
        # Check table existence once at startup
        table_exists = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'"
        ).fetchone()[0]
        if table_exists == 0:
            await websocket.send_text(json.dumps({
                "status": "error",
                "message": "❌ Table force_vs_z does not exist!"
            }))
            return

        # Continuously accept requests
        while True:
            try:
                # Wait for a request from the client
                request = await websocket.receive_text()
                request_data = json.loads(request)
                num_curves = min(request_data.get("num_curves", 100), 100)  # Cap for safety
                filters = request_data.get("filters", {"regular": {}, "cp_filters": {}})
                print(f"Received request: num_curves={num_curves}, filters={filters}")

                # Fetch curve IDs based on request
                curve_ids = conn.execute(
                    "SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)
                ).fetchall()
                curve_ids = [str(row[0]) for row in curve_ids]  # Ensure string IDs
                print(f"Total curve IDs fetched: {len(curve_ids)}")

                # Process in batches
                for i in range(0, len(curve_ids), BATCH_SIZE):
                    batch_ids = curve_ids[i:i + BATCH_SIZE]
                    print(f"Processing batch: {batch_ids}")
                    await process_and_stream_batch(conn, batch_ids, filters, websocket)
                    await asyncio.sleep(0.01)  # Small delay to avoid overwhelming client

                # Signal completion of this request
                await websocket.send_text(json.dumps({"status": "complete"}))
                print("Request completed")

            except WebSocketDisconnect:
                print("Client disconnected.")
                break  # Exit loop on disconnect
            except json.JSONDecodeError as e:
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": f"Invalid request format: {e}"
                }))
            except Exception as e:
                await websocket.send_text(json.dumps({
                    "status": "error",
                    "message": f"Error processing request: {e}"
                }))

    except Exception as e:
        print(f"Unexpected error: {e}")
        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
    finally:
        conn.close()
        print("WebSocket connection closed")

async def process_and_stream_batch(
    conn: duckdb.DuckDBPyConnection,
    batch_ids: List[str],
    filters: Dict,
    websocket: WebSocket
) -> None:
    """
    Process a batch of curve IDs, fetch data from DuckDB, and stream results via WebSocket.

    Args:
        conn: DuckDB connection object
        batch_ids: List of curve IDs to process in this batch
        filters: Dictionary of filters to apply (e.g., {'regular': {...}, 'cp_filters': {...}})
        websocket: WebSocket connection to stream results
    """
    try:
        # Get the current event loop
        loop = asyncio.get_running_loop()
        
        # Use ThreadPoolExecutor to offload blocking DuckDB operations
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Run fetch_curves_batch in a separate thread
            graph_force_vs_z, graph_force_indentation = await loop.run_in_executor(
                executor,
                lambda: fetch_curves_batch(conn, batch_ids, filters)
            )
        
        # Prepare the response data with both graphs
        response_data = {
            "status": "batch",
            "data": {
                "graphForcevsZ": graph_force_vs_z,
                "graphForceIndentation": graph_force_indentation
            }
        }
        
        # Stream batch results if data is available
        if graph_force_vs_z["curves"] or graph_force_indentation["curves"]:
            await websocket.send_text(json.dumps(
                response_data,
                default=str  # Handles any non-serializable types like numpy arrays
            ))
            print(f"Streamed batch for IDs: {batch_ids}")
        else:
            print(f"No data returned for batch: {batch_ids}")
            await websocket.send_text(json.dumps({
                "status": "batch_empty",
                "message": "No curves returned for this batch",
                "batch_ids": batch_ids
            }))

    except Exception as e:
        print(f"Error processing batch {batch_ids}: {e}")
        # Send error message to client
        await websocket.send_text(json.dumps({
            "status": "batch_error",
            "message": f"Error processing batch: {str(e)}",
            "batch_ids": batch_ids
        }))
    
@app.on_event("startup")
async def startup_event():
    """Load HDF5 data into DuckDB when the server starts (if needed)."""
    if not os.path.exists(DB_PATH) or os.stat(DB_PATH).st_size == 0:
        print("🚀 Loading HDF5 data into DuckDB...")
        transform_hdf5_to_db(HDF5_FILE_PATH, DB_PATH)
        print("✅ Data successfully loaded into DuckDB.")
    else:
        print("✅ DuckDB database already exists, skipping reload.")
