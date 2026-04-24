-- Add editable custom agent display name per project-agent connection.
-- Backfill existing rows from the linked project's title.

ALTER TABLE public.project_agents
  ADD COLUMN IF NOT EXISTS custom_agent_name text;

UPDATE public.project_agents pa
SET custom_agent_name = p.title
FROM public.projects p
WHERE p.id = pa.project_id
  AND (
    pa.custom_agent_name IS NULL
    OR btrim(pa.custom_agent_name) = ''
  );
