/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { ExtractedTableDataRow } from '@/lib/project-database/export-layouts/types';

/**
 * Parses phpMyAdmin "Export → JSON" array exports.
 * @see docs/db-schema/export-layouts/phpmyadmin-json.md
 */
export function parsePhpMyAdminJsonExport(
  parsed: unknown,
): { ok: true; tables: ExtractedTableDataRow[] } | { ok: false; message: string } {
  if (!Array.isArray(parsed)) {
    return { ok: false, message: 'PHPMyAdmin JSON export must be a top-level JSON array.' };
  }

  const tables: ExtractedTableDataRow[] = [];

  for (const item of parsed) {
    if (item === null || typeof item !== 'object') {
      continue;
    }
    const o = item as Record<string, unknown>;
    if (o.type !== 'table') {
      continue;
    }

    const nameRaw = o.name;
    const databaseRaw = o.database;
    const dataRaw = o.data;

    if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
      return { ok: false, message: 'Invalid PHPMyAdmin export: a table block is missing a valid name.' };
    }

    const schemaName =
      typeof databaseRaw === 'string' && databaseRaw.trim() ? databaseRaw.trim() : 'public';

    if (!Array.isArray(dataRaw)) {
      return {
        ok: false,
        message: `Invalid PHPMyAdmin export: table "${nameRaw.trim()}" data must be a JSON array.`,
      };
    }

    const tableData = dataRaw;
    const rowCountEstimate = tableData.length;
    const payloadBytes = Buffer.byteLength(JSON.stringify(tableData), 'utf8');

    tables.push({
      schemaName,
      tableName: nameRaw.trim(),
      tableData,
      rowCountEstimate,
      payloadBytes,
    });
  }

  if (tables.length === 0) {
    return {
      ok: false,
      message: 'No table blocks found in PHPMyAdmin JSON export (expected objects with type "table").',
    };
  }

  return { ok: true, tables };
}
