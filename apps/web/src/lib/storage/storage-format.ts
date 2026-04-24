/*
*  author: Yagnik Poshiya
*  github: https://github.com/yagnikposhiya/Neurons
*/

import type { StorageUsageSummary } from '@/lib/storage/storage-types';

export function bytesToMb(bytes: number): number {
  return bytes / (1024 * 1024);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${abs.toFixed(0)} B`;
  if (abs < 1024 * 1024) return `${(abs / 1024).toFixed(abs < 1024 * 1024 / 10 ? 1 : 0)} KB`;
  if (abs < 1024 * 1024 * 1024)
    return `${(abs / (1024 * 1024)).toFixed(abs < 1024 * 1024 * 10 ? 1 : 0)} MB`;
  return `${(abs / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function getFileExtensionLower(fileName: string): string {
  const trimmed = String(fileName ?? '').trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return 'unknown';
  return trimmed.slice(lastDot + 1).toLowerCase();
}

export function fileExtensionLabel(extLower: string): string {
  const ext = String(extLower ?? '').toLowerCase();
  if (!ext || ext === 'unknown') return 'Unknown';
  return ext.toUpperCase();
}

export function splitFileNameAndExt(fileName: string): {
  baseName: string;
  extWithDot: string;
  extLowerNoDot: string;
} {
  const trimmed = String(fileName ?? '').trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { baseName: trimmed, extWithDot: '', extLowerNoDot: '' };
  }
  const baseName = trimmed.slice(0, lastDot);
  const extWithDot = trimmed.slice(lastDot); // includes dot
  const extLowerNoDot = extWithDot.slice(1).toLowerCase();
  return { baseName, extWithDot, extLowerNoDot };
}

export function makeVersionedFileName(fileName: string, version: number): string {
  const { baseName, extWithDot } = splitFileNameAndExt(fileName);
  const v = Math.max(2, Math.floor(Number(version)));
  if (!extWithDot) return `${baseName}__v${v}`;
  return `${baseName}__v${v}${extWithDot}`;
}

export function statusLabel(status: string): string {
  const s = String(status ?? '').trim();
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusPillClassName(status: string): string {
  const s = String(status ?? '').trim();
  switch (s) {
    case 'ready':
      return 'inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'processing':
      return 'inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
    case 'failed':
      return 'inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';
    case 'pending':
    default:
      return 'inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200';
  }
}

export function inferMimeTypeFromFileName(fileName: string): string {
  const ext = getFileExtensionLower(fileName);
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    case 'txt':
    case 'log':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'yaml':
      return 'application/yaml';
    case 'rtf':
      return 'application/rtf';
    case 'pages':
      return 'application/x-iwork-pages-sffpages';
    case 'odt':
      return 'application/vnd.oasis.opendocument.text';
    default:
      return 'application/octet-stream';
  }
}

export function storageUsageText(usage: StorageUsageSummary): string {
  if (usage.allowedBytes == null) {
    return `Used ${usage.usedMb.toFixed(1)} MB (Unlimited)`;
  }
  return `Used ${usage.usedMb.toFixed(1)} MB of ${usage.allowedMb?.toFixed(0)} MB (${usage.usagePercent.toFixed(
    0,
  )}%)`;
}

export function storageUsageProgressPercent(usage: StorageUsageSummary | null): number {
  if (!usage) return 0;
  if (usage.allowedBytes == null) return 100;
  return Math.max(0, Math.min(100, usage.usagePercent));
}

export function storageUsageProgressBarClassName(usage: StorageUsageSummary | null): string {
  if (!usage) return 'bg-emerald-700';
  if (usage.allowedBytes == null) return 'bg-neutral-600 dark:bg-neutral-400';
  if (usage.usagePercent >= 100) return 'bg-rose-600 dark:bg-rose-500';
  if (usage.usagePercent >= 80) return 'bg-orange-500 dark:bg-orange-400';
  return 'bg-emerald-700 dark:bg-emerald-600';
}

