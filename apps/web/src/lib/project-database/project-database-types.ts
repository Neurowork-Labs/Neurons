/* 
  author: Yagnik Poshiya
  github: https://github.com/neuroworklabs/Neurons
*/

export type DbFilePurpose = 'db-schema-file' | 'data-file';

export type DatabaseTypeRow = {
  id: string;
  name: string;
};

export type DatabaseRow = {
  id: string;
  identifier: string;
  name: string;
  databaseTypeId: string;
};

export type AllowedDbExtensionRow = {
  fileExtension: string;
  purpose: DbFilePurpose;
};

/** Lookup: export format + platform for database uploads (`public.database_export_layouts`). */
export type DatabaseExportLayoutRow = {
  id: string;
  format: string;
  platform: string;
};

/** Connected project agents for upload targeting (same shape as storage). */
export type ProjectDatabaseUploadAgentOption = {
  projectAgentId: string;
  agentDisplayName: string;
};

export type ProjectDatabaseSchemaListItem = {
  id: string;
  databaseName: string;
  databaseId: string | null;
  projectAgentId: string;
  /** Connected agent display name for this row. */
  agentDisplayName: string;
  /** e.g. Relational — from `database_types` via `databases`. */
  databaseTypeName: string | null;
  /** e.g. PostgreSQL — from `databases.name`. */
  databaseProductName: string | null;
  status: string;
  /** Sum of schema `.sql` and data `.json` document sizes in bytes. */
  totalSizeBytes: number;
  createdAt: string;
  /** `upload` = file-based; `live` = connected MySQL (default upload). */
  source?: 'upload' | 'live';
  /** Live-only query execution mode. */
  queryMode?: 'generated' | 'template_preferred' | 'template_only' | null;
};

export type ProjectDatabaseSchemasListApiResult =
  | {
      ok: true;
      schemas: ProjectDatabaseSchemaListItem[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseLookupsApiResult =
  | {
      ok: true;
      databaseTypes: DatabaseTypeRow[];
      databases: DatabaseRow[];
      allowedExtensions: AllowedDbExtensionRow[];
      databaseExportLayouts: DatabaseExportLayoutRow[];
      uploadAgentOptions: ProjectDatabaseUploadAgentOption[];
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseUploadApiResult =
  | {
      ok: true;
      uploads: Array<{ schemaDocumentId: string; dataDocumentId: string; schemaId: string }>;
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseUploadCheckApiResult =
  | {
      ok: true;
      conflicts: Array<{ projectAgentId: string; agentDisplayName: string }>;
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseRenameApiResult =
  | { ok: true; schemaId: string; databaseName: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseUpdateFilesApiResult =
  | { ok: true; schemaId: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseUpdateDataFileApiResult =
  | { ok: true; schemaId: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseDownloadZipApiResult =
  | { ok: true; body: Buffer; fileName: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseDeleteApiResult =
  | { ok: true; schemaId: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionCreateApiResult =
  | { ok: true; connectionIds: string[] }
  | {
      ok: false;
      message: string;
      code?: string;
      mismatch?: {
        expectedProduct: 'mysql' | 'mariadb';
        detectedProduct: 'mysql' | 'mariadb' | 'unknown';
        version: string;
        versionComment: string;
      };
    };

export type ProjectDatabaseConnectionDeleteApiResult =
  | { ok: true; connectionId: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionStatusApiResult =
  | { ok: true; connectionId: string; status: 'connected' | 'disconnected' | 'failed' }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionCheckApiResult =
  | {
      ok: true;
      conflicts: Array<{ projectAgentId: string; agentDisplayName: string }>;
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionSyncSchemaApiResult =
  | { ok: true; connectionId: string; status: 'connected' | 'failed' }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionCredentialsApiResult =
  | {
      ok: true;
      connection: {
        id: string;
        databaseTypeId: string;
        databaseId: string | null;
        displayName: string;
        host: string;
        port: number;
        databaseName: string;
        username: string;
        password: string;
        sslMode: string;
        sslCaPem: string | null;
        status: string;
        queryMode: 'generated' | 'template_preferred' | 'template_only';
      };
    }
  | { ok: false; message: string; code?: string };

/** Stored in `database_connection_query_templates.query_kind`. */
export type QueryTemplateKind = 'sql' | 'mongo_json';

export type QueryTemplateCardLinkConfig = {
  basePath: string;
  pathSegments?: Array<{ column: string }>;
  queryParams?: Array<{ name: string; column: string }>;
};

export type QueryTemplateCardMapping = {
  titleColumn: string;
  imageColumn?: string | null;
  publicBucketUrl?: string | null;
  detailColumns: string[];
  maxCards?: number | null;
};

export type QueryTemplateCardConfig = {
  carouselEnabled: boolean;
  conversationExcludedColumns?: string[];
  cardMapping?: QueryTemplateCardMapping | null;
  link?: QueryTemplateCardLinkConfig | null;
};

export type ProjectDatabaseConnectionQueryTemplate = {
  id: string;
  connectionId: string;
  name: string;
  description: string;
  /** Relational SQL templates; empty string when `queryKind` is `mongo_json`. */
  sqlText: string;
  /** Non-relational query document; null when `queryKind` is `sql`. */
  queryBody: Record<string, unknown> | null;
  queryKind: QueryTemplateKind;
  parameterSchema: Record<string, unknown> | null;
  cardConfig: QueryTemplateCardConfig | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** Header row for a live connection on the query-templates page (and list API). */
export type ProjectDatabaseConnectionHeaderForTemplates = {
  id: string;
  displayName: string;
  projectDomain: string | null;
  agentDisplayName: string;
  databaseProductName: string | null;
  databaseTypeName: string | null;
  status: string;
  /** Drives UI + validation: SQL vs Mongo JSON template body. */
  queryTemplateDialect: 'sql' | 'mongo_json';
};

export type ProjectDatabaseConnectionQueryTemplatesApiResult =
  | {
      ok: true;
      connection: ProjectDatabaseConnectionHeaderForTemplates;
      queryMode: 'generated' | 'template_preferred' | 'template_only';
      templates: ProjectDatabaseConnectionQueryTemplate[];
    }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionQueryModeGetApiResult =
  | { ok: true; queryMode: 'generated' | 'template_preferred' | 'template_only' }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionQueryTemplateCreateApiResult =
  | { ok: true; template: ProjectDatabaseConnectionQueryTemplate }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionQueryTemplateUpdateApiResult =
  | { ok: true; template: ProjectDatabaseConnectionQueryTemplate }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionQueryTemplateDeleteApiResult =
  | { ok: true; templateId: string }
  | { ok: false; message: string; code?: string };

export type ProjectDatabaseConnectionQueryModeUpdateApiResult =
  | { ok: true; connectionId: string; queryMode: 'generated' | 'template_preferred' | 'template_only' }
  | { ok: false; message: string; code?: string };

