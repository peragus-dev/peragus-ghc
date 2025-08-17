#!/usr/bin/env python3
"""
Verify PySD installation and functionality
"""
import sys

def verify_pysd_installation():
    """Test PySD and dependencies are properly installed"""
    
    print("=" * 50)
    print("PySD Installation Verification")
    print("=" * 50)
    
    # Test imports
    try:
        import pysd
        print(f"✅ PySD version: {pysd.__version__}")
    except ImportError as e:
        print(f"❌ PySD import failed: {e}")
        return False
    
    try:
        import pandas as pd
        print(f"✅ Pandas version: {pd.__version__}")
    except ImportError as e:
        print(f"❌ Pandas import failed: {e}")
        return False
    
    try:
        import numpy as np
        print(f"✅ NumPy version: {np.__version__}")
    except ImportError as e:
        print(f"❌ NumPy import failed: {e}")
        return False
    
    try:
        import xarray as xr
        print(f"✅ Xarray version: {xr.__version__}")
    except ImportError as e:
        print(f"❌ Xarray import failed: {e}")
        return False
    
    print("\n" + "=" * 50)
    print("Python Environment Information")
    print("=" * 50)
    print(f"Python version: {sys.version}")
    print(f"Python executable: {sys.executable}")
    
    return True

if __name__ == "__main__":
    success = verify_pysd_installation()
    sys.exit(0 if success else 1)