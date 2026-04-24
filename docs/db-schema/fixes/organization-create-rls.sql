-- =============================================================================
-- Fix: organization creation blocked by RLS
-- =============================================================================
-- Symptom: "new row violates row-level security policy for table organizations"
-- PostgREST error 42501 / HTTP 403 on POST /rest/v1/organizations
--
-- Run this ENTIRE block in Supabase SQL Editor.
-- =============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: DIAGNOSE — see what's actually on the database right now       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Run this SELECT first to see existing policies:
-- (Check the "Result" tab in Supabase SQL Editor after running)
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'organization_members')
ORDER BY tablename, policyname;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: ENSURE RLS IS ENABLED                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: ENSURE helper functions exist                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND is_deleted = FALSE
  );
$$;

CREATE OR REPLACE FUNCTION has_org_role(org_id uuid, required_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND is_deleted = FALSE
      AND role IN (
        CASE required_role
          WHEN 'viewer' THEN 'owner'
          WHEN 'member' THEN 'owner'
          WHEN 'admin'  THEN 'owner'
          WHEN 'owner'  THEN 'owner'
        END,
        CASE required_role
          WHEN 'viewer' THEN 'admin'
          WHEN 'member' THEN 'admin'
          WHEN 'admin'  THEN 'admin'
          ELSE NULL
        END,
        CASE required_role
          WHEN 'viewer' THEN 'member'
          WHEN 'member' THEN 'member'
          ELSE NULL
        END,
        CASE required_role
          WHEN 'viewer' THEN 'viewer'
          ELSE NULL
        END
      )
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: ENSURE trigger function + trigger exist                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_organization();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: FIX POLICIES — drop old + create correct ones                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 5a) Organizations: SELECT
DROP POLICY IF EXISTS "Members can read their org" ON public.organizations;
CREATE POLICY "Members can read their org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(id));

-- 5b) Organizations: INSERT (the critical missing/broken one)
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- 5c) Organizations: UPDATE
DROP POLICY IF EXISTS "Admins can update org" ON public.organizations;
CREATE POLICY "Admins can update org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (has_org_role(id, 'admin'));

-- 5d) Organizations: DELETE
DROP POLICY IF EXISTS "Owner can delete org" ON public.organizations;
CREATE POLICY "Owner can delete org"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (has_org_role(id, 'owner'));

-- 5e) Organization members: SELECT
DROP POLICY IF EXISTS "Members can see co-members" ON public.organization_members;
CREATE POLICY "Members can see co-members"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- 5f) Organization members: INSERT (admin)
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_members;
CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (has_org_role(organization_id, 'admin'));

-- 5g) Organization members: INSERT (bootstrap for owner on new org)
DROP POLICY IF EXISTS "Owner can insert self membership on new org" ON public.organization_members;
CREATE POLICY "Owner can insert self membership on new org"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = organization_id
        AND o.owner_id = auth.uid()
        AND o.is_deleted = FALSE
    )
  );

-- 5h) Organization members: UPDATE
DROP POLICY IF EXISTS "Admins can update members" ON public.organization_members;
CREATE POLICY "Admins can update members"
  ON public.organization_members FOR UPDATE
  TO authenticated
  USING (has_org_role(organization_id, 'admin'));

-- 5i) Organization members: DELETE
DROP POLICY IF EXISTS "Admins can remove members" ON public.organization_members;
CREATE POLICY "Admins can remove members"
  ON public.organization_members FOR DELETE
  TO authenticated
  USING (has_org_role(organization_id, 'admin'));


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: VERIFY — run the diagnostic again to confirm                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'organization_members')
ORDER BY tablename, policyname;
