"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import logging
import os
import sys


def setup_logging() -> None:
    """
    Basic stdout logging suitable for Render workers.

    Control verbosity with LOG_LEVEL (DEBUG/INFO/WARNING/ERROR).
    """
    level_name = (os.getenv("LOG_LEVEL") or "INFO").upper().strip()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Avoid duplicate handlers if this is called twice.
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(fmt)
    root.addHandler(handler)

