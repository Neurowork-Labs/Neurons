"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from extractors.docx import extract_text_from_docx_bytes
from extractors.pdf import extract_text_from_pdf_bytes
from extractors.rtf import extract_text_from_rtf_bytes
from extractors.text import extract_text_from_plain_bytes


def extract_text(*, file_name: str, file_type: str, data: bytes) -> str:
    name = (file_name or "").lower()
    mime = (file_type or "").lower()

    if name.endswith(".pdf") or mime == "application/pdf":
        return extract_text_from_pdf_bytes(data)

    if name.endswith(".docx") or mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        return extract_text_from_docx_bytes(data)

    if name.endswith(".rtf") or mime == "application/rtf":
        return extract_text_from_rtf_bytes(data)

    # txt, md, json, xml, yaml, log, etc.
    return extract_text_from_plain_bytes(data)

