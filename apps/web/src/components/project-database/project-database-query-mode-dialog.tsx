/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

'use client';

import { useEffect, useState } from 'react';
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
import {
  fetchProjectDatabaseConnectionQueryModeViaApi,
  updateProjectDatabaseConnectionQueryModeViaApi,
} from '@/lib/project-database/project-database-api-client';
import { primaryCtaDialogButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

type QueryMode = 'generated' | 'template_preferred' | 'template_only';

type ProjectDatabaseQueryModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  connectionId: string;
  /** Shown in the title alongside "Query mode". */
  databaseDisplayName?: string | null;
  onSaved?: () => void;
};

export function ProjectDatabaseQueryModeDialog({
  open,
  onOpenChange,
  projectId,
  connectionId,
  databaseDisplayName,
  onSaved,
}: ProjectDatabaseQueryModeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<QueryMode>('template_only');
  const [draft, setDraft] = useState<QueryMode>('template_only');

  useEffect(() => {
    if (!open || !String(connectionId).trim()) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchProjectDatabaseConnectionQueryModeViaApi(projectId, connectionId);
      if (cancelled) return;
      if (res.ok) {
        setSaved(res.queryMode);
        setDraft(res.queryMode);
      } else {
        toast.error(res.message || 'Could not load query mode. Using default.');
        setSaved('template_only');
        setDraft('template_only');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, connectionId]);

  async function save() {
    if (!String(connectionId).trim()) return;
    if (draft === saved) return;
    setSaving(true);
    try {
      const res = await updateProjectDatabaseConnectionQueryModeViaApi(projectId, connectionId, {
        queryMode: draft,
      });
      if (res.ok) {
        setSaved(res.queryMode);
        setDraft(res.queryMode);
        toast.success('Query mode updated.');
        onSaved?.();
        onOpenChange(false);
      } else {
        toast.error(res.message || 'Could not update query mode.');
      }
    } finally {
      setSaving(false);
    }
  }

  const titleSuffix = databaseDisplayName?.trim() ? ` : ${databaseDisplayName.trim()}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-neutral-900 dark:text-neutral-50">Query mode{titleSuffix}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[14rem] flex-col gap-4">
          {loading ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading…</p>
          ) : (
            <>
              <div className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
                <p>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-50">Template only:</span> only
                  approved query templates run. Generated SQL is not used.
                </p>
                <p>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-50">Template preferred:</span>{' '}
                  the agent tries templates first; if none fit, it may generate SQL.
                </p>
                <p>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-50">Generated:</span> SQL is
                  generated for each request; templates are not required.
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Query execution mode
                </p>
                <Select
                  value={draft}
                  onValueChange={(value) => setDraft(value as QueryMode)}
                  disabled={saving}
                >
                  <SelectTrigger
                    size="sm"
                    className="mt-1.5 h-10 min-h-10 w-full cursor-pointer py-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]" position="popper" sideOffset={4}>
                    <SelectItem value="template_only">Template only (recommended)</SelectItem>
                    <SelectItem value="template_preferred" disabled>
                      Template preferred (coming soon)
                    </SelectItem>
                    <SelectItem value="generated" disabled>
                      Generated (coming soon)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700 sm:justify-end">
          <button
            type="button"
            disabled={saving || loading || draft === saved}
            onClick={() => void save()}
            className={cn(primaryCtaDialogButtonClassName, 'inline-flex h-10 items-center justify-center px-4')}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
