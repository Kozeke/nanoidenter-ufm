import json
from typing import Dict, Any
import numpy as np
from models.force_curve import ForceCurve, Segment

def read_json(file_path: str) -> Dict[str, Any]:
    """Read JSON file and return a structured dictionary."""
    with open(file_path, "r") as f:
        return json.load(f)

def transform_data_for_force_vs_z_json(json_data: Dict[str, Any]) -> Dict[str, ForceCurve]:
    """Transform JSON data into ForceCurve objects."""
    if "datasets" not in json_data:
        raise ValueError("JSON file must contain a 'datasets' key")

    curves = {}
    curve_segments = {}
    tip_data = {}

    # First pass: collect tip metadata
    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias:
            continue
        parts = alias.strip("/").split("/")
        if parts[-1] == "tip":
            curve_name = parts[-2]
            tip_radius = 1e-6  # Default
            tip_geometry = "pyramid"  # Default
            for attr in dataset.get("attributes", []):
                if attr.get("name") == "value" and attr.get("type", {}).get("class") == "H5T_FLOAT":
                    unit = next((a["value"] for a in dataset.get("attributes", []) if a.get("name") == "unit"), "um")
                    tip_radius = attr.get("value", 1e-6)
                    if unit == "um":
                        tip_radius /= 1e6  # Convert µm to m
                    elif unit == "nm":
                        tip_radius /= 1e9  # Convert nm to m
            tip_data[curve_name] = {"radius": tip_radius, "geometry": tip_geometry}

    # Second pass: collect segment data
    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias or alias.endswith("/tip"):
            continue
        parts = alias.strip("/").split("/")
        # Handle segment datasets (e.g., /curve0/segment0)
        if len(parts) == 2:
            curve_name, segment_name = parts[-2], parts[-1]
            curve_key = f"{curve_name}_{segment_name}"
            if curve_key not in curve_segments:
                curve_segments[curve_key] = {
                    "deflection": None,
                    "z_sensor": None,
                    "spring_constant": 0.0,
                    "sampling_rate": 1e5,
                    "velocity": 1e-6,
                    "tip": tip_data.get(curve_name, {"radius": 1e-6, "geometry": "pyramid"})
                }

            # Process links to Deflection and ZSensor datasets
            for link in dataset.get("links", []):
                if link.get("title") in ["Force", "Z"]:
                    linked_dataset_id = link.get("id")
                    linked_dataset = json_data["datasets"].get(linked_dataset_id, {})
                    values = linked_dataset.get("value", [])
                    if link["title"] == "Force":
                        curve_segments[curve_key]["deflection"] = values
                    elif link["title"] == "Z":
                        curve_segments[curve_key]["z_sensor"] = values

            # Extract spring_constant and other metadata
            for attr in dataset.get("attributes", []):
                if attr.get("name") == "spring_constant":
                    curve_segments[curve_key]["spring_constant"] = attr.get("value", 0.0)
                elif attr.get("name") == "sampling_rate":
                    curve_segments[curve_key]["sampling_rate"] = attr.get("value", 1e5)
                elif attr.get("name") == "velocity":
                    curve_segments[curve_key]["velocity"] = attr.get("value", 1e-6)

        # Handle direct datasets (e.g., /curve0/segment0/Force, /curve0/segment0/Z)
        elif len(parts) == 3 and parts[-1] in ["Force", "Z"]:
            curve_name, segment_name, data_type = parts[-3], parts[-2], parts[-1]
            curve_key = f"{curve_name}_{segment_name}"
            if curve_key not in curve_segments:
                curve_segments[curve_key] = {
                    "deflection": None,
                    "z_sensor": None,
                    "spring_constant": 0.0,
                    "sampling_rate": 1e5,
                    "velocity": 1e-6,
                    "tip": tip_data.get(curve_name, {"radius": 1e-6, "geometry": "pyramid"})
                }
            if data_type == "Force":
                curve_segments[curve_key]["deflection"] = dataset.get("value", [])
            elif data_type == "Z":
                curve_segments[curve_key]["z_sensor"] = dataset.get("value", [])

    # Process each curve/segment into ForceCurve
    for curve_key, data in curve_segments.items():
        if data["deflection"] is None or data["z_sensor"] is None:
            print(f"Warning: Skipping {curve_key} due to missing Deflection or Z data")
            continue
        z_values = np.array(data["z_sensor"])
        deflection = np.array(data["deflection"])
        min_length = min(len(z_values), len(deflection))
        if min_length == 0:
            print(f"Warning: Skipping {curve_key} due to empty Deflection or Z arrays")
            continue
        curve_name = curve_key.split("_")[0]
        curves[curve_key] = ForceCurve(
            file_id=f"{curve_name}_id",
            date="2025-05-20",  # Default, update if available
            instrument="unknown",  # Default, update if available
            sample="unknown",  # Default, update if available
            spring_constant=data["spring_constant"],
            inv_ols=22e-9,  # Default, update if available
            tip_geometry=data["tip"]["geometry"],
            tip_radius=data["tip"]["radius"],
            segments=[
                Segment(
                    type=curve_key.split("_")[1],
                    deflection=deflection[:min_length],
                    z_sensor=z_values[:min_length],
                    sampling_rate=data["sampling_rate"],
                    velocity=data["velocity"],
                    no_points=min_length
                )
            ]
        )

    if not curves:
        raise ValueError("No valid Deflection and Z datasets found in JSON")

    return curves


import numpy as np
from typing import Dict, List, Any
from models.force_curve import ForceCurve, Segment

def get_json_structure(json_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract JSON dataset structure as a nested dictionary for frontend display."""
    if "datasets" not in json_data:
        raise ValueError("JSON file must contain a 'datasets' key")

    structure = {"groups": {}, "datasets": []}

    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias:
            continue
        # Normalize alias by removing leading/trailing slashes
        alias = alias.strip("/")
        parts = alias.split("/")
        current = structure["groups"]
        path = ""

        # Build group hierarchy and collect datasets
        for i, part in enumerate(parts):
            path = f"{path}/{part}" if path else part
            if i == len(parts) - 1:
                # Dataset (e.g., Force, Z, or tip)
                if part in ["Force", "Z"] or part == "tip":
                    shape = [len(dataset.get("value", []))] if dataset.get("value") else [0]
                    dtype = "float64" if dataset.get("value") else "unknown"
                    current.setdefault("datasets", []).append({
                        "path": path,
                        "name": part,
                        "shape": shape,
                        "dtype": dtype
                    })
            else:
                # Group (e.g., curve0, segment0)
                if part not in current:
                    current[part] = {"groups": {}, "datasets": []}
                current = current[part]["groups"]

    return structure

def transform_data_for_force_vs_z_json(json_data: Dict[str, Any], force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    """Transform JSON data into ForceCurve objects using user-selected dataset paths and metadata."""
    if "datasets" not in json_data:
        raise ValueError("JSON file must contain a 'datasets' key")

    curves = {}
    # Extract curve names (e.g., curve0, curve1)
    curve_names = set()
    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias:
            continue
        # Normalize alias
        alias = alias.strip("/")
        parts = alias.split("/")
        if len(parts) >= 1:
            curve_names.add(parts[0])

    if not curve_names:
        raise ValueError("No curve groups found in JSON")

    print(f"Curve names: {curve_names}")

    # Extract curve name from force_path or z_path
    normalized_force_path = force_path.strip("/")
    normalized_z_path = z_path.strip("/")
    force_parts = normalized_force_path.split("/")
    z_parts = normalized_z_path.split("/")
    
    if len(force_parts) < 3 or len(z_parts) < 3:
        raise ValueError(f"Invalid path format. Expected curveX/segmentY/Force, got {force_path} and {z_path}")

    sample_curve_name = force_parts[0]
    if sample_curve_name != z_parts[0]:
        raise ValueError(f"Force and Z paths must belong to the same curve group. Got {force_path} and {z_path}")
    
    if sample_curve_name not in curve_names:
        raise ValueError(f"Selected curve group {sample_curve_name} not found in JSON data")

    print(f"Sample curve name: {sample_curve_name}")
    print(f"Force path: {force_path}, Z path: {z_path}")

    # Validate paths belong to the same curve group
    if not (normalized_force_path.startswith(f"{sample_curve_name}/") and normalized_z_path.startswith(f"{sample_curve_name}/")):
        raise ValueError(f"Selected paths must belong to a curve group. Expected paths starting with {sample_curve_name}/, got {force_path} and {z_path}")

    force_relative_path = normalized_force_path[len(sample_curve_name) + 1:]  # e.g., segment0/Force
    z_relative_path = normalized_z_path[len(sample_curve_name) + 1:]         # e.g., segment0/Z
    print(f"Force relative path: {force_relative_path}, Z relative path: {z_relative_path}")

    # Process each curve
    for curve_name in curve_names:
        try:
            # Normalize curve name
            curve_name = curve_name.strip("/")
            # Find Force and Z datasets
            force_data = None
            z_data = None
            for dataset_id, dataset in json_data["datasets"].items():
                alias = dataset.get("alias", [""])[0].strip("/")
                if alias == f"{curve_name}/{force_relative_path}":
                    force_data = dataset.get("value", [])
                elif alias == f"{curve_name}/{z_relative_path}":
                    z_data = dataset.get("value", [])

            if force_data is None or z_data is None:
                print(f"Warning: Skipping {curve_name} due to missing Force or Z data")
                continue

            deflection = np.array(force_data)
            z_sensor = np.array(z_data)
            min_length = min(len(deflection), len(z_sensor))
            if min_length == 0:
                print(f"Warning: Skipping {curve_name} due to empty Force or Z data")
                continue

            # Extract tip metadata for this curve
            tip_radius = float(metadata.get("tip_radius", 1e-6))
            tip_geometry = metadata.get("tip_geometry", "pyramid")
            for dataset_id, dataset in json_data["datasets"].items():
                alias = dataset.get("alias", [""])[0].strip("/")
                if alias == f"{curve_name}/tip":
                    for attr in dataset.get("attributes", []):
                        if attr.get("name") == "value" and attr.get("type", {}).get("class") == "H5T_FLOAT":
                            unit = next((a["value"] for a in dataset.get("attributes", []) if a.get("name") == "unit"), "um")
                            tip_radius = attr.get("value", 1e-6)
                            if unit == "um":
                                tip_radius /= 1e6
                            elif unit == "nm":
                                tip_radius /= 1e9
                    break

            segments = [
                Segment(
                    type="approach",  # Default, can be updated if segment type is available
                    deflection=deflection[:min_length],
                    z_sensor=z_sensor[:min_length],
                    sampling_rate=float(metadata.get("sampling_rate", 1e5)),
                    velocity=float(metadata.get("velocity", 1e-6)),
                    no_points=min_length
                )
            ]

            curves[curve_name] = ForceCurve(
                file_id=metadata.get("file_id", f"{curve_name}_id"),
                date=metadata.get("date", "2025-05-20"),
                instrument=metadata.get("instrument", "unknown"),
                sample=metadata.get("sample", "unknown"),
                spring_constant=float(metadata.get("spring_constant", 0.1)),
                inv_ols=float(metadata.get("inv_ols", 22e-9)),
                tip_geometry=tip_geometry,
                tip_radius=tip_radius,
                segments=segments
            )
        except Exception as e:
            print(f"Warning: Skipping {curve_name} due to error: {e}")
            continue

    if not curves:
        raise ValueError("No valid Force and Z datasets found in JSON")

    print(f"Processed {len(curves)} curves: {list(curves.keys())[:5]}{'...' if len(curves) > 5 else ''}")
    return curves