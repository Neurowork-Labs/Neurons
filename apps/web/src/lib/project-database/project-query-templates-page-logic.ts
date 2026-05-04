/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createProjectDatabaseConnectionQueryTemplateViaApi,
  deleteProjectDatabaseConnectionQueryTemplateViaApi,
  fetchProjectDatabaseConnectionQueryTemplatesViaApi,
  updateProjectDatabaseConnectionQueryTemplateViaApi,
} from '@/lib/project-database/project-database-api-client';
import { canonicalMongoQueryBodyString } from '@/lib/project-database/mongo-query-template-validation';
import type {
  ProjectDatabaseConnectionHeaderForTemplates,
  ProjectDatabaseConnectionQueryTemplate,
  QueryTemplateCardConfig,
} from '@/lib/project-database/project-database-types';
import { PROJECT_DATABASE_PAGE_SIZE } from '@/lib/project-database/project-database-page-logic';

export { PROJECT_DATABASE_PAGE_SIZE };

export function isValidReadOnlyTemplateSql(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(String(sql ?? '').trim());
}

/** Trims SQL; does not alter punctuation. Callers must validate semicolon rules before save. */
export function trimSqlText(sql: string): string {
  return String(sql ?? '').trim();
}

/** Canonical form for duplicate detection (legacy rows may omit `;`). */
function canonicalSqlForCompare(sql: string): string {
  let t = trimSqlText(sql).replace(/\s+/g, ' ').toLowerCase();
  if (t && !t.endsWith(';')) t += ';';
  return t;
}

/** True when trimmed SQL is non-empty and ends with exactly one statement terminator `;`. */
export function sqlQueryEndsWithSemicolon(sql: string): boolean {
  const t = trimSqlText(sql);
  return t.length > 0 && t.endsWith(';');
}

export function containsMultipleStatements(sql: string): boolean {
  const stripped = String(sql ?? '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  const semiCount = (stripped.match(/;/g) || []).length;
  if (semiCount > 1) return true;
  if (semiCount === 1 && !stripped.endsWith(';')) return true;
  return false;
}

export function isDuplicateSql(
  sql: string,
  existingTemplates: ProjectDatabaseConnectionQueryTemplate[],
  excludeTemplateId?: string,
): boolean {
  const candidate = canonicalSqlForCompare(sql);
  return existingTemplates.some((t) => {
    if (t.queryKind !== 'sql') return false;
    if (excludeTemplateId && t.id === excludeTemplateId) return false;
    return canonicalSqlForCompare(t.sqlText) === candidate;
  });
}

export function isDuplicateMongoQueryBody(
  body: Record<string, unknown>,
  existingTemplates: ProjectDatabaseConnectionQueryTemplate[],
  excludeTemplateId?: string,
): boolean {
  const candidate = canonicalMongoQueryBodyString(body);
  return existingTemplates.some((t) => {
    if (t.queryKind !== 'mongo_json' || !t.queryBody) return false;
    if (excludeTemplateId && t.id === excludeTemplateId) return false;
    return canonicalMongoQueryBodyString(t.queryBody) === candidate;
  });
}

/** One-line preview for the templates table (SQL text or mongo summary). */
export function queryTemplatePreviewForTable(t: ProjectDatabaseConnectionQueryTemplate): string {
  if (t.queryKind === 'mongo_json' && t.queryBody && typeof t.queryBody === 'object' && !Array.isArray(t.queryBody)) {
    const o = t.queryBody as Record<string, unknown>;
    const c = String(o.collection ?? '').trim();
    const op = String(o.operation ?? '').trim();
    const parts = [c ? `collection: ${c}` : '', op ? op : ''].filter(Boolean);
    if (parts.length) return parts.join(' · ');
    try {
      return JSON.stringify(t.queryBody);
    } catch {
      return '';
    }
  }
  return t.sqlText ?? '';
}

export function templateHaystackForSearch(t: ProjectDatabaseConnectionQueryTemplate): string {
  if (t.queryKind === 'mongo_json' && t.queryBody) {
    try {
      return `${t.name}\n${t.description}\n${JSON.stringify(t.queryBody)}`;
    } catch {
      return `${t.name}\n${t.description}`;
    }
  }
  return `${t.name}\n${t.description}\n${t.sqlText}`;
}

export function isDuplicateTemplateName(
  name: string,
  existingTemplates: ProjectDatabaseConnectionQueryTemplate[],
  excludeTemplateId?: string,
): boolean {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return false;
  return existingTemplates.some((t) => {
    if (excludeTemplateId && t.id === excludeTemplateId) return false;
    return t.name.trim().toLowerCase() === key;
  });
}

export type ProjectQueryTemplatesStatusFilter = 'all' | 'active' | 'inactive';

export function useProjectQueryTemplatesPage(projectId: string, connectionId: string) {
  const [connection, setConnection] = useState<ProjectDatabaseConnectionHeaderForTemplates | null>(null);
  const [allTemplates, setAllTemplates] = useState<ProjectDatabaseConnectionQueryTemplate[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectQueryTemplatesStatusFilter>('all');
  const [page, setPage] = useState(1);
  const mounted = useRef(true);
  const hasFetchedOnce = useRef(false);
  const fetchSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    let out = allTemplates;
    const q = searchInput.trim().toLowerCase();
    if (q) {
      out = out.filter((t) => templateHaystackForSearch(t).toLowerCase().includes(q));
    }
    if (statusFilter === 'active') out = out.filter((t) => t.isActive);
    if (statusFilter === 'inactive') out = out.filter((t) => !t.isActive);
    return out;
  }, [allTemplates, searchInput, statusFilter]);

  const total = filteredTemplates.length;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PROJECT_DATABASE_PAGE_SIZE)),
    [total],
  );

  useEffect(() => {
    setPage(1);
  }, [searchInput, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const templates = useMemo(() => {
    const start = (page - 1) * PROJECT_DATABASE_PAGE_SIZE;
    return filteredTemplates.slice(start, start + PROJECT_DATABASE_PAGE_SIZE);
  }, [filteredTemplates, page]);

  const fetchList = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoadError(null);
    const res = await fetchProjectDatabaseConnectionQueryTemplatesViaApi(projectId, connectionId);
    if (seq !== fetchSeq.current || !mounted.current) return;
    if (!res.ok) {
      setConnection(null);
      setAllTemplates([]);
      setLoadError(res.message || 'Could not load query templates.');
      return;
    }
    setConnection(res.connection);
    setAllTemplates(res.templates);
    setLoadError(null);
  }, [projectId, connectionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (hasFetchedOnce.current) setFetching(true);
      await fetchList();
      if (cancelled || !mounted.current) return;
      hasFetchedOnce.current = true;
      setInitialLoading(false);
      setFetching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const refresh = useCallback(async () => {
    setFetching(true);
    try {
      await fetchList();
    } finally {
      if (mounted.current) setFetching(false);
    }
  }, [fetchList]);

  async function createTemplate(payload: {
    name: string;
    description: string;
    sqlText: string;
    queryBody?: Record<string, unknown> | null;
    parameterSchema?: Record<string, unknown> | null;
    cardConfig?: QueryTemplateCardConfig | null;
    isActive: boolean;
    sortOrder: number;
  }): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await createProjectDatabaseConnectionQueryTemplateViaApi(projectId, connectionId, payload);
    if (!res.ok) return { ok: false, message: res.message || 'Could not create template.' };
    await fetchList();
    return { ok: true };
  }

  async function updateTemplate(
    templateId: string,
    payload: {
      name: string;
      description: string;
      sqlText: string;
      queryBody?: Record<string, unknown> | null;
      parameterSchema?: Record<string, unknown> | null;
      cardConfig?: QueryTemplateCardConfig | null;
      isActive: boolean;
      sortOrder: number;
    },
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await updateProjectDatabaseConnectionQueryTemplateViaApi(projectId, connectionId, templateId, payload);
    if (!res.ok) return { ok: false, message: res.message || 'Could not update template.' };
    await fetchList();
    return { ok: true };
  }

  async function removeTemplate(
    templateId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await deleteProjectDatabaseConnectionQueryTemplateViaApi(projectId, connectionId, templateId);
    if (!res.ok) return { ok: false, message: res.message || 'Could not delete template.' };
    await fetchList();
    return { ok: true };
  }

  return {
    connection,
    allTemplates,
    templates,
    total,
    page,
    setPage,
    totalPages,
    initialLoading,
    fetching,
    loadError,
    searchInput,
    setSearchInput,
    statusFilter,
    setStatusFilter,
    refresh,
    createTemplate,
    updateTemplate,
    removeTemplate,
  };
}
