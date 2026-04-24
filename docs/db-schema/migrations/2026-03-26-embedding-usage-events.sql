-- =============================================================================
-- Migration: embedding usage events (append-only usage audit)
-- Run in Supabase SQL Editor after core tables exist (organizations, projects, documents, document_processing_jobs).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.embedding_usage_events (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid          NOT NULL REFERENCES public.organizations(id),
  project_id       uuid          NOT NULL REFERENCES public.projects(id),
  document_id      uuid          NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  job_id           uuid                   REFERENCES public.document_processing_jobs(id) ON DELETE SET NULL,
  worker_model_id  uuid          NOT NULL REFERENCES public.worker_models(id),
  tokens_input     bigint        NOT NULL DEFAULT 0,
  cost_usd         numeric(12,6) NOT NULL DEFAULT 0,
  metadata         jsonb,
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chk_embedding_usage_tokens CHECK (tokens_input >= 0),
  CONSTRAINT chk_embedding_usage_cost CHECK (cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_org_created
  ON public.embedding_usage_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_project_created
  ON public.embedding_usage_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_document
  ON public.embedding_usage_events (document_id);
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_job
  ON public.embedding_usage_events (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embedding_usage_events_worker_model
  ON public.embedding_usage_events (worker_model_id);

ALTER TABLE public.embedding_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read embedding usage events" ON public.embedding_usage_events;
CREATE POLICY "Members can read embedding usage events"
  ON public.embedding_usage_events FOR SELECT
  USING (is_org_member(organization_id));

