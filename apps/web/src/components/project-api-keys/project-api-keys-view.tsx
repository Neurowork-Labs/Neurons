/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Copy, Plus, RefreshCw, Search } from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { copyToClipboardWithToast } from '@/lib/cloud-agents/copy-to-clipboard-with-toast';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import { createProjectApiKeyViaApi } from '@/lib/project-api-keys/project-api-keys-api-client';
import {
  type ApiKeyExpiryPreset,
  expiresAtIsoFromPreset,
} from '@/lib/project-api-keys/project-api-keys-expiry-presets';
import { storeProjectApiKeyPlaintextForCopy } from '@/lib/project-api-keys/project-api-key-client-store';
import {
  PROJECT_API_KEYS_PAGE_SIZE,
  useProjectApiKeysPage,
} from '@/lib/project-api-keys/project-api-keys-page-logic';
import {
  primaryCtaDialogButtonClassName,
  primaryCtaToolbarButtonClassName,
} from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

type ProjectApiKeysViewProps = {
  projectId: string;
};

/** Matches `ProjectStorageView` document list grid columns (6 data columns). */
const apiKeysTableGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(11rem,1.6fr)_minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(6rem,.85fr)_minmax(10rem,1.15fr)] sm:gap-4';

const apiKeysRowGridClassName =
  'grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(11rem,1.6fr)_minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(6rem,.85fr)_minmax(10rem,1.15fr)] sm:gap-4 sm:items-center';

const API_KEY_EXPIRY_SELECT_OPTIONS: { value: ApiKeyExpiryPreset; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '365 days' },
  { value: 'custom', label: 'Custom date' },
];

function parseYmdAsUtcDate(value: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const [y, m, d] = raw.split('-').map((part) => Number(part));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function toYmdFromUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatYmdForDisplay(value: string): string {
  const parsed = parseYmdAsUtcDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function ProjectApiKeysView({ projectId }: ProjectApiKeysViewProps) {
  const {
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
    onRefresh,
  } = useProjectApiKeysPage(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [replaceWarnOpen, setReplaceWarnOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [expiryPreset, setExpiryPreset] = useState<ApiKeyExpiryPreset>('30d');
  const [customDateYmd, setCustomDateYmd] = useState('');
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false);
  const [plaintextOnce, setPlaintextOnce] = useState('');
  const [creating, setCreating] = useState(false);

  const hasActiveKey = useMemo(() => keys.some((k) => k.isActive), [keys]);
  const todayUtc = useMemo(() => startOfTodayUtc(), []);
  const selectedCustomDate = useMemo(() => parseYmdAsUtcDate(customDateYmd), [customDateYmd]);
  const tableBusyLabel = debouncedSearch !== '' ? 'Searching…' : 'Loading…';

  function openCreate() {
    if (!isDomainVerified) {
      toast.error('Verify your project domain before creating an API key.');
      return;
    }
    setDraftName('');
    setExpiryPreset('30d');
    setCustomDateYmd('');
    setCustomDatePickerOpen(false);
    setCreateOpen(true);
  }

  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
  }

  async function runCreate(confirmDeactivateOtherActiveKeys: boolean) {
    const name = draftName.trim();
    if (!name) {
      toast.error('Enter a name for this API key.');
      return;
    }
    if (expiryPreset === 'custom' && !customDateYmd.trim()) {
      toast.error('Choose an expiration date or select a different expiration option.');
      return;
    }
    if (expiryPreset === 'custom') {
      const customDate = parseYmdAsUtcDate(customDateYmd);
      if (!customDate) {
        toast.error('Choose a valid custom expiration date.');
        return;
      }
      if (customDate.getTime() < todayUtc.getTime()) {
        toast.error('Expiration date cannot be in the past.');
        return;
      }
    }

    const expiresAt = expiresAtIsoFromPreset(
      expiryPreset,
      expiryPreset === 'custom' ? customDateYmd : null,
    );

    setCreating(true);
    try {
      const res = await createProjectApiKeyViaApi(projectId, {
        name,
        expiresAt,
        confirmDeactivateOtherActiveKeys,
      });

      if (!res.ok) {
        if (res.code === 'ACTIVE_KEY_EXISTS' && !confirmDeactivateOtherActiveKeys) {
          setReplaceWarnOpen(true);
          return;
        }
        toast.error(res.message || 'Could not create API key.');
        return;
      }

      setCreateOpen(false);
      setReplaceWarnOpen(false);
      setPlaintextOnce(res.plaintextKey);
      storeProjectApiKeyPlaintextForCopy(projectId, res.plaintextKey);
      setRevealOpen(true);
      toast.success('API key created.');
      void onRefresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <ProjectTabShell title="API Keys" fullWidthTabContent matchOrganizationMainPadding>
        <div className="flex flex-col gap-5">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 w-full flex-1 items-center gap-3 sm:max-w-xl">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by key name"
                  className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
                  aria-label="Search API keys by name"
                  disabled={!canManage && !loading}
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void onRefresh()}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                aria-label="Refresh API keys"
              >
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} aria-hidden />
              </button>
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className={cn(primaryCtaToolbarButtonClassName, 'inline-flex items-center gap-2')}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create key
              </button>
            ) : null}
          </div>

          {loadError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {loadError}
            </p>
          ) : null}

          {!canManage && !loading && loadError == null ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-300">
              Only organization owners and admins can view and manage API keys for this project.
            </p>
          ) : null}

          {canManage ? (
            <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className={apiKeysTableGridClassName}>
                <div>Name</div>
                <div>Key</div>
                <div>Last used</div>
                <div>Expires at</div>
                <div>Is active</div>
                <div>Created at</div>
              </div>

              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {loading ? (
                  <div className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {tableBusyLabel}
                  </div>
                ) : keys.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
                    {total === 0 && debouncedSearch === ''
                      ? 'No API keys yet. Create one to call the Neurons API from your site.'
                      : 'No API keys match your search.'}
                  </div>
                ) : (
                  keys.map((row) => (
                    <div key={row.id} className={apiKeysRowGridClassName}>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{row.name}</p>
                      </div>
                      <div className="font-mono text-xs text-neutral-700 dark:text-neutral-200">
                        <span title="Only a short prefix is stored for display">{row.keyPrefix}</span>
                        <span className="select-none text-neutral-400">••••••••</span>
                      </div>
                      <div className="text-neutral-700 dark:text-neutral-200">
                        {row.lastUsedAt ? formatAgentTimestamp(row.lastUsedAt) : '—'}
                      </div>
                      <div className="text-neutral-700 dark:text-neutral-200">
                        {row.expiresAt ? formatAgentTimestamp(row.expiresAt) : 'Never'}
                      </div>
                      <div className="text-neutral-700 dark:text-neutral-200">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                            row.isActive
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                          )}
                        >
                          {row.isActive ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="text-neutral-700 dark:text-neutral-200">
                        {formatAgentTimestamp(row.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {canManage && !loading && total > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Showing {(page - 1) * PROJECT_API_KEYS_PAGE_SIZE + 1}-
                {Math.min(page * PROJECT_API_KEYS_PAGE_SIZE, total)} of {total}
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
      </ProjectTabShell>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-plus-jakarta-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Create API key</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="api-key-name" className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
              NAME
            </label>
            <input
              id="api-key-name"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
              placeholder="e.g. Production"
              disabled={creating}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              id="api-key-expiration-label"
              className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              EXPIRATION
            </span>
            <Select
              value={expiryPreset}
              onValueChange={(v) => {
                setExpiryPreset(v as ApiKeyExpiryPreset);
                if (v !== 'custom') {
                  setCustomDatePickerOpen(false);
                }
              }}
              disabled={creating}
            >
              <SelectTrigger
                id="api-key-expiration"
                size="default"
                aria-labelledby="api-key-expiration-label"
                className="font-plus-jakarta-sans h-10 w-full min-h-10 cursor-pointer py-0"
              >
                <SelectValue placeholder="Select expiration" />
              </SelectTrigger>
              <SelectContent className="font-plus-jakarta-sans" position="popper" sideOffset={4}>
                {API_KEY_EXPIRY_SELECT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="font-plus-jakarta-sans">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {expiryPreset === 'custom' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="api-key-exp-custom" className="text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400">
                EXPIRES ON (UTC end of day)
              </label>
              <Popover open={customDatePickerOpen} onOpenChange={setCustomDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    id="api-key-exp-custom"
                    type="button"
                    disabled={creating}
                    className="font-plus-jakarta-sans inline-flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:hover:bg-neutral-900 dark:focus-visible:ring-neutral-600 dark:ring-offset-neutral-950"
                  >
                    <span className={cn(!customDateYmd && 'text-neutral-500 dark:text-neutral-400')}>
                      {customDateYmd ? formatYmdForDisplay(customDateYmd) : 'Pick date'}
                    </span>
                    <CalendarDays className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedCustomDate ?? undefined}
                    onSelect={(nextDate) => {
                      if (!nextDate) return;
                      const normalized = new Date(
                        Date.UTC(
                          nextDate.getFullYear(),
                          nextDate.getMonth(),
                          nextDate.getDate(),
                        ),
                      );
                      if (normalized.getTime() < todayUtc.getTime()) {
                        toast.error('Expiration date cannot be in the past.');
                        return;
                      }
                      setCustomDateYmd(toYmdFromUtcDate(normalized));
                      setCustomDatePickerOpen(false);
                    }}
                    disabled={{ before: todayUtc }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          ) : null}

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            You will only see the full secret once after creation.
            {hasActiveKey
              ? ' This project already has an active key; creating another will deactivate it after you confirm.'
              : null}
          </p>

          <DialogFooter className="mt-2 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={creating}
              onClick={closeCreate}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void runCreate(false)}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex items-center justify-center')}
            >
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={replaceWarnOpen}
        onOpenChange={(open) => {
          if (!open && !creating) setReplaceWarnOpen(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-plus-jakarta-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Replace active API key?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            This project already has an active API key. If you create a new key, the current active key
            will be set to inactive and will stop working for new requests.
          </p>
          <DialogFooter className="mt-2 gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
            <button
              type="button"
              disabled={creating}
              onClick={() => setReplaceWarnOpen(false)}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void runCreate(true)}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex items-center justify-center')}
            >
              {creating ? 'Creating…' : 'Deactivate old key & create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revealOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPlaintextOnce('');
            setRevealOpen(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-plus-jakarta-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Your new API key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Copy this key now. For security, this key will not be shown again.
          </p>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950">
            <code className="min-w-0 flex-1 break-all font-mono text-sm leading-snug text-neutral-900 dark:text-neutral-100">
              {plaintextOnce}
            </code>
            <button
              type="button"
              onClick={() =>
                void copyToClipboardWithToast(plaintextOnce, {
                  successMessage: 'API key copied',
                })
              }
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
              aria-label="Copy API key"
            >
              <Copy className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => {
                setPlaintextOnce('');
                setRevealOpen(false);
              }}
              className={cn(primaryCtaDialogButtonClassName, 'inline-flex w-full items-center justify-center sm:w-auto')}
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
