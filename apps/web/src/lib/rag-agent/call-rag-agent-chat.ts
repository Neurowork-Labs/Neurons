/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

export type RagAgentHistoryMessage = { role: string; content: string };

export type RagAgentChatResponse = {
  reply: string;
  sources: Array<Record<string, unknown>>;
  route: { mode?: string; reason?: string } | null;
  sql: string | null;
  suggestions: string[];
  cards: Array<Record<string, unknown>>;
  model_name: string | null;
  tokens_input: number;
  tokens_output: number;
};

export type RagAgentStreamEvent =
  | { type: 'start'; data: Record<string, unknown> }
  | { type: 'delta'; data: { text: string } }
  | { type: 'phase'; data: { name: string } }
  | { type: 'done'; data: RagAgentChatResponse }
  | { type: 'error'; data: { message: string } }
  | { type: 'cancelled'; data: { message: string } };

export async function callRagAgentChat(input: {
  organizationId: string;
  projectId: string;
  projectAgentId: string;
  userMessage: string;
  history: RagAgentHistoryMessage[];
  systemInstruction?: string | null;
  modelConfig?: Record<string, unknown> | null;
}): Promise<{ ok: true; data: RagAgentChatResponse } | { ok: false; message: string }> {
  const base = process.env.RAG_AGENT_BASE_URL?.trim();
  const secret = process.env.RAG_AGENT_INTERNAL_SECRET?.trim();
  if (!base || !secret) {
    return { ok: false, message: 'RAG agent is not configured (RAG_AGENT_BASE_URL / RAG_AGENT_INTERNAL_SECRET).' };
  }

  const url = `${base.replace(/\/$/, '')}/v1/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-RAG-Agent-Secret': secret,
    },
    body: JSON.stringify({
      organization_id: input.organizationId,
      project_id: input.projectId,
      project_agent_id: input.projectAgentId,
      user_message: input.userMessage,
      history: input.history.map((m) => ({ role: m.role, content: m.content })),
      ...(input.systemInstruction ? { system_instruction: input.systemInstruction } : {}),
      ...(input.modelConfig ? { model_config: input.modelConfig } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, message: text || `RAG agent error (${res.status})` };
  }

  try {
    const data = JSON.parse(text) as RagAgentChatResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, message: 'Invalid JSON from RAG agent.' };
  }
}

function parseSseEventBlock(block: string): RagAgentStreamEvent | null {
  const lines = block
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return null;

  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;

  let payload: unknown = {};
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    payload = {};
  }

  if (eventName === 'start') {
    return { type: 'start', data: (payload as Record<string, unknown>) ?? {} };
  }
  if (eventName === 'delta') {
    return { type: 'delta', data: { text: String((payload as { text?: unknown })?.text ?? '') } };
  }
  if (eventName === 'phase') {
    return { type: 'phase', data: { name: String((payload as { name?: unknown })?.name ?? '') } };
  }
  if (eventName === 'done') {
    return { type: 'done', data: payload as RagAgentChatResponse };
  }
  if (eventName === 'error') {
    return { type: 'error', data: { message: String((payload as { message?: unknown })?.message ?? '') } };
  }
  if (eventName === 'cancelled') {
    return { type: 'cancelled', data: { message: String((payload as { message?: unknown })?.message ?? '') } };
  }
  return null;
}

export async function callRagAgentChatStream(
  input: {
    organizationId: string;
    projectId: string;
    projectAgentId: string;
    userMessage: string;
    history: RagAgentHistoryMessage[];
    systemInstruction?: string | null;
    modelConfig?: Record<string, unknown> | null;
  },
  onEvent: (event: RagAgentStreamEvent) => void | Promise<void>,
): Promise<{ ok: true; data: RagAgentChatResponse } | { ok: false; message: string }> {
  const base = process.env.RAG_AGENT_BASE_URL?.trim();
  const secret = process.env.RAG_AGENT_INTERNAL_SECRET?.trim();
  if (!base || !secret) {
    return { ok: false, message: 'RAG agent is not configured (RAG_AGENT_BASE_URL / RAG_AGENT_INTERNAL_SECRET).' };
  }

  const url = `${base.replace(/\/$/, '')}/v1/chat/stream`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Accept: 'text/event-stream',
      'X-RAG-Agent-Secret': secret,
    },
    body: JSON.stringify({
      organization_id: input.organizationId,
      project_id: input.projectId,
      project_agent_id: input.projectAgentId,
      user_message: input.userMessage,
      history: input.history.map((m) => ({ role: m.role, content: m.content })),
      ...(input.systemInstruction ? { system_instruction: input.systemInstruction } : {}),
      ...(input.modelConfig ? { model_config: input.modelConfig } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, message: text || `RAG agent stream error (${res.status})` };
  }
  if (!res.body) {
    return { ok: false, message: 'RAG agent stream response body is empty.' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData: RagAgentChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    while (true) {
      const sepIdx = buffer.indexOf('\n\n');
      if (sepIdx === -1) break;
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const event = parseSseEventBlock(block);
      if (!event) continue;
      await onEvent(event);
      if (event.type === 'done') {
        finalData = event.data;
      }
      if (event.type === 'error') {
        return { ok: false, message: event.data.message || 'RAG agent stream failed.' };
      }
    }
  }

  if (!finalData) {
    return { ok: false, message: 'RAG agent stream completed without a final response.' };
  }
  return { ok: true, data: finalData };
}
