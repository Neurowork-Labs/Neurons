"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from striprtf.striprtf import rtf_to_text


def extract_text_from_rtf_bytes(data: bytes) -> str:
    raw = data.decode("utf-8", errors="replace")
    return (rtf_to_text(raw) or "").strip()

