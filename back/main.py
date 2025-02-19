from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import h5py
import numpy as np
import os
import asyncio
import json
app = FastAPI()

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to the HDF5 file
HDF5_FILE_PATH = "data/all.hdf5"  # Adjust as needed

async def read_hdf5_recursive_streaming(group, chunk_size=500, path=""):
    """Asynchronous generator to read HDF5 datasets recursively in chunks."""
    for key in group.keys():
        item_path = f"{path}/{key}" if path else key
        
        if isinstance(group[key], h5py.Group):
            async for item in read_hdf5_recursive_streaming(group[key], chunk_size, item_path):
                yield item  # ✅ Recursively yield data in chunks
        else:
            try:
                dataset = group[key]

                # If dataset is empty, skip it
                if dataset.shape[0] == 0:
                    continue

                # Read in chunks to avoid memory overload
                for start in range(0, dataset.shape[0], chunk_size):
                    end = min(start + chunk_size, dataset.shape[0])
                    data_chunk = dataset[start:end]  # Read only the required chunk

                    if isinstance(data_chunk, np.ndarray):
                        data_chunk = data_chunk.tolist()
                    
                    await asyncio.sleep(0)  # Yield control to event loop
                    yield (item_path, data_chunk)  # ✅ Yield chunked data

            except Exception as e:
                print(f"Error reading dataset {item_path}: {e}")


async def read_hdf5_streaming(file_path, chunk_size=500):
    """Asynchronous generator that reads an HDF5 file in chunks."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {file_path} not found.")

    try:
        with h5py.File(file_path, "r") as f:
            async for item in read_hdf5_recursive_streaming(f, chunk_size):
                yield item  # ✅ Yield each chunk instead of storing all at once
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Error reading HDF5 file: {e}")


def transform_data_for_force_vs_z(data_dict):
    """Transforms HDF5 data into a format suitable for F vs Z graph plotting."""
    
    curves = {}  
    transformed_data = {"Force_vs_Z": []}  

    for key, values in data_dict.items():
        parts = key.split("/")  

        if len(parts) < 3:
            continue  

        curve_name = parts[0]  
        data_type = parts[2]  # "Force" or "Z"

        if curve_name not in curves:
            curves[curve_name] = {}

        curves[curve_name][data_type] = values

    for curve_index, (curve_name, curve_data) in enumerate(curves.items()):
        z_values = curve_data.get("Z", [])
        force_values = curve_data.get("Force", [])

        if not z_values or not force_values:
            continue

        for i in range(min(len(z_values), len(force_values))):  
            while len(transformed_data["Force_vs_Z"]) <= i:
                transformed_data["Force_vs_Z"].append({"x": z_values[i]})
            transformed_data["Force_vs_Z"][i][f"y{curve_index + 1}"] = force_values[i]

    return transformed_data

@app.websocket("/ws/data")
async def websocket_data_stream(websocket: WebSocket):
    """WebSocket endpoint to stream HDF5 data in real-time."""
    await websocket.accept()
    
    try:
        # ✅ Read HDF5 asynchronously
        data_stream = read_hdf5_streaming(HDF5_FILE_PATH, chunk_size=500)

        # ✅ Send each chunk over WebSockets
        async for key, chunk in data_stream:
            await websocket.send_text(json.dumps({"status": "success", "dataset": key, "data": chunk}))
            await asyncio.sleep(0.1)  # Simulate real-time delay

    except WebSocketDisconnect:
        print("Client disconnected.")
    except Exception as e:
        await websocket.send_text(json.dumps({"status": "error", "message": str(e)}))

