/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

export function maskPrefix(prefix: string | null | undefined): string {
  const p = String(prefix ?? '').trim();
  if (!p) return '';
  return `${p}••••••••`;
}

export function maskProjectAgentId(projectAgentId: string): string {
  const v = String(projectAgentId ?? '').trim();
  if (!v) return '';
  return `${v.slice(0, 8)}••••••••••••••••`;
}

export function buildWidgetScriptValue(args: {
  src: string | null;
  apiKey: string;
  projectAgentId: string;
  /**
   * Legacy compatibility switch.
   * Keep false by default so generated snippets are dashboard-driven.
   */
  includeLegacyDisplayAttrs?: boolean;
  primaryColor?: string;
  agentName?: string | null;
  defaultGreetings?: string | null;
}): string {
  const src = String(args.src ?? '').trim();
  const apiKey = String(args.apiKey ?? '').trim();
  const projectAgentId = String(args.projectAgentId ?? '').trim();
  const includeLegacyDisplayAttrs = Boolean(args.includeLegacyDisplayAttrs);
  if (!src || !apiKey || !projectAgentId) return '';

  function escapeAttr(v: string) {
    return v
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  function encodeGreetingsForAttribute(v: string) {
    // Keep it as a single-line attribute value; convert newlines to "\n".
    return v.replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
  }

  const primaryColorAttr =
    includeLegacyDisplayAttrs && String(args.primaryColor ?? '').trim()
      ? `\n      data-primary-color="${escapeAttr(String(args.primaryColor).trim())}"`
      : '';
  const agentNameAttr =
    includeLegacyDisplayAttrs && args.agentName?.trim()
      ? `\n      data-agent-name="${escapeAttr(args.agentName.trim())}"`
      : '';
  const greetingAttr =
    includeLegacyDisplayAttrs && args.defaultGreetings?.trim()
      ? `\n      data-default-greetings="${escapeAttr(encodeGreetingsForAttribute(args.defaultGreetings.trim()))}"`
      : '';

  return `<script
      src="${src}"
      data-api-key="${apiKey}"
      data-project-agent-id="${projectAgentId}"${primaryColorAttr}${agentNameAttr}${greetingAttr}
      async
></script>`;
}
