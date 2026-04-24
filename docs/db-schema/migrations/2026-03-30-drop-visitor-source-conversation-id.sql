-- =============================================================================
-- Migration: Drop visitor_contacts.source_conversation_id
-- =============================================================================
-- This column was never used by application code. Visitor identity is tracked
-- via extracted_data.ae_visitor_id instead.
-- =============================================================================

ALTER TABLE public.visitor_contacts
  DROP CONSTRAINT IF EXISTS fk_visitor_source_conversation;

ALTER TABLE public.visitor_contacts
  DROP COLUMN IF EXISTS source_conversation_id;
