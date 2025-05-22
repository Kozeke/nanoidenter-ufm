import h5py
from typing import Dict, List, Tuple
import numpy as np
from models.force_curve import ForceCurve, Segment

def read_hdf5(file_path: str) -> Dict[str, ForceCurve]:
    """Read HDF5 file interactively to select dataset paths, then process all curves."""
    with h5py.File(file_path, "r") as f:
        return transform_data_for_force_vs_z(f, file_path)

def transform_data_for_force_vs_z(hdf5_file: h5py.File, file_path: str) -> Dict[str, ForceCurve]:
    """Transform HDF5 data into ForceCurve objects for all curves using one selection."""
    curves = {}

    def list_items(group: h5py.Group, path: str = "") -> List[Tuple[str, h5py.Group | h5py.Dataset]]:
        """List groups and datasets in the current group."""
        items = []
        for name, item in group.items():
            new_path = f"{path}/{name}" if path else name
            items.append((new_path, item))
        return items

    def select_item(prompt: str, items: List[Tuple[str, h5py.Group | h5py.Dataset]]) -> Tuple[str, h5py.Group | h5py.Dataset]:
        """Prompt user to select a group or dataset from a list."""
        if not items:
            raise ValueError("No items available to select")
        print(f"\n{prompt}")
        for i, (path, _) in enumerate(items, 1):
            item_type = "Dataset" if isinstance(items[i-1][1], h5py.Dataset) else "Group"
            extra = f" (Shape: {items[i-1][1].shape}, Dtype: {items[i-1][1].dtype})" if item_type == "Dataset" else ""
            print(f"{i}. {path} ({item_type}{extra})")
        while True:
            try:
                choice = input(f"Select number (1-{len(items)}): ").strip()
                index = int(choice) - 1
                if 0 <= index < len(items):
                    return items[index]
                print(f"Invalid choice. Please enter a number between 1 and {len(items)}.")
            except ValueError:
                print("Invalid input. Please enter a number.")

    def navigate_to_dataset(group: h5py.Group, path: str, dataset_type: str) -> Tuple[str, h5py.Dataset]:
        """Navigate group hierarchy until a dataset is selected."""
        while True:
            items = list_items(group, path)
            groups = [(p, i) for p, i in items if isinstance(i, h5py.Group)]
            datasets = [(p, i) for p, i in items if isinstance(i, h5py.Dataset)]
            
            if datasets:
                preferred_datasets = [
                    (p, i) for p, i in datasets
                    if (dataset_type == "Force" and p.lower().endswith(("force", "deflection"))) or
                       (dataset_type == "Z" and p.lower().endswith(("z", "zsensor", "height")))
                ]
                prompt_datasets = preferred_datasets if preferred_datasets else datasets
                path, dataset = select_item(f"Select {dataset_type} dataset:", prompt_datasets)
                return path, dataset
            elif groups:
                path, group = select_item("Select group to explore:", groups)
                continue
            else:
                raise ValueError(f"No datasets found in {path}")

    # List top-level curve groups (e.g., curve0, curve1, ...)
    curve_groups = [(name, item) for name, item in hdf5_file.items() if isinstance(item, h5py.Group)]
    if not curve_groups:
        print(f"Error: No curve groups found in {file_path}")
        raise ValueError("No curve groups found in HDF5")

    # Select one curve for dataset path identification
    print(f"\nHDF5 File Structure: {file_path}")
    path, selected_group = select_item("Select one curve group to define dataset paths:", curve_groups)
    curve_name = path  # e.g., curve0

    # Navigate to Force and Z datasets
    force_path, force_dataset = navigate_to_dataset(selected_group, path, "Force")
    z_path, z_dataset = navigate_to_dataset(selected_group, path, "Z")

    # Extract relative dataset paths (e.g., segment0/Force, segment0/Z)
    force_relative_path = force_path[len(curve_name) + 1:]  # Remove curve0/ prefix
    z_relative_path = z_path[len(curve_name) + 1:]         # Remove curve0/ prefix
    print(f"\nUsing relative paths: Force={force_relative_path}, Z={z_relative_path}")

    # Prompt for metadata (applied to all curves)
    print("\nEnter metadata for all curves (press Enter to use default values):")
    metadata = {}
    metadata["file_id"] = input("File ID [default: file_0]: ").strip() or "file_0"
    metadata["date"] = input("Date [default: 2025-05-20]: ").strip() or "2025-05-20"
    metadata["instrument"] = input("Instrument [default: unknown]: ").strip() or "unknown"
    metadata["sample"] = input("Sample [default: unknown]: ").strip() or "unknown"
    metadata["spring_constant"] = float(input("Spring Constant (N/m) [default: 0.1]: ").strip() or 0.1)
    metadata["inv_ols"] = float(input("Inverse Optical Lever Sensitivity (m/V) [default: 22e-9]: ").strip() or 22e-9)
    metadata["tip_geometry"] = input("Tip Geometry [default: pyramid]: ").strip() or "pyramid"
    metadata["tip_radius"] = float(input("Tip Radius (m) [default: 1e-6]: ").strip() or 1e-6)
    sampling_rate = float(input("Sampling Rate (Hz) [default: 1e5]: ").strip() or 1e5)
    velocity = float(input("Velocity (m/s) [default: 1e-6]: ").strip() or 1e-6)

    # Process all curves using the selected dataset paths
    for curve_name, curve_group in curve_groups:
        try:
            force_dataset = curve_group[force_relative_path]  # Use direct indexing to raise KeyError if missing
            z_dataset = curve_group[z_relative_path]
            
            deflection = force_dataset[()]
            z_sensor = z_dataset[()]
            min_length = min(len(deflection), len(z_sensor))
            if min_length == 0:
                print(f"Warning: Skipping {curve_name} due to empty Force or Z data")
                continue

            segments = [
                Segment(
                    type="approach",  # Default, can be adjusted
                    deflection=np.array(deflection[:min_length]),
                    z_sensor=np.array(z_sensor[:min_length]),
                    sampling_rate=sampling_rate,
                    velocity=velocity,
                    no_points=min_length
                )
            ]

            curves[curve_name] = ForceCurve(
                file_id=metadata["file_id"],
                date=metadata["date"],
                instrument=metadata["instrument"],
                sample=metadata["sample"],
                spring_constant=metadata["spring_constant"],
                inv_ols=metadata["inv_ols"],
                tip_geometry=metadata["tip_geometry"],
                tip_radius=metadata["tip_radius"],
                segments=segments
            )
        except KeyError as e:
            print(f"Warning: Skipping {curve_name} due to missing dataset: {e}")
            continue
        except Exception as e:
            print(f"Warning: Skipping {curve_name} due to error: {e}")
            continue

    if not curves:
        print(f"Error: No valid Force and Z datasets found in {file_path}")
        raise ValueError("No valid Force and Z datasets found in HDF5")

    print(f"\nProcessed {len(curves)} curves: {list(curves.keys())[:5]}{'...' if len(curves) > 5 else ''}")
    return curves



import h5py
from typing import Dict, List, Any
import numpy as np
from models.force_curve import ForceCurve, Segment

def get_hdf5_structure(file_path: str) -> Dict[str, Any]:
    """Return the HDF5 file structure as a nested dictionary for frontend display."""
    structure = {"groups": {}, "datasets": []}
    
    def collect_items(group: h5py.Group, path: str = "", parent_dict: Dict = structure["groups"]):
        # Initialize datasets list for this group if not present
        if "datasets" not in parent_dict:
            parent_dict["datasets"] = []
        
        for name, item in group.items():
            new_path = f"{path}/{name}" if path else name
            try:
                if isinstance(item, h5py.Group):
                    parent_dict[name] = {"groups": {}, "datasets": []}
                    collect_items(item, new_path, parent_dict[name]["groups"])
                elif isinstance(item, h5py.Dataset):
                    parent_dict["datasets"].append({
                        "path": new_path,
                        "name": name,
                        "shape": list(item.shape),  # Convert tuple to list for JSON
                        "dtype": str(item.dtype)
                    })
                # Ignore other item types (e.g., attributes)
            except Exception as e:
                print(f"Warning: Skipping item {new_path} due to error: {e}")
                continue
    
    try:
        with h5py.File(file_path, "r") as f:
            collect_items(f)
    except Exception as e:
        raise ValueError(f"Failed to read HDF5 structure: {e}")
    
    return structure

def process_hdf5(file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    """Process all curves in HDF5 file using user-selected dataset paths and metadata."""
    curves = {}
    
    with h5py.File(file_path, "r") as f:
        # List top-level curve groups
        curve_groups = [(name, item) for name, item in f.items() if isinstance(item, h5py.Group)]
        if not curve_groups:
            raise ValueError("No curve groups found in HDF5")

        # Extract relative paths (e.g., segment0/Force)
        sample_curve_name = curve_groups[0][0]
        if not (force_path.startswith(f"{sample_curve_name}/") and z_path.startswith(f"{sample_curve_name}/")):
            raise ValueError("Selected paths must belong to a curve group")
        
        force_relative_path = force_path[len(sample_curve_name) + 1:]
        z_relative_path = z_path[len(sample_curve_name) + 1:]
        print("force_relative_path", force_relative_path)
        print("z_relative_path", z_relative_path)
        # Process all curves
        for curve_name, curve_group in curve_groups:
            try:
                force_dataset = curve_group[force_relative_path]
                z_dataset = curve_group[z_relative_path]
                
                deflection = force_dataset[()]
                z_sensor = z_dataset[()]
                min_length = min(len(deflection), len(z_sensor))
                if min_length == 0:
                    print(f"Warning: Skipping {curve_name} due to empty Force or Z data")
                    continue

                segments = [
                    Segment(
                        type="approach",
                        deflection=np.array(deflection[:min_length]),
                        z_sensor=np.array(z_sensor[:min_length]),
                        sampling_rate=float(metadata.get("sampling_rate", 1e5)),
                        velocity=float(metadata.get("velocity", 1e-6)),
                        no_points=min_length
                    )
                ]

                curves[curve_name] = ForceCurve(
                    file_id=metadata.get("file_id", "file_0"),
                    date=metadata.get("date", "2025-05-20"),
                    instrument=metadata.get("instrument", "unknown"),
                    sample=metadata.get("sample", "unknown"),
                    spring_constant=float(metadata.get("spring_constant", 0.1)),
                    inv_ols=float(metadata.get("inv_ols", 22e-9)),
                    tip_geometry=metadata.get("tip_geometry", "pyramid"),
                    tip_radius=float(metadata.get("tip_radius", 1e-6)),
                    segments=segments
                )
            except KeyError as e:
                print(f"Warning: Skipping {curve_name} due to missing dataset: {e}")
                continue
            except Exception as e:
                print(f"Warning: Skipping {curve_name} due to error: {e}")
                continue

    if not curves:
        raise ValueError("No valid Force and Z datasets found in HDF5")

    print(f"Processed {len(curves)} curves: {list(curves.keys())[:5]}{'...' if len(curves) > 5 else ''}")
    return curves