/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type HistoryMessage = {
  role: 'visitor' | 'agent' | 'system';
  content: string;
  createdAt: string;
  cards?: Array<Record<string, unknown>>;
  suggestions?: string[];
};

export type PublicRagHistoryResult =
  | { ok: true; messages: HistoryMessage[]; projectName: string; greeting: string | null }
  | { ok: false; message: string; code?: string };

export async function getPublicRagHistory(input: {
  conversationId: string;
  visitorId: string;
  projectId: string;
  projectAgentId: string;
}): Promise<PublicRagHistoryResult> {
  const conversationId = input.conversationId.trim();
  const visitorId = input.visitorId.trim();
  const projectAgentId = input.projectAgentId.trim();

  if (!conversationId || !visitorId || !projectAgentId) {
    return { ok: false, message: 'Missing required fields.', code: 'BAD_REQUEST' };
  }

  const supabase = getSupabaseServiceRoleClient();

  const [{ data: projRow }, { data: paRow }, { data: visitor }] = await Promise.all([
    supabase.from('projects').select('title').eq('id', input.projectId).maybeSingle(),
    supabase
      .from('project_agents')
      .select('greeting, custom_agent_name')
      .eq('id', projectAgentId)
      .maybeSingle(),
    supabase
      .from('visitor_contacts')
      .select('id')
      .eq('project_id', input.projectId)
      .contains('extracted_data', { ae_visitor_id: visitorId })
      .maybeSingle(),
  ]);

  const projectName = String(paRow?.custom_agent_name ?? '').trim() || String(projRow?.title ?? '');
  const greeting = (paRow?.greeting as string) || null;

  if (!visitor?.id) {
    return { ok: true, messages: [], projectName, greeting };
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('project_agent_id', projectAgentId)
    .eq('visitor_contact_id', String(visitor.id))
    .maybeSingle();

  if (!conv) {
    return { ok: true, messages: [], projectName, greeting };
  }

  const { data: rows, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(20);

  if (error) {
    return { ok: false, message: error.message };
  }

  const reversed = (rows ?? []).slice().reverse();

  const messages: HistoryMessage[] = reversed.map((r) => {
    const msg: HistoryMessage = {
      role: String(r.role) as HistoryMessage['role'],
      content: String(r.content ?? ''),
      createdAt: String(r.created_at ?? ''),
    };
    const meta = r.metadata as Record<string, unknown> | null;
    if (meta && String(r.role) === 'agent') {
      if (Array.isArray(meta.cards) && meta.cards.length > 0) {
        msg.cards = meta.cards as Array<Record<string, unknown>>;
      }
      if (Array.isArray(meta.suggestions) && meta.suggestions.length > 0) {
        msg.suggestions = meta.suggestions as string[];
      }
    }
    return msg;
  });

  return {
    ok: true,
    messages,
    projectName,
    greeting,
  };
}
