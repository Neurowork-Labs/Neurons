/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type {
  CloudAgentCatalogItem,
  CloudAgentTypeOption,
} from '@/lib/cloud-agents/cloud-agents-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

type AgentTypeEmbed = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
} | null;

type AgentStatusEmbed = { name: string | null } | null;

type ModelEmbed = {
  name: string;
  display_name: string;
} | null;

type AgentRow = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon_url: string | null;
  version: string;
  type_id: string;
  system_instruction: string;
  config_schema: unknown | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  agent_types: AgentTypeEmbed | AgentTypeEmbed[];
  agent_statuses: AgentStatusEmbed | AgentStatusEmbed[];
  models: ModelEmbed | ModelEmbed[];
};

type AgentTypeRow = {
  id: string;
  name: string;
  display_name: string;
};

export type ListPublicCloudAgentsCatalogResult =
  | { ok: true; agents: CloudAgentCatalogItem[]; agentTypes: CloudAgentTypeOption[] }
  | { ok: false; message: string };

function firstEmbed<T>(embed: T | T[] | null): T | null {
  if (embed == null) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function normalizeAgentType(
  embed: AgentTypeEmbed | AgentTypeEmbed[],
): {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
} | null {
  const row = firstEmbed(embed);
  if (!row?.id) return null;
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
  };
}

function normalizeStatusName(embed: AgentStatusEmbed | AgentStatusEmbed[]): string {
  const row = firstEmbed(embed);
  const n = row?.name;
  return n != null && String(n).trim() !== '' ? String(n) : '—';
}

function normalizeModel(embed: ModelEmbed | ModelEmbed[]): {
  name: string;
  displayName: string;
} {
  const row = firstEmbed(embed);
  return {
    name: row?.name ?? '—',
    displayName: row?.display_name ?? '—',
  };
}

export async function listPublicCloudAgentsCatalog(): Promise<ListPublicCloudAgentsCatalogResult> {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, message: authError.message };
  }

  if (!authData.user) {
    return { ok: false, message: 'Unauthorized' };
  }

  const { data: agentRows, error: agentsError } = await supabase
    .from('agents')
    .select(
      `
      id,
      name,
      display_name,
      description,
      icon_url,
      version,
      type_id,
      system_instruction,
      config_schema,
      is_public,
      created_at,
      updated_at,
      agent_types (
        id,
        name,
        display_name,
        description
      ),
      agent_statuses (
        name
      ),
      models!agents_default_model_id_fkey (
        name,
        display_name
      )
    `,
    )
    .eq('is_public', true)
    .eq('is_deleted', false)
    .order('display_name', { ascending: true });

  if (agentsError) {
    return { ok: false, message: agentsError.message };
  }

  const { data: typeRows, error: typesError } = await supabase
    .from('agent_types')
    .select('id, name, display_name')
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (typesError) {
    return { ok: false, message: typesError.message };
  }

  const agents: CloudAgentCatalogItem[] = (agentRows ?? []).map((row: AgentRow) => {
    const t = normalizeAgentType(row.agent_types);
    const model = normalizeModel(row.models);
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      iconUrl: row.icon_url,
      version: row.version,
      typeId: t?.id ?? row.type_id,
      typeName: t?.name ?? '—',
      typeDisplayName: t?.displayName ?? '—',
      typeDescription: t?.description ?? null,
      statusName: normalizeStatusName(row.agent_statuses),
      defaultModelName: model.name,
      defaultModelDisplayName: model.displayName,
      systemInstruction: row.system_instruction,
      configSchema: row.config_schema,
      isPublic: row.is_public,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const agentTypes: CloudAgentTypeOption[] = (typeRows ?? []).map((row: AgentTypeRow) => ({
    id: row.id,
    name: row.name,
    displayName: row.display_name,
  }));

  return { ok: true, agents, agentTypes };
}
