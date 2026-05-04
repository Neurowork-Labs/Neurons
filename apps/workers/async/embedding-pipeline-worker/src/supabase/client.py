"""
author: Yagnik Poshiya
github: https://github.com/neuroworklabs/Neurons
"""

from __future__ import annotations

from supabase import create_client
from supabase.client import Client

from config.settings import Settings


def get_supabase_client(settings: Settings) -> Client:
    # Service role is required for:
    # - writing document_chunks
    # - updating document/job rows regardless of RLS (service role bypasses)
    return create_client(settings.supabase_url, settings.supabase_service_role_key)

