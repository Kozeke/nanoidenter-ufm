from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import duckdb
import os
# from db import transform_hdf5_to_db
from filters.register_all import register_filters
from db import fetch_curves_batch
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple


app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    # allow_origins=["https://nanoidenter-ufm-front-end.onrender.com/"],
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
HDF5_FILE_PATH = "data/all.hdf5"  # HDF5 file path
DB_PATH = "data/experiment.db"  # DuckDB database file
BATCH_SIZE = 10  # Process 10 curves per batch (adjust based on your needs)
MAX_WORKERS = 8  # Number of parallel workers (tune based on CPU cores)

# Ensure the DB directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream batches of curve data from DuckDB and send filter defaults."""
    print("WebSocket connected")
    await websocket.accept()
    conn = duckdb.connect(DB_PATH)
    print(f"Connected to database: {DB_PATH}")

    try:
        # Debug: List all tables before any operations
        tables = conn.execute("SHOW TABLES").fetchall()
        print(f"Tables in database at connection: {tables}")
        
        # Register filters
        register_filters(conn)
        print("Filters registered")

        # Debug: List tables after register_filters
        tables = conn.execute("SHOW TABLES").fetchall()
        print(f"Tables in database after register_filters: {tables}")

        # Send filter defaults immediately after connection
        result = conn.execute("SELECT name, parameters FROM filters").fetchall()
        filter_defaults = {}
        for name, params_json in result:
            params = json.loads(params_json)
            filter_key = f"{name.lower()}_filter_array"
            filter_defaults[filter_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
        
        # Send contact point filter defaults
        cp_result = conn.execute("SELECT name, parameters FROM cps").fetchall()
        cp_filter_defaults = {}
        for name, params_json in cp_result:
            params = json.loads(params_json)
            cp_filter_key = f"{name.lower()}_filter_array"
            cp_filter_defaults[cp_filter_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
            
        # Send fmodel defaults
        fmodel_result = conn.execute("SELECT name, parameters FROM fmodels").fetchall()
        fmodel_defaults = {}
        for name, params_json in fmodel_result:
            params = json.loads(params_json)
            fmodel_key = f"{name.lower()}_filter_array"  # Matches UDF name from create_fmodel_udf
            fmodel_defaults[fmodel_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
        
        # Send fmodel defaults
        emodel_result = conn.execute("SELECT name, parameters FROM emodels").fetchall()
        emodel_defaults = {}
        for name, params_json in emodel_result:
            params = json.loads(params_json)
            emodel_key = f"{name.lower()}_filter_array"  # Matches UDF name from create_fmodel_udf
            emodel_defaults[emodel_key] = {
                param_name: param_info["default"]
                for param_name, param_info in params.items()
            }
            
        print("Prepared contact point filter defaults")
        await websocket.send_json({
            "status": "filter_defaults",             
            "data": {
                "regular_filters": filter_defaults,
                "cp_filters": cp_filter_defaults,
                "fmodels": fmodel_defaults,
                "emodels": emodel_defaults
            }})
        print("Sent filter defaults to client")

        # Check table existence
        table_exists = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'"
        ).fetchone()[0]
        print(f"force_vs_z exists: {table_exists}")
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
                filters = request_data.get("filters", {"regular": {}, "cp_filters": {}, "fmodels": {}})
                curve_id = request_data.get("curve_id", None)  # Extract curve_id
                filters_changed = request_data.get("filters_changed", False)
                print(f"Received request: num_curves={num_curves}, curve_id={curve_id}, filters={filters}")

                # Fetch curve IDs based on request
                curve_ids = conn.execute(
                    "SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)
                ).fetchall()
                curve_ids = [str(row[0]) for row in curve_ids]  # Ensure string IDs
                print(f"Total curve IDs fetched: {curve_ids}")
                
                # If curve_id is provided, ensure it's included or handled separately
                if curve_id and curve_id not in curve_ids:
                    curve_ids.append(curve_id)  # Add specific curve_id if not already included

                # Process in batches
                for i in range(0, len(curve_ids), BATCH_SIZE):
                    batch_ids = curve_ids[i:i + BATCH_SIZE]
                    print(f"Processing batch: {batch_ids}")
                    await process_and_stream_batch(conn, batch_ids, filters, websocket, curve_id, filters_changed)
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
    websocket: WebSocket,
    curve_id: str = None,
    filters_changed: bool = False,  # New flag,
) -> None:
    """
    Process a batch of curve IDs and optionally a single curve ID, fetch data from DuckDB, and stream results via WebSocket.

    Args:
        conn: DuckDB connection object
        batch_ids: List of curve IDs to process in this batch
        filters: Dictionary of filters to apply (e.g., {'regular': {...}, 'cp_filters': {...}})
        websocket: WebSocket connection to stream results
        curve_id: Optional specific curve ID to fetch separately
        filters_changed: Boolean flag indicating if filters have changed
    """
    try:
        # Get the current event loop
        loop = asyncio.get_running_loop()

        # Initialize graph variables
        graph_force_vs_z = None
        graph_force_indentation = None
        graph_elspectra = None
        graph_force_vs_z_single = None
        graph_force_indentation_single = None
        graph_elspectra_single = None

        # Use ThreadPoolExecutor for blocking DuckDB operations
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Fetch non-single graphs only if filters have changed
            if filters_changed:
                graph_force_vs_z, graph_force_indentation, graph_elspectra = await loop.run_in_executor(
                    executor,
                    lambda: fetch_curves_batch(conn, batch_ids, filters)
                )
                
        # Fetch specific curve data if curve_id is provided (always, regardless of filters_changed)
        if curve_id:
            # Note: Using synchronous call here for simplicity; could also use executor if needed
            graph_force_vs_z_single, graph_force_indentation_single, graph_elspectra_single = fetch_curves_batch(
                conn, [curve_id], filters, single=True
            )

        # Prepare the response data
        response_data = {
            "status": "batch",
            "data": {}
        }

        # Include non-single graph data only if fetched (i.e., filters_changed was True)
        if filters_changed:
            response_data["data"].update({
                "graphForcevsZ": graph_force_vs_z,
                "graphForceIndentation": graph_force_indentation,
                "graphElspectra": graph_elspectra
            })

        # Add single curve data if available
        if graph_force_vs_z_single:
            response_data["data"].update({
                "graphForcevsZSingle": graph_force_vs_z_single,
                "graphForceIndentationSingle": graph_force_indentation_single,
                "graphElspectraSingle": graph_elspectra_single
            })

        # Stream results if there’s any data
        if response_data["data"]:
            await websocket.send_text(json.dumps(
                response_data,
                default=str  # Handles non-serializable types like numpy arrays
            ))
            # print(f"Streamed batch for IDs: {batch_ids}, curve_id: {curve_id}")
        else:
            print(f"No data returned for batch: {batch_ids}")
            await websocket.send_text(json.dumps({
                "status": "batch_empty",
                "message": "No curves returned for this batch",
                "batch_ids": batch_ids
            }))

    except Exception as e:
        print(f"Error processing batch {batch_ids}: {e}")
        await websocket.send_text(json.dumps({
            "status": "batch_error",
            "message": f"Error processing batch: {str(e)}",
            "batch_ids": batch_ids
        }))
    
@app.on_event("startup")
async def startup_event():
    """Load HDF5 data into DuckDB and set up filters when the server starts."""
    # Check if DB needs initialization
    # if not os.path.exists(DB_PATH) or os.stat(DB_PATH).st_size == 0:
    #     print("🚀 Loading HDF5 data into DuckDB...")
    #     transform_hdf5_to_db(HDF5_FILE_PATH, DB_PATH)
    # else:
    #     print("✅ DuckDB database already exists, skipping reload.")
    print("✅ Startup complete.")


from opener import detect_file_type, load_experiment
from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel

# Pydantic model for response
class ExperimentResponse(BaseModel):
    status: str
    message: str
    curves: int
    filename: str
    duckdb_status: str
    spring_constant: float = None
    tip_radius_um: float = None

from file_types.json import read_json, transform_data_for_force_vs_z_json
from openers.hdf5_opener import HDF5Opener
from openers.json_opener import JSONOpener
from storage.duckdb_storage import save_to_duckdb
from transform.transform import transform_data
from typing import Dict, List, Any
from file_types.hdf5 import get_hdf5_structure, process_hdf5
from file_types.json import get_json_structure
from fastapi import FastAPI, File, UploadFile


@app.post("/load-experiment")
async def load_experiment_endpoint(file: UploadFile = File(...)):
    """Handle file upload and return file structure."""
    file_path = os.path.join("uploads", file.filename)
    os.makedirs("uploads", exist_ok=True)
    
    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())

        file_type = detect_file_type(file_path)
        if file_type == "json":
            with open(file_path, "r") as f:
                json_data = json.load(f)
            structure = get_json_structure(json_data)
            return {
                "status": "structure",
                "message": "Select dataset paths and metadata",
                "filename": file_path,
                "file_type": "json",
                "structure": structure
            }
        elif file_type == "hdf5":
            structure = get_hdf5_structure(file_path)
            return {
                "status": "structure",
                "message": "Select dataset paths and metadata",
                "filename": file_path,
                "file_type": "hdf5",
                "structure": structure
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

@app.post("/process-file")
async def process_file_endpoint(data: Dict[str, Any]):
    """Process file with user-selected dataset paths and metadata."""
    file_path = data.get("file_path")
    file_type = data.get("file_type")
    force_path = data.get("force_path")
    z_path = data.get("z_path")
    metadata = data.get("metadata", {})
    print("process file", force_path, z_path)
    if not all([file_path, file_type, force_path, z_path]):
        raise HTTPException(status_code=400, detail="Missing file_path, file_type, force_path, or z_path")

    try:
        if file_type == "json":
            with open(file_path, "r") as f:
                json_data = json.load(f)
            curves = transform_data_for_force_vs_z_json(json_data, force_path, z_path, metadata)
        elif file_type == "hdf5":
            curves = process_hdf5(file_path, force_path, z_path, metadata)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        transformed_curves = transform_data(curves)
        db_path = "data/experiment.db"
        save_to_duckdb(transformed_curves, db_path)
        return {
            "status": "success",
            "message": f"{file_type.upper()} file processed",
            "curves": len(curves),
            "filename": file_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")
