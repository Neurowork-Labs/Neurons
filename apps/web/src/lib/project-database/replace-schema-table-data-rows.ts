/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ExtractedTableDataRow } from '@/lib/project-database/export-layouts/types';

const INSERT_CHUNK_SIZE = 80;

type SupabaseServer = Pick<SupabaseClient, 'from'>;

export async function replaceSchemaTableDataRows(
  supabase: SupabaseServer,
  args: {
    schemaId: string;
    organizationId: string;
    projectAgentId: string;
    dataDocumentId: string;
    tables: ExtractedTableDataRow[];
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error: delErr } = await supabase
    .from('document_database_table_data')
    .delete()
    .eq('schema_id', args.schemaId);

  if (delErr) {
    return { ok: false, message: delErr.message };
  }

  for (let i = 0; i < args.tables.length; i += INSERT_CHUNK_SIZE) {
    const slice = args.tables.slice(i, i + INSERT_CHUNK_SIZE);
    const rows = slice.map((t) => ({
      schema_id: args.schemaId,
      organization_id: args.organizationId,
      project_agent_id: args.projectAgentId,
      document_id: args.dataDocumentId,
      schema_name: t.schemaName,
      table_name: t.tableName,
      table_data: t.tableData,
      row_count_estimate: t.rowCountEstimate,
      payload_bytes: t.payloadBytes,
    }));

    const { error: insErr } = await supabase.from('document_database_table_data').insert(rows);
    if (insErr) {
      return { ok: false, message: insErr.message };
    }
  }

  const { error: tcErr } = await supabase
    .from('document_database_schemas')
    .update({
      table_count: args.tables.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.schemaId);

  if (tcErr) {
    return { ok: false, message: tcErr.message };
  }

  return { ok: true };
}
