from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
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

def read_hdf5_recursive(group, data_dict, path=""):
    """Recursively reads datasets from an HDF5 file."""
    for key in group.keys():
        item_path = f"{path}/{key}" if path else key
        
        if isinstance(group[key], h5py.Group):
            read_hdf5_recursive(group[key], data_dict, item_path)  # Recursively read groups
        else:
            try:
                data = group[key][()]
                if isinstance(data, np.ndarray):
                    data = data.tolist()
                data_dict[item_path] = data
            except Exception as e:
                print(f"Error reading dataset {item_path}: {e}")

def read_hdf5(file_path):
    """Reads an HDF5 file recursively and returns its contents as a dictionary."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {file_path} not found.")

    data_dict = {}
    try:
        with h5py.File(file_path, "r") as f:
            read_hdf5_recursive(f, data_dict)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Error reading HDF5 file: {e}")

    return data_dict

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

@app.get("/data")
async def get_hdf5_data():
    """API endpoint to read and return Force vs Z data."""
    try:
        raw_data = read_hdf5(HDF5_FILE_PATH)  
        transformed_data = transform_data_for_force_vs_z(raw_data)  
        return {"status": "success", "data": transformed_data}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="HDF5 file not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

