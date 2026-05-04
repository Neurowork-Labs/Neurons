/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useCallback, useEffect, useState } from 'react';

import { fetchProjectApiKeysViaApi } from '@/lib/project-api-keys/project-api-keys-api-client';
import type { ProjectApiKeyListItem } from '@/lib/project-api-keys/project-api-keys-types';

export const PROJECT_API_KEYS_PAGE_SIZE = 15;

export function useProjectApiKeysPage(projectId: string) {
  const [keys, setKeys] = useState<ProjectApiKeyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [canManage, setCanManage] = useState(false);
  const [isDomainVerified, setIsDomainVerified] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      // Reset pagination on search change (async to satisfy hooks lint rule).
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchProjectApiKeysViaApi(projectId, {
      page,
      pageSize: PROJECT_API_KEYS_PAGE_SIZE,
      search: debouncedSearch,
    });
    if (!res.ok) {
      setKeys([]);
      setTotal(0);
      setCanManage(false);
      setIsDomainVerified(false);
      setLoadError(res.message || 'Could not load API keys.');
      setLoading(false);
      return;
    }
    setKeys(res.keys);
    setTotal(res.total);
    setCanManage(res.canManage);
    setIsDomainVerified(res.isDomainVerified);
    setLoading(false);
  }, [projectId, page, debouncedSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PROJECT_API_KEYS_PAGE_SIZE));

  return {
    keys,
    total,
    page,
    setPage,
    totalPages,
    canManage,
    isDomainVerified,
    loadError,
    loading,
    searchInput,
    setSearchInput,
    debouncedSearch,
    onRefresh: load,
  };
}
