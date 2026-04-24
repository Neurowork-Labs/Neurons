"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

import logging
from supabase.client import Client


def download_document_bytes(
    supabase: Client,
    *,
    bucket: str,
    path: str,
) -> bytes:
    log = logging.getLogger("embedding-worker.storage")
    data = supabase.storage.from_(bucket).download(path)
    # supabase-py returns bytes for download
    if not data:
        raise RuntimeError("Empty download response.")
    log.debug("download ok bucket=%s path=%s bytes=%s", bucket, path, len(data))
    return data

