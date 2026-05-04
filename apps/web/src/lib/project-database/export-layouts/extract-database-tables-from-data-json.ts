/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

import { parsePhpMyAdminJsonExport } from '@/lib/project-database/export-layouts/phpmyadmin-json-parser';
import type { ExtractedTableDataRow } from '@/lib/project-database/export-layouts/types';

export type ExtractDataJsonResult =
  | {
      ok: true;
      strategy: 'phpmyadmin';
      tables: ExtractedTableDataRow[];
    }
  | {
      ok: true;
      strategy: 'legacy-blob';
      tableData: unknown;
      rowCountEstimate: number;
      payloadBytes: number;
    }
  | { ok: false; message: string };

function legacyBlobMetrics(parsedJson: unknown): { rowCountEstimate: number; payloadBytes: number } {
  const payloadBytes = Buffer.byteLength(JSON.stringify(parsedJson), 'utf8');
  let rowCountEstimate = 0;
  if (Array.isArray(parsedJson)) {
    rowCountEstimate = parsedJson.length;
  } else if (
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    Array.isArray((parsedJson as { rows?: unknown }).rows)
  ) {
    rowCountEstimate = ((parsedJson as { rows: unknown[] }).rows.length ?? 0);
  }
  return { rowCountEstimate, payloadBytes };
}

/**
 * Dispatches on `database_export_layouts.format` + `.platform` (case-insensitive).
 * Add new strategies here when new export layouts are introduced.
 */
export function extractDatabaseTablesFromDataJson(args: {
  format: string;
  platform: string;
  parsedJson: unknown;
  /** When set (e.g. upload file size), used for legacy `payload_bytes` instead of JSON.stringify length. */
  rawDataBytesLength?: number;
}): ExtractDataJsonResult {
  const format = String(args.format ?? '').trim().toLowerCase();
  const platform = String(args.platform ?? '').trim().toLowerCase();

  if (format === 'json' && platform === 'phpmyadmin') {
    const r = parsePhpMyAdminJsonExport(args.parsedJson);
    if (!r.ok) {
      return { ok: false, message: r.message };
    }
    return { ok: true, strategy: 'phpmyadmin', tables: r.tables };
  }

  const { rowCountEstimate, payloadBytes } = legacyBlobMetrics(args.parsedJson);
  return {
    ok: true,
    strategy: 'legacy-blob',
    tableData: args.parsedJson,
    rowCountEstimate,
    payloadBytes:
      typeof args.rawDataBytesLength === 'number' && Number.isFinite(args.rawDataBytesLength)
        ? args.rawDataBytesLength
        : payloadBytes,
  };
}
