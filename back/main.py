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
                # Check for metadata request
                action = request_data.get("action", None)
                if action == "get_metadata":
                    await get_metadata(conn, websocket)
                    continue
                print("send meta and now curves")
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


async def get_metadata(conn, websocket):
    try:
        # Execute query to fetch one row from force_vs_z
        cursor = conn.execute("SELECT * FROM force_vs_z LIMIT 1")
        row = cursor.fetchone()
        
        # Get column names from cursor description
        columns = [description[0] for description in cursor.description]
        
        # If a row exists, include its data; otherwise, send only column names
        metadata = {
            "status": "metadata",
            "metadata": {
                "columns": columns,
                "sample_row": dict(zip(columns, row)) if row else None
            }
        }
        
        # Send metadata via WebSocket
        await websocket.send_text(json.dumps(metadata))
        # print("Sent metadata:", metadata)
        
        # return metadata
    
    except Exception as e:
        error_response = {
            "status": "error",
            "message": f"Error fetching metadata: {e}"
        }
        await websocket.send_text(json.dumps(error_response))
        print(f"Error in get_metadata: {e}")
        return error_response
    
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
from file_types.hdf5 import get_hdf5_structure, process_hdf5, export_from_duckdb_to_hdf5
from file_types.json import get_json_structure
from fastapi import FastAPI, File, UploadFile
import json
import os
import logging
import re
from fastapi.responses import FileResponse
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("hdf5_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

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
        elif file_type == "hdf5":
            structure = get_hdf5_structure(file_path)
        else:
            logger.error(f"Unsupported file type: {file_type}")
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type}")

        logger.info(f"Loaded file structure for {file_path} (type: {file_type})")
        return {
            "status": "structure",
            "message": "Select dataset paths and metadata",
            "filename": file_path,
            "file_type": file_type,
            "structure": structure,
            "errors": []
        }
    except Exception as e:
        logger.error(f"Failed to process file {file.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to process file: {str(e)}",
            "filename": file.filename,
            "errors": [str(e)]
        })

@app.post("/process-file")
async def process_file_endpoint(data: Dict[str, Any]):
    """Process file with user-selected dataset paths and metadata."""
    file_path = data.get("file_path")
    file_type = data.get("file_type")
    force_path = data.get("force_path")
    z_path = data.get("z_path")
    metadata = data.get("metadata", {})
    errors = []

    if not all([file_path, file_type, force_path, z_path]):
        errors.append("Missing file_path, file_type, force_path, or z_path")
        logger.error(f"Missing required fields: {errors}")
        raise HTTPException(status_code=400, detail={
            "status": "error",
            "message": "Missing required fields",
            "filename": file_path or "unknown",
            "errors": errors
        })

    try:
        if file_type == "json":
            with open(file_path, "r") as f:
                json_data = json.load(f)
            curves = transform_data_for_force_vs_z_json(json_data, force_path, z_path, metadata)
        elif file_type == "hdf5":
            opener = HDF5Opener()
            if not opener.validate_metadata(metadata):
                errors.append("Invalid or incomplete metadata")
                logger.error(f"Metadata validation failed: {metadata}")
                raise ValueError("Invalid or incomplete metadata")
            curves = process_hdf5(file_path, force_path, z_path, metadata)
        else:
            errors.append(f"Unsupported file type: {file_type}")
            logger.error(f"Unsupported file type: {file_type}")
            raise ValueError(f"Unsupported file type: {file_type}")

        transformed_curves = transform_data(curves)
        db_path = "data/experiment.db"
        save_to_duckdb(transformed_curves, db_path)
        logger.info(f"Saved {len(curves)} curves to DuckDB at {db_path}")

        return {
            "status": "success",
            "message": f"{file_type.upper()} file processed",
            "curves": len(curves),
            "filename": file_path,
            "duckdb_status": "saved",
            "spring_constant": float(metadata.get("spring_constant", 0.1)),
            "tip_radius_um": float(metadata.get("tip_radius", 1e-6)) * 1e6,
            "errors": errors
        }
    except Exception as e:
        errors.append(str(e))
        logger.error(f"Failed to process file {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to process file: {str(e)}",
            "filename": file_path,
            "errors": errors
        })


# Sanitize file system paths
def sanitize_file_path(path: str) -> str:
    path = Path(path).resolve()
    if not path.is_relative_to(Path.cwd()):
        raise ValueError("Path outside allowed directory")
    return str(path)

# Validate HDF5 paths (group/dataset names)
def validate_hdf5_path(path: str) -> None:
    if not path or not isinstance(path, str):
        raise ValueError("HDF5 path must be a non-empty string")
    if path.startswith("/") or path.endswith("/"):
        raise ValueError("HDF5 path cannot start or end with '/'")
    if "//" in path:
        raise ValueError("HDF5 path cannot contain consecutive '/'")
    # Optionally, add regex to restrict to valid HDF5 group/dataset names
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_/]*[a-zA-Z0-9]$', path):
        raise ValueError("HDF5 path contains invalid characters")

@app.post("/export-hdf5")
async def export_hdf5_endpoint(data: Dict[str, Any]):
    """Export curves from DuckDB to an HDF5 file with custom level names and metadata."""
    export_hdf5_path = data.get("export_hdf5_path")
    curve_ids = data.get("curve_ids", [])
    dataset_path = data.get("dataset_path")
    num_curves = data.get("num_curves")
    level_names = data.get("level_names", ["curve0", "segment0"])
    metadata_path = data.get("metadata_path", "")
    metadata = data.get("metadata", {})
    db_path = "data/experiment.db"
    errors = []

    # Validate export_hdf5_path
    if not export_hdf5_path:
        errors.append("Missing export_hdf5_path")
        logger.error("Missing export_hdf5_path")
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Missing export_hdf5_path", "errors": errors})

    try:
        # Sanitize file system path
        export_hdf5_path = sanitize_file_path(export_hdf5_path)

        # Validate dataset_path (required for HDF5 data storage)
        if not dataset_path:
            errors.append("Missing dataset_path")
            logger.error("Missing dataset_path")
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Missing dataset_path", "errors": errors})
        validate_hdf5_path(dataset_path)

        # Validate metadata_path (optional, can be empty)
        if metadata_path:
            validate_hdf5_path(metadata_path)

        # Convert curve_ids
        converted_curve_ids = None
        if curve_ids:
            converted_curve_ids = []
            for curve_id in curve_ids:
                match = re.match(r"curve(\d+)", curve_id)
                if not match:
                    errors.append(f"Invalid curve_id format: {curve_id}")
                    logger.error(f"Invalid curve_id: {curve_id}")
                    raise HTTPException(status_code=400, detail={"status": "error", "message": f"Invalid curve_id: {curve_id}", "errors": errors})
                converted_curve_ids.append(int(match.group(1)))

        # Fetch curve_ids if num_curves is provided
        if not converted_curve_ids and num_curves is not None:
            if not isinstance(num_curves, int) or num_curves <= 0:
                errors.append("num_curves must be a positive integer")
                raise HTTPException(status_code=400, detail={"status": "error", "message": "Invalid num_curves", "errors": errors})
            with duckdb.connect(db_path) as conn:
                curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)).fetchall()
                converted_curve_ids = [row[0] for row in curve_ids_result]

        # Validate level_names
        if not all(isinstance(name, str) and name.strip() for name in level_names):
            errors.append("All level names must be non-empty strings")
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Invalid level names", "errors": errors})

        # Validate metadata
        for key, value in metadata.items():
            if value and isinstance(value, str) and not value.strip():
                errors.append(f"Metadata field {key} cannot be empty")
        if errors:
            raise HTTPException(status_code=400, detail={
                "status": "error",
                "message": "Invalid metadata",
                "errors": errors
            })

        logger.info(f"Starting HDF5 export to {export_hdf5_path} with {len(converted_curve_ids or [])} curves")
        os.makedirs(os.path.dirname(export_hdf5_path), exist_ok=True)
        num_exported = export_from_duckdb_to_hdf5(
            db_path=db_path,
            output_path=export_hdf5_path,  # Fixed: Use output_path instead of export_hdf5_path
            curve_ids=converted_curve_ids,
            dataset_path=dataset_path,  # Pass dataset_path for HDF5 data storage
            level_names=level_names,
            metadata_path=metadata_path,
            metadata=metadata
        )

        return {
            "status": "success",
            "message": f"Successfully exported {num_exported} curves",
            "export_hdf5_path": export_hdf5_path,
            "exported_curves": num_exported
        }
    except Exception as e:
        errors.append(str(e))
        logger.error(f"Failed to export to HDF5: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to export: {str(e)}",
            "export_hdf5_path": export_hdf5_path,
            "errors": errors
        })
        
        
# File-serving endpoint
@app.get("/exports/{file_path:path}")
async def serve_exported_file(file_path: str):
    """Serve an exported file from the exports directory."""
    full_path = os.path.join("", file_path)
    print(full_path)
    if not os.path.exists(full_path):
        logger.error(f"File not found: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path, filename=os.path.basename(full_path))