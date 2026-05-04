"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons

Bootstrap script for the embedding pipeline worker.

Usage (run from this directory or repo root):
  python apps/workers/async/embedding-pipeline-worker/environment/setup.py

What it does:
  - Creates a virtual environment at apps/workers/async/embedding-pipeline-worker/.venv
  - Installs Python dependencies from environment/requirements.txt
"""

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path


def _venv_python_path(venv_dir: Path) -> Path:
    if platform.system().lower().startswith("win"):
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def main() -> int:
    worker_root = Path(__file__).resolve().parents[1]
    venv_dir = worker_root / ".venv"
    requirements_path = worker_root / "environment" / "requirements.txt"

    if not requirements_path.exists():
        raise FileNotFoundError(f"Missing requirements file: {requirements_path}")

    venv_py = _venv_python_path(venv_dir)

    # Create venv if missing.
    if not venv_dir.exists():
        print(f"Creating venv at: {venv_dir}")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv_dir)])
    else:
        print(f"Venv already exists at: {venv_dir}")

    if not venv_py.exists():
        raise RuntimeError(f"Venv python not found at: {venv_py}")

    # Upgrade pip tooling inside venv.
    print("Upgrading pip/setuptools/wheel…")
    subprocess.check_call([str(venv_py), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])

    # Install deps.
    print(f"Installing dependencies from: {requirements_path}")
    subprocess.check_call([str(venv_py), "-m", "pip", "install", "-r", str(requirements_path)])

    print("")
    print("Setup complete.")
    print("")
    if platform.system().lower().startswith("win"):
        activate_hint = venv_dir / "Scripts" / "activate"
    else:
        activate_hint = venv_dir / "bin" / "activate"
    print("To activate:")
    print(f'  source "{activate_hint}"')
    print("")
    print("To run the worker:")
    print(f'  "{venv_py}" "{worker_root / "src" / "main.py"}"')

    return 0


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parents[1])
    raise SystemExit(main())