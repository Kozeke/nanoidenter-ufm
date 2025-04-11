from pathlib import Path
from importlib import import_module

def load_filter_classes(directory, module_prefix):
    """Dynamically load filter classes from a given directory with a specific module prefix."""
    filter_classes = []
    print(f"Scanning directory: {directory.absolute()}")
    if not directory.exists():
        print(f"Directory {directory} does not exist!")
        return filter_classes
    
    py_files = list(directory.glob("*.py"))
    print(f"Found Python files: {py_files}")
    
    for file_path in py_files:
        if file_path.stem == "__init__":
            continue
        module_name = f"{module_prefix}.{file_path.stem}"
        print(f"Attempting to import: {module_name}")
        try:
            module = import_module(module_name)
            print(f"Successfully imported: {module_name}")
            for attr_name in dir(module):
                try:
                    attr = getattr(module, attr_name)
                    if (isinstance(attr, type) and 
                        hasattr(attr, 'NAME') and 
                        hasattr(attr, 'DESCRIPTION') and 
                        hasattr(attr, 'DOI')):
                        print(f"Found class: {attr}")
                        filter_classes.append(attr)
                    else:
                        print(f"Skipping {attr_name}: Missing required attributes")
                except Exception as e:
                    print(f"Error inspecting {attr_name} in {module_name}: {e}")
        except ImportError as e:
            print(f"Failed to import {module_name}: {e}")
        except Exception as e:
            print(f"Unexpected error with {module_name}: {e}")
    
    print(f"Loaded classes: {filter_classes}")
    return filter_classes
