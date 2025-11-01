from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import json
import duckdb
import os
import logging
# from db import transform_hdf5_to_db
from filters.register_all import register_filters
from db import fetch_curves_batch, ensure_cache_tables, get_metadata_for_curves, get_conn, compute_elasticity_params_batched
import asyncio
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from typing import Dict, List, Tuple, Any


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

# Configure logging
logger = logging.getLogger(__name__)


# --- PARALLEL WORKER (place near top of main.py) ---
# Each worker owns its DuckDB connection (read-only), registers UDFs,
# sets PRAGMAs, then runs the pipeline for its subset.
# Returns a dict with only what's needed by the caller.
def _parallel_worker(curve_ids, filters, compute="elasticity"):
    """
    Process-level worker function that processes a batch of curves.
    Each worker creates its own DuckDB connection, registers UDFs,
    and runs the pipeline for its subset of curve IDs.
    
    Args:
        curve_ids: List of curve IDs to process in this batch
        filters: Dictionary of filters to apply
        compute: Either a string ("fparams" or "elasticity") for backward compatibility,
                 or a dict compute_spec with keys:
                 - "compute": "fparams" or "elasticity"
                 - "emodel": (optional) elastic model name
                 - "emodel_params": (optional) elastic model parameters dict
                 - "elasticity_params": (optional) elasticity parameters dict
    
    Returns:
        For string compute: Dict containing either "fparams" or "elasticity_params" key with results
        For dict compute_spec: Tuple (True, out_dict) where out_dict contains full result structure
    """
    # Each worker gets its own read-only connection (separate process, won't conflict with main process)
    conn = duckdb.connect(DB_PATH, read_only=True)
    try:
        # Let DuckDB parallelize *inside* each query too (tune as you like)
        conn.execute(f"PRAGMA threads = {os.cpu_count() or 2};")

        # Every process must (re)register UDFs
        register_filters(conn)
        # Ensure cache tables exist (may fail in read-only mode; main process handles this)
        try:
            ensure_cache_tables(conn)
        except Exception as _:
            # Likely read-only; skip creating cache tables in worker
            # Main process will handle cache table creation
            pass

        # Per-batch metadata (spring_constant, tip_radius, tip_geometry)
        metadata = get_metadata_for_curves(conn, curve_ids)

        # Parse compute parameter - support both string (backward compat) and dict (new pattern)
        if isinstance(compute, dict):
            # New pattern: compute_spec dict
            compute_spec = compute
            compute_type = compute_spec.get("compute", "elasticity")
            # Note: emodel selection is handled via filters["e_models"], not via this field
            emodel = compute_spec.get("emodel")  # Optional; actual model comes from filters
            emodel_params = compute_spec.get("emodel_params", {})  # Model-specific parameters (maxInd, minInd, etc.)
            elasticity_params = compute_spec.get("elasticity_params", {})  # Elspectra parameters (window, order, interpolate)
            
            # Extract elastic_model_params from emodel_params or use defaults
            if isinstance(emodel_params, dict):
                elastic_model_params = {
                    "maxInd": emodel_params.get("maxInd", 800),
                    "minInd": emodel_params.get("minInd", 0)
                }
            else:
                elastic_model_params = {"maxInd": 800, "minInd": 0}
            
            # Determine if we need elspectra computation
            need_elspectra = (compute_type == "elasticity")
            
            # Run your full pipeline for this subset (single=True exposes params)
            g_fvz, g_fi, g_el = fetch_curves_batch(
                conn, curve_ids, filters, single=True, metadata=metadata,
                compute_elspectra=need_elspectra,
                elasticity_params=elasticity_params if elasticity_params else None,
                elastic_model_params=elastic_model_params
            )
            
            # Build result dict with full structure
            out = {
                "num_curves": len(curve_ids),
                "graph_force_vs_z": g_fvz,
                "graph_force_indentation": g_fi,
                "graph_elspectra": g_el
            }
            
            # Extract specific params if needed
            if compute_type == "elasticity":
                elasticity_params_list = []
                if g_el and isinstance(g_el, dict):
                    elasticity_params_list = g_el.get("curves_elasticity_param", [])
                out["elasticity_params"] = elasticity_params_list
                
            elif compute_type == "fparams":
                fparams_list = []
                if g_fi and isinstance(g_fi.get("curves"), dict):
                    fparams_list = g_fi["curves"].get("curves_fparam", [])
                out["fparams"] = fparams_list
            
            # Return tuple format for streaming endpoints
            return True, out
            
        else:
            # Backward compatibility: string compute parameter
            compute_type = compute
            
            # Run your full pipeline for this subset (single=True exposes params) 
            g_fvz, g_fi, g_el = fetch_curves_batch(
                conn, curve_ids, filters, single=True, metadata=metadata, compute_elspectra=(compute_type == "elasticity")
            )

            if compute_type == "fparams":
                out = []
                if g_fi and isinstance(g_fi.get("curves"), dict):
                    out = g_fi["curves"].get("curves_fparam", [])
                return {"fparams": out}

            elif compute_type == "elasticity":
                out = []
                if g_el and isinstance(g_el, dict):
                    out = g_el.get("curves_elasticity_param", [])
                return {"elasticity_params": out}

            else:
                return {}

    finally:
        conn.close()


@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream batches of curve data from DuckDB and send filter defaults."""
    # print("WebSocket connected")
    await websocket.accept()
    conn = duckdb.connect(DB_PATH)
    # print(f"Connected to database: {DB_PATH}")

    try:
        # Debug: List all tables before any operations
        tables = conn.execute("SHOW TABLES").fetchall()
        # print(f"Tables in database at connection: {tables}")
        
        # Register filters
        register_filters(conn)
        # Ensure cache tables exist
        ensure_cache_tables(conn)
        # print("Filters registered")

        # Debug: List tables after register_filters
        tables = conn.execute("SHOW TABLES").fetchall()
        # print(f"Tables in database after register_filters: {tables}")

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
            
        # print("Prepared contact point filter defaults")
        await websocket.send_json({
            "status": "filter_defaults",             
            "data": {
                "regular_filters": filter_defaults,
                "cp_filters": cp_filter_defaults,
                "fmodels": fmodel_defaults,
                "emodels": emodel_defaults
            }})
        # print("Sent filter defaults to client")

        # Check table existence
        table_exists = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='force_vs_z'"
        ).fetchone()[0]
        # print(f"force_vs_z exists: {table_exists}")
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
                
                
                num_curves = request_data.get("num_curves") or 1
                filters = request_data.get("filters", {"regular": {}, "cp_filters": {}, "fmodels": {}})
                curve_id = request_data.get("curve_id", None)  # Extract curve_id
                filters_changed = request_data.get("filters_changed", False)
                set_zero_force = request_data.get("set_zero_force", True)  # Extract set_zero_force, default to True
                elasticity_params = request_data.get("elasticity_params", {
                    "interpolate": True,
                    "order": 2,
                    "window": 61
                })  # Extract elasticity parameters
                elastic_model_params = request_data.get("elastic_model_params", {
                    "maxInd": 800,
                    "minInd": 0
                })  # Extract elastic model parameters
                force_model_params = request_data.get("force_model_params", {
                    "maxInd": 800,
                    "minInd": 0,
                    "poisson": 0.5
                })  # Extract force model parameters
                # print(f"Received request: num_curves={num_curves}, curve_id={curve_id}, filters={filters}")

                # Fetch curve IDs based on request
                if curve_id:
                    # If specific curve_id is provided, only fetch that curve
                    curve_ids = [curve_id]
                    # print(f"Fetching specific curve_id: {curve_ids}")
                else:
                    # Otherwise fetch based on num_curves
                    curve_ids_result = conn.execute(
                        "SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)
                    ).fetchall()
                    curve_ids = [str(row[0]) for row in curve_ids_result]  # Ensure string IDs
                    # print(f"Total curve IDs fetched: {curve_ids}")

                # Process in batches
                for i in range(0, len(curve_ids), BATCH_SIZE):
                    batch_ids = curve_ids[i:i + BATCH_SIZE]
                    # print(f"Processing batch: {batch_ids}")
                    await process_and_stream_batch(conn, batch_ids, filters, websocket, curve_id, filters_changed, set_zero_force, elasticity_params, elastic_model_params, force_model_params)
                    await asyncio.sleep(0.01)  # Small delay to avoid overwhelming client
                # Check for metadata request
                action = request_data.get("action", None)
                if action == "get_metadata":
                    await get_metadata(conn, websocket)
                # print("send meta and now curves")
                # Signal completion of this request
                await websocket.send_text(json.dumps({"status": "complete"}))
                # print("Request completed")

            except WebSocketDisconnect:
                # print("Client disconnected.")
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
        # print(f"Unexpected error: {e}")
        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))
    finally:
        conn.close()
        # print("WebSocket connection closed")


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
        # print(f"Error in get_metadata: {e}")
        return error_response
    
async def process_and_stream_batch(
    conn: duckdb.DuckDBPyConnection,
    batch_ids: List[str],
    filters: Dict,
    websocket: WebSocket,
    curve_id: str = None,
    filters_changed: bool = False,  # New flag,
    set_zero_force: bool = True,  # New parameter for set_zero_force
    elasticity_params: Dict = None,  # New parameter for elasticity parameters
    elastic_model_params: Dict = None,  # New parameter for elastic model parameters
    force_model_params: Dict = None,  # New parameter for force model parameters
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
            # If this is a specific single curve request (curve_id is provided), use single=True
            # Get metadata for the curves
            from db import get_metadata_for_curves
            metadata = get_metadata_for_curves(conn, batch_ids)
            print(f"DEBUG: Retrieved metadata: {metadata}")
            
            # Decide if we want the "single" path (include fmodel/emodel fits in the payload)
            want_models = bool(filters.get("f_models") or filters.get("e_models"))

            # Case A: explicit single curve request
            if curve_id and len(batch_ids) == 1:
                print("Single curve request:", batch_ids)
                # Note: Using synchronous call here for simplicity; could also use executor if needed
                graph_force_vs_z_single, graph_force_indentation_single, graph_elspectra_single = fetch_curves_batch(
                    conn, batch_ids, filters, single=True, metadata=metadata, set_zero_force=set_zero_force, elasticity_params=elasticity_params, elastic_model_params=elastic_model_params, force_model_params=force_model_params
                )

            # Case B: implicit single curve (e.g., num_curves = 1) AND models are selected
            elif len(batch_ids) == 1 and want_models:
                print("Implicit single curve with models:", batch_ids)
                graph_force_vs_z_single, graph_force_indentation_single, graph_elspectra_single = fetch_curves_batch(
                    conn, batch_ids, filters, single=True, metadata=metadata, set_zero_force=set_zero_force, elasticity_params=elasticity_params, elastic_model_params=elastic_model_params, force_model_params=force_model_params
                )

            # Case C: regular batch mode
            elif filters_changed or not curve_id:
                print("Batch processing:", batch_ids)
                graph_force_vs_z, graph_force_indentation, graph_elspectra = await loop.run_in_executor(
                    executor,
                    lambda: fetch_curves_batch(conn, batch_ids, filters, metadata=metadata, set_zero_force=set_zero_force, elasticity_params=elasticity_params, elastic_model_params=elastic_model_params, force_model_params=force_model_params)
                )

        # Prepare the response data
        response_data = {
            "status": "batch",
            "data": {}
        }

        # Include batch graph data if fetched
        if graph_force_vs_z:
            response_data["data"].update({
                "graphForcevsZ": graph_force_vs_z,
                "graphForceIndentation": graph_force_indentation,
                "graphElspectra": graph_elspectra
            })

        # Add single curve data if available (for specific curve_id requests)
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



from typing import Dict, List, Any
from file_types.hdf5 import get_hdf5_structure, process_hdf5, export_from_duckdb_to_hdf5
from fastapi import FastAPI, File, UploadFile
import json
import os
import logging
import re
from fastapi.responses import FileResponse
from pathlib import Path
from routers.opener import router as experiment_router
from routers.exporter import router as exporter_router

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
app.include_router(experiment_router)
app.include_router(exporter_router)


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


# New endpoint to fetch all curves' fparams with progress streaming
@app.post("/get-all-fparams-stream")
async def get_all_fparams_stream(data: Dict[str, Any]):
    """
    Server-Sent Events endpoint to stream fparams progress and results.
    Emits progress updates during batch processing.
    """
    async def generate():
        try:
            # Extract parameters from request
            filters = data.get("filters", {})
            
            # Ensure we have fmodels to calculate fparams
            if not filters.get("f_models"):
                filters["f_models"] = {"hertz_filter_array": {"model": "hertz", "poisson": 0.5}}
            
            # Connect to database
            conn = duckdb.connect(DB_PATH)
            
            # Register filters (with error handling for existing functions)
            try:
                register_filters(conn)
                # Ensure cache tables exist
                ensure_cache_tables(conn)
            except Exception as e:
                if "already exists" in str(e):
                    print(f"Some functions already exist. Continuing with existing functions.")
                else:
                    raise
            
            # Get ALL curve IDs (no limit)
            curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
            curve_ids = [str(row[0]) for row in curve_ids_result]
            
            total_curves = len(curve_ids)
            print(f"Found {total_curves} total curves in database")
            
            # Emit initial progress
            yield f"data: {json.dumps({'type': 'progress', 'phase': 'Starting...', 'done': 0, 'total': total_curves})}\n\n"
            
            if not curve_ids:
                yield f"data: {json.dumps({'type': 'complete', 'status': 'success', 'fparams': [], 'message': 'No curves found'})}\n\n"
                conn.close()
                return
            
            # Process curves in smaller batches to avoid memory issues
            batch_size = 50  # Process 50 curves at a time
            all_fparams = []
            total_batches = (total_curves + batch_size - 1) // batch_size
            
            for i in range(0, len(curve_ids), batch_size):
                batch_curve_ids = curve_ids[i:i + batch_size]
                batch_num = i // batch_size + 1
                print(f"Processing batch {batch_num}/{total_batches}: curves {i} to {min(i + batch_size, len(curve_ids))}")
                
                # Emit batch progress
                yield f"data: {json.dumps({'type': 'progress', 'phase': f'Processing batch {batch_num}/{total_batches}...', 'done': i, 'total': total_curves, 'current_batch': batch_num, 'total_batches': total_batches})}\n\n"
                
                # Fetch curves with fparam calculation (use single=True to get fparams)
                # Skip elspectra calculation for fparams endpoint to improve performance
                graph_force_vs_z, graph_force_indentation, graph_elspectra = fetch_curves_batch(
                    conn, batch_curve_ids, filters, single=True, compute_elspectra=False
                )
                
                # Extract fparams from this batch
                if graph_force_indentation and graph_force_indentation.get("curves"):
                    curves_data = graph_force_indentation["curves"]
                    if isinstance(curves_data, dict) and "curves_fparam" in curves_data:
                        batch_fparams = curves_data["curves_fparam"]
                        # Adjust curve_index to be global
                        for fparam in batch_fparams:
                            fparam["curve_index"] += i  # Add the batch offset
                        all_fparams.extend(batch_fparams)
                        print(f"Batch {batch_num}: Found {len(batch_fparams)} fparams")
                
                # Emit batch completion
                yield f"data: {json.dumps({'type': 'progress', 'phase': f'Batch {batch_num}/{total_batches} complete', 'done': min(i + batch_size, total_curves), 'total': total_curves})}\n\n"
            
            fparams = all_fparams
            print(f"Total fparams found: {len(fparams)}")
            
            conn.close()
            
            # Emit final result
            yield f"data: {json.dumps({'type': 'complete', 'status': 'success', 'fparams': fparams, 'message': f'Retrieved fparams for {len(fparams)} curves'})}\n\n"
            
        except Exception as e:
            logger.error(f"Failed to fetch fparams: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'status': 'error', 'message': f'Failed to fetch fparams: {str(e)}'})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


# Helper function for SSE events
def sse_event(payload: dict) -> bytes:
    """Format a dict as an SSE event line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


# New endpoint to fetch all curves' elasticity parameters with progress streaming
@app.post("/get-all-emodels-stream")
async def get_all_emodels_stream(req: Request):
    """
    SSE stream of elasticity model parameters with progress.
    Uses consistent DuckDB connection to avoid configuration conflicts.
    
    Body:
      {
        "filters": {
          "regular": {...},
          "cp_filters": {...},
          "f_models": {...},
          "e_models": {...}
        },
        "num_curves": <optional>,
        "elasticity_params": {"interpolate": true, "order": 2, "window": 61},
        "emodel_params": {"maxInd": 800, "minInd": 0}
      }
    """
    body = await req.json()
    filters = (body or {}).get("filters", {})
    num_curves = (body or {}).get("num_curves")
    elasticity_params = (body or {}).get("elasticity_params", {"interpolate": True, "order": 2, "window": 61})
    elastic_model_params = (body or {}).get("emodel_params", {"maxInd": 800, "minInd": 0})
    
    # Ensure we have e_models to calculate elasticity
    if not filters.get("e_models"):
        filters["e_models"] = {"constant_filter_array": {"model": "constant"}}
    
    async def gen():
        # Important for proxies like nginx
        yield b": keep-alive\n\n"
        yield sse_event({"type": "initializing", "phase": "Initializing...", "done": 0, "total": 0, "total_batches": 0})
        
        # Use consistent connection from get_conn() to avoid DuckDB configuration conflicts
        conn = get_conn()
        try:
            # Use the batched async generator
            batch_iter = compute_elasticity_params_batched(
                conn,
                filters=filters,
                num_curves=num_curves,
                batch_size=50,
                elasticity_params=elasticity_params,
                elastic_model_params=elastic_model_params
            )
            
            total_batches = None
            total = None
            done_global = 0
            all_rows = []
            
            async for batch_idx, tb, done, tot, rows in batch_iter:
                # Cache totals once
                total_batches = tb if total_batches is None else total_batches
                total = tot if total is None else total
                
                done_global = done
                all_rows.extend(rows)
                
                # Progress event with correct field names matching fparams stream
                yield sse_event({
                    "type": "progress",
                    "phase": f"Processing batch {batch_idx}/{tb}",
                    "current_batch": batch_idx,
                    "total_batches": tb,
                    "done": done,
                    "total": tot,
                })
                
                # Give the event loop a breath so chunks flush
                await asyncio.sleep(0)
            
            # Complete event with final payload
            yield sse_event({
                "type": "complete",
                "status": "success",
                "done": done_global,
                "total": total,
                "elasticity_params": all_rows
            })
            
        except Exception as e:
            logger.error(f"Failed to fetch elasticity params: {str(e)}")
            yield sse_event({"type": "error", "status": "error", "message": str(e)})
        # Note: Do NOT close the singleton connection here
        
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Disables nginx buffering
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)


# New endpoint to fetch all curves' fparams (non-streaming, kept for compatibility)
@app.post("/get-all-fparams")
async def get_all_fparams(data: Dict[str, Any]):
    """HTTP endpoint to fetch fparams for all curves with current filters using process-level parallelism."""
    try:
        # Extract parameters from request
        filters = data.get("filters", {})
        
        # Ensure we have fmodels to calculate fparams
        if not filters.get("f_models"):
            filters["f_models"] = {"hertz_filter_array": {"model": "hertz", "poisson": 0.5}}
        
        # Use consistent connection to avoid DuckDB configuration conflicts
        conn = get_conn()
        try:
            # Let DuckDB parallelize scans/CTEs within queries
            conn.execute(f"PRAGMA threads = {os.cpu_count() or 2};")
            # Build the full id list once
            curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
            all_ids = [str(r[0]) for r in curve_ids_result]
        finally:
            # Don't close singleton connection
            pass
        
        if not all_ids:
            return {
                "status": "success",
                "fparams": [],
                "message": "No curves found"
            }
        
        print(f"Found {len(all_ids)} total curves in database")
        
        # Process curves in batches with process-level parallelism
        batch_size = 100  # Process 100 curves per batch (tune as you like)
        batches = [all_ids[i:i+batch_size] for i in range(0, len(all_ids), batch_size)]
        
        all_fparams = []
        # Use ProcessPoolExecutor for true process-level parallelism
        # Each worker = its own DuckDB connection + its own UDFs
        with ProcessPoolExecutor(max_workers=(os.cpu_count() // 2) or 2) as ex:
            futs = [ex.submit(_parallel_worker, b, filters, "fparams") for b in batches]
            for fut in as_completed(futs):
                res = fut.result()
                if res and "fparams" in res:
                    all_fparams.extend(res["fparams"])
        
        print(f"Total fparams found: {len(all_fparams)}")
        
        return {
            "status": "success",
            "fparams": all_fparams,
            "message": f"Retrieved fparams for {len(all_fparams)} curves"
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch fparams: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to fetch fparams: {str(e)}"
        })


# New endpoint to fetch all curves' elasticity parameters
@app.post("/get-all-elasticity-params")
async def get_all_elasticity_params(data: Dict[str, Any]):
    """HTTP endpoint to fetch elasticity parameters for all curves with current filters using process-level parallelism."""
    try:
        filters = data.get("filters", {})
        if not filters.get("e_models"):
            filters["e_models"] = {"constant_filter_array": {"model": "constant"}}

        # Use consistent connection to avoid DuckDB configuration conflicts
        conn = get_conn()
        try:
            # Let DuckDB parallelize scans/CTEs within queries
            conn.execute(f"PRAGMA threads = {os.cpu_count() or 2};")
            curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
            all_ids = [str(r[0]) for r in curve_ids_result]
        finally:
            # Don't close singleton connection
            pass

        if not all_ids:
            return {"status": "success", "elasticity_params": [], "message": "No curves found"}

        batch_size = 100   # Process 100 curves per batch to reduce coordinator round-trips
        batches = [all_ids[i:i+batch_size] for i in range(0, len(all_ids), batch_size)]

        all_params = []
        with ProcessPoolExecutor(max_workers=(os.cpu_count() // 2) or 2) as ex:
            futs = [ex.submit(_parallel_worker, b, filters, "elasticity") for b in batches]
            for fut in as_completed(futs):
                res = fut.result()
                if res and "elasticity_params" in res:
                    all_params.extend(res["elasticity_params"])

        return {
            "status": "success",
            "elasticity_params": all_params,
            "message": f"Retrieved elasticity params for {len(all_params)} curves"
        }

    except Exception as e:
        logger.error(f"Failed to fetch elasticity params: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to fetch elasticity params: {str(e)}"
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