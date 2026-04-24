-- RPC for pgvector similarity search on document_chunks (used by rag-agent service).
-- Prerequisites: pgvector extension; document_chunks.embedding is vector(1536).
-- Idempotent.

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  p_project_agent_id uuid,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    (1 - (dc.embedding <=> query_embedding))::double precision AS similarity
  FROM public.document_chunks dc
  WHERE dc.project_agent_id = p_project_agent_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 50));
$$;

COMMENT ON FUNCTION public.match_document_chunks IS
  'Cosine distance similarity search on document_chunks for a project_agent instance.';

GRANT EXECUTE ON FUNCTION public.match_document_chunks(vector(1536), uuid, integer) TO service_role;
