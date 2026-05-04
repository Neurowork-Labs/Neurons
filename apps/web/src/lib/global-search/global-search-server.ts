/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import type { GlobalSearchApiResult, GlobalSearchItem, GlobalSearchPayload } from '@/lib/global-search/global-search-types';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const MAX_QUERY_LENGTH = 120;
const LIMIT_PER_SECTION = 8;

function normalizeQuery(raw: string): string {
  return String(raw ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

function emptyPayload(): GlobalSearchPayload {
  return {
    organizations: [],
    projects: [],
    storageFiles: [],
    connectedAgents: [],
    cloudAgents: [],
    apiKeys: [],
  };
}

export async function searchGlobalForCurrentUser(rawQuery: string): Promise<GlobalSearchApiResult> {
  const q = normalizeQuery(rawQuery);
  if (!q) return { ok: true, query: '', results: emptyPayload() };

  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, message: authError.message, code: 'UNAUTHORIZED' };
  if (!authData.user) return { ok: false, message: 'Unauthorized', code: 'UNAUTHORIZED' };

  const userId = authData.user.id;
  const safeSearch = q.replace(/[%_\\]/g, '');

  const { data: memberRows, error: membersError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_deleted', false);
  if (membersError) return { ok: false, message: membersError.message };

  const orgIds = Array.from(new Set((memberRows ?? []).map((row) => String(row.organization_id))));
  if (orgIds.length === 0) return { ok: true, query: q, results: emptyPayload() };

  const [
    organizationsRes,
    projectsRes,
    documentsRes,
    projectAgentsRes,
    apiKeysRes,
    cloudAgentsRes,
  ] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
      .eq('is_deleted', false)
      .ilike('name', `%${safeSearch}%`)
      .order('name', { ascending: true })
      .limit(LIMIT_PER_SECTION),
    supabase
      .from('projects')
      .select('id, title, organization_id')
      .in('organization_id', orgIds)
      .eq('is_deleted', false)
      .ilike('title', `%${safeSearch}%`)
      .order('updated_at', { ascending: false })
      .limit(LIMIT_PER_SECTION),
    supabase
      .from('documents')
      .select('id, file_name, project_agent_id')
      .in('organization_id', orgIds)
      .eq('is_deleted', false)
      .ilike('file_name', `%${safeSearch}%`)
      .order('updated_at', { ascending: false })
      .limit(LIMIT_PER_SECTION),
    supabase
      .from('project_agents')
      .select('id, project_id, is_deleted, agents!inner(name, display_name)')
      .eq('is_deleted', false)
      .limit(LIMIT_PER_SECTION * 3),
    supabase
      .from('project_api_keys')
      .select('id, name, project_id')
      .ilike('name', `%${safeSearch}%`)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SECTION * 2),
    supabase
      .from('agents')
      .select('id, display_name, name')
      .eq('is_deleted', false)
      .eq('is_public', true)
      .or(`name.ilike.%${safeSearch}%,display_name.ilike.%${safeSearch}%`)
      .order('display_name', { ascending: true })
      .limit(LIMIT_PER_SECTION),
  ]);

  if (organizationsRes.error) return { ok: false, message: organizationsRes.error.message };
  if (projectsRes.error) return { ok: false, message: projectsRes.error.message };
  if (documentsRes.error) return { ok: false, message: documentsRes.error.message };
  if (projectAgentsRes.error) return { ok: false, message: projectAgentsRes.error.message };
  if (apiKeysRes.error) return { ok: false, message: apiKeysRes.error.message };
  if (cloudAgentsRes.error) return { ok: false, message: cloudAgentsRes.error.message };

  const projectRows = (projectsRes.data ?? []) as Array<{ id: string; title: string; organization_id: string }>;

  const organizations: GlobalSearchItem[] = ((organizationsRes.data ?? []) as Array<{ id: string; name: string }>).map(
    (row) => ({
      id: row.id,
      title: row.name,
      subtitle: 'Organization',
      href: `/org/${encodeURIComponent(row.id)}`,
    }),
  );

  const projects: GlobalSearchItem[] = projectRows.slice(0, LIMIT_PER_SECTION).map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: 'Project',
    href: `/project/${encodeURIComponent(row.id)}`,
  }));

  const { data: projectAgentsForDocs } = await supabase
    .from('project_agents')
    .select('id, project_id')
    .in(
      'id',
      Array.from(
        new Set(
          ((documentsRes.data ?? []) as Array<{ project_agent_id: string }>).map((row) =>
            String(row.project_agent_id),
          ),
        ),
      ),
    );
  const projectByProjectAgentId = new Map(
    (projectAgentsForDocs ?? []).map((row) => [String(row.id), String(row.project_id)]),
  );

  const connectedAgentRows = (projectAgentsRes.data ?? []) as Array<{
    id: string;
    project_id: string;
    agents: { name: string; display_name: string } | Array<{ name: string; display_name: string }>;
  }>;
  const apiKeyRows = (apiKeysRes.data ?? []) as Array<{
    id: string;
    name: string;
    project_id: string;
  }>;

  const relatedProjectIds = Array.from(
    new Set<string>([
      ...projectRows.map((row) => String(row.id)),
      ...Array.from(projectByProjectAgentId.values()),
      ...connectedAgentRows.map((row) => String(row.project_id)),
      ...apiKeyRows.map((row) => String(row.project_id)),
    ]),
  );

  let projectMap = new Map<string, { id: string; title: string; organization_id: string }>(
    projectRows.map((row) => [String(row.id), row]),
  );
  if (relatedProjectIds.length > 0) {
    const { data: relatedProjects, error: relatedProjectsError } = await supabase
      .from('projects')
      .select('id, title, organization_id')
      .in('id', relatedProjectIds)
      .eq('is_deleted', false);
    if (relatedProjectsError) return { ok: false, message: relatedProjectsError.message };
    projectMap = new Map(
      ((relatedProjects ?? []) as Array<{ id: string; title: string; organization_id: string }>).map(
        (row) => [String(row.id), row],
      ),
    );
  }

  const storageFiles: GlobalSearchItem[] = ((documentsRes.data ?? []) as Array<{
    id: string;
    file_name: string;
    project_agent_id: string;
  }>)
    .map((row) => {
      const projectId = projectByProjectAgentId.get(String(row.project_agent_id));
      if (!projectId) return null;
      const project = projectMap.get(projectId);
      if (!project) return null;
      return {
        id: row.id,
        title: row.file_name,
        subtitle: `Storage file${project ? ` • ${project.title}` : ''}`,
        href: `/project/${encodeURIComponent(projectId)}/storage`,
      } as GlobalSearchItem;
    })
    .filter((item): item is GlobalSearchItem => item != null)
    .slice(0, LIMIT_PER_SECTION);

  const connectedAgents: GlobalSearchItem[] = connectedAgentRows
    .map((row) => {
      const embedded = Array.isArray(row.agents) ? row.agents[0] : row.agents;
      if (!embedded) return null;
      const inName = embedded.name.toLowerCase().includes(safeSearch.toLowerCase());
      const inDisplay = embedded.display_name.toLowerCase().includes(safeSearch.toLowerCase());
      if (!inName && !inDisplay) return null;
      const project = projectMap.get(String(row.project_id));
      if (!project) return null;
      return {
        id: row.id,
        title: embedded.display_name || embedded.name,
        subtitle: `Connected agent${project ? ` • ${project.title}` : ''}`,
        href: `/project/${encodeURIComponent(String(row.project_id))}/connected-agents`,
      } as GlobalSearchItem;
    })
    .filter((item): item is GlobalSearchItem => item != null)
    .slice(0, LIMIT_PER_SECTION);

  const apiKeys: GlobalSearchItem[] = apiKeyRows
    .filter((row) => projectMap.has(String(row.project_id)))
    .slice(0, LIMIT_PER_SECTION)
    .map((row) => {
      const project = projectMap.get(String(row.project_id));
      return {
        id: row.id,
        title: row.name,
        subtitle: `API key${project ? ` • ${project.title}` : ''}`,
        href: `/project/${encodeURIComponent(String(row.project_id))}/api-keys`,
      };
    });

  let defaultProjectId: string | null = projectRows[0]?.id ?? null;
  if (!defaultProjectId) {
    const { data: defaultProjectRows, error: defaultProjectError } = await supabase
      .from('projects')
      .select('id')
      .in('organization_id', orgIds)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (defaultProjectError) return { ok: false, message: defaultProjectError.message };
    defaultProjectId = (defaultProjectRows?.[0] as { id: string } | undefined)?.id ?? null;
  }
  const cloudAgents: GlobalSearchItem[] = ((cloudAgentsRes.data ?? []) as Array<{
    id: string;
    display_name: string;
    name: string;
  }>).map((row) => ({
    id: row.id,
    title: row.display_name || row.name,
    subtitle: 'Agents Cloud',
    href:
      defaultProjectId != null
        ? `/project/${encodeURIComponent(defaultProjectId)}/cloud-agents`
        : '/dashboard',
  }));

  return {
    ok: true,
    query: q,
    results: {
      organizations,
      projects,
      storageFiles,
      connectedAgents,
      cloudAgents,
      apiKeys,
    },
  };
}
