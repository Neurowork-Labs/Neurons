/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type {
  StorageDocumentItem,
  StorageFormatOption,
  StorageUploadAgentOption,
  StorageUsageSummary,
} from '@/lib/storage/storage-types';
import {
  checkProjectStorageUploadConflictViaApi,
  deleteProjectStorageDocumentViaApi,
  downloadProjectStorageDocumentViaApi,
  fetchProjectStorageViaApi,
  renameProjectStorageDocumentViaApi,
  uploadProjectStorageDocumentViaApi,
} from '@/lib/storage/storage-api-client';

const ALL_FORMATS_VALUE = 'all';
const STORAGE_ROWS_PER_PAGE = 15;
const MAX_SINGLE_FILE_UPLOAD_BYTES = 5 * 1024 * 1024;
const FILE_SIZE_LIMIT_ERROR_HINT = 'Max file size is 5 MB.';

export function useProjectStoragePage(projectId: string) {
  const [usage, setUsage] = useState<StorageUsageSummary | null>(null);
  const [documents, setDocuments] = useState<StorageDocumentItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Initial full-page load only (first fetch). */
  const [loading, setLoading] = useState(true);
  /** Manual refresh or post-mutation reload — shows spinner on the refresh control only. */
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialLoadCompletedRef = useRef(false);

  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>(ALL_FORMATS_VALUE);

  const [formatOptions, setFormatOptions] = useState<StorageFormatOption[]>([]);
  const [uploadAgentOptions, setUploadAgentOptions] = useState<StorageUploadAgentOption[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTargetsDialogOpen, setUploadTargetsDialogOpen] = useState(false);
  const [selectedUploadAgentIds, setSelectedUploadAgentIds] = useState<string[]>([]);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDocumentId, setRenameDocumentId] = useState<string | null>(null);
  const [renameDraftFileName, setRenameDraftFileName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [embeddingJobDeleteWarningOpen, setEmbeddingJobDeleteWarningOpen] = useState(false);
  const [embeddingJobDeleteWarningDoc, setEmbeddingJobDeleteWarningDoc] =
    useState<StorageDocumentItem | null>(null);
  const [chunkImpactDeleteWarningOpen, setChunkImpactDeleteWarningOpen] = useState(false);
  const [chunkImpactDeleteWarningDoc, setChunkImpactDeleteWarningDoc] =
    useState<StorageDocumentItem | null>(null);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleteConfirmAgentName, setDeleteConfirmAgentName] = useState('');
  const [deleteDraftAgentName, setDeleteDraftAgentName] = useState('');
  const canSubmitDeleteConfirm =
    deleteConfirmAgentName.length > 0 && deleteDraftAgentName.trim() === deleteConfirmAgentName;
  const [activeActionMenuDocumentId, setActiveActionMenuDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      if (!initialLoadCompletedRef.current) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setLoadError(null);
    }

    const res = await fetchProjectStorageViaApi(projectId);
    if (!res.ok) {
      if (!silent) {
        setUsage(null);
        setDocuments([]);
        setFormatOptions([]);
        setUploadAgentOptions([]);
        setLoadError(res.message || 'Could not load storage.');
        setLoading(false);
        setIsRefreshing(false);
      }
      return;
    }
    setUsage(res.usage);
    setDocuments(res.documents);
    setFormatOptions(res.formatOptions);
    setUploadAgentOptions(res.uploadAgentOptions);
    setLoadError(null);
    if (!silent) {
      setLoading(false);
      setIsRefreshing(false);
      initialLoadCompletedRef.current = true;
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load({ silent: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const needsPoll = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );
    if (!needsPoll) return;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 12_000);
    return () => window.clearInterval(id);
  }, [documents, load]);

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ext = String(formatFilter ?? '').toLowerCase();
    return documents.filter((d) => {
      if (ext !== ALL_FORMATS_VALUE) {
        if (String(d.fileExtension).toLowerCase() !== ext) return false;
      }
      if (!q) return true;
      return String(d.fileName).toLowerCase().includes(q);
    });
  }, [documents, search, formatFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, formatFilter]);

  const pagination = useMemo(() => {
    const totalRows = filteredDocuments.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / STORAGE_ROWS_PER_PAGE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (safePage - 1) * STORAGE_ROWS_PER_PAGE;
    const endIndex = startIndex + STORAGE_ROWS_PER_PAGE;
    return {
      page: safePage,
      totalPages,
      totalRows,
      pageSize: STORAGE_ROWS_PER_PAGE,
      pagedDocuments: filteredDocuments.slice(startIndex, endIndex),
    };
  }, [filteredDocuments, page]);

  async function onPickFile(file: File | null) {
    if (!file) return;
    if (loading) return;
    if (file.size > MAX_SINGLE_FILE_UPLOAD_BYTES) {
      toast.error(FILE_SIZE_LIMIT_ERROR_HINT);
      return;
    }

    setPendingFile(file);
    setPendingFileName(file.name);
    setSelectedUploadAgentIds(uploadAgentOptions.map((opt) => opt.projectAgentId));
    setUploadTargetsDialogOpen(true);
    setConfirmOpen(false);
  }

  const uploadWithChoice = useCallback(
    async (keepExisting: boolean, fileOverride?: File) => {
      const file = fileOverride ?? pendingFile;
      if (!file) return;
      if (selectedUploadAgentIds.length === 0) {
        toast.error('Select at least one agent.');
        return;
      }

      setUploading(true);
      try {
        const res = await uploadProjectStorageDocumentViaApi(projectId, {
          file,
          keepExisting,
          projectAgentIds: selectedUploadAgentIds,
        });

        if (!res.ok) {
          const msg = (res.message || '').toLowerCase();
          if (
            msg.includes('maximum allowed size') ||
            msg.includes('file too large') ||
            msg.includes('payload too large') ||
            msg.includes('5 mb')
          ) {
            toast.error(FILE_SIZE_LIMIT_ERROR_HINT);
          } else {
            toast.error(res.message || 'Upload failed.');
          }
          return;
        }

        toast.success('Upload started.');
        setConfirmOpen(false);
        setUploadTargetsDialogOpen(false);
        setPendingFile(null);
        setPendingFileName(null);
        setSelectedUploadAgentIds([]);
        setPage(1);
        await load({ silent: false });
      } finally {
        setUploading(false);
      }
    },
    [load, pendingFile, projectId, selectedUploadAgentIds],
  );

  function onConfirmKeepExisting() {
    if (uploading) return;
    void uploadWithChoice(true);
  }

  function onConfirmReplace() {
    if (uploading) return;
    void uploadWithChoice(false);
  }

  async function submitUploadTargets() {
    if (!pendingFile) return;
    if (selectedUploadAgentIds.length === 0) {
      toast.error('Select at least one agent.');
      return;
    }

    setCheckingConflict(true);
    try {
      const checkRes = await checkProjectStorageUploadConflictViaApi(projectId, {
        fileName: pendingFile.name,
        fileSizeBytes: pendingFile.size,
        projectAgentIds: selectedUploadAgentIds,
      });

      if (!checkRes.ok) {
        toast.error(checkRes.message || 'Could not check existing file.');
        return;
      }

      if (checkRes.conflict) {
        setUploadTargetsDialogOpen(false);
        setConfirmOpen(true);
        return;
      }

      await uploadWithChoice(false /* keepExisting */, pendingFile);
    } finally {
      setCheckingConflict(false);
    }
  }

  function openRenameDialog(document: StorageDocumentItem) {
    setRenameDocumentId(document.id);
    setRenameDraftFileName(document.fileName);
    setRenameDialogOpen(true);
    setActiveActionMenuDocumentId(null);
  }

  async function submitRename() {
    if (!renameDocumentId) return;
    const nextName = renameDraftFileName.trim();
    if (!nextName) {
      toast.error('File name is required.');
      return;
    }

    setRenaming(true);
    try {
      const res = await renameProjectStorageDocumentViaApi(projectId, renameDocumentId, {
        fileName: nextName,
      });
      if (!res.ok) {
        toast.error(res.message || 'Could not rename file.');
        return;
      }
      toast.success('File renamed.');
      setRenameDialogOpen(false);
      setRenameDocumentId(null);
      await load({ silent: false });
    } finally {
      setRenaming(false);
    }
  }

  async function deleteDocument(documentId: string) {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await deleteProjectStorageDocumentViaApi(projectId, documentId);
      if (!res.ok) {
        toast.error(res.message || 'Could not delete file.');
        return;
      }
      toast.success('File deleted.');
      await load({ silent: false });
    } finally {
      setDeleting(false);
      setActiveActionMenuDocumentId(null);
    }
  }

  function openDeleteDialog(document: StorageDocumentItem) {
    setActiveActionMenuDocumentId(null);
    const shouldShowChunkImpactWarning =
      document.requiresDocumentEmbedding &&
      document.hasChunksCreated &&
      (document.status === 'processing' || document.status === 'ready');

    if (shouldShowChunkImpactWarning) {
      setChunkImpactDeleteWarningDoc(document);
      setChunkImpactDeleteWarningOpen(true);
      return;
    }

    if (document.hasActiveEmbeddingJob) {
      setEmbeddingJobDeleteWarningDoc(document);
      setEmbeddingJobDeleteWarningOpen(true);
      return;
    }
    setDeleteDocumentId(document.id);
    setDeleteConfirmAgentName(document.agentDisplayName);
    setDeleteDraftAgentName('');
    setDeleteDialogOpen(true);
  }

  function confirmEmbeddingJobDeleteWarning() {
    const doc = embeddingJobDeleteWarningDoc;
    setEmbeddingJobDeleteWarningOpen(false);
    setEmbeddingJobDeleteWarningDoc(null);
    if (!doc) return;
    setDeleteDocumentId(doc.id);
    setDeleteConfirmAgentName(doc.agentDisplayName);
    setDeleteDraftAgentName('');
    setDeleteDialogOpen(true);
  }

  function closeEmbeddingJobDeleteWarning() {
    setEmbeddingJobDeleteWarningOpen(false);
    setEmbeddingJobDeleteWarningDoc(null);
  }

  function confirmChunkImpactDeleteWarning() {
    const doc = chunkImpactDeleteWarningDoc;
    setChunkImpactDeleteWarningOpen(false);
    setChunkImpactDeleteWarningDoc(null);
    if (!doc) return;
    setDeleteDocumentId(doc.id);
    setDeleteConfirmAgentName(doc.agentDisplayName);
    setDeleteDraftAgentName('');
    setDeleteDialogOpen(true);
  }

  function closeChunkImpactDeleteWarning() {
    setChunkImpactDeleteWarningOpen(false);
    setChunkImpactDeleteWarningDoc(null);
  }

  async function downloadStorageDocument(document: StorageDocumentItem) {
    if (downloadingDocumentId) return;
    setDownloadingDocumentId(document.id);
    setActiveActionMenuDocumentId(null);
    try {
      const res = await downloadProjectStorageDocumentViaApi(
        projectId,
        document.id,
        document.fileName,
      );
      if (!res.ok) {
        toast.error(res.message);
      }
    } finally {
      setDownloadingDocumentId(null);
    }
  }

  async function submitDeleteConfirm() {
    if (!deleteDialogOpen || !deleteDocumentId) return;
    if (deleteDraftAgentName.trim() !== deleteConfirmAgentName) {
      toast.error('Please enter the exact agent name to confirm delete.');
      return;
    }
    await deleteDocument(deleteDocumentId);
    setDeleteDialogOpen(false);
    setDeleteDocumentId(null);
    setDeleteConfirmAgentName('');
    setDeleteDraftAgentName('');
  }

  return {
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
    setUploadTargetsDialogOpen,
    selectedUploadAgentIds,
    setSelectedUploadAgentIds,
    submitUploadTargets,
    onRefresh: () => void load({ silent: false }),
    page: pagination.page,
    totalPages: pagination.totalPages,
    totalRows: pagination.totalRows,
    pageSize: pagination.pageSize,
    pagedDocuments: pagination.pagedDocuments,
    onPrevPage: () => setPage((prev) => Math.max(1, prev - 1)),
    onNextPage: () => setPage((prev) => Math.min(pagination.totalPages, prev + 1)),
    setPage,
    maxSingleFileUploadMb: 5,
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
    closeRenameDialog: () => {
      setRenameDialogOpen(false);
      setRenameDocumentId(null);
    },
    deleting,
    deleteDocument,
    deleteDialogOpen,
    deleteConfirmAgentName,
    deleteDraftAgentName,
    canSubmitDeleteConfirm,
    setDeleteDraftAgentName,
    openDeleteDialog,
    submitDeleteConfirm,
    closeDeleteDialog: () => {
      setDeleteDialogOpen(false);
      setDeleteDocumentId(null);
      setDeleteConfirmAgentName('');
      setDeleteDraftAgentName('');
    },
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
    closeConfirmDialog: () => {
      setConfirmOpen(false);
      setPendingFile(null);
      setPendingFileName(null);
      setSelectedUploadAgentIds([]);
    },
    closeUploadTargetsDialog: () => {
      setUploadTargetsDialogOpen(false);
      setPendingFile(null);
      setPendingFileName(null);
      setSelectedUploadAgentIds([]);
    },
  };
}

