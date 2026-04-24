"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons
"""

from __future__ import annotations

from supabase import Client, create_client

from config.settings import Settings


def get_supabase(settings: Settings) -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
