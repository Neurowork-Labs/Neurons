"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.app import create_app

app = create_app()


def _get_server_port() -> int:
    raw_port = os.getenv("PORT", "8080").strip()
    try:
        return int(raw_port)
    except ValueError:
        return 8080


if __name__ == "__main__":
    import uvicorn

    load_dotenv(dotenv_path=ROOT.parent / ".env", override=False)
    uvicorn.run("main:app", host="0.0.0.0", port=_get_server_port())
