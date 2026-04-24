-- Widget launcher icon configuration per connected project agent.
-- Stores metadata + references to a public Supabase Storage bucket for custom SVG icons.
-- Prerequisites: public.set_updated_at(), public.is_org_member(uuid),
--                public.has_org_role(uuid,text)

-- ============================================================
-- 0) VALIDATOR FUNCTION (Postgres CHECK cannot use subqueries)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_valid_contact_fields(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(val) = 'array'
    AND bool_and(elem IN ('name', 'email', 'phone', 'location'))
  FROM jsonb_array_elements_text(val) AS t(elem)
  UNION ALL
  SELECT jsonb_typeof(val) = 'array' AND jsonb_array_length(val) = 0
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(val))
  LIMIT 1;
$$;

-- ============================================================
-- 1) CONFIG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_agent_widget_configs (
  project_agent_id uuid PRIMARY KEY
    REFERENCES public.project_agents(id) ON DELETE CASCADE,
  icon_mode text NOT NULL DEFAULT 'lucide'
    CHECK (icon_mode IN ('lucide', 'custom_url')),
  lucide_icon text NOT NULL DEFAULT 'user-round'
    CHECK (lucide_icon IN (
      'user-round',
      'message-circle',
      'bot',
      'sparkles',
      'circle-help',
      'message-square',
      'send',
      'headset',
      'life-buoy',
      'badge-help',
      'info',
      'mail',
      'phone',
      'megaphone',
      'bell',
      'rocket',
      'shield-check',
      'user',
      'at-sign',
      'book-open'
    )),
  custom_icon_url text,
  required_contact_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT project_agent_widget_configs_custom_url_required
    CHECK (
      (icon_mode = 'custom_url' AND custom_icon_url IS NOT NULL AND btrim(custom_icon_url) <> '')
      OR icon_mode = 'lucide'
    ),
  CONSTRAINT project_agent_widget_configs_required_contact_fields_valid
    CHECK (public.is_valid_contact_fields(required_contact_fields))
);

CREATE INDEX IF NOT EXISTS idx_project_agent_widget_configs_icon_mode
  ON public.project_agent_widget_configs (icon_mode);

-- ============================================================
-- 2) TRIGGER (updated_at)
-- ============================================================

DROP TRIGGER IF EXISTS trg_set_updated_at_project_agent_widget_configs
  ON public.project_agent_widget_configs;

CREATE TRIGGER trg_set_updated_at_project_agent_widget_configs
  BEFORE UPDATE ON public.project_agent_widget_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3) RLS — project_agent_widget_configs
-- ============================================================

ALTER TABLE public.project_agent_widget_configs ENABLE ROW LEVEL SECURITY;

-- SELECT: org members
DROP POLICY IF EXISTS "Org members can read project agent widget configs"
  ON public.project_agent_widget_configs;
CREATE POLICY "Org members can read project agent widget configs"
  ON public.project_agent_widget_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
        AND is_org_member(p.organization_id)
    )
  );

-- INSERT: admins only
DROP POLICY IF EXISTS "Admins can insert project agent widget configs"
  ON public.project_agent_widget_configs;
CREATE POLICY "Admins can insert project agent widget configs"
  ON public.project_agent_widget_configs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
        AND has_org_role(p.organization_id, 'admin')
    )
  );

-- UPDATE: admins only
DROP POLICY IF EXISTS "Admins can update project agent widget configs"
  ON public.project_agent_widget_configs;
CREATE POLICY "Admins can update project agent widget configs"
  ON public.project_agent_widget_configs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
        AND has_org_role(p.organization_id, 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_agents pa
      JOIN public.projects p ON p.id = pa.project_id
      WHERE pa.id = project_agent_id
        AND pa.is_deleted = FALSE
        AND p.is_deleted = FALSE
        AND has_org_role(p.organization_id, 'admin')
    )
  );

-- No DELETE policy: rows are upserted, never removed by admins.
-- Cascade from project_agents handles cleanup.

-- ============================================================
-- 4) PUBLIC STORAGE BUCKET: widget-assets
-- ============================================================
-- Object path convention:
--   {organization_id}/{project_id}/{project_agent_id}/launcher-icon.svg
--
-- The bucket is PUBLIC so visitor browsers can fetch the icon via
-- the Supabase public URL without authentication.
-- RLS on storage.objects still gates who can write/replace.

INSERT INTO storage.buckets (id, name, public)
VALUES ('widget-assets', 'widget-assets', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5) RLS — storage.objects for widget-assets bucket
-- ============================================================
-- Read: anyone (public bucket — browsers load icon directly).

DROP POLICY IF EXISTS "Public can read widget assets"
  ON storage.objects;
CREATE POLICY "Public can read widget assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'widget-assets');

-- Upload (INSERT): org admins, scoped by org_id in path.
DROP POLICY IF EXISTS "Admins can upload widget assets"
  ON storage.objects;
CREATE POLICY "Admins can upload widget assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );

-- Replace (UPDATE): org admins — simple overwrite, no versioning.
DROP POLICY IF EXISTS "Admins can update widget assets"
  ON storage.objects;
CREATE POLICY "Admins can update widget assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  )
  WITH CHECK (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );

-- Delete: org admins — clean up when icon is changed back to lucide.
DROP POLICY IF EXISTS "Admins can delete widget assets"
  ON storage.objects;
CREATE POLICY "Admins can delete widget assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'widget-assets'
    AND has_org_role(split_part(name, '/', 1)::uuid, 'admin')
  );
