/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/neuroworklabs/Neurons
 */
'use client';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import { useProjectSettingsPage } from '@/lib/project-settings/project-settings-page-logic';
import { formatProjectStatusLabel } from '@/lib/projects/project-status-label';
import { primaryCtaToolbarButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';

const fieldLabelClass =
  'text-[11px] font-semibold tracking-wider text-neutral-500 dark:text-neutral-400';

const inputClassName =
  'h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500';

const textareaClassName =
  'min-h-[100px] w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500';

const readOnlyValueClassName = 'text-sm text-neutral-900 dark:text-neutral-200';

export function ProjectSettingsView({ projectId }: { projectId: string }) {
  const {
    settings,
    loadError,
    loading,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    saving,
    dirty,
    onDiscard,
    onSave,
    deleteDialogOpen,
    deleteConfirmTitle,
    setDeleteConfirmTitle,
    openDeleteDialog,
    closeDeleteDialog,
    onConfirmDelete,
    deleting,
    deleteNameMatches,
  } = useProjectSettingsPage(projectId);

  const canManage = settings?.canManage === true;

  return (
    <ProjectTabShell title="Project Settings" fullWidthTabContent matchOrganizationMainPadding>
      <div className="flex flex-col gap-5">
        {loadError != null ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        {loading && settings == null && loadError == null ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading settings…</p>
        ) : null}

        {settings != null ? (
          <>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                General
              </p>
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-start">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="project-settings-title" className={fieldLabelClass}>
                      TITLE
                    </label>
                    <input
                      id="project-settings-title"
                      type="text"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      disabled={!canManage}
                      className={cn(inputClassName, !canManage && 'cursor-not-allowed opacity-80')}
                      autoComplete="off"
                      aria-label="Project title"
                    />
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={fieldLabelClass}>DOMAIN</span>
                    <p
                      className={cn(
                        readOnlyValueClassName,
                        'flex min-h-9 items-center truncate leading-snug',
                      )}
                      title={
                        settings.domain != null && settings.domain.trim() !== ''
                          ? settings.domain
                          : undefined
                      }
                    >
                      {settings.domain != null && settings.domain.trim() !== ''
                        ? settings.domain
                        : '—'}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={fieldLabelClass}>PROJECT STATUS</span>
                    <p className={cn(readOnlyValueClassName, 'flex min-h-9 items-center leading-snug')}>
                      {formatProjectStatusLabel(settings.statusName)}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={fieldLabelClass}>DOMAIN VERIFICATION</span>
                    <p className={cn(readOnlyValueClassName, 'flex min-h-9 items-center leading-snug')}>
                      {settings.isDomainVerified ? 'Verified' : 'Not verified'}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className={fieldLabelClass}>VERIFIED AT</span>
                    <p
                      className={cn(
                        readOnlyValueClassName,
                        'flex min-h-9 items-center truncate leading-snug',
                      )}
                      title={
                        settings.isDomainVerified
                          ? formatAgentTimestamp(settings.domainVerifiedAt)
                          : undefined
                      }
                    >
                      {settings.isDomainVerified
                        ? formatAgentTimestamp(settings.domainVerifiedAt)
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="project-settings-description" className={fieldLabelClass}>
                    DESCRIPTION
                  </label>
                  <textarea
                    id="project-settings-description"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    disabled={!canManage}
                    className={cn(textareaClassName, !canManage && 'cursor-not-allowed opacity-80')}
                    aria-label="Project description"
                  />
                </div>
              </div>

              {canManage ? (
                <div
                  className={cn(
                    'mt-6 flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center dark:border-neutral-700',
                    dirty ? 'sm:justify-between' : 'sm:justify-end',
                  )}
                >
                  {dirty ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={onDiscard}
                      className="h-9 w-full cursor-pointer rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                    >
                      Discard
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving || !dirty || !draftTitle.trim()}
                    onClick={() => void onSave()}
                    className={primaryCtaToolbarButtonClassName}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              ) : null}
            </div>

            {canManage ? (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/60 dark:bg-red-950/20">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Danger zone
                </p>
                <p className="mt-2 text-sm text-red-800/90 dark:text-red-200/90">
                  Deleting this project cannot be undone. You will not be able to open or access this
                  project again after deletion.
                </p>
                <button
                  type="button"
                  onClick={openDeleteDialog}
                  className="mt-4 inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  Delete Project
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Delete Project</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Once this project is deleted, it cannot be accessed again.
          </p>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            To confirm, type the project name exactly:
            <span className="ml-1 font-semibold text-neutral-900 dark:text-neutral-50">
              {settings?.title ?? '—'}
            </span>
          </p>

          <input
            type="text"
            value={deleteConfirmTitle}
            onChange={(e) => setDeleteConfirmTitle(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
            placeholder="Enter project name"
            aria-label="Type project name to confirm deletion"
            disabled={deleting}
          />

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={deleting}
              onClick={closeDeleteDialog}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting || !deleteNameMatches}
              onClick={() => void onConfirmDelete()}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleting ? 'Deleting…' : 'Delete Project'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectTabShell>
  );
}
