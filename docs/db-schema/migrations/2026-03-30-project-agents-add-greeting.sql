-- Add greeting column to project_agents
-- Custom greeting message shown when the RAG widget opens. NULL = use default.

ALTER TABLE public.project_agents
  ADD COLUMN IF NOT EXISTS greeting text;
