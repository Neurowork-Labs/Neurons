-- =============================================================================
-- Migration: visitor_contacts — drop company_name, add metadata
-- =============================================================================

ALTER TABLE public.visitor_contacts
  DROP COLUMN IF EXISTS company_name;

ALTER TABLE public.visitor_contacts
  ADD COLUMN IF NOT EXISTS metadata jsonb;
