/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/
'use client';

import { useEffect, useRef } from 'react';
import {
  Check,
  Download,
  EllipsisVertical,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectTabShell } from '@/components/projects/project-tab-shell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatAgentTimestamp } from '@/lib/cloud-agents/cloud-agent-detail-format';
import { primaryCtaDialogButtonClassName, primaryCtaToolbarButtonClassName } from '@/lib/ui/primary-cta-button';
import { cn } from '@/lib/utils';
import {
  statusPillClassName,
  statusLabel,
  formatBytes,
  fileExtensionLabel,
  storageUsageProgressBarClassName,
  storageUsageProgressPercent,
  storageUsageText,
} from '@/lib/storage/storage-format';
import { useProjectStoragePage } from '@/lib/storage/storage-page-logic';

export function ProjectStorageView({ projectId }: { projectId: string }) {
  const {
    usage,
    documents,
    filteredDocuments,
    loadError,
    loading,
    isRefreshing,
    search,
    setSearch,
    formatFilter,
    setFormatFilter,
    formatOptions,
    uploadAgentOptions,
    uploadTargetsDialogOpen,
    selectedUploadAgentIds,
    setSelectedUploadAgentIds,
    submitUploadTargets,
    closeUploadTargetsDialog,
    onRefresh,
    page,
    totalPages,
    totalRows,
    pageSize,
    pagedDocuments,
    onPrevPage,
    onNextPage,
    maxSingleFileUploadMb,
    confirmOpen,
    pendingFileName,
    onPickFile,
    checkingConflict,
    uploading,
    onConfirmKeepExisting,
    onConfirmReplace,
    renameDialogOpen,
    renameDraftFileName,
    setRenameDraftFileName,
    renaming,
    openRenameDialog,
    submitRename,
    closeRenameDialog,
    deleting,
    deleteDialogOpen,
    deleteConfirmAgentName,
    deleteDraftAgentName,
    canSubmitDeleteConfirm,
    setDeleteDraftAgentName,
    openDeleteDialog,
    submitDeleteConfirm,
    closeDeleteDialog,
    embeddingJobDeleteWarningOpen,
    embeddingJobDeleteWarningDoc,
    confirmEmbeddingJobDeleteWarning,
    closeEmbeddingJobDeleteWarning,
    chunkImpactDeleteWarningOpen,
    chunkImpactDeleteWarningDoc,
    confirmChunkImpactDeleteWarning,
    closeChunkImpactDeleteWarning,
    activeActionMenuDocumentId,
    setActiveActionMenuDocumentId,
    downloadingDocumentId,
    downloadStorageDocument,
    closeConfirmDialog,
  } = useProjectStoragePage(projectId);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const progressPercent = storageUsageProgressPercent(usage);
  const progressBarClassName = storageUsageProgressBarClassName(usage);

  useEffect(() => {
    if (!activeActionMenuDocumentId) return;
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!target?.closest('[data-storage-action-menu-root="true"]')) {
        setActiveActionMenuDocumentId(null);
      }
    }
    function onDocKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveActionMenuDocumentId(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [activeActionMenuDocumentId, setActiveActionMenuDocumentId]);

  return (
    <ProjectTabShell
      title="Storage"
      fullWidthTabContent
      matchOrganizationMainPadding
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Organization storage usage
            </p>
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {usage ? storageUsageText(usage) : '—'}
            </p>
          </div>

          <div className="mt-3 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800" aria-label="Storage usage progress">
            <div
              className={cn('h-2 rounded-full transition-[width] duration-200', progressBarClassName)}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Max upload file size is {maxSingleFileUploadMb} MB.
          </p>
        </div>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 w-full sm:flex-1 sm:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by document name"
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50 dark:focus:border-neutral-500"
              aria-label="Search documents by name"
            />
          </div>

          <Select
            value={formatFilter}
            onValueChange={setFormatFilter}
            disabled={loading && documents.length === 0}
          >
            <SelectTrigger
              size="sm"
              className="h-9 min-h-9 w-full cursor-pointer py-0 sm:w-[12rem] sm:shrink-0"
            >
              <SelectValue placeholder="All formats" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {formatOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            disabled={loading || isRefreshing}
            onClick={() => void onRefresh()}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            aria-label="Refresh storage documents"
          >
            <RefreshCw
              className={cn('h-4 w-4', loading || isRefreshing ? 'animate-spin' : '')}
              aria-hidden
            />
          </button>

          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const next = e.currentTarget.files?.[0] ?? null;
              // allow selecting the same file twice
              e.currentTarget.value = '';
              void onPickFile(next);
            }}
          />
          <button
            type="button"
            disabled={loading || checkingConflict || uploading}
            onClick={() => uploadInputRef.current?.click()}
            className={cn(
              primaryCtaToolbarButtonClassName,
              'inline-flex items-center gap-2',
            )}
            aria-label="Upload document"
          >
            <Upload className="h-4 w-4" aria-hidden />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {loadError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div
            className="grid grid-cols-1 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:grid-cols-[minmax(15rem,2.4fr)_minmax(8rem,1.2fr)_minmax(5rem,.8fr)_minmax(5rem,.8fr)_minmax(6rem,.9fr)_minmax(10rem,1.1fr)_3.25rem] sm:gap-4"
          >
            <div>File name</div>
            <div>Agent</div>
            <div>File type</div>
            <div>File size</div>
            <div>Status</div>
            <div>Uploaded</div>
            <div className="sm:text-right">Action</div>
          </div>

          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {!loading && !loadError && filteredDocuments.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
                {documents.length === 0
                  ? 'No documents are available yet.'
                  : 'No documents match your search or format filter.'}
              </div>
            ) : null}

            {!loading
              ? pagedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="grid grid-cols-1 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(15rem,2.4fr)_minmax(8rem,1.2fr)_minmax(5rem,.8fr)_minmax(5rem,.8fr)_minmax(6rem,.9fr)_minmax(10rem,1.1fr)_3.25rem] sm:gap-4 sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                        {doc.fileName}
                      </p>
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200">
                      {doc.agentDisplayName}
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200">
                      {fileExtensionLabel(doc.fileExtension)}
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200">
                      {formatBytes(doc.fileSizeBytes)}
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200">
                      <span className={statusPillClassName(String(doc.status))}>
                        {statusLabel(String(doc.status))}
                      </span>
                    </div>
                    <div className="text-neutral-700 dark:text-neutral-200">
                      {formatAgentTimestamp(doc.uploadedAt)}
                    </div>
                    <div className="relative flex sm:justify-end" data-storage-action-menu-root="true">
                      <button
                        type="button"
                        data-storage-action-menu-root="true"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-neutral-300 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        aria-label="Open document actions"
                        onClick={() =>
                          setActiveActionMenuDocumentId((prev) =>
                            prev === doc.id ? null : doc.id,
                          )
                        }
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </button>
                      {activeActionMenuDocumentId === doc.id ? (
                        <div
                          data-storage-action-menu-root="true"
                          className="absolute right-0 top-9 z-20 min-w-[10.5rem] rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <button
                            type="button"
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            onClick={() => openRenameDialog(doc)}
                          >
                            <PencilLine className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Rename
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(downloadingDocumentId)}
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            onClick={() => void downloadStorageDocument(doc)}
                          >
                            <Download className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Download
                          </button>
                          <button
                            type="button"
                            disabled={deleting}
                            className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40"
                            onClick={() => {
                              openDeleteDialog(doc);
                            }}
                          >
                            <Trash2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>

        {filteredDocuments.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, totalRows)} of {totalRows}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={onPrevPage}
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
                onClick={onNextPage}
                className="h-8 cursor-pointer rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={uploadTargetsDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeUploadTargetsDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              Select agents for upload
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            Choose one or more connected agents for this file upload.
          </p>

          <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            {uploadAgentOptions.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                No connected agents available.
              </p>
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
                            prev.includes(opt.projectAgentId)
                              ? prev
                              : [...prev, opt.projectAgentId],
                          );
                          return;
                        }
                        setSelectedUploadAgentIds((prev) =>
                          prev.filter((id) => id !== opt.projectAgentId),
                        );
                      }}
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-neutral-500 bg-transparent text-transparent transition peer-checked:border-emerald-700 peer-checked:bg-emerald-700 peer-checked:text-white dark:border-neutral-400 dark:peer-checked:border-emerald-600 dark:peer-checked:bg-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm text-neutral-800 dark:text-neutral-200">
                      {opt.agentDisplayName}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={uploading || checkingConflict}
              onClick={closeUploadTargetsDialog}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={uploading || checkingConflict || uploadAgentOptions.length === 0}
              onClick={() => void submitUploadTargets()}
              className={cn(
                primaryCtaDialogButtonClassName,
                'inline-flex h-10 items-center justify-center px-4',
              )}
            >
              {checkingConflict ? 'Checking…' : 'Continue'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) closeConfirmDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              Keep existing file?
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            A document named <span className="font-medium">{pendingFileName ?? '—'}</span>{' '}
            already exists. Do you want to keep the existing file (version the new upload), or replace it?
          </p>

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={uploading}
              onClick={onConfirmReplace}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={onConfirmKeepExisting}
              className={cn(
                primaryCtaDialogButtonClassName,
                'inline-flex h-10 items-center justify-center px-4',
              )}
            >
              {uploading ? 'Working…' : 'Keep existing'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeRenameDialog();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Rename file</DialogTitle>
          </DialogHeader>

          <input
            type="text"
            value={renameDraftFileName}
            onChange={(e) => setRenameDraftFileName(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
            placeholder="Enter file name"
          />

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              disabled={renaming}
              onClick={closeRenameDialog}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={renaming}
              onClick={() => void submitRename()}
              className={cn(
                primaryCtaDialogButtonClassName,
                'inline-flex h-10 items-center justify-center px-4',
              )}
            >
              {renaming ? 'Renaming…' : 'Rename'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={chunkImpactDeleteWarningOpen}
        onOpenChange={(open) => {
          if (!open) closeChunkImpactDeleteWarning();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              Delete indexed knowledge?
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            {chunkImpactDeleteWarningDoc ? (
              <>
                This file is connected to{' '}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {chunkImpactDeleteWarningDoc.agentDisplayName}
                </span>{' '}
                and its chunks are already stored. Deleting this file will remove those chunks and
                reduce that agent&apos;s knowledge base.
              </>
            ) : (
              'This file is indexed and has stored chunks. Deleting it will reduce the related agent knowledge base.'
            )}
          </p>
          {chunkImpactDeleteWarningDoc ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              File:{' '}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {chunkImpactDeleteWarningDoc.fileName}
              </span>
            </p>
          ) : null}

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              onClick={closeChunkImpactDeleteWarning}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmChunkImpactDeleteWarning}
              className={cn(
                primaryCtaDialogButtonClassName,
                'inline-flex h-10 items-center justify-center px-4',
              )}
            >
              Continue to delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={embeddingJobDeleteWarningOpen}
        onOpenChange={(open) => {
          if (!open) closeEmbeddingJobDeleteWarning();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="font-dm-sans flex max-w-[calc(100%-1.5rem)] flex-col gap-4 border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <DialogHeader>
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">
              Cancel embedding job?
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            {embeddingJobDeleteWarningDoc ? (
              <>
                This file is being processed for{' '}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {embeddingJobDeleteWarningDoc.agentDisplayName}
                </span>
                . Deleting it will cancel that work and remove this document from that agent’s
                knowledge base.
              </>
            ) : (
              'This file is still being processed. Deleting it may affect your agent’s knowledge base.'
            )}
          </p>
          {embeddingJobDeleteWarningDoc ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              File:{' '}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {embeddingJobDeleteWarningDoc.fileName}
              </span>
            </p>
          ) : null}

          <DialogFooter className="mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <button
              type="button"
              onClick={closeEmbeddingJobDeleteWarning}
              className="h-10 cursor-pointer rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEmbeddingJobDeleteWarning}
              className={cn(
                primaryCtaDialogButtonClassName,
                'inline-flex h-10 items-center justify-center px-4',
              )}
            >
              Continue to delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle className="text-neutral-900 dark:text-neutral-50">Confirm delete</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            This will delete the file, so it will no longer be accessible from active storage.
          </p>
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            To continue, type the agent name:
            <span className="ml-1 font-semibold">{deleteConfirmAgentName || '—'}</span>
          </p>

          <input
            type="text"
            value={deleteDraftAgentName}
            onChange={(e) => setDeleteDraftAgentName(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500"
            placeholder="Enter agent name to confirm"
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
              disabled={deleting || !canSubmitDeleteConfirm}
              onClick={() => void submitDeleteConfirm()}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProjectTabShell>
  );
}

