/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchProjectDatabaseLookupsViaApi,
  fetchProjectDatabaseSchemasViaApi,
} from '@/lib/project-database/project-database-api-client';
import type {
  AllowedDbExtensionRow,
  DatabaseExportLayoutRow,
  DatabaseRow,
  DatabaseTypeRow,
  ProjectDatabaseSchemaListItem,
  ProjectDatabaseUploadAgentOption,
} from '@/lib/project-database/project-database-types';

export const PROJECT_DATABASE_PAGE_SIZE = 15;

export function useProjectDatabasePage(projectId: string) {
  const [allSchemas, setAllSchemas] = useState<ProjectDatabaseSchemaListItem[]>([]);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');

  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseTypeRow[]>([]);
  const [databases, setDatabases] = useState<DatabaseRow[]>([]);
  const [allowedExtensions, setAllowedExtensions] = useState<AllowedDbExtensionRow[]>([]);
  const [uploadAgentOptions, setUploadAgentOptions] = useState<ProjectDatabaseUploadAgentOption[]>([]);
  const [databaseExportLayouts, setDatabaseExportLayouts] = useState<DatabaseExportLayoutRow[]>([]);

  const filteredSchemas = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return allSchemas;
    return allSchemas.filter((s) => s.databaseName.toLowerCase().includes(q));
  }, [allSchemas, searchInput]);

  const total = filteredSchemas.length;

  const schemas = useMemo(() => {
    const start = (page - 1) * PROJECT_DATABASE_PAGE_SIZE;
    return filteredSchemas.slice(start, start + PROJECT_DATABASE_PAGE_SIZE);
  }, [filteredSchemas, page]);

  const loadSchemas = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetchProjectDatabaseSchemasViaApi(projectId, { fetchAll: true });
    if (!res.ok) {
      setAllSchemas([]);
      setLoadError(res.message || 'Could not load databases.');
      setLoading(false);
      return;
    }
    setAllSchemas(res.schemas);
    setLoadError(null);
    setLoading(false);
  }, [projectId]);

  const loadLookups = useCallback(async () => {
    setLookupsLoading(true);
    const res = await fetchProjectDatabaseLookupsViaApi(projectId);
    if (res.ok) {
      setDatabaseTypes(res.databaseTypes);
      setDatabases(res.databases);
      setAllowedExtensions(res.allowedExtensions);
      setDatabaseExportLayouts(res.databaseExportLayouts);
      setUploadAgentOptions(res.uploadAgentOptions);
    }
    setLookupsLoading(false);
    return res;
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSchemas();
      void loadLookups();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSchemas, loadLookups]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PROJECT_DATABASE_PAGE_SIZE)),
    [total],
  );

  return {
    schemas,
    total,
    totalInProject: allSchemas.length,
    page,
    setPage,
    totalPages,
    loadError,
    loading,
    searchInput,
    setSearchInput,
    onRefresh: loadSchemas,
    lookupsLoading,
    databaseTypes,
    databases,
    allowedExtensions,
    databaseExportLayouts,
    uploadAgentOptions,
    loadLookups,
  };
}
