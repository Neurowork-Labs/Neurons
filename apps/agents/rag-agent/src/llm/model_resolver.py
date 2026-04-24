"""
author: Yagnik Poshiya
github: https://github.com/yagnikposhiya/Neurons

Resolves the LLM provider + model identifier for a project agent
by reading public.project_agents.model_id → public.models row.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from supabase import Client

logger = logging.getLogger(__name__)


@dataclass
class ResolvedModel:
    provider_name: str
    model_identifier: str
    display_name: str


def resolve_model_for_project_agent(
    supabase: Client,
    project_agent_id: str,
) -> ResolvedModel | None:
    pa_q = (
        supabase.table("project_agents")
        .select("model_id")
        .eq("id", project_agent_id)
        .eq("is_deleted", False)
        .limit(1)
        .execute()
    )
    rows = list(pa_q.data or [])
    if not rows:
        logger.warning("resolve_model: project_agent not found id=%s", project_agent_id)
        return None

    model_id = (rows[0].get("model_id") or "")
    if not str(model_id).strip():
        logger.info("resolve_model: project_agent has no model_id id=%s", project_agent_id)
        return None

    model_q = (
        supabase.table("models")
        .select("provider_name, model_identifier, display_name")
        .eq("id", str(model_id).strip())
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    model_rows = list(model_q.data or [])
    if not model_rows:
        logger.warning("resolve_model: model row not found for model_id=%s", model_id)
        return None

    row = model_rows[0]
    provider = str(row.get("provider_name") or "").strip()
    identifier = str(row.get("model_identifier") or "").strip()
    display = str(row.get("display_name") or "").strip()

    if not provider or not identifier:
        logger.warning(
            "resolve_model: incomplete model row model_id=%s provider=%r identifier=%r",
            model_id, provider, identifier,
        )
        return None

    return ResolvedModel(
        provider_name=provider,
        model_identifier=identifier,
        display_name=display,
    )
