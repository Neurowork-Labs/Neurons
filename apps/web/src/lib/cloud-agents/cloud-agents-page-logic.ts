/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ALL_CONNECTION_STATES_FILTER_VALUE,
  ALL_AGENT_TYPES_FILTER_VALUE,
  CONNECTED_ONLY_FILTER_VALUE,
  NOT_CONNECTED_ONLY_FILTER_VALUE,
  type CloudAgentCatalogItem,
  type CloudAgentTypeOption,
} from '@/lib/cloud-agents/cloud-agents-types';
import { fetchCloudAgentsCatalogViaApi } from '@/lib/cloud-agents/cloud-agents-api-client';
import { fetchProjectConnectedAgentsViaApi } from '@/lib/projects/connect-public-agent-api-client';

export function useProjectCloudAgentsPage(projectId: string) {
  const [agents, setAgents] = useState<CloudAgentCatalogItem[]>([]);
  const [agentTypes, setAgentTypes] = useState<CloudAgentTypeOption[]>([]);
  const [connectedAgentIds, setConnectedAgentIds] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL_AGENT_TYPES_FILTER_VALUE);
  const [connectionFilter, setConnectionFilter] = useState(
    ALL_CONNECTION_STATES_FILTER_VALUE,
  );
  const [dialogAgent, setDialogAgent] = useState<CloudAgentCatalogItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [catalogRes, connectedRes] = await Promise.all([
      fetchCloudAgentsCatalogViaApi(),
      fetchProjectConnectedAgentsViaApi(projectId),
    ]);
    if (!catalogRes.ok) {
      setAgents([]);
      setAgentTypes([]);
      setConnectedAgentIds(new Set());
      setProjectName('');
      setLoadError(catalogRes.message || 'Could not load cloud agents.');
      setLoading(false);
      return;
    }
    if (!connectedRes.ok) {
      setAgents([]);
      setAgentTypes([]);
      setConnectedAgentIds(new Set());
      setProjectName('');
      setLoadError(connectedRes.message || 'Could not load connected agents.');
      setLoading(false);
      return;
    }
    setAgents(catalogRes.agents);
    setAgentTypes(catalogRes.agentTypes);
    setConnectedAgentIds(new Set(connectedRes.connectedAgentIds));
    setProjectName(connectedRes.projectName);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const typeFilterOptions = useMemo(
    () => [
      { value: ALL_AGENT_TYPES_FILTER_VALUE, label: 'All types' },
      ...agentTypes.map((t) => ({
        value: t.id,
        label: t.displayName || t.name,
      })),
    ],
    [agentTypes],
  );

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (typeFilter !== ALL_AGENT_TYPES_FILTER_VALUE && a.typeId !== typeFilter) {
        return false;
      }
      const isConnected = connectedAgentIds.has(a.id);
      if (connectionFilter === CONNECTED_ONLY_FILTER_VALUE && !isConnected) {
        return false;
      }
      if (connectionFilter === NOT_CONNECTED_ONLY_FILTER_VALUE && isConnected) {
        return false;
      }
      if (!q) return true;
      const inName = a.name.toLowerCase().includes(q);
      const inDisplay = a.displayName.toLowerCase().includes(q);
      return inName || inDisplay;
    });
  }, [agents, search, typeFilter, connectionFilter, connectedAgentIds]);

  const connectionFilterOptions = useMemo(
    () => [
      { value: ALL_CONNECTION_STATES_FILTER_VALUE, label: 'All connections' },
      { value: CONNECTED_ONLY_FILTER_VALUE, label: 'Connected' },
      { value: NOT_CONNECTED_ONLY_FILTER_VALUE, label: 'Not connected' },
    ],
    [],
  );

  const isAgentConnected = useCallback(
    (agentId: string) => connectedAgentIds.has(agentId),
    [connectedAgentIds],
  );

  const markAgentConnected = useCallback((agentId: string) => {
    setConnectedAgentIds((prev) => {
      const next = new Set(prev);
      next.add(agentId);
      return next;
    });
  }, []);

  const markAgentDisconnected = useCallback((agentId: string) => {
    setConnectedAgentIds((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  return {
    agents,
    filteredAgents,
    projectName,
    loadError,
    loading,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    typeFilterOptions,
    connectionFilter,
    setConnectionFilter,
    connectionFilterOptions,
    isAgentConnected,
    markAgentConnected,
    markAgentDisconnected,
    onRefresh: load,
    dialogAgent,
    setDialogAgent,
    closeAgentDialog: () => setDialogAgent(null),
  };
}
