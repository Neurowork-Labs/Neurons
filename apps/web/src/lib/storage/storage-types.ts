/* 
*  author: Yagnik Poshiya
*  github: https://github.com/neuroworklabs/Neurons
*/

export type StorageDocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type StorageFormatOption = {
  /** Special value for "no filter". */
  value: string;
  label: string;
};

export type StorageUsageSummary = {
  /** Null => unlimited plan (e.g. Enterprise). */
  allowedBytes: number | null;
  allowedMb: number | null;
  usedBytes: number;
  usedMb: number;
  /** 0-100. For unlimited plans, this is 0. */
  usagePercent: number;
};

export type StorageDocumentItem = {
  id: string;
  fileName: string;
  agentDisplayName: string;
  projectAgentId: string;
  fileType: string;
  /** Bytes */
  fileSizeBytes: number;
  status: StorageDocumentStatus | string;
  /** ISO timestamp */
  uploadedAt: string;
  /** Lowercase extension without dot (e.g. "pdf"). */
  fileExtension: string;
  /** True when an embedding pipeline job is queued or processing for this document. */
  hasActiveEmbeddingJob: boolean;
  /** True when the related agent has requires_document_embedding = TRUE. */
  requiresDocumentEmbedding: boolean;
  /** True when at least one row exists in public.document_chunks for this document. */
  hasChunksCreated: boolean;
};

export type StorageUploadAgentOption = {
  projectAgentId: string;
  agentDisplayName: string;
};

export type StorageListApiResult =
  | {
      ok: true;
      usage: StorageUsageSummary;
      documents: StorageDocumentItem[];
      formatOptions: StorageFormatOption[];
      uploadAgentOptions: StorageUploadAgentOption[];
    }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND';
    };

export type StorageCheckUploadConflictApiResult =
  | { ok: true; conflict: boolean }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' };

export type StorageUploadApiResult =
  | {
      ok: true;
      uploadedDocumentIds: string[];
    }
  | {
      ok: false;
      message: string;
      code?: 'FORBIDDEN' | 'NOT_FOUND' | 'QUOTA_EXCEEDED' | 'BAD_REQUEST' | 'UNAUTHORIZED';
    };

export type RenameStorageDocumentApiResult =
  | { ok: true; documentId: string; fileName: string }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' };

export type DeleteStorageDocumentApiResult =
  | { ok: true; documentId: string }
  | { ok: false; message: string; code?: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' };

