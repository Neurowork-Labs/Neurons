"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import re

from utils.text_sanitize import sanitize_text_for_db


_WHITESPACE_RE = re.compile(r"\s+")


def _clean_text(text: str) -> str:
    t = sanitize_text_for_db(text or "")
    t = t.strip()
    t = _WHITESPACE_RE.sub(" ", t)
    return t.strip()


def chunk_text(
    text: str,
    *,
    max_chars: int,
    overlap_chars: int,
    max_chunks: int,
) -> list[str]:
    """
    Simple character-window chunking with overlap.

    This is intentionally tokenization-free for an MVP worker.
    """
    t = (text or "").strip()
    if not t:
        return []

    # Prefer splitting on blank lines to preserve structure, then fallback to hard windows.
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", t) if p and p.strip()]
    if not paragraphs:
        paragraphs = [t]

    chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0

    def flush_buf():
        nonlocal buf, buf_len
        if not buf:
            return
        joined = _clean_text("\n\n".join(buf))
        if joined:
            chunks.append(joined)
        buf = []
        buf_len = 0

    for p in paragraphs:
        if len(p) > max_chars:
            flush_buf()
            start = 0
            while start < len(p) and len(chunks) < max_chunks:
                end = min(len(p), start + max_chars)
                window = _clean_text(p[start:end])
                if window:
                    chunks.append(window)
                if end >= len(p):
                    break
                start = max(0, end - overlap_chars)
            continue

        if buf_len + len(p) + 2 <= max_chars:
            buf.append(p)
            buf_len += len(p) + 2
            continue

        flush_buf()
        buf.append(p)
        buf_len = len(p)

        if len(chunks) >= max_chunks:
            break

    flush_buf()

    return chunks[:max_chunks]

