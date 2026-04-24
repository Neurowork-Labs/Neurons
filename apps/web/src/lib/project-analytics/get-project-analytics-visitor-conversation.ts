import type { ProjectAnalyticsVisitorConversationApiResult } from '@/lib/project-analytics/project-analytics-types';
import { listProjectConnectedAgentsCatalogForCurrentUser } from '@/lib/projects/list-project-connected-agents-catalog';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type ConversationRow = {
  id: string;
};

type MessageRow = {
  id: string;
  role: string;
  content: string | null;
  metadata: unknown | null;
  created_at: string | null;
};

function parseSuggestions(metadata: unknown): string[] {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>).suggestions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
}

export async function getProjectAnalyticsVisitorConversationForCurrentUser(input: {
  projectId: string;
  projectAgentId: string;
  visitorContactId: string;
}): Promise<ProjectAnalyticsVisitorConversationApiResult> {
  const projectId = String(input.projectId ?? '').trim();
  const projectAgentId = String(input.projectAgentId ?? '').trim();
  const visitorContactId = String(input.visitorContactId ?? '').trim();

  if (!projectId || !projectAgentId || !visitorContactId) {
    return { ok: false, message: 'Missing required query params.', code: 'BAD_REQUEST' };
  }

  const catalog = await listProjectConnectedAgentsCatalogForCurrentUser(projectId);
  if (!catalog.ok) return catalog;

  const selectedAgent = catalog.agents.find((agent) => agent.projectAgentId === projectAgentId);
  if (!selectedAgent) {
    return { ok: false, message: 'Connected agent not found in this project.', code: 'NOT_FOUND' };
  }

  const supabase = await getSupabaseServerClient();

  const { data: conversationRows, error: conversationError } = await supabase
    .from('conversations')
    .select('id')
    .eq('project_agent_id', projectAgentId)
    .eq('visitor_contact_id', visitorContactId)
    .order('created_at', { ascending: false });

  if (conversationError) {
    return { ok: false, message: conversationError.message };
  }
  if (!conversationRows || conversationRows.length === 0) {
    return { ok: false, message: 'No conversation found for this visitor.', code: 'NOT_FOUND' };
  }

  const latestConversationId = (conversationRows[0] as ConversationRow).id;
  const conversationIds = conversationRows
    .map((row) => (row as ConversationRow).id)
    .filter((id): id is string => Boolean(id));

  const { data: messageRows, error: messagesError } = await supabase
    .from('messages')
    .select('id, role, content, metadata, created_at')
    .in('conversation_id', conversationIds)
    .in('role', ['visitor', 'agent'])
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (messagesError) {
    return { ok: false, message: messagesError.message };
  }

  return {
    ok: true,
    conversationId: latestConversationId,
    messages: (messageRows ?? []).map((row) => {
      const message = row as MessageRow;
      const role = message.role === 'agent' ? 'agent' : 'visitor';
      return {
        id: message.id,
        role,
        content: String(message.content ?? ''),
        createdAt: message.created_at,
        suggestions: role === 'agent' ? parseSuggestions(message.metadata) : [],
      };
    }),
  };
}
