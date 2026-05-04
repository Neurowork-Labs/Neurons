"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations


def extract_text_from_plain_bytes(data: bytes, *, encoding: str = "utf-8") -> str:
    # Best-effort decode; replace errors so worker doesn't crash.
    return data.decode(encoding, errors="replace")

