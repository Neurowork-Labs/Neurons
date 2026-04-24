'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchProjectAnalyticsFiltersViaApi,
  fetchProjectAnalyticsVisitorConversationViaApi,
  fetchProjectAnalyticsVisitorsViaApi,
} from '@/lib/project-analytics/project-analytics-api-client';
import type {
  ProjectAnalyticsConversationMessage,
  ProjectAnalyticsConnectedAgentOption,
  ProjectAnalyticsVisitorRow,
} from '@/lib/project-analytics/project-analytics-types';

const ALL_CONNECTED_AGENTS_FILTER_VALUE = '__all_connected_agents__';
export const PROJECT_ANALYTICS_PAGE_SIZE = 10;

export function useProjectAnalyticsPage(projectId: string) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visitorsError, setVisitorsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAgentId, setSelectedAgentId] = useState(ALL_CONNECTED_AGENTS_FILTER_VALUE);
  const [connectedAgents, setConnectedAgents] = useState<ProjectAnalyticsConnectedAgentOption[]>([]);
  const [visitors, setVisitors] = useState<ProjectAnalyticsVisitorRow[]>([]);
  const [visitorsLoading, setVisitorsLoading] = useState(false);
  const [activeVisitor, setActiveVisitor] = useState<ProjectAnalyticsVisitorRow | null>(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ProjectAnalyticsConversationMessage[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchProjectAnalyticsFiltersViaApi(projectId);
    if (!res.ok) {
      setConnectedAgents([]);
      setLoadError(res.message || 'Could not load connected agents.');
      setLoading(false);
      return;
    }

    setConnectedAgents(res.connectedAgents);
    setLoading(false);
  }, [projectId]);

  const loadVisitors = useCallback(async () => {
    if (selectedAgentId === ALL_CONNECTED_AGENTS_FILTER_VALUE) {
      setVisitors([]);
      setVisitorsError(null);
      setVisitorsLoading(false);
      return;
    }

    setVisitorsLoading(true);
    setVisitorsError(null);

    const res = await fetchProjectAnalyticsVisitorsViaApi(projectId, selectedAgentId);
    if (!res.ok) {
      setVisitors([]);
      setVisitorsError(res.message || 'Could not load visitors.');
      setVisitorsLoading(false);
      return;
    }

    setVisitors(res.visitors);
    setVisitorsLoading(false);
  }, [projectId, selectedAgentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVisitors();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadVisitors]);

  useEffect(() => {
    if (
      selectedAgentId !== ALL_CONNECTED_AGENTS_FILTER_VALUE &&
      !connectedAgents.some((agent) => agent.projectAgentId === selectedAgentId)
    ) {
      setSelectedAgentId(ALL_CONNECTED_AGENTS_FILTER_VALUE);
    }
  }, [connectedAgents, selectedAgentId]);

  const connectedAgentOptions = useMemo(
    () => [
      { value: ALL_CONNECTED_AGENTS_FILTER_VALUE, label: 'All connected agents' },
      ...connectedAgents.map((agent) => ({
        value: agent.projectAgentId,
        label: agent.displayName,
      })),
    ],
    [connectedAgents],
  );

  const filteredVisitors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visitors;
    return visitors.filter((visitor) => {
      const loc = visitor.location;
      const values = [
        visitor.name ?? '',
        visitor.email ?? '',
        visitor.phone ?? '',
        loc?.country ?? '',
        loc?.state ?? '',
        loc?.city ?? '',
      ];
      return values.some((value) => value.toLowerCase().includes(q));
    });
  }, [search, visitors]);

  const totalVisitors = filteredVisitors.length;
  const totalPages = Math.max(1, Math.ceil(totalVisitors / PROJECT_ANALYTICS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedVisitors = useMemo(() => {
    const start = (currentPage - 1) * PROJECT_ANALYTICS_PAGE_SIZE;
    return filteredVisitors.slice(start, start + PROJECT_ANALYTICS_PAGE_SIZE);
  }, [currentPage, filteredVisitors]);

  const hasConnectedAgents = connectedAgentOptions.length > 1;
  const hasAgentSelected = selectedAgentId !== ALL_CONNECTED_AGENTS_FILTER_VALUE;
  const onRefresh = useCallback(async () => {
    await load();
    await loadVisitors();
  }, [load, loadVisitors]);

  useEffect(() => {
    setPage(1);
  }, [selectedAgentId, search]);

  const openVisitorConversation = useCallback(
    async (visitor: ProjectAnalyticsVisitorRow) => {
      if (selectedAgentId === ALL_CONNECTED_AGENTS_FILTER_VALUE) return;

      setActiveVisitor(visitor);
      setConversationLoading(true);
      setConversationError(null);
      setConversationMessages([]);

      const res = await fetchProjectAnalyticsVisitorConversationViaApi(
        projectId,
        selectedAgentId,
        visitor.id,
      );
      if (!res.ok) {
        setConversationError(res.message || 'Could not load visitor conversation.');
        setConversationLoading(false);
        return;
      }

      setConversationMessages(res.messages);
      setConversationLoading(false);
    },
    [projectId, selectedAgentId],
  );

  const closeVisitorConversation = useCallback(() => {
    setActiveVisitor(null);
    setConversationLoading(false);
    setConversationError(null);
    setConversationMessages([]);
  }, []);

  return {
    loading,
    loadError,
    visitorsLoading,
    visitorsError,
    search,
    setSearch,
    selectedAgentId,
    setSelectedAgentId,
    page: currentPage,
    setPage,
    totalPages,
    totalVisitors,
    connectedAgentOptions,
    paginatedVisitors,
    activeVisitor,
    conversationLoading,
    conversationError,
    conversationMessages,
    hasConnectedAgents,
    hasAgentSelected,
    openVisitorConversation,
    closeVisitorConversation,
    onRefresh,
  };
}
