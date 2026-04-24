/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  EllipsisVertical,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  Link2,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  KeyRound,
  SlidersHorizontal,
  Trash2,
  Unplug,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import {
  databaseSchemaStatusPillClassNameCn,
  formatDatabaseSchemaStatusLabel,
} from '@/lib/project-database/project-database-display';
import {
  checkProjectDatabaseConnectionViaApi,
  checkProjectDatabaseUploadViaApi,
  createProjectDatabaseConnectionViaApi,
  deleteProjectDatabaseConnectionViaApi,
  deleteProjectDatabaseSchemaViaApi,
  downloadProjectDatabaseSchemaZipViaApi,
  fetchProjectDatabaseConnectionCredentialsViaApi,
  fetchProjectDatabaseLookupsViaApi,
  renameProjectDatabaseSchemaViaApi,
  syncProjectDatabaseConnectionSchemaViaApi,
  updateProjectDatabaseConnectionCredentialsViaApi,
  updateProjectDatabaseConnectionStatusViaApi,
  updateProjectDatabaseSchemaDataFileViaApi,
  updateProjectDatabaseSchemaFilesViaApi,
  uploadProjectDatabaseViaApi,
} from '@/lib/project-database/project-database-api-client';
import { validateConnectDatabaseForm } from '@/lib/project-database/project-database-connect-form';
import type { ProjectDatabaseSchemaListItem } from '@/lib/project-database/project-database-types';
import { formatBytes } from '@/lib/storage/storage-format';
import {
  PROJECT_DATABASE_PAGE_SIZE,
  useProjectDatabasePage,
} from '@/lib/project-database/project-database-page-logic';
import {
  primaryCtaDialogButtonClassName,
  primaryCtaToolbarButtonClassName,
} from '@/lib/ui/primary-cta-button';
import { ProjectDatabaseQueryModeDialog } from '@/components/project-database/project-database-query-mode-dialog';
import { cn } from '@/lib/utils';

type ProjectDatabaseViewProps = {
  projectId: string;
};

const databaseTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(8rem,1.1fr)_minmax(6.5rem,0.85fr)_minmax(6rem,0.75fr)_minmax(6rem,0.75fr)_minmax(4.5rem,0.55fr)_minmax(4rem,0.5fr)_minmax(7rem,0.85fr)_minmax(2.25rem,0.35fr)] sm:gap-2';

const databaseRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(8rem,1.1fr)_minmax(6.5rem,0.85fr)_minmax(6rem,0.75fr)_minmax(6rem,0.75fr)_minmax(4.5rem,0.55fr)_minmax(4rem,0.5fr)_minmax(7rem,0.85fr)_minmax(2.25rem,0.35fr)] sm:gap-2 sm:items-center';

function extLowerNoDot(fileName: string): string {
  const raw = String(fileName ?? '').trim();
  const idx = raw.lastIndexOf('.');
  if (idx < 0) return '';
  return raw.slice(idx + 1).toLowerCase();
}

export function ProjectDatabaseView({ projectId }: ProjectDatabaseViewProps) {
  const {
    schemas,
    total,
    totalInProject,
    page,
    setPage,
    totalPages,
    loadError,
    loading,
    searchInput,
    setSearchInput,
    onRefresh,
    databaseTypes,
    databases,
    allowedExtensions,
    databaseExportLayouts,
    uploadAgentOptions,
    loadLookups,
  } = useProjectDatabasePage(projectId);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadAgentDialogOpen, setUploadAgentDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [draftDatabaseTypeId, setDraftDatabaseTypeId] = useState('');
  const [draftDatabaseId, setDraftDatabaseId] = useState('');
  const [draftDatabaseName, setDraftDatabaseName] = useState('');
  const [draftDatabaseExportLayoutId, setDraftDatabaseExportLayoutId] = useState('');
  const [draftSchemaFile, setDraftSchemaFile] = useState<File | null>(null);
  const [draftDataFile, setDraftDataFile] = useState<File | null>(null);
  const [selectedUploadAgentIds, setSelectedUploadAgentIds] = useState<string[]>([]);
  const [uploadConflictOpen, setUploadConflictOpen] = useState(false);
  const [uploadConflictAgentNames, setUploadConflictAgentNames] = useState<string[]>([]);

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectSaving, setConnectSaving] = useState(false);
  const [connectAgentDialogOpen, setConnectAgentDialogOpen] = useState(false);
  const [connectDraftTypeId, setConnectDraftTypeId] = useState('');
  const [connectDraftDbId, setConnectDraftDbId] = useState('');
  const [connectDisplayName, setConnectDisplayName] = useState('');
  const [connectHost, setConnectHost] = useState('');
  const [connectPort, setConnectPort] = useState('3306');
  const [connectDbName, setConnectDbName] = useState('');
  const [connectUsername, setConnectUsername] = useState('');
  const [connectPassword, setConnectPassword] = useState('');
  const [connectPasswordVisible, setConnectPasswordVisible] = useState(false);
  const [connectSslMode, setConnectSslMode] = useState('required');
  const [connectSslCaPem, setConnectSslCaPem] = useState('');
  const [connectMongoUseSrv, setConnectMongoUseSrv] = useState(false);
  const [connectSelectedAgentIds, setConnectSelectedAgentIds] = useState<string[]>([]);
  const [connectConflictOpen, setConnectConflictOpen] = useState(false);
  const [connectConflictAgentNames, setConnectConflictAgentNames] = useState<string[]>([]);
  const [reconnectPasswordOpen, setReconnectPasswordOpen] = useState(false);
  const [reconnectPassword, setReconnectPassword] = useState('');
  const [reconnectPendingPayload, setReconnectPendingPayload] = useState<{
    databaseTypeId: string;
    databaseId: string;
    displayName: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    sslMode: string;
    sslCaPem?: string | null;
    mongoUseSrv?: boolean;
    projectAgentIds: string[];
  } | null>(null);

  const [serverMismatchOpen, setServerMismatchOpen] = useState(false);
  const [serverMismatchDetails, setServerMismatchDetails] = useState<{
    expectedProduct: 'mysql' | 'mariadb';
    detectedProduct: 'mysql' | 'mariadb' | 'unknown';
    version: string;
    versionComment: string;
  } | null>(null);
  const [serverMismatchPendingPayload, setServerMismatchPendingPayload] = useState<{
    databaseTypeId: string;
    databaseId: string;
    displayName: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    sslMode: string;
    sslCaPem?: string | null;
    mongoUseSrv?: boolean;
    projectAgentIds: string[];
    password: string;
    reconnectWithPassword: boolean;
  } | null>(null);

  const [activeActionMenuSchemaId, setActiveActionMenuSchemaId] = useState<string | null>(null);
  const [downloadingSchemaId, setDownloadingSchemaId] = useState<string | null>(null);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [togglingConnectionAction, setTogglingConnectionAction] = useState<{
    connectionId: string;
    action: 'disconnect' | 'reconnect';
  } | null>(null);
  const [connectionActionColorPhase, setConnectionActionColorPhase] = useState(false);

  const [addDataOpen, setAddDataOpen] = useState(false);
  const [addDataTarget, setAddDataTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);
  const [addDataFile, setAddDataFile] = useState<File | null>(null);
  const [addDataSaving, setAddDataSaving] = useState(false);
  const addDataFileInputRef = useRef<HTMLInputElement>(null);

  const draftSchemaFileInputRef = useRef<HTMLInputElement>(null);
  const draftDataFileInputRef = useRef<HTMLInputElement>(null);
  const updateSchemaFileInputRef = useRef<HTMLInputElement>(null);
  const updateDataFileInputRef = useRef<HTMLInputElement>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);
  const [updateSchemaFile, setUpdateSchemaFile] = useState<File | null>(null);
  const [updateDataFile, setUpdateDataFile] = useState<File | null>(null);
  const [updateSaving, setUpdateSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [reconnectBlockedOpen, setReconnectBlockedOpen] = useState(false);
  const [reconnectBlockedAgentName, setReconnectBlockedAgentName] = useState('');
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsTarget, setCredentialsTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);
  const [credDisplayName, setCredDisplayName] = useState('');
  const [credHost, setCredHost] = useState('');
  const [credPort, setCredPort] = useState('3306');
  const [credDatabaseName, setCredDatabaseName] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credPasswordVisible, setCredPasswordVisible] = useState(false);
  const [credSslMode, setCredSslMode] = useState('required');
  const [credSslCaPem, setCredSslCaPem] = useState('');
  const [credMongoUseSrv, setCredMongoUseSrv] = useState(false);
  const [queryModeDialogOpen, setQueryModeDialogOpen] = useState(false);
  const [queryModeDialogTarget, setQueryModeDialogTarget] = useState<ProjectDatabaseSchemaListItem | null>(null);

  useEffect(() => {
    if (!togglingConnectionAction) {
      setConnectionActionColorPhase(false);
      return;
    }
    const id = window.setInterval(() => {
      setConnectionActionColorPhase((prev) => !prev);
    }, 220);
    return () => window.clearInterval(id);
  }, [togglingConnectionAction]);

  const databasesForSelectedType = useMemo(() => {
    const typeId = draftDatabaseTypeId.trim();
    if (!typeId) return [];
    return databases.filter((d) => d.databaseTypeId === typeId);
  }, [databases, draftDatabaseTypeId]);

  const connectDatabasesForSelectedType = useMemo(() => {
    const typeId = connectDraftTypeId.trim();
    if (!typeId) return [];
    const typeName = databaseTypes.find((t) => t.id === typeId)?.name ?? '';
    const allow =
      typeName === 'WordPress Relational'
        ? new Set(['wp-mysql', 'wp-mariadb'])
        : typeName === 'Relational'
          ? new Set(['mysql'])
          : typeName === 'Non-Relational'
            ? new Set(['mongodb'])
            : new Set<string>();
    return databases.filter((d) => d.databaseTypeId === typeId && allow.has(d.identifier));
  }, [databases, databaseTypes, connectDraftTypeId]);

  const databaseIdentifierById = useMemo(() => {
    return new Map(databases.map((d) => [d.id, d.identifier] as const));
  }, [databases]);

  const selectedConnectDatabaseIdentifier = connectDraftDbId ? (databaseIdentifierById.get(connectDraftDbId) ?? '') : '';
  const isMongoConnectSelection = selectedConnectDatabaseIdentifier === 'mongodb';
  const isMongoCredentialsSelection =
    !!credentialsTarget?.databaseId && (databaseIdentifierById.get(credentialsTarget.databaseId) ?? '') === 'mongodb';
  function resetUploadDraft() {
    setDraftDatabaseTypeId('');
    setDraftDatabaseId('');
    setDraftDatabaseName('');
    setDraftDatabaseExportLayoutId('');
    setDraftSchemaFile(null);
    setDraftDataFile(null);
    if (draftSchemaFileInputRef.current) draftSchemaFileInputRef.current.value = '';
    if (draftDataFileInputRef.current) draftDataFileInputRef.current.value = '';
    setSelectedUploadAgentIds([]);
    setUploadAgentDialogOpen(false);
    setUploadConflictOpen(false);
    setUploadConflictAgentNames([]);
  }

  function resetConnectDraft() {
    setConnectDraftTypeId('');
    setConnectDraftDbId('');
    setConnectDisplayName('');
    setConnectHost('');
    setConnectPort('3306');
    setConnectDbName('');
    setConnectUsername('');
    setConnectPassword('');
    setConnectPasswordVisible(false);
    setConnectSslMode('required');
    setConnectSslCaPem('');
    setConnectMongoUseSrv(false);
    setConnectSelectedAgentIds([]);
    setConnectAgentDialogOpen(false);
    setConnectConflictOpen(false);
    setConnectConflictAgentNames([]);
    setReconnectPasswordOpen(false);
    setReconnectPassword('');
    setReconnectPendingPayload(null);
    setServerMismatchOpen(false);
    setServerMismatchDetails(null);
    setServerMismatchPendingPayload(null);
  }

  function applyConnectDatabaseDefaults(databaseId: string) {
    const identifier = databaseIdentifierById.get(databaseId) ?? '';
    if (identifier === 'mongodb') {
      setConnectPort('27017');
      setConnectSslMode('required');
      setConnectSslCaPem('');
      setConnectMongoUseSrv(false);
      return;
    }
    setConnectPort('3306');
    setConnectSslMode('required');
    setConnectSslCaPem('');
    setConnectMongoUseSrv(false);
  }

  async function openUploadDialog() {
    setAddMenuOpen(false);
    resetUploadDraft();
    setUploadOpen(true);
    const res = await loadLookups();
    if (!res.ok) toast.error(res.message || 'Could not load database options.');
  }

  async function openConnectDialog() {
    setAddMenuOpen(false);
    resetConnectDraft();
    setConnectOpen(true);
    const res = await loadLookups();
    if (!res.ok) toast.error(res.message || 'Could not load database options.');
  }

  function continueConnectToAgentSelection() {
    const v = validateConnectDatabaseForm({
      databaseTypeId: connectDraftTypeId,
      databaseId: connectDraftDbId,
      databaseIdentifier: selectedConnectDatabaseIdentifier,
      displayName: connectDisplayName,
      host: connectHost,
      portRaw: connectPort,
      databaseName: connectDbName,
      username: connectUsername,
      password: connectPassword,
      sslMode: connectSslMode,
      sslCaPem: connectSslCaPem,
      mongoUseSrv: connectMongoUseSrv,
      projectAgentIds: [],
      requireProjectAgents: false,
    });
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    setConnectOpen(false);
    setConnectAgentDialogOpen(true);
  }

  async function submitConnectDatabase() {
    setConnectSaving(true);
    try {
      if (connectSelectedAgentIds.length === 0) {
        toast.error('Select at least one connected agent.');
        return;
      }
      const v = validateConnectDatabaseForm({
        databaseTypeId: connectDraftTypeId,
        databaseId: connectDraftDbId,
        databaseIdentifier: selectedConnectDatabaseIdentifier,
        displayName: connectDisplayName,
        host: connectHost,
        portRaw: connectPort,
        databaseName: connectDbName,
        username: connectUsername,
        password: connectPassword,
        sslMode: connectSslMode,
        sslCaPem: connectSslCaPem,
        mongoUseSrv: connectMongoUseSrv,
        projectAgentIds: connectSelectedAgentIds,
      });
      if (!v.ok) {
        toast.error(v.message);
        return;
      }
      const checkRes = await checkProjectDatabaseConnectionViaApi(projectId, {
        displayName: v.payload.displayName,
        projectAgentIds: v.payload.projectAgentIds,
      });
      if (!checkRes.ok) {
        toast.error(checkRes.message || 'Could not verify name.');
        return;
      }
      if (checkRes.conflicts.length > 0) {
        setConnectConflictAgentNames(checkRes.conflicts.map((c) => c.agentDisplayName));
        setConnectConflictOpen(true);
        return;
      }

      const basePayload = {
        databaseTypeId: v.payload.databaseTypeId,
        databaseId: v.payload.databaseId,
        displayName: v.payload.displayName,
        host: v.payload.host,
        port: v.payload.port,
        databaseName: v.payload.databaseName,
        username: v.payload.username,
        sslMode: v.payload.sslMode,
        sslCaPem: v.payload.sslCaPem,
        mongoUseSrv: v.payload.mongoUseSrv,
        projectAgentIds: v.payload.projectAgentIds,
      };

      const res = await createProjectDatabaseConnectionViaApi(projectId, {
        ...basePayload,
        password: v.payload.password,
        reconnectWithPassword: false,
      });
      if (!res.ok) {
        if (res.code === 'DB_SERVER_MISMATCH' && res.mismatch) {
          setServerMismatchDetails(res.mismatch);
          setServerMismatchPendingPayload({
            ...basePayload,
            password: v.payload.password,
            reconnectWithPassword: false,
          });
          setServerMismatchOpen(true);
          return;
        }
        if (res.code === 'PASSWORD_CONFIRM_REQUIRED') {
          setReconnectPendingPayload(basePayload);
          setReconnectPassword('');
          setReconnectPasswordOpen(true);
          return;
        }
        toast.error('Could not connect database. Please verify credentials and network access.');
        return;
      }
      toast.success('Database connected and schema synced.');
      setConnectAgentDialogOpen(false);
      resetConnectDraft();
      void onRefresh();
    } finally {
      setConnectSaving(false);
    }
  }

  async function submitConnectDespiteMismatch() {
    if (!serverMismatchPendingPayload) return;
    setConnectSaving(true);
    try {
      const res = await createProjectDatabaseConnectionViaApi(projectId, {
        ...serverMismatchPendingPayload,
        forceMismatch: true,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not connect database.');
        return;
      }
      toast.success('Database connected and schema synced.');
      setServerMismatchOpen(false);
      setServerMismatchDetails(null);
      setServerMismatchPendingPayload(null);
      setConnectAgentDialogOpen(false);
      resetConnectDraft();
      void onRefresh();
    } finally {
      setConnectSaving(false);
    }
  }

  async function submitReconnectWithPassword() {
    if (!reconnectPendingPayload) return;
    const pwd = reconnectPassword.trim();
    if (!pwd) {
      toast.error('Password is required.');
      return;
    }
    setConnectSaving(true);
    try {
      const res = await createProjectDatabaseConnectionViaApi(projectId, {
        ...reconnectPendingPayload,
        password: pwd,
        reconnectWithPassword: true,
      });
      if (!res.ok) {
        toast.error('Could not reconnect database. Please verify credentials and network access.');
        return;
      }
      toast.success('Database reconnected and schema synced.');
      setReconnectPasswordOpen(false);
      setReconnectPassword('');
      setReconnectPendingPayload(null);
      setConnectAgentDialogOpen(false);
      resetConnectDraft();
      void onRefresh();
    } finally {
      setConnectSaving(false);
    }
  }

  function isAllowed(ext: string, purpose: 'db-schema-file' | 'data-file') {
    const e = String(ext ?? '').toLowerCase();
    if (!e) return false;
    return allowedExtensions.some(
      (row) => row.purpose === purpose && String(row.fileExtension ?? '').toLowerCase() === e,
    );
  }

  /** Validates form and opens the agent selection dialog (same flow as Storage upload). */
  function continueToAgentSelection() {
    const databaseTypeId = draftDatabaseTypeId.trim();
    const databaseId = draftDatabaseId.trim();
    const databaseName = draftDatabaseName.trim();
    const schemaFile = draftSchemaFile;
    const dataFile = draftDataFile;

    if (!databaseTypeId) return toast.error('Select a database type.');
    if (!databaseId) return toast.error('Select a database.');
    if (!databaseName) return toast.error('Enter a database name.');
    if (!draftDatabaseExportLayoutId.trim()) return toast.error('Select an export layout.');
    if (!schemaFile) return toast.error('Upload a schema file.');
    if (!dataFile) return toast.error('Upload a data file.');

    const schemaExt = extLowerNoDot(schemaFile.name);
    const dataExt = extLowerNoDot(dataFile.name);
    if (!isAllowed(schemaExt, 'db-schema-file')) {
      return toast.error(`.${schemaExt || 'unknown'} is not allowed for schema files.`);
    }
    if (!isAllowed(dataExt, 'data-file')) {
      return toast.error(`.${dataExt || 'unknown'} is not allowed for data files.`);
    }

    if (uploadAgentOptions.length === 0) {
      toast.error('No connected agents available for this project.');
      return;
    }

    setUploadAgentDialogOpen(true);
  }

  async function submitUploadWithAgents() {
    if (selectedUploadAgentIds.length === 0) {
      toast.error('Select at least one connected agent.');
      return;
    }

    const databaseTypeId = draftDatabaseTypeId.trim();
    const databaseId = draftDatabaseId.trim();
    const databaseName = draftDatabaseName.trim();
    const schemaFile = draftSchemaFile;
    const dataFile = draftDataFile;
    if (!schemaFile || !dataFile) return;

    setUploading(true);
    try {
      const check = await checkProjectDatabaseUploadViaApi(projectId, {
        databaseName,
        projectAgentIds: selectedUploadAgentIds,
      });
      if (!check.ok) {
        toast.error(check.message || 'Could not verify upload.');
        return;
      }
      if (check.conflicts.length > 0) {
        setUploadConflictAgentNames(check.conflicts.map((c) => c.agentDisplayName));
        setUploadConflictOpen(true);
        return;
      }

      const res = await uploadProjectDatabaseViaApi(projectId, {
        databaseTypeId,
        databaseId,
        databaseName,
        databaseExportLayoutId: draftDatabaseExportLayoutId.trim(),
        projectAgentIds: selectedUploadAgentIds,
        schemaFile,
        dataFile,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not upload database.');
        return;
      }
      toast.success(
        res.uploads.length > 1
          ? `Database uploaded for ${res.uploads.length} agents.`
          : 'Database uploaded.',
      );
      setUploadOpen(false);
      setUploadAgentDialogOpen(false);
      resetUploadDraft();
      void onRefresh();
    } finally {
      setUploading(false);
    }
  }

  async function submitRename() {
    if (!renameTarget) return;
    const name = renameDraft.trim();
    if (!name) {
      toast.error('Enter a database name.');
      return;
    }
    setRenameSaving(true);
    try {
      const res = await renameProjectDatabaseSchemaViaApi(projectId, renameTarget.id, { databaseName: name });
      if (!res.ok) {
        toast.error(res.message || 'Could not rename.');
        return;
      }
      toast.success('Database renamed.');
      setRenameOpen(false);
      setRenameTarget(null);
      setRenameDraft('');
      void onRefresh();
    } finally {
      setRenameSaving(false);
    }
  }

  async function submitAddData() {
    if (!addDataTarget) return;
    if (!addDataFile) {
      toast.error('Select a JSON data file.');
      return;
    }
    let extList = allowedExtensions;
    if (extList.length === 0) {
      const lookupRes = await fetchProjectDatabaseLookupsViaApi(projectId);
      if (!lookupRes.ok) {
        toast.error(lookupRes.message || 'Could not load allowed file types.');
        return;
      }
      extList = lookupRes.allowedExtensions;
    }
    const de = extLowerNoDot(addDataFile.name);
    const dataAllowed = extList.some(
      (row) => row.purpose === 'data-file' && String(row.fileExtension ?? '').toLowerCase() === de,
    );
    if (!dataAllowed) {
      toast.error('Only an allowed JSON data file can be uploaded.');
      return;
    }
    setAddDataSaving(true);
    try {
      const res = await updateProjectDatabaseSchemaDataFileViaApi(projectId, addDataTarget.id, {
        dataFile: addDataFile,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not update data file.');
        return;
      }
      toast.success('Data file updated.');
      setAddDataOpen(false);
      setAddDataTarget(null);
      setAddDataFile(null);
      if (addDataFileInputRef.current) addDataFileInputRef.current.value = '';
      void onRefresh();
    } finally {
      setAddDataSaving(false);
    }
  }

  async function downloadDatabaseZip(row: ProjectDatabaseSchemaListItem) {
    setDownloadingSchemaId(row.id);
    try {
      const res = await downloadProjectDatabaseSchemaZipViaApi(projectId, row.id);
      if (!res.ok) {
        toast.error(res.message || 'Could not download.');
        return;
      }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingSchemaId(null);
      setActiveActionMenuSchemaId(null);
    }
  }

  async function submitUpdate() {
    if (!updateTarget) return;
    if (!updateSchemaFile || !updateDataFile) {
      toast.error('Select both schema (.sql) and data (.json) files.');
      return;
    }
    const se = extLowerNoDot(updateSchemaFile.name);
    const de = extLowerNoDot(updateDataFile.name);
    if (!isAllowed(se, 'db-schema-file') || !isAllowed(de, 'data-file')) {
      toast.error('Invalid file types. Use an allowed .sql schema file and .json data file.');
      return;
    }
    setUpdateSaving(true);
    try {
      const res = await updateProjectDatabaseSchemaFilesViaApi(projectId, updateTarget.id, {
        schemaFile: updateSchemaFile,
        dataFile: updateDataFile,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not update files.');
        return;
      }
      toast.success('Database files updated.');
      setUpdateOpen(false);
      setUpdateTarget(null);
      setUpdateSchemaFile(null);
      setUpdateDataFile(null);
      if (updateSchemaFileInputRef.current) updateSchemaFileInputRef.current.value = '';
      if (updateDataFileInputRef.current) updateDataFileInputRef.current.value = '';
      void onRefresh();
    } finally {
      setUpdateSaving(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmDraft.trim() !== deleteTarget.databaseName.trim()) {
      toast.error('Enter the exact database name to confirm.');
      return;
    }
    setDeleteSaving(true);
    try {
      const res =
        deleteTarget.source === 'live'
          ? await deleteProjectDatabaseConnectionViaApi(projectId, deleteTarget.id)
          : await deleteProjectDatabaseSchemaViaApi(projectId, deleteTarget.id);
      if (!res.ok) {
        toast.error(res.message || 'Could not delete.');
        return;
      }
      toast.success('Database removed.');
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmDraft('');
      void onRefresh();
    } finally {
      setDeleteSaving(false);
    }
  }

  async function submitSyncSchema(target: ProjectDatabaseSchemaListItem) {
    if (target.source !== 'live') return;
    if (target.status !== 'connected') {
      toast.error('This connection is not in `connected` state.');
      return;
    }
    setSyncingConnectionId(target.id);
    try {
      const res = await syncProjectDatabaseConnectionSchemaViaApi(projectId, target.id);
      if (!res.ok) {
        toast.error(res.message || 'Could not sync schema.');
        return;
      }
      toast.success('Schema synced.');
      void onRefresh();
    } finally {
      setSyncingConnectionId(null);
      setActiveActionMenuSchemaId(null);
    }
  }

  async function submitConnectionStatus(target: ProjectDatabaseSchemaListItem, action: 'disconnect' | 'reconnect') {
    if (target.source !== 'live') return;
    setTogglingConnectionAction({ connectionId: target.id, action });
    const res = await updateProjectDatabaseConnectionStatusViaApi(projectId, target.id, action);
    if (!res.ok) {
      if (action === 'reconnect' && res.code === 'NAME_CONFLICT') {
        setReconnectBlockedAgentName(target.agentDisplayName || 'this agent');
        setReconnectBlockedOpen(true);
        setTogglingConnectionAction(null);
        return;
      }
      if (action === 'reconnect') {
        toast.error('Could not reconnect database. Please verify credentials and try again.');
      } else {
        toast.error('Could not disconnect database. Please try again.');
      }
      setTogglingConnectionAction(null);
      return;
    }
    toast.success(action === 'disconnect' ? 'Database disconnected.' : 'Database reconnected.');
    void onRefresh();
    setActiveActionMenuSchemaId(null);
    setTogglingConnectionAction(null);
  }

  async function openCredentialsDialog(target: ProjectDatabaseSchemaListItem) {
    if (target.source !== 'live') return;
    setCredentialsTarget(target);
    setCredentialsLoading(true);
    setCredentialsOpen(true);
    const res = await fetchProjectDatabaseConnectionCredentialsViaApi(projectId, target.id);
    if (!res.ok) {
      toast.error(res.message || 'Could not load credentials.');
      setCredentialsOpen(false);
      setCredentialsLoading(false);
      setCredentialsTarget(null);
      return;
    }
    setCredDisplayName(res.connection.displayName);
    setCredHost(res.connection.host);
    setCredPort(String(res.connection.port || 3306));
    setCredDatabaseName(res.connection.databaseName);
    setCredUsername(res.connection.username);
    setCredPassword(res.connection.password);
    setCredPasswordVisible(false);
    setCredSslMode(res.connection.sslMode);
    setCredSslCaPem(res.connection.sslCaPem ?? '');
    setCredMongoUseSrv(String(res.connection.host ?? '').trim().toLowerCase().endsWith('.mongodb.net'));
    setCredentialsLoading(false);
  }

  function openQueryModeDialog(target: ProjectDatabaseSchemaListItem) {
    if (target.source !== 'live') return;
    setQueryModeDialogTarget(target);
    setQueryModeDialogOpen(true);
  }

  async function submitCredentialsUpdate() {
    if (!credentialsTarget) return;
    const v = validateConnectDatabaseForm({
      databaseTypeId: credentialsTarget.databaseTypeName ? 'keep' : 'keep',
      databaseId: credentialsTarget.databaseProductName ? 'keep' : 'keep',
      databaseIdentifier:
        credentialsTarget.databaseId ? (databaseIdentifierById.get(credentialsTarget.databaseId) ?? '') : '',
      displayName: credDisplayName,
      host: credHost,
      portRaw: credPort,
      databaseName: credDatabaseName,
      username: credUsername,
      password: credPassword,
      sslMode: credSslMode,
      sslCaPem: credSslCaPem,
      mongoUseSrv: credMongoUseSrv,
      projectAgentIds: [],
      requireProjectAgents: false,
    });
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    setCredentialsSaving(true);
    try {
      const res = await updateProjectDatabaseConnectionCredentialsViaApi(projectId, credentialsTarget.id, {
        displayName: v.payload.displayName,
        host: v.payload.host,
        port: v.payload.port,
        databaseName: v.payload.databaseName,
        username: v.payload.username,
        password: v.payload.password,
        sslMode: v.payload.sslMode,
        sslCaPem: v.payload.sslCaPem,
        mongoUseSrv: v.payload.mongoUseSrv,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not update credentials.');
        return;
      }
      toast.success('Credentials updated. Connection set to disconnected.');
      setCredentialsOpen(false);
      setCredentialsTarget(null);
      void onRefresh();
    } finally {
      setCredentialsSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 w-full flex-1 items-center gap-3 sm:max-w-xl">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by database name"
                className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
                aria-label="Search databases by name"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void onRefresh()}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
              aria-label="Refresh databases"
            >
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} aria-hidden />
            </button>
          </div>

          <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(primaryCtaToolbarButtonClassName, 'inline-flex items-center gap-2')}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add database
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => void openUploadDialog()}
                  className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <Upload className="h-4 w-4 text-neutral-500 dark:text-neutral-400" aria-hidden />
                  Upload database
                </button>
                <button
                  type="button"
                  onClick={() => void openConnectDialog()}
                  className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <Link2 className="h-4 w-4 text-neutral-500 dark:text-neutral-400" aria-hidden />
                  Connect database
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-w-[58rem] sm:min-w-[72rem]">
            <div className={databaseTableGridClassName}>
              <div>Database name</div>
              <div>Agent</div>
              <div>Database type</div>
              <div>Database</div>
              <div>Status</div>
              <div>Size</div>
              <div>Added at</div>
              <div className="text-right sm:text-center">Action</div>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Loading…
                </div>
              ) : schemas.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
                  {totalInProject === 0
                    ? 'No databases yet. Upload a database or connect a live database to get started.'
                    : 'No databases match your search.'}
                </div>
              ) : (
                schemas.map((row) => (
                  <div key={row.id} className={databaseRowGridClassName}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                        {row.databaseName}
                      </p>
                    </div>
                    <div className="truncate text-neutral-700 dark:text-neutral-200" title={row.agentDisplayName}>
                      {row.agentDisplayName}
                    </div>
                    <div className="truncate text-neutral-700 dark:text-neutral-200">
                      {row.databaseTypeName ?? '—'}
                    </div>
                    <div className="truncate text-neutral-700 dark:text-neutral-200">
                      {row.databaseProductName ?? '—'}
                    </div>
                    <div>
                      <span className={databaseSchemaStatusPillClassNameCn(row.status)}>
                        {formatDatabaseSchemaStatusLabel(row.status)}
                      </span>
                    </div>
                    <div className="whitespace-nowrap tabular-nums text-neutral-700 dark:text-neutral-200">
                      {row.source === 'live' ? 'N/A' : formatBytes(row.totalSizeBytes)}
                    </div>
                    <div className="whitespace-nowrap text-neutral-700 dark:text-neutral-200">
                      {formatAgentTimestamp(row.createdAt)}
                    </div>
                    <div className="flex justify-end sm:justify-center">
                      <Popover
                        open={activeActionMenuSchemaId === row.id}
                        onOpenChange={(open) => setActiveActionMenuSchemaId(open ? row.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                            aria-label="Open actions"
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
                            disabled={row.source === 'live' && row.status !== 'connected'}
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            onClick={() => {
                              setActiveActionMenuSchemaId(null);
                              toast.message('Open will be implemented soon.');
                            }}
                          >
                            <FolderOpen className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Open
                          </button>
                          {row.source === 'live' ? (
                            <button
                              type="button"
                              disabled={syncingConnectionId === row.id || row.status !== 'connected'}
                              className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              onClick={() => void submitSyncSchema(row)}
                            >
                              <RefreshCw className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                              {syncingConnectionId === row.id ? 'Syncing…' : 'Sync schema'}
                            </button>
                          ) : null}
                          {row.source === 'live' ? (
                            <button
                              type="button"
                              className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              onClick={() => void openCredentialsDialog(row)}
                            >
                              <KeyRound className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                              Show credentials
                            </button>
                          ) : null}
                          {row.source === 'live' ? (
                            <button
                              type="button"
                              className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              onClick={() => {
                                setActiveActionMenuSchemaId(null);
                                openQueryModeDialog(row);
                              }}
                            >
                              <SlidersHorizontal className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                              Query mode
                            </button>
                          ) : null}
                          {row.source === 'live' ? (
                            <Link
                              href={`/project/${encodeURIComponent(projectId)}/database/connections/${encodeURIComponent(row.id)}/query-templates`}
                              className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              onClick={() => setActiveActionMenuSchemaId(null)}
                            >
                              <FileJson className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                              Query templates
                            </Link>
                          ) : null}
                          {row.source === 'live' ? (
                            <button
                              type="button"
                              disabled={togglingConnectionAction?.connectionId === row.id}
                              className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              onClick={() =>
                                void submitConnectionStatus(
                                  row,
                                  row.status === 'disconnected' || row.status === 'failed'
                                    ? 'reconnect'
                                    : 'disconnect',
                                )
                              }
                            >
                              {row.status === 'disconnected' || row.status === 'failed' ? (
                                <Plug
                                  className={cn(
                                    'h-4 w-4 shrink-0 opacity-80',
                                    togglingConnectionAction?.connectionId === row.id &&
                                      togglingConnectionAction?.action === 'reconnect'
                                      ? connectionActionColorPhase
                                        ? 'text-emerald-500'
                                        : 'text-cyan-500'
                                      : '',
                                  )}
                                  aria-hidden
                                />
                              ) : (
                                <Unplug
                                  className={cn(
                                    'h-4 w-4 shrink-0 opacity-80',
                                    togglingConnectionAction?.connectionId === row.id &&
                                      togglingConnectionAction?.action === 'disconnect'
                                      ? connectionActionColorPhase
                                        ? 'text-red-500'
                                        : 'text-orange-500'
                                      : '',
                                  )}
                                  aria-hidden
                                />
                              )}
                              {togglingConnectionAction?.connectionId === row.id
                                ? row.status === 'disconnected' || row.status === 'failed'
                                  ? 'Reconnecting…'
                                  : 'Disconnecting…'
                                : row.status === 'disconnected' || row.status === 'failed'
                                  ? 'Reconnect'
                                  : 'Disconnect'}
                            </button>
                          ) : null}
                          {row.source !== 'live' ? (
                            <>
                              <button
                                type="button"
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() => {
                                  setActiveActionMenuSchemaId(null);
                                  setRenameTarget(row);
                                  setRenameDraft(row.databaseName);
                                  setRenameOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Rename
                              </button>
                              <button
                                type="button"
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() => {
                                  setActiveActionMenuSchemaId(null);
                                  setUpdateTarget(row);
                                  setUpdateSchemaFile(null);
                                  setUpdateDataFile(null);
                                  if (updateSchemaFileInputRef.current) updateSchemaFileInputRef.current.value = '';
                                  if (updateDataFileInputRef.current) updateDataFileInputRef.current.value = '';
                                  setUpdateOpen(true);
                                }}
                              >
                                <RefreshCw className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Update
                              </button>
                              <button
                                type="button"
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() => {
                                  setActiveActionMenuSchemaId(null);
                                  setAddDataTarget(row);
                                  setAddDataFile(null);
                                  if (addDataFileInputRef.current) addDataFileInputRef.current.value = '';
                                  setAddDataOpen(true);
                                }}
                              >
                                <FileJson className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Add data
                              </button>
                              <button
                                type="button"
                                disabled={downloadingSchemaId === row.id}
                                className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                onClick={() => void downloadDatabaseZip(row)}
                              >
                                <Download className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                Download
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                            onClick={() => {
                              setActiveActionMenuSchemaId(null);
                              setDeleteTarget(row);
                              setDeleteConfirmDraft('');
                              setDeleteOpen(true);
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

        {!loading && total > 0 ? (
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

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open && !uploading) {
            setUploadOpen(false);
            resetUploadDraft();
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Upload database</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATABASE TYPE
              </span>
              <Select
                value={draftDatabaseTypeId}
                onValueChange={(v) => {
                  setDraftDatabaseTypeId(v);
                  setDraftDatabaseId('');
                }}
                disabled={uploading}
              >
                <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                  {databaseTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="font-dm-sans">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATABASE
              </span>
              <Select value={draftDatabaseId} onValueChange={setDraftDatabaseId} disabled={uploading}>
                <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                  <SelectValue placeholder={draftDatabaseTypeId ? 'Select database' : 'Select type first'} />
                </SelectTrigger>
                <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                  {databasesForSelectedType.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="font-dm-sans">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="db-name" className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              DATABASE NAME
            </label>
            <input
              id="db-name"
              type="text"
              value={draftDatabaseName}
              onChange={(e) => setDraftDatabaseName(e.target.value)}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              placeholder="e.g. Production"
              disabled={uploading}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              EXPORT LAYOUT
            </span>
            <Select
              value={draftDatabaseExportLayoutId}
              onValueChange={setDraftDatabaseExportLayoutId}
              disabled={uploading || databaseExportLayouts.length === 0}
            >
              <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                <SelectValue
                  placeholder={
                    databaseExportLayouts.length === 0 ? 'No export layouts available' : 'Select export layout'
                  }
                />
              </SelectTrigger>
              <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                {databaseExportLayouts.map((layout) => (
                  <SelectItem key={layout.id} value={layout.id} className="font-dm-sans">
                    {layout.format} · {layout.platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                SCHEMA FILE
              </label>
              <input
                ref={draftSchemaFileInputRef}
                type="file"
                accept=".sql"
                disabled={uploading}
                onChange={(e) => setDraftSchemaFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-200 dark:text-neutral-200 dark:file:bg-neutral-800 dark:file:text-neutral-100 dark:hover:file:bg-neutral-700"
              />
              {draftSchemaFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950">
                  <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {draftSchemaFile.name}
                  </span>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setDraftSchemaFile(null);
                      if (draftSchemaFileInputRef.current) draftSchemaFileInputRef.current.value = '';
                    }}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    aria-label="Remove schema file"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATA FILE
              </label>
              <input
                ref={draftDataFileInputRef}
                type="file"
                accept=".json"
                disabled={uploading}
                onChange={(e) => setDraftDataFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-200 dark:text-neutral-200 dark:file:bg-neutral-800 dark:file:text-neutral-100 dark:hover:file:bg-neutral-700"
              />
              {draftDataFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950">
                  <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {draftDataFile.name}
                  </span>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setDraftDataFile(null);
                      if (draftDataFileInputRef.current) draftDataFileInputRef.current.value = '';
                    }}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    aria-label="Remove data file"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                setUploadOpen(false);
                resetUploadDraft();
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => continueToAgentSelection()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex items-center justify-center')}
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadAgentDialogOpen}
        onOpenChange={(open) => {
          if (!open && !uploading) setUploadAgentDialogOpen(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Select agents for upload</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Choose one or more connected agents for this database upload.
          </p>

          <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            {uploadAgentOptions.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">No connected agents available.</p>
            ) : (
              uploadAgentOptions.map((opt) => {
                const checked = selectedUploadAgentIds.includes(opt.projectAgentId);
                return (
                  <label
                    key={opt.projectAgentId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className="peer sr-only"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUploadAgentIds((prev) =>
                            prev.includes(opt.projectAgentId) ? prev : [...prev, opt.projectAgentId],
                          );
                          return;
                        }
                        setSelectedUploadAgentIds((prev) => prev.filter((id) => id !== opt.projectAgentId));
                      }}
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm text-neutral-800 dark:text-neutral-200">{opt.agentDisplayName}</span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={uploading}
              onClick={() => setUploadAgentDialogOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Back
            </button>
            <button
              type="button"
              disabled={uploading || uploadAgentOptions.length === 0}
              onClick={() => void submitUploadWithAgents()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {uploading ? 'Checking…' : 'Upload'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadConflictOpen} onOpenChange={setUploadConflictOpen}>
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Cannot upload</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            The following agent(s) already have a database attached (uploaded or connected):{' '}
            <span className="font-semibold">{uploadConflictAgentNames.join(', ')}</span>. Deselect those agents and try
            again.
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setUploadConflictOpen(false)}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={connectOpen}
        onOpenChange={(open) => {
          if (!open && !connectSaving) {
            setConnectOpen(false);
            resetConnectDraft();
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Connect database</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATABASE TYPE
              </span>
              <Select
                value={connectDraftTypeId}
                onValueChange={(v) => {
                  setConnectDraftTypeId(v);
                  setConnectDraftDbId('');
                }}
                disabled={connectSaving}
              >
                <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                  {databaseTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="font-dm-sans">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATABASE
              </span>
              <Select
                value={connectDraftDbId}
                onValueChange={(v) => {
                  setConnectDraftDbId(v);
                  applyConnectDatabaseDefaults(v);
                }}
                disabled={connectSaving}
              >
                <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                  <SelectValue
                    placeholder={
                      connectDraftTypeId
                        ? connectDatabasesForSelectedType.length === 0
                          ? 'No database available — run DB migration'
                          : 'Select database'
                        : 'Select type first'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                  {connectDatabasesForSelectedType.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="font-dm-sans">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="connect-display"
              className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              DISPLAY NAME
            </label>
            <input
              id="connect-display"
              type="text"
              value={connectDisplayName}
              onChange={(e) => setConnectDisplayName(e.target.value)}
              disabled={connectSaving}
              placeholder="Shown in the database list"
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="connect-host"
                className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                HOST
              </label>
              <input
                id="connect-host"
                type="text"
                value={connectHost}
                onChange={(e) => setConnectHost(e.target.value)}
                disabled={connectSaving}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:w-28">
              <label
                htmlFor="connect-port"
                className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                PORT
              </label>
              <input
                id="connect-port"
                type="text"
                inputMode="numeric"
                value={connectPort}
                onChange={(e) => setConnectPort(e.target.value)}
                disabled={connectSaving || (isMongoConnectSelection && connectMongoUseSrv)}
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
                autoComplete="off"
              />
            </div>
          </div>
          {isMongoConnectSelection ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800">
              <input
                type="checkbox"
                checked={connectMongoUseSrv}
                className="peer sr-only"
                onChange={(e) => {
                  const checked = e.target.checked;
                  setConnectMongoUseSrv(checked);
                  if (checked) setConnectPort('27017');
                }}
                disabled={connectSaving}
              />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                <Check className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span>Use `mongodb+srv` URI (recommended for MongoDB Atlas)</span>
            </label>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="connect-dbname"
              className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              DATABASE NAME
            </label>
            <input
              id="connect-dbname"
              type="text"
              value={connectDbName}
              onChange={(e) => setConnectDbName(e.target.value)}
              disabled={connectSaving}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="connect-user"
                className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                USERNAME
              </label>
              <input
                id="connect-user"
                type="text"
                value={connectUsername}
                onChange={(e) => setConnectUsername(e.target.value)}
                disabled={connectSaving}
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="connect-pass"
                className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                PASSWORD
              </label>
              <div className="relative">
                <input
                  id="connect-pass"
                  type={connectPasswordVisible ? 'text' : 'password'}
                  value={connectPassword}
                  onChange={(e) => setConnectPassword(e.target.value)}
                  disabled={connectSaving}
                  autoComplete="new-password"
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-10 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setConnectPasswordVisible((v) => !v)}
                  disabled={connectSaving}
                  aria-label={connectPasswordVisible ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center text-neutral-500 transition hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {connectPasswordVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              SSL/TLS
            </span>
            <Select value={connectSslMode} onValueChange={setConnectSslMode} disabled={connectSaving}>
              <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                <SelectItem value="disable">Disable</SelectItem>
                {isMongoConnectSelection ? null : <SelectItem value="preferred">Preferred</SelectItem>}
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="verify_ca">Verify CA</SelectItem>
                <SelectItem value="verify_identity">Verify identity</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Use <span className="font-semibold">Required</span> or stronger for production databases. If your local
              database does not support TLS, use <span className="font-semibold">Disable</span>.
            </p>
          </div>

          {connectSslMode === 'verify_ca' || connectSslMode === 'verify_identity' ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="connect-ca"
                className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                CA CERTIFICATE (PEM)
              </label>
              <textarea
                id="connect-ca"
                value={connectSslCaPem}
                onChange={(e) => setConnectSslCaPem(e.target.value)}
                disabled={connectSaving}
                rows={4}
                placeholder="-----BEGIN CERTIFICATE-----"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              />
            </div>
          ) : null}

          <DialogFooter className="mt-2 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => {
                setConnectOpen(false);
                resetConnectDraft();
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={connectSaving || connectDatabasesForSelectedType.length === 0}
              onClick={() => continueConnectToAgentSelection()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex items-center justify-center')}
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={connectAgentDialogOpen}
        onOpenChange={(open) => {
          if (!open && !connectSaving) setConnectAgentDialogOpen(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Select agents for connection</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Choose one or more connected agents that may query this live database.
          </p>

          <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            {uploadAgentOptions.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">No connected agents available.</p>
            ) : (
              uploadAgentOptions.map((opt) => {
                const checked = connectSelectedAgentIds.includes(opt.projectAgentId);
                return (
                  <label
                    key={opt.projectAgentId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className="peer sr-only"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setConnectSelectedAgentIds((prev) =>
                            prev.includes(opt.projectAgentId) ? prev : [...prev, opt.projectAgentId],
                          );
                          return;
                        }
                        setConnectSelectedAgentIds((prev) => prev.filter((id) => id !== opt.projectAgentId));
                      }}
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm text-neutral-800 dark:text-neutral-200">{opt.agentDisplayName}</span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => {
                setConnectAgentDialogOpen(false);
                setConnectOpen(true);
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Back
            </button>
            <button
              type="button"
              disabled={connectSaving || uploadAgentOptions.length === 0}
              onClick={() => void submitConnectDatabase()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {connectSaving ? 'Connecting…' : 'Connect'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectConflictOpen} onOpenChange={setConnectConflictOpen}>
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Cannot connect</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            The following agent(s) already have a database attached (uploaded or connected):{' '}
            <span className="font-semibold">{connectConflictAgentNames.join(', ')}</span>. Deselect those agents and try
            again.
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setConnectConflictOpen(false)}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reconnectPasswordOpen}
        onOpenChange={(open) => {
          if (!open && !connectSaving) {
            setReconnectPasswordOpen(false);
            setReconnectPassword('');
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Reconnect database</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            A matching deleted connection already exists for the selected agent(s). Enter password to restore that
            connection, sync schema, and mark it active again.
          </p>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reconnect-password"
              className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              PASSWORD
            </label>
            <input
              id="reconnect-password"
              type="password"
              value={reconnectPassword}
              onChange={(e) => setReconnectPassword(e.target.value)}
              disabled={connectSaving}
              autoComplete="new-password"
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
            />
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => {
                setReconnectPasswordOpen(false);
                setReconnectPassword('');
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => void submitReconnectWithPassword()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {connectSaving ? 'Connecting…' : 'Reconnect'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serverMismatchOpen} onOpenChange={setServerMismatchOpen}>
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Database type mismatch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            You selected <span className="font-semibold">{serverMismatchDetails?.expectedProduct === 'mariadb' ? 'MariaDB' : 'MySQL'}</span>, but the server
            looks like <span className="font-semibold">{serverMismatchDetails?.detectedProduct === 'mariadb' ? 'MariaDB' : 'MySQL'}</span>.
          </p>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
            <div className="font-mono">
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">VERSION():</span> {serverMismatchDetails?.version || '—'}
              </div>
              <div className="mt-1">
                <span className="text-neutral-500 dark:text-neutral-400">version_comment:</span> {serverMismatchDetails?.versionComment || '—'}
              </div>
            </div>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            If you continue, Neurons will sync schema and allow the connected agent(s) to query this database.
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => {
                setServerMismatchOpen(false);
                setServerMismatchDetails(null);
                setServerMismatchPendingPayload(null);
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={connectSaving}
              onClick={() => void submitConnectDespiteMismatch()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {connectSaving ? 'Connecting…' : 'Continue'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open && !renameSaving) {
            setRenameOpen(false);
            setRenameTarget(null);
            setRenameDraft('');
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Rename database</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            The database name must be unique for <span className="font-semibold">{renameTarget?.agentDisplayName}</span>.
            You cannot use a name that is already assigned to another database for this same agent.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rename-db" className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              DATABASE NAME
            </label>
            <input
              id="rename-db"
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              disabled={renameSaving}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={renameSaving}
              onClick={() => {
                setRenameOpen(false);
                setRenameTarget(null);
                setRenameDraft('');
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={renameSaving}
              onClick={() => void submitRename()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {renameSaving ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={updateOpen}
        onOpenChange={(open) => {
          if (!open && !updateSaving) {
            setUpdateOpen(false);
            setUpdateTarget(null);
            setUpdateSchemaFile(null);
            setUpdateDataFile(null);
            if (updateSchemaFileInputRef.current) updateSchemaFileInputRef.current.value = '';
            if (updateDataFileInputRef.current) updateDataFileInputRef.current.value = '';
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Update database files</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Update stored database for <span className="font-semibold">{updateTarget?.databaseName}</span> (
            {updateTarget?.agentDisplayName}). Upload a new <code className="text-xs">.sql</code> schema file and{' '}
            <code className="text-xs">.json</code> data file.
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                SCHEMA FILE
              </span>
              <input
                ref={updateSchemaFileInputRef}
                type="file"
                accept=".sql"
                disabled={updateSaving}
                onChange={(e) => setUpdateSchemaFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 dark:text-neutral-200 dark:file:bg-neutral-800"
              />
              {updateSchemaFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950">
                  <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {updateSchemaFile.name}
                  </span>
                  <button
                    type="button"
                    disabled={updateSaving}
                    onClick={() => {
                      setUpdateSchemaFile(null);
                      if (updateSchemaFileInputRef.current) updateSchemaFileInputRef.current.value = '';
                    }}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    aria-label="Remove schema file"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                DATA FILE
              </span>
              <input
                ref={updateDataFileInputRef}
                type="file"
                accept=".json"
                disabled={updateSaving}
                onChange={(e) => setUpdateDataFile(e.target.files?.[0] ?? null)}
                className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 dark:text-neutral-200 dark:file:bg-neutral-800"
              />
              {updateDataFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950">
                  <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {updateDataFile.name}
                  </span>
                  <button
                    type="button"
                    disabled={updateSaving}
                    onClick={() => {
                      setUpdateDataFile(null);
                      if (updateDataFileInputRef.current) updateDataFileInputRef.current.value = '';
                    }}
                    className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    aria-label="Remove data file"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={updateSaving}
              onClick={() => {
                setUpdateOpen(false);
                setUpdateTarget(null);
                setUpdateSchemaFile(null);
                setUpdateDataFile(null);
                if (updateSchemaFileInputRef.current) updateSchemaFileInputRef.current.value = '';
                if (updateDataFileInputRef.current) updateDataFileInputRef.current.value = '';
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={updateSaving}
              onClick={() => void submitUpdate()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {updateSaving ? 'Updating…' : 'Update database'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addDataOpen}
        onOpenChange={(open) => {
          if (!open && !addDataSaving) {
            setAddDataOpen(false);
            setAddDataTarget(null);
            setAddDataFile(null);
            if (addDataFileInputRef.current) addDataFileInputRef.current.value = '';
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Add data</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Replace only the data file for <span className="font-semibold">{addDataTarget?.databaseName}</span> (
            {addDataTarget?.agentDisplayName}). Upload a JSON file (schema files are not accepted here).
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              DATA FILE
            </span>
            <input
              ref={addDataFileInputRef}
              type="file"
              accept=".json,application/json"
              disabled={addDataSaving}
              onChange={(e) => setAddDataFile(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer text-sm text-neutral-700 file:mr-4 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 dark:text-neutral-200 dark:file:bg-neutral-800"
            />
            {addDataFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-950">
                <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                  {addDataFile.name}
                </span>
                <button
                  type="button"
                  disabled={addDataSaving}
                  onClick={() => {
                    setAddDataFile(null);
                    if (addDataFileInputRef.current) addDataFileInputRef.current.value = '';
                  }}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  aria-label="Remove data file"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={addDataSaving}
              onClick={() => {
                setAddDataOpen(false);
                setAddDataTarget(null);
                setAddDataFile(null);
                if (addDataFileInputRef.current) addDataFileInputRef.current.value = '';
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={addDataSaving}
              onClick={() => void submitAddData()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {addDataSaving ? 'Updating…' : 'Replace data file'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={credentialsOpen}
        onOpenChange={(open) => {
          if (!open && !credentialsSaving) {
            setCredentialsOpen(false);
            setCredentialsTarget(null);
          }
        }}
      >
        <DialogContent
          showCloseButton
          className="font-dm-sans flex max-h-[min(90vh,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] flex-col gap-4 overflow-y-auto border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              {credentialsTarget?.databaseName ? `${credentialsTarget.databaseName}'s credentials` : "Database's credentials"}
            </DialogTitle>
          </DialogHeader>
          {credentialsLoading ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading credentials…</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Note: updating credentials will automatically disconnect this database.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">DATABASE TYPE</span>
                  <input
                    type="text"
                    value={credentialsTarget?.databaseTypeName ?? '—'}
                    disabled
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-neutral-100 px-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">DATABASE</span>
                  <input
                    type="text"
                    value={credentialsTarget?.databaseProductName ?? '—'}
                    disabled
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-neutral-100 px-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">DISPLAY NAME</span>
                <input
                  type="text"
                  value={credDisplayName}
                  onChange={(e) => setCredDisplayName(e.target.value)}
                  disabled={credentialsSaving}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">HOST</span>
                  <input
                    type="text"
                    value={credHost}
                    onChange={(e) => setCredHost(e.target.value)}
                    disabled={credentialsSaving}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:w-28">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">PORT</span>
                  <input
                    type="text"
                    value={credPort}
                    onChange={(e) => setCredPort(e.target.value)}
                    disabled={credentialsSaving || (isMongoCredentialsSelection && credMongoUseSrv)}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </div>
              </div>
              {isMongoCredentialsSelection ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800">
                  <input
                    type="checkbox"
                    checked={credMongoUseSrv}
                    className="peer sr-only"
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCredMongoUseSrv(checked);
                      if (checked) setCredPort('27017');
                    }}
                    disabled={credentialsSaving}
                  />
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span>Use `mongodb+srv` URI (recommended for MongoDB Atlas)</span>
                </label>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">DATABASE NAME</span>
                  <input
                    type="text"
                    value={credDatabaseName}
                    onChange={(e) => setCredDatabaseName(e.target.value)}
                    disabled={credentialsSaving}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">USERNAME</span>
                  <input
                    type="text"
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    disabled={credentialsSaving}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">PASSWORD</span>
                <div className="relative">
                  <input
                    type={credPasswordVisible ? 'text' : 'password'}
                    value={credPassword}
                    onChange={(e) => setCredPassword(e.target.value)}
                    disabled={credentialsSaving}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-10 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                  <button
                    type="button"
                    onClick={() => setCredPasswordVisible((v) => !v)}
                    disabled={credentialsSaving}
                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center text-neutral-500 transition hover:text-neutral-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
                    aria-label={credPasswordVisible ? 'Hide password' : 'Show password'}
                  >
                    {credPasswordVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">SSL/TLS</span>
                <Select value={credSslMode} onValueChange={setCredSslMode} disabled={credentialsSaving}>
                  <SelectTrigger size="default" className="font-dm-sans h-10 w-full min-h-10 cursor-pointer py-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="font-dm-sans" position="popper" sideOffset={4}>
                    <SelectItem value="disable">Disable</SelectItem>
                    {isMongoCredentialsSelection ? null : (
                      <SelectItem value="preferred">Preferred</SelectItem>
                    )}
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="verify_ca">Verify CA</SelectItem>
                    <SelectItem value="verify_identity">Verify identity</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Use <span className="font-semibold">Required</span> or stronger for production databases. If your
                  local database does not support TLS, use <span className="font-semibold">Disable</span>.
                </p>
              </div>
              {credSslMode === 'verify_ca' || credSslMode === 'verify_identity' ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">CA CERTIFICATE (PEM)</span>
                  <textarea
                    value={credSslCaPem}
                    onChange={(e) => setCredSslCaPem(e.target.value)}
                    disabled={credentialsSaving}
                    rows={4}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </div>
              ) : null}
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Note: updating credentials will automatically disconnect this database.
              </p>
            </>
          )}
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={credentialsSaving}
              onClick={() => {
                setCredentialsOpen(false);
                setCredentialsTarget(null);
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={credentialsSaving || credentialsLoading}
              onClick={() => void submitCredentialsUpdate()}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              {credentialsSaving ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {queryModeDialogTarget ? (
        <ProjectDatabaseQueryModeDialog
          open={queryModeDialogOpen}
          onOpenChange={(open) => {
            setQueryModeDialogOpen(open);
            if (!open) setQueryModeDialogTarget(null);
          }}
          projectId={projectId}
          connectionId={queryModeDialogTarget.id}
          databaseDisplayName={queryModeDialogTarget.databaseName}
          onSaved={() => void onRefresh()}
        />
      ) : null}

      <Dialog open={reconnectBlockedOpen} onOpenChange={setReconnectBlockedOpen}>
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Cannot reconnect database</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            You cannot connect more than one database with a single agent. Agent:{' '}
            <span className="font-semibold">{reconnectBlockedAgentName}</span>
          </p>
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              onClick={() => setReconnectBlockedOpen(false)}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) {
            setDeleteOpen(false);
            setDeleteTarget(null);
            setDeleteConfirmDraft('');
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Delete database</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            {deleteTarget?.source === 'live' ? (
              <>
                This will mark the live connection <span className="font-semibold">{deleteTarget?.databaseName}</span> for
                agent <span className="font-semibold">{deleteTarget?.agentDisplayName}</span> as deleted (it will be
                hidden from the list). Connection schema snapshots and secrets are retained for audit purposes.
              </>
            ) : (
              <>
                This will remove the database <span className="font-semibold">{deleteTarget?.databaseName}</span> for agent{' '}
                <span className="font-semibold">{deleteTarget?.agentDisplayName}</span> from the list, move schema and data
                files to archive storage, and clear table data. The database record is kept as deleted for audit purposes.
              </>
            )}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Type the database name <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">{deleteTarget?.databaseName}</span> to confirm.
          </p>
          <input
            type="text"
            value={deleteConfirmDraft}
            onChange={(e) => setDeleteConfirmDraft(e.target.value)}
            disabled={deleteSaving}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
            placeholder="Database name"
            autoComplete="off"
          />
          <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={deleteSaving}
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
                setDeleteConfirmDraft('');
              }}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                deleteSaving ||
                !deleteTarget ||
                deleteConfirmDraft.trim() !== deleteTarget.databaseName.trim()
              }
              onClick={() => void submitDelete()}
              className="h-10 cursor-pointer rounded-lg border border-red-300 bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-800 dark:hover:bg-red-700"
            >
              {deleteSaving ? 'Deleting…' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
