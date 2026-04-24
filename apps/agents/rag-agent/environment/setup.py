#!/usr/bin/env python3
"""
Bootstrap local development environment for rag-agent.

Usage:
    python environment/setup.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import venv
from pathlib import Path


def _run_command(command: list[str], *, description: str) -> None:
    """Run a shell command and fail fast with context."""
    print(f"[setup] {description}...")
    subprocess.run(command, check=True)


def _python_in_venv(venv_path: Path) -> Path:
    """Resolve python executable inside virtual environment."""
    if os.name == "nt":
        return venv_path / "Scripts" / "python.exe"
    return venv_path / "bin" / "python"


def main() -> int:
    setup_file = Path(__file__).resolve()
    environment_dir = setup_file.parent
    project_root = environment_dir.parent
    venv_path = project_root / ".venv"
    requirements_file = environment_dir / "requirements.txt"

    if not requirements_file.exists():
        print(f"[setup] requirements file not found: {requirements_file}")
        return 1

    if not venv_path.exists():
        print(f"[setup] Creating virtual environment at: {venv_path}")
        venv.EnvBuilder(with_pip=True).create(venv_path)
    else:
        print(f"[setup] Virtual environment already exists at: {venv_path}")

    venv_python = _python_in_venv(venv_path)
    if not venv_python.exists():
        print(f"[setup] Python executable not found in virtual environment: {venv_python}")
        return 1

    _run_command(
        [str(venv_python), "-m", "pip", "install", "--upgrade", "pip"],
        description="Upgrading pip in virtual environment",
    )
    _run_command(
        [str(venv_python), "-m", "pip", "install", "-r", str(requirements_file)],
        description="Installing dependencies from requirements.txt",
    )

    print("\n[setup] Environment ready.")
    if os.name == "nt":
        print(f"[setup] Activate with: {venv_path}\\Scripts\\activate")
    else:
        print(f"[setup] Activate with: source {venv_path}/bin/activate")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"[setup] Command failed with exit code {exc.returncode}")
        raise SystemExit(exc.returncode) from exc
