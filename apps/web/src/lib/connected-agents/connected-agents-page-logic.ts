/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ALL_AGENT_STATUSES_FILTER_VALUE,
  type ConnectedAgentItem,
  type ConnectedAgentModelOption,
  type ConnectedAgentStatusOption,
} from '@/lib/connected-agents/connected-agents-types';
import { fetchConnectedAgentsViaApi } from '@/lib/connected-agents/connected-agents-api-client';

export function useProjectConnectedAgentsPage(projectId: string) {
  const [agents, setAgents] = useState<ConnectedAgentItem[]>([]);
  const [statusOptions, setStatusOptions] = useState<ConnectedAgentStatusOption[]>([]);
  const [modelOptions, setModelOptions] = useState<ConnectedAgentModelOption[]>([]);
  const [planDefaultModelId, setPlanDefaultModelId] = useState<string | null>(null);
  const [planDefaultModelDisplayName, setPlanDefaultModelDisplayName] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [widgetScriptSrc, setWidgetScriptSrc] = useState<string | null>(null);
  const [activeApiKeyPrefix, setActiveApiKeyPrefix] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_AGENT_STATUSES_FILTER_VALUE);
  const [dialogAgent, setDialogAgent] = useState<ConnectedAgentItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchConnectedAgentsViaApi(projectId);
    if (!res.ok) {
      setAgents([]);
      setStatusOptions([]);
      setModelOptions([]);
      setPlanDefaultModelId(null);
      setPlanDefaultModelDisplayName(null);
      setProjectName('');
      setWidgetScriptSrc(null);
      setActiveApiKeyPrefix(null);
      setLoadError(res.message || 'Could not load connected agents.');
      setLoading(false);
      return;
    }
    setAgents(res.agents);
    setStatusOptions(res.statusOptions);
    setModelOptions(res.modelOptions);
    setPlanDefaultModelId(res.planDefaultModelId);
    setPlanDefaultModelDisplayName(res.planDefaultModelDisplayName);
    setProjectName(res.projectName);
    setWidgetScriptSrc(res.widgetScriptSrc);
    setActiveApiKeyPrefix(res.activeApiKeyPrefix);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const statusFilterOptions = useMemo(
    () => [
      { value: ALL_AGENT_STATUSES_FILTER_VALUE, label: 'All statuses' },
      ...statusOptions.map((s) => ({ value: s.id, label: s.label })),
    ],
    [statusOptions],
  );

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter !== ALL_AGENT_STATUSES_FILTER_VALUE && a.statusId !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const inName = a.name.toLowerCase().includes(q);
      const inDisplay = a.displayName.toLowerCase().includes(q);
      return inName || inDisplay;
    });
  }, [agents, search, statusFilter]);

  const replaceAgentInList = useCallback((nextAgent: ConnectedAgentItem) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.projectAgentId === nextAgent.projectAgentId ? nextAgent : agent)),
    );
    setDialogAgent(nextAgent);
  }, []);

  return {
    agents,
    filteredAgents,
    projectName,
    widgetScriptSrc,
    activeApiKeyPrefix,
    loadError,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    statusFilterOptions,
    modelOptions,
    planDefaultModelId,
    planDefaultModelDisplayName,
    onRefresh: load,
    dialogAgent,
    setDialogAgent,
    closeAgentDialog: () => setDialogAgent(null),
    replaceAgentInList,
  };
}
