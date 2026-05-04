/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/**
 * When the org plan default model is a real row in `public.models`, stored `project_agents.model_id`
 * may equal that id or be null. For the UI, both mean "use plan default" — map explicit default id to null
 * so the "(default)" option is selected and the same model is not listed twice.
 */
export function normalizeConnectedAgentModelIdForDraft(
  modelId: string | null | undefined,
  planDefaultModelId: string | null | undefined,
): string | null {
  const def = String(planDefaultModelId ?? '').trim();
  if (!def) return modelId ?? null;
  const mid = String(modelId ?? '').trim();
  if (mid === def) return null;
  return modelId ?? null;
}
