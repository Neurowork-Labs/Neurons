/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

/** One logical table worth of data for `document_database_table_data`. */
export type ExtractedTableDataRow = {
  schemaName: string;
  tableName: string;
  /** Stored in `table_data` jsonb — for PHPMyAdmin this is the `data` array. */
  tableData: unknown;
  rowCountEstimate: number;
  payloadBytes: number;
};
