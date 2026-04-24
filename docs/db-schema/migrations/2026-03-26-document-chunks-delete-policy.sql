-- Allow org admins to hard-delete document chunks when needed (e.g., when a document is removed).
-- Idempotent.

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can delete chunks" ON public.document_chunks;

CREATE POLICY "Admins can delete chunks"
  ON public.document_chunks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND has_org_role(d.organization_id, 'admin')
  ));

