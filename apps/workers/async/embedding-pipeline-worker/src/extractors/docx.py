"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from io import BytesIO

import docx  # python-docx


def extract_text_from_docx_bytes(data: bytes) -> str:
    doc = docx.Document(BytesIO(data))
    parts: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)
    return "\n\n".join(parts)

