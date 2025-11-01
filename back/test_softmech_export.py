#!/usr/bin/env python3
"""
Test script for SoftMech-style CSV export functionality in nanoindenter-ufm.

This script demonstrates how to use the new export features that replicate
the functionality from the original SoftMech project.
"""

import requests
import json
import os

# Configuration
BASE_URL = "http://localhost:8000"  # Adjust if your server runs on a different port
DB_PATH = "data/experiment.db"

def test_raw_export():
    """Test raw data export (original functionality)."""
    print("📤 Testing raw data export...")
    
    url = f"{BASE_URL}/export/csv"
    data = {
        "export_path": "exports/raw_data.csv",
        "export_type": "raw",
        "curve_ids": ["curve0", "curve1"],  # Export first two curves
        "metadata": {
            "experiment": "Test Experiment",
            "date": "2024-01-01"
        }
    }
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        # print(f"✅ Raw export successful: {result['message']}")
        # print(f"📁 File: {result['export_path']}")
        return True
    except Exception as e:
        print(f"❌ Raw export failed: {e}")
        return False

def test_average_export():
    """Test average curve export (SoftMech-style)."""
    print("\n📤 Testing average curve export...")
    
    url = f"{BASE_URL}/export/csv"
    data = {
        "export_path": "exports/average_force.csv",
        "export_type": "average",
        "dataset_type": "Force",
        "direction": "V",
        "loose": 100,
        "curve_ids": ["curve0", "curve1", "curve2"],  # Export first three curves
        # Use actual filter configuration (similar to frontend)
        "filters": {
            "regular": {},
            "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
            "f_models": {"hertz": {"model": "hertz"}},
            "e_models": {}
        },
        "metadata": {
            "experiment": "Test Experiment",
            "analysis": "Average Force-Indentation"
        }
    }
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        # print(f"✅ Average export successful: {result['message']}")
        # print(f"📁 File: {result['export_path']}")
        # print(f"📊 Export type: {result['export_type']}")
        # print(f"📊 Dataset type: {result['dataset_type']}")
        return True
    except Exception as e:
        print(f"❌ Average export failed: {e}")
        return False

def test_elasticity_export():
    """Test elasticity spectra export (SoftMech-style)."""
    print("\n📤 Testing elasticity spectra export...")
    
    url = f"{BASE_URL}/export/csv"
    data = {
        "export_path": "exports/elasticity_spectra.csv",
        "export_type": "average",
        "dataset_type": "Elasticity",
        "direction": "V",
        "loose": 100,
        "curve_ids": ["curve0", "curve1", "curve2"],
        # Use actual filter configuration
        "filters": {
            "regular": {},
            "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
            "f_models": {},
            "e_models": {"constant": {"model": "constant"}}
        },
        "metadata": {
            "experiment": "Test Experiment",
            "analysis": "Elasticity Spectra"
        }
    }
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        # print(f"✅ Elasticity export successful: {result['message']}")
        # print(f"📁 File: {result['export_path']}")
        return True
    except Exception as e:
        print(f"❌ Elasticity export failed: {e}")
        return False

def test_scatter_export():
    """Test scatter data export (SoftMech-style)."""
    print("\n📤 Testing scatter data export...")
    
    url = f"{BASE_URL}/export/csv"
    data = {
        "export_path": "exports/force_model_params.csv",
        "export_type": "scatter",
        "dataset_type": "Force Model",
        "curve_ids": ["curve0", "curve1", "curve2"],
        # Use actual filter configuration
        "filters": {
            "regular": {},
            "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
            "f_models": {"hertz": {"model": "hertz"}},
            "e_models": {}
        },
        "metadata": {
            "experiment": "Test Experiment",
            "analysis": "Force Model Parameters"
        }
    }
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        result = response.json()
        # print(f"✅ Scatter export successful: {result['message']}")
        # print(f"📁 File: {result['export_path']}")
        return True
    except Exception as e:
        print(f"❌ Scatter export failed: {e}")
        return False

def check_exported_files():
    """Check if exported files exist and show their content."""
    print("\n📋 Checking exported files...")
    
    export_files = [
        "exports/raw_data.csv",
        "exports/average_force.csv",
        "exports/elasticity_spectra.csv",
        "exports/force_model_params.csv"
    ]
    
    for file_path in export_files:
        if os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            print(f"✅ {file_path} ({file_size} bytes)")
            
            # Show first few lines of the file
            try:
                with open(file_path, 'r') as f:
                    lines = f.readlines()[:10]  # First 10 lines
                    print(f"   Preview:")
                    for line in lines:
                        print(f"   {line.rstrip()}")
                    if len(lines) == 10:
                        print(f"   ... (showing first 10 lines)")
            except Exception as e:
                print(f"   Error reading file: {e}")
        else:
            print(f"❌ {file_path} (not found)")

def main():
    """Main test function."""
    print("🧪 Testing SoftMech-style CSV Export Functionality")
    print("=" * 60)
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/docs")
        print("✅ Server is running")
    except Exception as e:
        print(f"❌ Server is not running: {e}")
        print("Please start the server first: uvicorn main:app --reload")
        return
    
    # Run tests
    success_count = 0
    total_tests = 4
    
    if test_raw_export():
        success_count += 1
    
    if test_average_export():
        success_count += 1
    
    if test_elasticity_export():
        success_count += 1
    
    if test_scatter_export():
        success_count += 1
    
    # Check results
    check_exported_files()
    
    print("\n" + "=" * 60)
    print(f"🎯 Test Results: {success_count}/{total_tests} tests passed")
    
    if success_count == total_tests:
        print("🎉 All tests passed! SoftMech-style export is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the error messages above.")

if __name__ == "__main__":
    main()
