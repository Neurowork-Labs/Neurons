/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

/** Matches `public.database_types.name` seed for MongoDB family (see docs/db-schema migrations). */
export const NON_RELATIONAL_DATABASE_TYPE_NAME = 'Non-Relational';

export type QueryTemplateDialect = 'sql' | 'mongo_json';

export function queryTemplateDialectFromDatabaseTypeName(
  databaseTypeName: string | null | undefined,
): QueryTemplateDialect {
  const n = String(databaseTypeName ?? '').trim();
  return n === NON_RELATIONAL_DATABASE_TYPE_NAME ? 'mongo_json' : 'sql';
}
