-- =============================================================================
-- Migration: document processing queue + agents.requires_document_embedding
-- Run in Supabase SQL Editor after extensions + functions (set_updated_at, RLS helpers) exist.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS where applicable).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Agent catalog: which agent definitions require document embedding pipeline
-- -----------------------------------------------------------------------------
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS requires_document_embedding boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agents.requires_document_embedding IS
  'When TRUE, uploads for this agent should be queued for chunking + embedding (RAG knowledge base).';

CREATE INDEX IF NOT EXISTS idx_agents_requires_document_embedding
  ON public.agents (id)
  WHERE is_deleted = FALSE AND requires_document_embedding = TRUE;

-- -----------------------------------------------------------------------------
-- 2. Job queue (polled by Python worker; service role bypasses RLS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_processing_jobs (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid        NOT NULL REFERENCES public.organizations(id),
  project_id          uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id         uuid        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'queued',
  job_type            text        NOT NULL DEFAULT 'embed_document',
  priority            integer     NOT NULL DEFAULT 0,
  payload             jsonb,
  attempt_count       integer     NOT NULL DEFAULT 0,
  max_attempts        integer     NOT NULL DEFAULT 5,
  run_after           timestamptz NOT NULL DEFAULT now(),
  locked_at           timestamptz,
  locked_by           text,
  lease_expires_at    timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_document_processing_job_status CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT chk_document_processing_job_type CHECK (
    job_type IN ('embed_document', 'reindex_document')
  ),
  CONSTRAINT chk_document_processing_attempts CHECK (attempt_count >= 0 AND max_attempts > 0)
);

COMMENT ON TABLE public.document_processing_jobs IS
  'Queue for document chunking + embedding (worker polls; service role bypasses RLS).';

CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_org_created
  ON public.document_processing_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_document
  ON public.document_processing_jobs (document_id);
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_poll
  ON public.document_processing_jobs (status, run_after)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_document_processing_jobs_lease
  ON public.document_processing_jobs (lease_expires_at)
  WHERE status = 'processing';

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.document_processing_jobs;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.document_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. RLS (authenticated clients). Worker uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read document processing jobs" ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can enqueue document processing jobs" ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can update document processing jobs" ON public.document_processing_jobs;
DROP POLICY IF EXISTS "Admins can delete document processing jobs" ON public.document_processing_jobs;

CREATE POLICY "Org members can read document processing jobs"
  ON public.document_processing_jobs FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can enqueue document processing jobs"
  ON public.document_processing_jobs FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.project_agents pa ON pa.id = d.project_agent_id
      WHERE d.id = document_id
        AND d.organization_id = organization_id
        AND pa.project_id = project_id
        AND d.is_deleted = FALSE
    )
  );

CREATE POLICY "Admins can update document processing jobs"
  ON public.document_processing_jobs FOR UPDATE
  USING (has_org_role(organization_id, 'admin'))
  WITH CHECK (has_org_role(organization_id, 'admin'));

CREATE POLICY "Admins can delete document processing jobs"
  ON public.document_processing_jobs FOR DELETE
  USING (has_org_role(organization_id, 'admin'));
