-- phpMyAdmin JSON layout seed + fix RLS on document_database_table_data INSERT
-- Date: 2026-03-30
-- Idempotent migration for Supabase SQL Editor.

-- ============================================================
-- 1) Seed: json + phpmyadmin (PHPMyAdmin array export)
-- ============================================================

INSERT INTO public.database_export_layouts (format, platform, is_active)
VALUES ('json', 'phpmyadmin', TRUE)
ON CONFLICT (format, platform) DO NOTHING;

-- ============================================================
-- 2) RLS: allow data-file document_id on document_database_table_data
--    (schema row references schema .sql document; table rows reference data .json document)
-- ============================================================

DROP POLICY IF EXISTS "Admins can insert database table data"
  ON public.document_database_table_data;

CREATE POLICY "Admins can insert database table data"
  ON public.document_database_table_data FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.document_database_schemas s
      WHERE s.id = schema_id
        AND s.organization_id = organization_id
        AND s.project_agent_id = project_agent_id
        AND s.is_deleted = FALSE
    )
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.id = document_id
        AND d.organization_id = organization_id
        AND d.project_agent_id = project_agent_id
        AND d.is_db_data_file = TRUE
        AND d.is_deleted = FALSE
    )
  );
