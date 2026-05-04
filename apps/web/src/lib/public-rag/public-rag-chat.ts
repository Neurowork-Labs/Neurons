/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */

import { callRagAgentChat, callRagAgentChatStream } from '@/lib/rag-agent/call-rag-agent-chat';
import { recordAgentExecution } from '@/lib/public-rag/record-agent-execution';
import { checkExecutionQuota } from '@/lib/public-rag/execution-quota';
import {
  normalizeWidgetRequiredContactFields,
  wasLocationPermissionRequested,
} from '@/lib/connected-agents/widget-contact-fields-config';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type PublicRagChatBody = {
  projectAgentId: string;
  message: string;
  visitorId: string;
  sessionId: string;
  conversationId?: string | null;
  pageUrl?: string | null;
};

export type PublicRagChatResult =
  | {
      ok: true;
      reply: string;
      conversationId: string;
      visitorId: string;
      sessionId: string;
      sources: Array<Record<string, unknown>>;
      route: { mode?: string; reason?: string } | null;
      sql: string | null;
      suggestions: string[];
      cards: Array<Record<string, unknown>>;
      projectName: string;
      greeting: string | null;
    }
  | { ok: false; message: string; code?: string };

type VisitorContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  metadata: Record<string, unknown> | null;
};

async function ensureVisitorContact(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  projectId: string,
  visitorId: string,
): Promise<VisitorContactRow> {
  const { data: existing, error: findErr } = await supabase
    .from('visitor_contacts')
    .select('id, name, email, phone, metadata')
    .eq('project_id', projectId)
    .contains('extracted_data', { ae_visitor_id: visitorId })
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing?.id) {
    return {
      id: String(existing.id),
      name: (existing.name as string | null) ?? null,
      email: (existing.email as string | null) ?? null,
      phone: (existing.phone as string | null) ?? null,
      metadata: (existing.metadata as Record<string, unknown> | null) ?? null,
    };
  }

  const { data: created, error: insErr } = await supabase
    .from('visitor_contacts')
    .insert({
      project_id: projectId,
      extracted_data: { ae_visitor_id: visitorId },
    })
    .select('id, name, email, phone, metadata')
    .single();

  if (insErr) throw new Error(insErr.message);
  return {
    id: String(created!.id),
    name: (created!.name as string | null) ?? null,
    email: (created!.email as string | null) ?? null,
    phone: (created!.phone as string | null) ?? null,
    metadata: (created!.metadata as Record<string, unknown> | null) ?? null,
  };
}

export async function runPublicRagChat(
  ctx: { projectId: string; organizationId: string },
  body: PublicRagChatBody,
  opts?: {
    onReplyDelta?: (delta: string) => void | Promise<void>;
    onPhase?: (name: string) => void | Promise<void>;
  },
): Promise<PublicRagChatResult> {
  const projectAgentId = String(body.projectAgentId ?? '').trim();
  const message = String(body.message ?? '').trim();
  const visitorId = String(body.visitorId ?? '').trim();
  const sessionId = String(body.sessionId ?? '').trim();

  if (!projectAgentId || !message || !visitorId || !sessionId) {
    return { ok: false, message: 'Missing required fields.', code: 'BAD_REQUEST' };
  }

  const supabase = getSupabaseServiceRoleClient();

  // ------------------------------------------------------------------
  // Phase 1 — fan out prep reads that only depend on inputs.
  // project_agents, visitor contact row, widget config, and project title
  // are all independent I/O calls. Running them sequentially added
  // ~400-800ms to TTFT; Promise.all keeps the whole group at ≈ max(reads).
  // ------------------------------------------------------------------
  let visitorContact: VisitorContactRow;
  const [paRes, vcOrErr, widgetCfgRes, projectRes] = await Promise.all([
    supabase
      .from('project_agents')
      .select('id, agent_id, user_instruction, config, greeting, custom_agent_name')
      .eq('id', projectAgentId)
      .eq('project_id', ctx.projectId)
      .eq('is_deleted', false)
      .maybeSingle(),
    ensureVisitorContact(supabase, ctx.projectId, visitorId).catch((e: unknown) =>
      e instanceof Error ? e : new Error('Visitor setup failed.'),
    ),
    supabase
      .from('project_agent_widget_configs')
      .select('required_contact_fields')
      .eq('project_agent_id', projectAgentId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('title')
      .eq('id', ctx.projectId)
      .maybeSingle(),
  ]);

  const { data: pa, error: paErr } = paRes;
  if (paErr) return { ok: false, message: paErr.message };
  if (!pa) {
    return { ok: false, message: 'Invalid project agent.', code: 'BAD_REQUEST' };
  }

  if (vcOrErr instanceof Error) {
    return { ok: false, message: vcOrErr.message };
  }
  visitorContact = vcOrErr;
  const visitorContactId = visitorContact.id;

  const { data: widgetCfg, error: widgetCfgErr } = widgetCfgRes;
  if (widgetCfgErr) return { ok: false, message: widgetCfgErr.message };

  const projectTitle = String(projectRes.data?.title ?? '').trim();

  let systemInstruction: string | null = (pa.user_instruction as string) ?? null;
  let modelConfig: Record<string, unknown> | null = (pa.config as Record<string, unknown>) ?? null;

  if ((!systemInstruction || !modelConfig) && pa.agent_id) {
    const { data: agent } = await supabase
      .from('agents')
      .select('system_instruction, config_schema')
      .eq('id', pa.agent_id)
      .maybeSingle();

    if (agent) {
      if (!systemInstruction) {
        systemInstruction = (agent.system_instruction as string) ?? null;
      }
      if (!modelConfig && agent.config_schema) {
        const schema = agent.config_schema as Record<string, unknown>;
        const defaults: Record<string, unknown> = {};
        if (typeof schema === 'object' && schema !== null) {
          for (const [key, def] of Object.entries(schema)) {
            if (typeof def === 'object' && def !== null && 'default' in (def as Record<string, unknown>)) {
              defaults[key] = (def as Record<string, unknown>).default;
            }
          }
        }
        if (Object.keys(defaults).length > 0) {
          modelConfig = defaults;
        }
      }
    }
  }

  let conversationId = body.conversationId?.trim() || '';

  const requiredContactFields = normalizeWidgetRequiredContactFields(
    widgetCfg?.required_contact_fields ?? null,
  );
  if (requiredContactFields.length > 0) {
    const missing = requiredContactFields.filter((field) => {
      if (field === 'location') return !wasLocationPermissionRequested(visitorContact.metadata);
      const col = field as 'name' | 'email' | 'phone';
      return !String(visitorContact[col] ?? '').trim();
    });
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Please submit required contact details first: ${missing.join(', ')}.`,
        code: 'BAD_REQUEST',
      };
    }
  }

  if (conversationId) {
    const { data: conv, error: cErr } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('project_agent_id', projectAgentId)
      .maybeSingle();

    if (cErr) return { ok: false, message: cErr.message };
    if (!conv) {
      conversationId = '';
    }
  }

  if (!conversationId) {
    const { data: newConv, error: nErr } = await supabase
      .from('conversations')
      .insert({
        project_agent_id: projectAgentId,
        visitor_contact_id: visitorContactId,
        session_id: sessionId,
        source_url: body.pageUrl ?? null,
        metadata: { source: 'rag_widget' },
      })
      .select('id')
      .single();

    if (nErr) return { ok: false, message: nErr.message };
    conversationId = String(newConv!.id);
  }

  // History read and visitor insert are independent: insert doesn't need the
  // returned history and history doesn't include the in-flight message.
  // Running them in parallel saves one round-trip on the critical path.
  const [priorRes, visitorInsertRes] = await Promise.all([
    supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(40),
    supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'visitor',
      content: message,
    }),
  ]);

  if (priorRes.error) return { ok: false, message: priorRes.error.message };
  if (visitorInsertRes.error) return { ok: false, message: visitorInsertRes.error.message };

  const historyRows = (priorRes.data ?? []).map((m) => ({
    role: String(m.role) === 'agent' ? 'agent' : 'visitor',
    content: String(m.content ?? ''),
  }));

  let effectiveInstruction = systemInstruction ?? '';
  const contactPrompt =
    'IMPORTANT — Never ask the visitor for contact details (name, email, phone). ' +
    'Do not request, prompt, or follow up for contact info, even when missing. ' +
    'Answer the user query directly using available database/document context. ' +
    'If contact fields are missing, leave them null.';
  effectiveInstruction = effectiveInstruction
    ? `${contactPrompt}\n\n${effectiveInstruction}`
    : contactPrompt;

  const ragStart = Date.now();
  const rag = opts?.onReplyDelta
    ? await callRagAgentChatStream(
        {
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          projectAgentId,
          userMessage: message,
          history: historyRows,
          systemInstruction: effectiveInstruction || null,
          modelConfig: modelConfig,
        },
        async (event) => {
          if (event.type === 'delta') {
            await opts.onReplyDelta?.(event.data.text);
          } else if (event.type === 'phase') {
            await opts.onPhase?.(event.data.name);
          }
        },
      )
    : await callRagAgentChat({
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        projectAgentId,
        userMessage: message,
        history: historyRows,
        systemInstruction: effectiveInstruction || null,
        modelConfig: modelConfig,
      });
  const ragLatencyMs = Date.now() - ragStart;

  if (!rag.ok) {
    void recordAgentExecution(supabase, {
      projectAgentId,
      organizationId: ctx.organizationId,
      conversationId,
      modelName: null,
      status: 'error',
      errorCode: 'rag_agent_error',
      latencyMs: ragLatencyMs,
      metadata: { error: rag.message },
    });
    return { ok: false, message: rag.message };
  }

  const { error: aErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'agent',
    content: rag.data.reply,
    metadata: {
      route: rag.data.route,
      sql: rag.data.sql,
      sources: rag.data.sources,
      cards: rag.data.cards || [],
      suggestions: rag.data.suggestions || [],
    },
  });
  if (aErr) return { ok: false, message: aErr.message };

  // Developer convenience: trace which model answered this visitor query.
  console.info('[public-rag] model used', {
    projectId: ctx.projectId,
    projectAgentId,
    conversationId,
    modelName: rag.data.model_name ?? null,
  });

  void recordAgentExecution(supabase, {
    projectAgentId,
    organizationId: ctx.organizationId,
    conversationId,
    modelName: rag.data.model_name,
    status: 'success',
    latencyMs: ragLatencyMs,
    tokensInput: rag.data.tokens_input || 0,
    tokensOutput: rag.data.tokens_output || 0,
    metadata: {
      route: rag.data.route,
      sql: rag.data.sql,
    },
  });

  void checkExecutionQuota(supabase, ctx.organizationId);

  void extractAndSaveContactInfo(supabase, visitorContactId, message, historyRows);

  const fallbackProjectName = String((pa as { custom_agent_name?: string | null })?.custom_agent_name ?? '').trim();
  const projectName = fallbackProjectName.length > 0 ? fallbackProjectName : projectTitle;

  return {
    ok: true,
    reply: rag.data.reply,
    conversationId,
    visitorId,
    sessionId,
    sources: rag.data.sources,
    route: rag.data.route,
    sql: rag.data.sql,
    suggestions: rag.data.suggestions || [],
    cards: rag.data.cards || [],
    projectName,
    greeting: (pa.greeting as string) || null,
  };
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}/;

const NAME_PATTERNS = [
  /(?:my name is|i am|i'm|this is|call me|i'm|name\s*[:\-]?\s*)\s*([a-zA-Z][a-zA-Z]+(?:\s[a-zA-Z][a-zA-Z]+){0,2})/i,
  /^([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+){0,2})$/m,
];

const EXTRA_INFO_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'company', re: /(?:company|organization|firm|business)(?:\s+(?:is|name))?\s*[:\-]?\s*(.{2,60})/i },
  { key: 'location', re: /(?:location|city|address|based in|from)\s*[:\-]?\s*(.{2,80})/i },
  { key: 'budget', re: /(?:budget|price range)\s*[:\-]?\s*(.{2,40})/i },
  { key: 'requirement', re: /(?:looking for|interested in|i need|requirement)\s*[:\-]?\s*(.{2,120})/i },
];

async function extractAndSaveContactInfo(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  visitorContactId: string,
  latestMessage: string,
  history: Array<{ role: string; content: string }>,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('visitor_contacts')
      .select('name, email, phone, metadata')
      .eq('id', visitorContactId)
      .maybeSingle();

    const visitorTexts = history
      .filter((m) => m.role === 'visitor')
      .map((m) => m.content);
    visitorTexts.push(latestMessage);
    const combined = visitorTexts.join('\n');

    const updates: Record<string, unknown> = {};

    if (!existing?.email) {
      const emailMatch = combined.match(EMAIL_RE);
      if (emailMatch) updates.email = emailMatch[0].toLowerCase();
    }

    if (!existing?.phone) {
      const phoneMatch = combined.match(PHONE_RE);
      if (phoneMatch) updates.phone = phoneMatch[0].trim();
    }

    if (!existing?.name || !String(existing.name).trim()) {
      for (const re of NAME_PATTERNS) {
        const match = combined.match(re);
        if (match?.[1]) {
          const candidate = match[1].trim();
          if (candidate.length >= 2 && candidate.length <= 60) {
            updates.name = candidate;
            break;
          }
        }
      }
    }

    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};
    const newMeta: Record<string, unknown> = { ...existingMeta };
    let metaChanged = false;
    for (const { key, re } of EXTRA_INFO_PATTERNS) {
      if (newMeta[key]) continue;
      const match = combined.match(re);
      if (match?.[1]) {
        newMeta[key] = match[1].trim();
        metaChanged = true;
      }
    }
    if (metaChanged) {
      updates.metadata = newMeta;
    }

    if (Object.keys(updates).length === 0) return;

    await supabase
      .from('visitor_contacts')
      .update(updates)
      .eq('id', visitorContactId);
  } catch {
    // best-effort
  }
}
