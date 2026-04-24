/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  EllipsisVertical,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import {
  parseMongoQueryBodyText,
  validateMongoQueryTemplateBody,
} from '@/lib/project-database/mongo-query-template-validation';
import {
  PROJECT_DATABASE_PAGE_SIZE,
  containsMultipleStatements,
  isDuplicateMongoQueryBody,
  isDuplicateSql,
  isDuplicateTemplateName,
  isValidReadOnlyTemplateSql,
  sqlQueryEndsWithSemicolon,
  trimSqlText,
  queryTemplatePreviewForTable,
  useProjectQueryTemplatesPage,
  type ProjectQueryTemplatesStatusFilter,
} from '@/lib/project-database/project-query-templates-page-logic';
import {
  detectTemplateParameterNames,
  QUERY_TEMPLATE_PARAMETER_TYPES,
  parameterRowsFromSchema,
  parameterSchemaFromRows,
  syncParameterRowsWithDetectedNames,
  validateParameterRows,
  type QueryTemplateParameterRow,
  type QueryTemplateParameterType,
} from '@/lib/project-database/query-template-parameter-schema';
import {
  buildCardLinkPreviewUrl,
  buildCardImagePreviewUrl,
  carouselCardStatusPresentation,
  detectMongoQueryBodyColumns,
  detectSqlSelectColumns,
  cardConfigFromUiState,
  uiStateFromCardConfig,
} from '@/lib/project-database/query-template-card-config';
import type { ProjectDatabaseConnectionQueryTemplate } from '@/lib/project-database/project-database-types';
import { databaseSchemaStatusPillClassNameCn } from '@/lib/project-database/project-database-display';
import { primaryCtaDialogButtonClassName, primaryCtaToolbarButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

const templateTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(3rem,0.3fr)_minmax(7rem,0.85fr)_minmax(8rem,0.95fr)_minmax(12rem,1.25fr)_minmax(4.5rem,0.5fr)_minmax(2.25rem,0.35fr)] sm:gap-2';

const templateRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(3rem,0.3fr)_minmax(7rem,0.85fr)_minmax(8rem,0.95fr)_minmax(12rem,1.25fr)_minmax(4.5rem,0.5fr)_minmax(2.25rem,0.35fr)] sm:gap-2 sm:items-center';

const parameterTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(8rem,0.85fr)_minmax(8rem,0.75fr)_minmax(8rem,0.75fr)_minmax(10rem,1fr)_minmax(5.5rem,0.45fr)_minmax(5.5rem,0.45fr)_minmax(9rem,0.9fr)] sm:gap-2';

const parameterRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(8rem,0.85fr)_minmax(8rem,0.75fr)_minmax(8rem,0.75fr)_minmax(10rem,1fr)_minmax(5.5rem,0.45fr)_minmax(5.5rem,0.45fr)_minmax(9rem,0.9fr)] sm:gap-2 sm:items-center';
const detectedColumnsTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(12rem,1fr)_minmax(5.5rem,0.35fr)] sm:gap-2';
const detectedColumnsRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-2 text-sm sm:grid-cols-[minmax(12rem,1fr)_minmax(5.5rem,0.35fr)] sm:gap-2 sm:items-center';
const PARAMETER_DIALOG_PAGE_SIZE = 10;

type ProjectQueryTemplatesViewProps = {
  projectId: string;
  connectionId: string;
};

type CardConfigFormState = {
  carouselEnabled: boolean;
  conversationExcludedColumns: string[];
  titleColumn: string;
  imageColumn: string;
  publicBucketUrl: string;
  detailColumns: string[];
  maxCards: number;
  linkBasePath: string;
  linkPathSegments: Array<{ column: string }>;
  linkQueryParams: Array<{ name: string; column: string }>;
};

function emptyCardConfigForm(): CardConfigFormState {
  return {
    carouselEnabled: false,
    conversationExcludedColumns: [],
    titleColumn: '',
    imageColumn: '',
    publicBucketUrl: '',
    detailColumns: [],
    maxCards: 10,
    linkBasePath: '',
    linkPathSegments: [],
    linkQueryParams: [],
  };
}

type TemplateFormState = {
  name: string;
  description: string;
  sqlText: string;
  /** JSON string for MongoDB templates (`mongo_json` dialect). */
  queryBodyText: string;
  parameterRows: QueryTemplateParameterRow[];
  sortOrder: string;
  isActive: boolean;
  cardConfig: CardConfigFormState;
  detectedColumns: string[];
};

const MONGO_QUERY_BODY_DEFAULT = `{
  "collection": "",
  "operation": "find",
  "filter": {}
}`;

function emptyForm(dialect: 'sql' | 'mongo_json'): TemplateFormState {
  return {
    name: '',
    description: '',
    sqlText: '',
    queryBodyText: dialect === 'mongo_json' ? MONGO_QUERY_BODY_DEFAULT : '',
    parameterRows: [],
    sortOrder: '0',
    isActive: true,
    cardConfig: emptyCardConfigForm(),
    detectedColumns: [],
  };
}

function templateStatusPillClassName(isActive: boolean): string {
  return databaseSchemaStatusPillClassNameCn(isActive ? 'connected' : 'disconnected');
}

function isIdRelatedDetectedColumn(columnName: string): boolean {
  const col = String(columnName || '').trim().toLowerCase();
  return col === 'id' || col.endsWith('_id');
}

function withDefaultIdExcludedColumns(existing: string[], detected: string[]): string[] {
  const out = [...existing];
  const seen = new Set(existing.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean));
  for (const col of detected) {
    const norm = String(col || '').trim().toLowerCase();
    if (!norm) continue;
    if (!isIdRelatedDetectedColumn(col)) continue;
    if (seen.has(norm)) continue;
    out.push(col);
    seen.add(norm);
  }
  return out;
}

export function ProjectQueryTemplatesView({ projectId, connectionId }: ProjectQueryTemplatesViewProps) {
  const {
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
  } = useProjectQueryTemplatesPage(projectId, connectionId);

  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addForm, setAddForm] = useState<TemplateFormState>(() => emptyForm('sql'));

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormState>(() => emptyForm('sql'));
  const [editBaseline, setEditBaseline] = useState<TemplateFormState>(() => emptyForm('sql'));
  const [editDirty, setEditDirty] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDatabaseConnectionQueryTemplate | null>(null);
  const [parameterDialogOpen, setParameterDialogOpen] = useState(false);
  const [parameterDialogTarget, setParameterDialogTarget] = useState<'add' | 'edit'>('add');
  const [parameterDialogPage, setParameterDialogPage] = useState(1);

  const [carouselDialogOpen, setCarouselDialogOpen] = useState(false);
  const [carouselDialogTarget, setCarouselDialogTarget] = useState<'add' | 'edit'>('add');

  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [columnsDialogTarget, setColumnsDialogTarget] = useState<'add' | 'edit'>('add');
  const listLoading = initialLoading || fetching;

  useEffect(() => {
    if (loadError) toast.error(loadError);
  }, [loadError]);

  const title = connection?.displayName?.trim()
    ? `Query templates : ${connection.displayName.trim()}`
    : 'Query templates';

  const dialect = connection?.queryTemplateDialect ?? 'sql';
  const isMongoDialect = dialect === 'mongo_json';

  const addCarouselStatusTag = carouselCardStatusPresentation(addForm.cardConfig.carouselEnabled);
  const editCarouselStatusTag = carouselCardStatusPresentation(editForm.cardConfig.carouselEnabled);

  function syncRowsForInput(
    rows: QueryTemplateParameterRow[],
    nextSqlText: string,
    nextQueryBodyText: string,
  ): QueryTemplateParameterRow[] {
    const names = detectTemplateParameterNames(dialect, nextSqlText, nextQueryBodyText);
    return syncParameterRowsWithDetectedNames(rows, names);
  }

  const editHasChanges = editDirty;

  function updateAddSqlText(value: string) {
    setAddForm((f) => {
      const parameterRows = syncRowsForInput(f.parameterRows, value, f.queryBodyText);
      const detectedColumns = detectSqlSelectColumns(value);
      const conversationExcludedColumns = withDefaultIdExcludedColumns(
        f.cardConfig.conversationExcludedColumns,
        detectedColumns,
      );
      return {
        ...f,
        sqlText: value,
        parameterRows,
        detectedColumns,
        cardConfig: { ...f.cardConfig, conversationExcludedColumns },
      };
    });
  }

  function updateAddQueryBodyText(value: string) {
    setAddForm((f) => {
      const parameterRows = syncRowsForInput(f.parameterRows, f.sqlText, value);
      const detectedColumns = detectMongoQueryBodyColumns(value);
      const conversationExcludedColumns = withDefaultIdExcludedColumns(
        f.cardConfig.conversationExcludedColumns,
        detectedColumns,
      );
      return {
        ...f,
        queryBodyText: value,
        parameterRows,
        detectedColumns,
        cardConfig: { ...f.cardConfig, conversationExcludedColumns },
      };
    });
  }

  function updateEditSqlText(value: string) {
    setEditDirty(true);
    setEditForm((f) => {
      const parameterRows = syncRowsForInput(f.parameterRows, value, f.queryBodyText);
      const detectedColumns = detectSqlSelectColumns(value);
      const conversationExcludedColumns = withDefaultIdExcludedColumns(
        f.cardConfig.conversationExcludedColumns,
        detectedColumns,
      );
      return {
        ...f,
        sqlText: value,
        parameterRows,
        detectedColumns,
        cardConfig: { ...f.cardConfig, conversationExcludedColumns },
      };
    });
  }

  function updateEditQueryBodyText(value: string) {
    setEditDirty(true);
    setEditForm((f) => {
      const parameterRows = syncRowsForInput(f.parameterRows, f.sqlText, value);
      const detectedColumns = detectMongoQueryBodyColumns(value);
      const conversationExcludedColumns = withDefaultIdExcludedColumns(
        f.cardConfig.conversationExcludedColumns,
        detectedColumns,
      );
      return {
        ...f,
        queryBodyText: value,
        parameterRows,
        detectedColumns,
        cardConfig: { ...f.cardConfig, conversationExcludedColumns },
      };
    });
  }

  function updateAddParameterRow(index: number, patch: Partial<QueryTemplateParameterRow>) {
    setAddForm((f) => ({
      ...f,
      parameterRows: f.parameterRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function updateEditParameterRow(index: number, patch: Partial<QueryTemplateParameterRow>) {
    setEditDirty(true);
    setEditForm((f) => ({
      ...f,
      parameterRows: f.parameterRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function openParameterDialog(target: 'add' | 'edit') {
    setParameterDialogTarget(target);
    setParameterDialogPage(1);
    setParameterDialogOpen(true);
  }

  function parameterCheckbox(
    checked: boolean,
    onChange: (next: boolean) => void,
    disabled: boolean,
    label: string,
  ) {
    return (
      <label className="flex h-9 w-full cursor-pointer items-center justify-center rounded-md px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
        <input
          type="checkbox"
          checked={checked}
          className="peer sr-only"
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-label={label}
        />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      </label>
    );
  }

  function validateSqlTemplateForm(
    sqlText: string,
    name: string,
    description: string,
    excludeTemplateId?: string,
  ): string | null {
    if (!name || !description || !sqlText) return 'Name, description and SQL query are required.';
    if (isDuplicateTemplateName(name, allTemplates, excludeTemplateId))
      return 'A query template with this name already exists.';
    if (!sqlQueryEndsWithSemicolon(sqlText))
      return 'SQL query must end with a semicolon (;).';
    if (!isValidReadOnlyTemplateSql(sqlText)) return 'Only read-only SELECT or WITH SQL queries are allowed.';
    if (containsMultipleStatements(sqlText)) return 'Only one SQL query per template is allowed.';
    if (isDuplicateSql(sqlText, allTemplates, excludeTemplateId))
      return 'A template with the same SQL query already exists.';
    return null;
  }

  function validateMongoTemplateForm(
    queryBody: Record<string, unknown>,
    name: string,
    description: string,
    excludeTemplateId?: string,
  ): string | null {
    if (!name || !description) return 'Name and description are required.';
    if (isDuplicateTemplateName(name, allTemplates, excludeTemplateId))
      return 'A query template with this name already exists.';
    const structErr = validateMongoQueryTemplateBody(queryBody);
    if (structErr) return structErr;
    if (isDuplicateMongoQueryBody(queryBody, allTemplates, excludeTemplateId))
      return 'A template with the same query document already exists.';
    return null;
  }

  function openEdit(t: ProjectDatabaseConnectionQueryTemplate) {
    const seedRows = parameterRowsFromSchema(t.parameterSchema);
    const queryBodyText =
      t.queryKind === 'mongo_json' && t.queryBody ? JSON.stringify(t.queryBody, null, 2) : '';
    const parameterRows = syncRowsForInput(seedRows, t.sqlText, queryBodyText);
    const detectedColumns =
      t.queryKind === 'mongo_json'
        ? detectMongoQueryBodyColumns(queryBodyText)
        : detectSqlSelectColumns(t.sqlText);
    const cardConfigUi = uiStateFromCardConfig(t.cardConfig);
    const conversationExcludedColumns = withDefaultIdExcludedColumns(
      cardConfigUi.conversationExcludedColumns,
      detectedColumns,
    );
    const next: TemplateFormState = {
      name: t.name,
      description: t.description,
      sqlText: t.sqlText,
      queryBodyText,
      parameterRows,
      sortOrder: String(t.sortOrder),
      isActive: t.isActive,
      cardConfig: { ...cardConfigUi, conversationExcludedColumns },
      detectedColumns,
    };
    setEditTemplateId(t.id);
    setEditForm(next);
    setEditBaseline(next);
    setEditDirty(false);
    setEditOpen(true);
    setActiveRowMenuId(null);
  }

  function discardEdit() {
    setEditForm(editBaseline);
    setEditDirty(false);
    setEditOpen(false);
    setEditTemplateId(null);
  }

  async function submitAdd() {
    const name = addForm.name.trim();
    const description = addForm.description.trim();
    const rowErr = validateParameterRows(addForm.parameterRows);
    if (rowErr) {
      toast.error(rowErr);
      return;
    }
    const parameterSchema = parameterSchemaFromRows(addForm.parameterRows);
    const cardConfig = cardConfigFromUiState(addForm.cardConfig);
    if (isMongoDialect) {
      const parsed = parseMongoQueryBodyText(addForm.queryBodyText);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return;
      }
      const err = validateMongoTemplateForm(parsed.body, name, description);
      if (err) {
        toast.error(err);
        return;
      }
      setAddSubmitting(true);
      try {
        const res = await createTemplate({
          name,
          description,
          sqlText: '',
          queryBody: parsed.body,
          parameterSchema,
          cardConfig,
          isActive: addForm.isActive,
          sortOrder: Number(addForm.sortOrder || '0'),
        });
        if (res.ok) {
          toast.success('Template created.');
          setAddOpen(false);
          setAddForm(emptyForm(dialect));
        } else toast.error(res.message);
      } finally {
        setAddSubmitting(false);
      }
      return;
    }

    const sqlText = trimSqlText(addForm.sqlText);
    const error = validateSqlTemplateForm(sqlText, name, description);
    if (error) {
      toast.error(error);
      return;
    }
    setAddSubmitting(true);
    try {
      const res = await createTemplate({
        name,
        description,
        sqlText,
        parameterSchema,
        cardConfig,
        isActive: addForm.isActive,
        sortOrder: Number(addForm.sortOrder || '0'),
      });
      if (res.ok) {
        toast.success('Template created.');
        setAddOpen(false);
        setAddForm(emptyForm(dialect));
      } else toast.error(res.message);
    } finally {
      setAddSubmitting(false);
    }
  }

  async function submitEdit() {
    if (!editTemplateId) return;
    const name = editForm.name.trim();
    const description = editForm.description.trim();
    const rowErr = validateParameterRows(editForm.parameterRows);
    if (rowErr) {
      toast.error(rowErr);
      return;
    }
    const parameterSchema = parameterSchemaFromRows(editForm.parameterRows);
    const cardConfig = cardConfigFromUiState(editForm.cardConfig);
    if (isMongoDialect) {
      const parsed = parseMongoQueryBodyText(editForm.queryBodyText);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return;
      }
      const err = validateMongoTemplateForm(parsed.body, name, description, editTemplateId);
      if (err) {
        toast.error(err);
        return;
      }
      setEditSubmitting(true);
      try {
        const res = await updateTemplate(editTemplateId, {
          name,
          description,
          sqlText: '',
          queryBody: parsed.body,
          parameterSchema,
          cardConfig,
          isActive: editForm.isActive,
          sortOrder: Number(editForm.sortOrder || '0'),
        });
        if (res.ok) {
          toast.success('Template updated.');
          setEditDirty(false);
          setEditOpen(false);
          setEditTemplateId(null);
        } else toast.error(res.message);
      } finally {
        setEditSubmitting(false);
      }
      return;
    }

    const sqlText = trimSqlText(editForm.sqlText);
    const error = validateSqlTemplateForm(sqlText, name, description, editTemplateId);
    if (error) {
      toast.error(error);
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await updateTemplate(editTemplateId, {
        name,
        description,
        sqlText,
        parameterSchema,
        cardConfig,
        isActive: editForm.isActive,
        sortOrder: Number(editForm.sortOrder || '0'),
      });
      if (res.ok) {
        toast.success('Template updated.');
        setEditOpen(false);
        setEditTemplateId(null);
      } else toast.error(res.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await removeTemplate(deleteTarget.id);
      if (res.ok) {
        toast.success('Template deleted.');
        setDeleteOpen(false);
        setDeleteTarget(null);
      } else toast.error(res.message);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function openCarouselDialog(target: 'add' | 'edit') {
    setCarouselDialogTarget(target);
    setCarouselDialogOpen(true);
  }

  function openColumnsDialog(target: 'add' | 'edit') {
    setColumnsDialogTarget(target);
    setColumnsDialogOpen(true);
  }

  const parameterRows = parameterDialogTarget === 'add' ? addForm.parameterRows : editForm.parameterRows;
  const parameterDialogSubmitting = parameterDialogTarget === 'add' ? addSubmitting : editSubmitting;
  const updateParameterRow =
    parameterDialogTarget === 'add' ? updateAddParameterRow : updateEditParameterRow;
  const parameterTotal = parameterRows.length;
  const parameterTotalPages = Math.max(1, Math.ceil(parameterTotal / PARAMETER_DIALOG_PAGE_SIZE));
  const parameterPageStart = (parameterDialogPage - 1) * PARAMETER_DIALOG_PAGE_SIZE;
  const parameterRowsPage = parameterRows.slice(parameterPageStart, parameterPageStart + PARAMETER_DIALOG_PAGE_SIZE);

  useEffect(() => {
    if (parameterDialogPage > parameterTotalPages) setParameterDialogPage(parameterTotalPages);
  }, [parameterDialogPage, parameterTotalPages]);

  const titleAccessory =
    connection != null ? (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Connection details"
          >
            <Info className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-[200] max-w-sm border-neutral-200 bg-white p-3 text-sm text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          <ul className="list-disc list-outside space-y-0 pl-4 text-sm leading-tight marker:text-neutral-400 dark:marker:text-neutral-500 [&>li]:py-0">
            <li>
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">Agent: </span>
              <span className="text-neutral-700 dark:text-neutral-200">
                {connection.agentDisplayName?.trim() || '—'}
              </span>
            </li>
            <li>
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">Database: </span>
              <span className="text-neutral-700 dark:text-neutral-200">
                {connection.databaseProductName?.trim() || '—'}
              </span>
            </li>
            <li>
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">Type: </span>
              <span className="text-neutral-700 dark:text-neutral-200">
                {connection.databaseTypeName?.trim() || '—'}
              </span>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
    ) : null;

  return (
    <ProjectTabShell
      title={title}
      titleAccessory={titleAccessory}
      titleAccessoryGapClassName="gap-1"
      fullWidthTabContent
      matchOrganizationMainPadding
    >
      <div className="flex flex-col gap-5">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                isMongoDialect
                  ? 'Search by name, description, or query document'
                  : 'Search by name, description, or SQL'
              }
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search query templates"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ProjectQueryTemplatesStatusFilter)}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[12rem] sm:shrink-0"
            >
              <SelectValue placeholder="All queries" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              <SelectItem value="all">All queries</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={listLoading}
            onClick={() => void refresh()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh query templates"
          >
            <RefreshCw className={cn('h-4 w-4', listLoading ? 'animate-spin' : '')} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setAddForm(emptyForm(dialect));
              setAddOpen(true);
            }}
            className={cn(primaryCtaToolbarButtonClassName, 'inline-flex shrink-0 items-center gap-2')}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add template
          </button>
        </div>

        <div
          className={cn(
            'overflow-x-auto rounded-xl border border-neutral-200 bg-white transition-opacity dark:border-neutral-800 dark:bg-neutral-900',
            fetching && !initialLoading ? 'opacity-80' : '',
          )}
        >
          <div className="min-w-[56rem]">
            <div className={templateTableGridClassName}>
              <div>Priority</div>
              <div>Name</div>
              <div>Description</div>
              <div>{isMongoDialect ? 'Query document' : 'SQL query'}</div>
              <div>Status</div>
              <div className="text-right sm:text-center">Action</div>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {initialLoading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Loading…
                </div>
              ) : templates.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
                  No query templates match your filters.
                </p>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className={templateRowGridClassName}>
                        <div className="tabular-nums text-neutral-700 dark:text-neutral-300">
                          {template.sortOrder}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                            {template.name}
                          </p>
                        </div>
                        <div
                          className="min-w-0 truncate text-neutral-700 dark:text-neutral-200"
                          title={template.description}
                        >
                          {template.description}
                        </div>
                        <div
                          className="min-w-0 max-w-full truncate font-mono text-xs text-neutral-600 dark:text-neutral-400"
                          title={queryTemplatePreviewForTable(template)}
                        >
                          {queryTemplatePreviewForTable(template)}
                        </div>
                        <div>
                          <span className={templateStatusPillClassName(template.isActive)}>
                            {template.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="flex justify-end sm:justify-center">
                          <Popover
                            open={activeRowMenuId === template.id}
                            onOpenChange={(o) => setActiveRowMenuId(o ? template.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                aria-label="Template actions"
                              >
                                <EllipsisVertical className="h-4 w-4" aria-hidden />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              side="bottom"
                              sideOffset={4}
                              className="w-48 min-w-[10.5rem] p-1 font-dm-sans shadow-lg z-[200]"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                            >
                              <button
                                type="button"
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() => openEdit(template)}
                              >
                                <Pencil className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                                onClick={() => {
                                  setDeleteTarget(template);
                                  setDeleteOpen(true);
                                  setActiveRowMenuId(null);
                                }}
                              >
                                <Trash2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Delete
                              </button>
                            </PopoverContent>
                          </Popover>
                        </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {!initialLoading && total > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing {(page - 1) * PROJECT_DATABASE_PAGE_SIZE + 1}-
              {Math.min(page * PROJECT_DATABASE_PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Previous
              </button>
              <span className="text-xs text-neutral-600 dark:text-neutral-300">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Add template dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !addSubmitting) {
            setAddOpen(false);
            setAddForm(emptyForm(dialect));
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Add query template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                NAME
              </span>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                disabled={addSubmitting}
                placeholder="e.g. Fetch active orders"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DESCRIPTION
              </span>
              <textarea
                rows={2}
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                disabled={addSubmitting}
                placeholder="e.g. Retrieves all orders with status active"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </div>
            {isMongoDialect ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                  QUERY DOCUMENT (JSON)
                </span>
                <textarea
                  rows={10}
                  value={addForm.queryBodyText}
                  onChange={(e) => updateAddQueryBodyText(e.target.value)}
                  disabled={addSubmitting}
                  placeholder={MONGO_QUERY_BODY_DEFAULT}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                />
                <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                  Read-only templates: <span className="font-mono">find</span> or{' '}
                  <span className="font-mono">aggregate</span> with a non-empty collection name.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                  SQL QUERY
                </span>
                <textarea
                  rows={6}
                  value={addForm.sqlText}
                  onChange={(e) => updateAddSqlText(e.target.value)}
                  disabled={addSubmitting}
                  placeholder="e.g. SELECT * FROM orders WHERE status = 'active';"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                PARAMETERS
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  {addForm.parameterRows.length > 0
                    ? `${addForm.parameterRows.length} parameter(s) configured`
                    : isMongoDialect
                      ? 'No parameters detected. Use {{parameter_name}} in QUERY DOCUMENT.'
                      : 'No parameters detected. Use :parameter_name in SQL QUERY.'}
                </p>
                <button
                  type="button"
                  onClick={() => openParameterDialog('add')}
                  disabled={addSubmitting || addForm.parameterRows.length === 0}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DETECTED COLUMNS
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  {addForm.detectedColumns.length > 0
                    ? `${addForm.detectedColumns.length} column(s) detected`
                    : isMongoDialect
                      ? 'No columns detected. Use projection in find or $project/$group in aggregate.'
                      : 'No columns detected. Write a SELECT query with explicit columns.'}
                </p>
                <button
                  type="button"
                  onClick={() => openColumnsDialog('add')}
                  disabled={addSubmitting || addForm.detectedColumns.length === 0}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                CAROUSEL CARD
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <span className={addCarouselStatusTag.className}>{addCarouselStatusTag.label}</span>
                <button
                  type="button"
                  onClick={() => openCarouselDialog('add')}
                  disabled={addSubmitting}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                PRIORITY
              </span>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={addForm.sortOrder}
                  onChange={(e) => setAddForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  disabled={addSubmitting}
                  placeholder="0"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none [-moz-appearance:textfield] [appearance:textfield] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={addForm.isActive}
                    className="peer sr-only"
                    onChange={(e) => setAddForm((f) => ({ ...f, isActive: e.target.checked }))}
                    disabled={addSubmitting}
                  />
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>Active</span>
                </label>
              </div>
              <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                Lower numbers have higher priority.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={addSubmitting}
              onClick={() => {
                setAddOpen(false);
                setAddForm(emptyForm(dialect));
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={addSubmitting}
              onClick={() => void submitAdd()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 min-w-[9rem] items-center justify-center px-4')}
            >
              {addSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                'Create template'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit template dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open && !editSubmitting) discardEdit();
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Edit query template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                NAME
              </span>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => {
                  setEditDirty(true);
                  setEditForm((f) => ({ ...f, name: e.target.value }));
                }}
                disabled={editSubmitting}
                placeholder="e.g. Fetch active orders"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DESCRIPTION
              </span>
              <textarea
                rows={2}
                value={editForm.description}
                onChange={(e) => {
                  setEditDirty(true);
                  setEditForm((f) => ({ ...f, description: e.target.value }));
                }}
                disabled={editSubmitting}
                placeholder="e.g. Retrieves all orders with status active"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </div>
            {isMongoDialect ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                  QUERY DOCUMENT (JSON)
                </span>
                <textarea
                  rows={10}
                  value={editForm.queryBodyText}
                  onChange={(e) => updateEditQueryBodyText(e.target.value)}
                  disabled={editSubmitting}
                  placeholder={MONGO_QUERY_BODY_DEFAULT}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                />
                <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                  Read-only templates: <span className="font-mono">find</span> or{' '}
                  <span className="font-mono">aggregate</span> with a non-empty collection name.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                  SQL QUERY
                </span>
                <textarea
                  rows={6}
                  value={editForm.sqlText}
                  onChange={(e) => updateEditSqlText(e.target.value)}
                  disabled={editSubmitting}
                  placeholder="e.g. SELECT * FROM orders WHERE status = 'active';"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                PARAMETERS
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  {editForm.parameterRows.length > 0
                    ? `${editForm.parameterRows.length} parameter(s) configured`
                    : isMongoDialect
                      ? 'No parameters detected. Use {{parameter_name}} in QUERY DOCUMENT.'
                      : 'No parameters detected. Use :parameter_name in SQL QUERY.'}
                </p>
                <button
                  type="button"
                  onClick={() => openParameterDialog('edit')}
                  disabled={editSubmitting || editForm.parameterRows.length === 0}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DETECTED COLUMNS
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <p className="text-xs text-neutral-600 dark:text-neutral-300">
                  {editForm.detectedColumns.length > 0
                    ? `${editForm.detectedColumns.length} column(s) detected`
                    : isMongoDialect
                      ? 'No columns detected. Use projection in find or $project/$group in aggregate.'
                      : 'No columns detected. Write a SELECT query with explicit columns.'}
                </p>
                <button
                  type="button"
                  onClick={() => openColumnsDialog('edit')}
                  disabled={editSubmitting || editForm.detectedColumns.length === 0}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                CAROUSEL CARD
              </span>
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <span className={editCarouselStatusTag.className}>{editCarouselStatusTag.label}</span>
                <button
                  type="button"
                  onClick={() => openCarouselDialog('edit')}
                  disabled={editSubmitting}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                PRIORITY
              </span>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={editForm.sortOrder}
                  onChange={(e) => {
                    setEditDirty(true);
                    setEditForm((f) => ({ ...f, sortOrder: e.target.value }));
                  }}
                  disabled={editSubmitting}
                  placeholder="0"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none [-moz-appearance:textfield] [appearance:textfield] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    className="peer sr-only"
                    onChange={(e) => {
                      setEditDirty(true);
                      setEditForm((f) => ({ ...f, isActive: e.target.checked }));
                    }}
                    disabled={editSubmitting}
                  />
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>Active</span>
                </label>
              </div>
              <p className="text-xs leading-snug text-neutral-500 dark:text-neutral-400">
                Lower numbers have higher priority.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-between">
            <button
              type="button"
              disabled={editSubmitting || !editHasChanges}
              onClick={() => discardEdit()}
              className={cn(
                'h-10 cursor-pointer rounded-lg border px-4 text-sm font-medium transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800',
                editHasChanges
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60'
                  : 'border-neutral-300 text-neutral-700',
              )}
            >
              Discard
            </button>
            <button
              type="button"
              disabled={editSubmitting || !editHasChanges}
              onClick={() => void submitEdit()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 min-w-[9rem] items-center justify-center px-4')}
            >
              {editSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parameter configuration dialog */}
      <Dialog
        open={parameterDialogOpen}
        onOpenChange={(open) => {
          if (!open) setParameterDialogOpen(false);
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-6xl"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Template parameters</DialogTitle>
          </DialogHeader>
          {parameterRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
              {isMongoDialect
                ? 'No parameters detected. Use {{parameter_name}} in QUERY DOCUMENT.'
                : 'No parameters detected. Use :parameter_name in SQL QUERY.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className={parameterTableGridClassName}>
                <div>NAME</div>
                <div>TYPE</div>
                <div>DEFAULT</div>
                <div>ENUM</div>
                <div>REQUIRED</div>
                <div>NULLABLE</div>
                <div>DESCRIPTION</div>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {parameterRowsPage.map((row, index) => {
                  const absoluteIndex = parameterPageStart + index;
                  return (
                  <div key={`param-row-${row.name}-${index}`} className={parameterRowGridClassName}>
                    <div className="font-mono text-neutral-800 dark:text-neutral-100">{row.name}</div>
                    <div>
                      <Select
                        value={row.type}
                        onValueChange={(v) => updateParameterRow(absoluteIndex, { type: v as QueryTemplateParameterType })}
                        disabled={parameterDialogSubmitting}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-9 min-h-9 w-full cursor-pointer py-0 text-sm"
                        >
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="max-h-48 overflow-y-auto">
                          {QUERY_TEMPLATE_PARAMETER_TYPES.map((typeName) => (
                            <SelectItem key={typeName} value={typeName}>
                              {typeName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={row.defaultValueText}
                        onChange={(e) => updateParameterRow(absoluteIndex, { defaultValueText: e.target.value })}
                        disabled={parameterDialogSubmitting}
                        placeholder="Optional"
                        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={row.enumValuesText}
                        onChange={(e) => updateParameterRow(absoluteIndex, { enumValuesText: e.target.value })}
                        disabled={parameterDialogSubmitting}
                        placeholder='Optional (e.g. ["A","B"])'
                        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                      />
                    </div>
                    <div>{parameterCheckbox(row.required, (next) => updateParameterRow(absoluteIndex, { required: next }), parameterDialogSubmitting, `required-${row.name}`)}</div>
                    <div>{parameterCheckbox(row.nullable, (next) => updateParameterRow(absoluteIndex, { nullable: next }), parameterDialogSubmitting, `nullable-${row.name}`)}</div>
                    <div>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateParameterRow(absoluteIndex, { description: e.target.value })}
                        disabled={parameterDialogSubmitting}
                        placeholder="Optional"
                        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          {parameterTotal > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Showing {parameterPageStart + 1}-{Math.min(parameterPageStart + PARAMETER_DIALOG_PAGE_SIZE, parameterTotal)} of {parameterTotal}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={parameterDialogPage <= 1}
                  onClick={() => setParameterDialogPage((p) => Math.max(1, p - 1))}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Previous
                </button>
                <span className="text-xs text-neutral-600 dark:text-neutral-300">
                  Page {parameterDialogPage} of {parameterTotalPages}
                </span>
                <button
                  type="button"
                  disabled={parameterDialogPage >= parameterTotalPages}
                  onClick={() => setParameterDialogPage((p) => p + 1)}
                  className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setParameterDialogOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleteSubmitting) {
            setDeleteOpen(false);
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Delete query template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Deleting <span className="font-semibold">{deleteTarget?.name ?? 'this template'}</span> is permanent and
            may impact agent performance for this database connection.
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteSubmitting}
              onClick={() => void confirmDelete()}
              className="h-10 cursor-pointer rounded-lg border border-red-300 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-800 dark:hover:bg-red-700"
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Carousel card configuration dialog */}
      <Dialog
        open={carouselDialogOpen}
        onOpenChange={(open) => {
          if (!open) setCarouselDialogOpen(false);
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Carousel card configuration</DialogTitle>
          </DialogHeader>
          {(() => {
            const isEdit = carouselDialogTarget === 'edit';
            const form = isEdit ? editForm : addForm;
            const setForm = isEdit ? setEditForm : setAddForm;
            const disabled = isEdit ? editSubmitting : addSubmitting;
            const markDirty = isEdit ? () => setEditDirty(true) : undefined;
            const cols = form.detectedColumns;
            const cc = form.cardConfig;
            const colOptions = cols.length > 0 ? cols : [];
            const detailColumnOptions = colOptions.filter((c) => c !== cc.titleColumn && c !== cc.imageColumn);
            const pathSegmentRows =
              cc.linkPathSegments.length > 0 ? cc.linkPathSegments : [{ column: '' }];
            const queryParamRows =
              cc.linkQueryParams.length > 0 ? cc.linkQueryParams : [{ name: '', column: '' }];
            const carouselFieldsDisabled = disabled || !cc.carouselEnabled;
            const builtLinkPreview = buildCardLinkPreviewUrl({
              projectDomain: connection?.projectDomain ?? null,
              basePath: cc.linkBasePath,
              pathSegments: cc.linkPathSegments,
              queryParams: cc.linkQueryParams,
            });
            const builtImagePreview = buildCardImagePreviewUrl({
              publicBucketUrl: cc.publicBucketUrl,
              imageColumn: cc.imageColumn,
            });
            const update = (patch: Partial<CardConfigFormState>) => {
              if (markDirty) markDirty();
              setForm((f) => ({ ...f, cardConfig: { ...f.cardConfig, ...patch } }));
            };

            return (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
                    <input
                      type="checkbox"
                      checked={cc.carouselEnabled}
                      className="peer sr-only"
                      onChange={(e) => update({ carouselEnabled: e.target.checked })}
                      disabled={disabled}
                    />
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span>Enable carousel</span>
                  </label>
                </div>
                <div className={cn('flex flex-col gap-4 transition-opacity', !cc.carouselEnabled && 'opacity-60')}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                        TITLE COLUMN *
                      </span>
                      {colOptions.length > 0 ? (
                        <Select value={cc.titleColumn} onValueChange={(v) => update({ titleColumn: v })} disabled={carouselFieldsDisabled}>
                          <SelectTrigger className="h-10 min-h-10 w-full cursor-pointer py-0 text-sm">
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="max-h-48 overflow-y-auto">
                            {colOptions.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input type="text" value={cc.titleColumn} onChange={(e) => update({ titleColumn: e.target.value })} disabled={carouselFieldsDisabled} placeholder="e.g. name" className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                        IMAGE COLUMN
                      </span>
                      {colOptions.length > 0 ? (
                        <Select value={cc.imageColumn || '__none__'} onValueChange={(v) => update({ imageColumn: v === '__none__' ? '' : v })} disabled={carouselFieldsDisabled}>
                          <SelectTrigger className="h-10 min-h-10 w-full cursor-pointer py-0 text-sm">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4} className="max-h-48 overflow-y-auto">
                            <SelectItem value="__none__">None</SelectItem>
                            {colOptions.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <input type="text" value={cc.imageColumn} onChange={(e) => update({ imageColumn: e.target.value })} disabled={carouselFieldsDisabled} placeholder="e.g. image_url (optional)" className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                      )}
                    </div>
                      {colOptions.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                            DETAIL COLUMNS
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                disabled={carouselFieldsDisabled}
                                className="font-dm-sans border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left text-sm whitespace-nowrap text-neutral-900 shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                              >
                                <span className="truncate">
                                  {cc.detailColumns.length > 0
                                    ? `${cc.detailColumns.length} column(s) selected`
                                    : 'Select columns'}
                                </span>
                                <ChevronDown className="size-4 opacity-50" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={6}
                              className="font-dm-sans z-[100] w-[var(--radix-popover-trigger-width)] min-w-[14rem] rounded-xl border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                            >
                              <div
                                className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1 overscroll-contain"
                                onWheel={(e) => e.stopPropagation()}
                              >
                                {detailColumnOptions.length > 0 ? (
                                  detailColumnOptions.map((c) => {
                                    const selected = cc.detailColumns.includes(c);
                                    return (
                                      <label
                                        key={c}
                                        className="font-dm-sans focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 pl-2 text-sm text-neutral-900 outline-hidden select-none hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          disabled={carouselFieldsDisabled}
                                          className="peer sr-only"
                                          onChange={() => {
                                            if (markDirty) markDirty();
                                            setForm((f) => {
                                              const prev = f.cardConfig.detailColumns;
                                              const next = selected
                                                ? prev.filter((x) => x !== c)
                                                : [...prev, c];
                                              return { ...f, cardConfig: { ...f.cardConfig, detailColumns: next } };
                                            });
                                          }}
                                        />
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-neutral-400 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-500 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                                          <Check className="h-3 w-3" aria-hidden />
                                        </span>
                                        <span>{c}</span>
                                      </label>
                                    );
                                  })
                                ) : (
                                  <p className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400">
                                    No columns available.
                                  </p>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                            DETAIL COLUMNS
                          </span>
                          <input type="text" value={cc.detailColumns.join(', ')} onChange={(e) => update({ detailColumns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} disabled={carouselFieldsDisabled} placeholder="e.g. price, city (comma separated)" className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                        </div>
                      )}

                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">MAX CARDS</span>
                      <input type="number" min={1} max={50} step={1} value={cc.maxCards} onChange={(e) => update({ maxCards: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })} disabled={carouselFieldsDisabled} className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none [-moz-appearance:textfield] [appearance:textfield] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">FULL IMAGE URL</span>
                      <div className="relative">
                        <input
                          type="text"
                          value={builtImagePreview}
                          readOnly
                          placeholder="Generated image URL preview will appear here"
                          className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-20 font-mono text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                        />
                        <button
                          type="button"
                          disabled={!builtImagePreview}
                          onClick={async () => {
                            if (!builtImagePreview) return;
                            try {
                              await navigator.clipboard.writeText(builtImagePreview);
                              toast.success('Image URL copied.');
                            } catch {
                              toast.error('Failed to copy image URL.');
                            }
                          }}
                          className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 cursor-pointer rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                          aria-label="Copy image URL"
                          title="Copy image URL"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">PUBLIC BUCKET URL</span>
                      <input
                        type="text"
                        value={cc.publicBucketUrl}
                        onChange={(e) => update({ publicBucketUrl: e.target.value })}
                        disabled={carouselFieldsDisabled}
                        placeholder="e.g. https://<project>.supabase.co/storage/v1/object/public/property-images"
                        className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">FULL URL</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={builtLinkPreview}
                        readOnly
                        placeholder="Generated URL preview will appear here"
                        className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-20 font-mono text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                      />
                      <button
                        type="button"
                        disabled={!builtLinkPreview}
                        onClick={async () => {
                          if (!builtLinkPreview) return;
                          try {
                            await navigator.clipboard.writeText(builtLinkPreview);
                            toast.success('Path copied.');
                          } catch {
                            toast.error('Failed to copy path.');
                          }
                        }}
                        className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 cursor-pointer rounded-md border border-neutral-300 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        aria-label="Copy URL"
                        title="Copy URL"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">BASE PATH</span>
                      <input type="text" value={cc.linkBasePath} onChange={(e) => update({ linkBasePath: e.target.value })} disabled={carouselFieldsDisabled} placeholder="e.g. /property/details" className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">PATH SEGMENTS (appended to base path)</span>
                      </div>
                      {pathSegmentRows.map((seg, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {colOptions.length > 0 ? (
                            <Select value={seg.column || '__none__'} onValueChange={(v) => { if (markDirty) markDirty(); setForm((f) => { const segs = [...f.cardConfig.linkPathSegments]; segs[i] = { column: v === '__none__' ? '' : v }; return { ...f, cardConfig: { ...f.cardConfig, linkPathSegments: segs } }; }); }} disabled={carouselFieldsDisabled}>
                              <SelectTrigger className="h-10 min-h-10 flex-1 cursor-pointer py-0 text-sm"><SelectValue placeholder="Select column" /></SelectTrigger>
                              <SelectContent position="popper" sideOffset={4} className="max-h-48 overflow-y-auto">
                                <SelectItem value="__none__">Select column</SelectItem>
                                {colOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input type="text" value={seg.column} onChange={(e) => { if (markDirty) markDirty(); setForm((f) => { const segs = [...f.cardConfig.linkPathSegments]; segs[i] = { column: e.target.value }; return { ...f, cardConfig: { ...f.cardConfig, linkPathSegments: segs } }; }); }} disabled={carouselFieldsDisabled} placeholder="Column name" className="h-10 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50" />
                          )}
                          <button type="button" disabled={carouselFieldsDisabled || pathSegmentRows.length <= 1} onClick={() => { if (markDirty) markDirty(); setForm((f) => { const next = f.cardConfig.linkPathSegments.filter((_, idx) => idx !== i); return { ...f, cardConfig: { ...f.cardConfig, linkPathSegments: next.length > 0 ? next : [{ column: '' }] } }; }); }} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50" aria-label="Remove path segment" title="Remove path segment"><Trash2 className="h-4 w-4" aria-hidden /></button>
                          {i === pathSegmentRows.length - 1 ? (
                            <button type="button" disabled={carouselFieldsDisabled} onClick={() => { if (markDirty) markDirty(); setForm((f) => { const base = f.cardConfig.linkPathSegments.length > 0 ? f.cardConfig.linkPathSegments : [{ column: '' }]; return { ...f, cardConfig: { ...f.cardConfig, linkPathSegments: [...base, { column: '' }] } }; }); }} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800" aria-label="Add path segment" title="Add path segment"><Plus className="h-4 w-4" aria-hidden /></button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">QUERY PARAMETERS</span>
                      </div>
                      {queryParamRows.map((qp, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="text" value={qp.name} onChange={(e) => { if (markDirty) markDirty(); setForm((f) => { const params = [...f.cardConfig.linkQueryParams]; params[i] = { ...params[i], name: e.target.value }; return { ...f, cardConfig: { ...f.cardConfig, linkQueryParams: params } }; }); }} disabled={carouselFieldsDisabled} placeholder="Param name" className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50" />
                          {colOptions.length > 0 ? (
                            <Select value={qp.column || '__none__'} onValueChange={(v) => { if (markDirty) markDirty(); setForm((f) => { const params = [...f.cardConfig.linkQueryParams]; params[i] = { ...params[i], column: v === '__none__' ? '' : v }; return { ...f, cardConfig: { ...f.cardConfig, linkQueryParams: params } }; }); }} disabled={carouselFieldsDisabled}>
                              <SelectTrigger className="h-10 min-h-10 min-w-0 flex-1 cursor-pointer py-0 text-sm"><SelectValue placeholder="Select column" /></SelectTrigger>
                              <SelectContent position="popper" sideOffset={4} className="max-h-48 overflow-y-auto">
                                <SelectItem value="__none__">Select column</SelectItem>
                                {colOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input type="text" value={qp.column} onChange={(e) => { if (markDirty) markDirty(); setForm((f) => { const params = [...f.cardConfig.linkQueryParams]; params[i] = { ...params[i], column: e.target.value }; return { ...f, cardConfig: { ...f.cardConfig, linkQueryParams: params } }; }); }} disabled={carouselFieldsDisabled} placeholder="Column name" className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50" />
                          )}
                          <button type="button" disabled={carouselFieldsDisabled || queryParamRows.length <= 1} onClick={() => { if (markDirty) markDirty(); setForm((f) => { const next = f.cardConfig.linkQueryParams.filter((_, idx) => idx !== i); return { ...f, cardConfig: { ...f.cardConfig, linkQueryParams: next.length > 0 ? next : [{ name: '', column: '' }] } }; }); }} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50" aria-label="Remove query parameter" title="Remove query parameter"><Trash2 className="h-4 w-4" aria-hidden /></button>
                          {i === queryParamRows.length - 1 ? (
                            <button type="button" disabled={carouselFieldsDisabled} onClick={() => { if (markDirty) markDirty(); setForm((f) => { const base = f.cardConfig.linkQueryParams.length > 0 ? f.cardConfig.linkQueryParams : [{ name: '', column: '' }]; return { ...f, cardConfig: { ...f.cardConfig, linkQueryParams: [...base, { name: '', column: '' }] } }; }); }} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800" aria-label="Add query parameter" title="Add query parameter"><Plus className="h-4 w-4" aria-hidden /></button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            );
          })()}
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setCarouselDialogOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detected columns – exclude from LLM context dialog */}
      <Dialog
        open={columnsDialogOpen}
        onOpenChange={(open) => {
          if (!open) setColumnsDialogOpen(false);
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Detected columns</DialogTitle>
          </DialogHeader>
          {(() => {
            const isEdit = columnsDialogTarget === 'edit';
            const form = isEdit ? editForm : addForm;
            const setForm = isEdit ? setEditForm : setAddForm;
            const disabled = isEdit ? editSubmitting : addSubmitting;
            const markDirty = isEdit ? () => setEditDirty(true) : undefined;
            const cols = form.detectedColumns;
            const excluded = form.cardConfig.conversationExcludedColumns;

            if (cols.length === 0) {
              return (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {isMongoDialect
                    ? 'No columns detected. Use projection in find or $project/$group in aggregate.'
                    : 'No columns detected. Write a SELECT query with explicit columns first.'}
                </p>
              );
            }

            return (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <div className={detectedColumnsTableGridClassName}>
                  <div>COLUMN NAME</div>
                  <div className="text-center">EXCLUDE</div>
                </div>
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {cols.map((col) => {
                    const isExcluded = excluded.includes(col);
                    return (
                      <div key={col} className={detectedColumnsRowGridClassName}>
                        <div className="font-mono text-neutral-800 dark:text-neutral-100">{col}</div>
                        <div className="flex justify-center">
                          <label className="flex h-8 w-full cursor-pointer items-center justify-center rounded-md px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              className="peer sr-only"
                              onChange={(e) => {
                                const next = e.target.checked;
                                if (markDirty) markDirty();
                                setForm((f) => {
                                  const prev = f.cardConfig.conversationExcludedColumns;
                                  const uniqueNext = next
                                    ? Array.from(new Set([...prev, col]))
                                    : prev.filter((x) => x !== col);
                                  return {
                                    ...f,
                                    cardConfig: { ...f.cardConfig, conversationExcludedColumns: uniqueNext },
                                  };
                                });
                              }}
                              disabled={disabled}
                              aria-label={`exclude-${col}`}
                            />
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-red-700 peer-checked:bg-red-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-red-600 dark:peer-checked:bg-red-600">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Checked columns will be excluded from the LLM context only when carousel card is disabled.
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setColumnsDialogOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectTabShell>
  );
}
