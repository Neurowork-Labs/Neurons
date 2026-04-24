-- Allow authenticated users to create in-app notifications for themselves (org-scoped context).
-- Used by the Next.js API when enqueueing document jobs and similar flows.
-- Idempotent.

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (organization_id IS NULL OR is_org_member(organization_id))
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
          AND p.is_deleted = FALSE
          AND is_org_member(p.organization_id)
      )
    )
    AND (
      agent_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = agent_id AND a.is_deleted = FALSE
      )
    )
  );
