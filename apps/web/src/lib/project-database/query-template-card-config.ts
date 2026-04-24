/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import type {
  QueryTemplateCardConfig,
  QueryTemplateCardLinkConfig,
  QueryTemplateCardMapping,
} from '@/lib/project-database/project-database-types';
import { databaseSchemaStatusPillClassNameCn } from '@/lib/project-database/project-database-display';
import { projectDomainToOpenUrl } from '@/lib/projects/project-domain-url';

const MAX_DETAIL_COLUMNS = 6;
const MAX_CARDS_UPPER = 50;
const MAX_CARDS_DEFAULT = 10;
const MAX_EXCLUDED_COLUMNS = 50;
const MAX_PATH_SEGMENTS = 5;
const MAX_QUERY_PARAMS = 10;
const COLUMN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.*]*$/;
const BASE_PATH_RE = /^\/[^\s]*$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidColumnName(v: unknown): boolean {
  return isNonEmptyString(v) && COLUMN_NAME_RE.test(String(v).trim());
}

export function validateCardConfig(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return 'Card config must be a JSON object.';
  }
  const obj = raw as Record<string, unknown>;

  const ALLOWED_KEYS = new Set([
    'carouselEnabled',
    'conversationExcludedColumns',
    'cardMapping',
    'link',
  ]);
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      return `Unknown card config key "${key}".`;
    }
  }

  if (typeof obj.carouselEnabled !== 'boolean') {
    return 'Card config "carouselEnabled" must be a boolean.';
  }

  if (obj.conversationExcludedColumns != null) {
    if (!Array.isArray(obj.conversationExcludedColumns)) {
      return '"conversationExcludedColumns" must be an array of column names.';
    }
    if (obj.conversationExcludedColumns.length > MAX_EXCLUDED_COLUMNS) {
      return `"conversationExcludedColumns" cannot exceed ${MAX_EXCLUDED_COLUMNS} entries.`;
    }
    for (const col of obj.conversationExcludedColumns) {
      if (!isNonEmptyString(col)) {
        return '"conversationExcludedColumns" entries must be non-empty strings.';
      }
    }
  }

  if (obj.carouselEnabled) {
    const mappingErr = validateCardMapping(obj.cardMapping);
    if (mappingErr) return mappingErr;
  } else if (obj.cardMapping != null) {
    const mappingErr = validateCardMapping(obj.cardMapping);
    if (mappingErr) return mappingErr;
  }

  if (obj.link != null) {
    if (typeof obj.link !== 'object' || Array.isArray(obj.link)) {
      return '"link" must be a JSON object.';
    }
    const linkErr = validateLinkConfig(obj.link as Record<string, unknown>);
    if (linkErr) return linkErr;
  }

  return null;
}

function validateCardMapping(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return '"cardMapping" must be a JSON object.';
  }
  const m = raw as Record<string, unknown>;
  const MAPPING_KEYS = new Set(['titleColumn', 'imageColumn', 'publicBucketUrl', 'detailColumns', 'maxCards']);
  for (const key of Object.keys(m)) {
    if (!MAPPING_KEYS.has(key)) {
      return `Unknown cardMapping key "${key}".`;
    }
  }

  if (!isNonEmptyString(m.titleColumn)) {
    return '"cardMapping.titleColumn" is required and must be a non-empty string.';
  }
  if (!isValidColumnName(m.titleColumn)) {
    return `"cardMapping.titleColumn" has invalid column name "${String(m.titleColumn)}".`;
  }

  if (m.imageColumn != null && m.imageColumn !== '') {
    if (!isNonEmptyString(m.imageColumn)) {
      return '"cardMapping.imageColumn" must be a non-empty string or null.';
    }
    if (!isValidColumnName(m.imageColumn)) {
      return `"cardMapping.imageColumn" has invalid column name "${String(m.imageColumn)}".`;
    }
  }

  if (m.publicBucketUrl != null && m.publicBucketUrl !== '') {
    if (!isNonEmptyString(m.publicBucketUrl)) {
      return '"cardMapping.publicBucketUrl" must be a non-empty string or null.';
    }
  }

  if (!Array.isArray(m.detailColumns)) {
    return '"cardMapping.detailColumns" must be an array.';
  }
  if (m.detailColumns.length > MAX_DETAIL_COLUMNS) {
    return `"cardMapping.detailColumns" cannot exceed ${MAX_DETAIL_COLUMNS} entries.`;
  }
  for (const col of m.detailColumns) {
    if (!isNonEmptyString(col)) {
      return '"cardMapping.detailColumns" entries must be non-empty strings.';
    }
  }

  if (m.maxCards != null) {
    const n = Number(m.maxCards);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CARDS_UPPER) {
      return `"cardMapping.maxCards" must be an integer between 1 and ${MAX_CARDS_UPPER}.`;
    }
  }

  return null;
}

function validateLinkConfig(obj: Record<string, unknown>): string | null {
  const LINK_KEYS = new Set(['basePath', 'pathSegments', 'queryParams']);
  for (const key of Object.keys(obj)) {
    if (!LINK_KEYS.has(key)) {
      return `Unknown link config key "${key}".`;
    }
  }

  if (!isNonEmptyString(obj.basePath)) {
    return '"link.basePath" is required and must start with /.';
  }
  if (!BASE_PATH_RE.test(String(obj.basePath).trim())) {
    return '"link.basePath" must be a relative path starting with /.';
  }

  if (obj.pathSegments != null) {
    if (!Array.isArray(obj.pathSegments)) {
      return '"link.pathSegments" must be an array.';
    }
    if (obj.pathSegments.length > MAX_PATH_SEGMENTS) {
      return `"link.pathSegments" cannot exceed ${MAX_PATH_SEGMENTS} entries.`;
    }
    for (const seg of obj.pathSegments) {
      if (!seg || typeof seg !== 'object' || Array.isArray(seg)) {
        return '"link.pathSegments" entries must be objects with a "column" key.';
      }
      const s = seg as Record<string, unknown>;
      if (!isNonEmptyString(s.column)) {
        return '"link.pathSegments[].column" must be a non-empty string.';
      }
    }
  }

  if (obj.queryParams != null) {
    if (!Array.isArray(obj.queryParams)) {
      return '"link.queryParams" must be an array.';
    }
    if (obj.queryParams.length > MAX_QUERY_PARAMS) {
      return `"link.queryParams" cannot exceed ${MAX_QUERY_PARAMS} entries.`;
    }
    for (const qp of obj.queryParams) {
      if (!qp || typeof qp !== 'object' || Array.isArray(qp)) {
        return '"link.queryParams" entries must be objects with "name" and "column" keys.';
      }
      const q = qp as Record<string, unknown>;
      if (!isNonEmptyString(q.name)) {
        return '"link.queryParams[].name" must be a non-empty string.';
      }
      if (!isNonEmptyString(q.column)) {
        return '"link.queryParams[].column" must be a non-empty string.';
      }
    }
  }

  return null;
}

export function detectSqlSelectColumns(sql: string): string[] {
  const trimmed = String(sql ?? '').trim();
  if (!trimmed) return [];

  const normalized = trimmed
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/^(?:WITH\s[\s\S]*?\)\s+)?SELECT\s+([\s\S]+?)\s+FROM\s/i);
  if (!match?.[1]) return [];

  const selectPart = match[1].trim();
  if (selectPart === '*' || selectPart.includes('*')) return [];

  const columns: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selectPart) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      columns.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) columns.push(current.trim());

  return columns.map((col) => {
    const asMatch = col.match(/\bAS\s+["`]?(\w+)["`]?\s*$/i);
    if (asMatch?.[1]) return asMatch[1];
    const dotMatch = col.match(/^[\w.]+\.(\w+)$/);
    if (dotMatch?.[1]) return dotMatch[1];
    const simpleMatch = col.match(/^(\w+)$/);
    if (simpleMatch?.[1]) return simpleMatch[1];
    return col;
  }).filter((c) => c.length > 0 && !c.includes(' '));
}

/**
 * Extract output column/field names from a MongoDB query template body (JSON text).
 * Supports `find` with explicit projection and `aggregate` with $project/$group/$count.
 * Returns empty when output shape cannot be determined statically.
 */
export function detectMongoQueryBodyColumns(queryBodyText: string): string[] {
  const text = String(queryBodyText ?? '').trim();
  if (!text) return [];

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    body = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  const op = String(body.operation ?? '').trim().toLowerCase();
  if (op === 'find') return mongoColumnsFromFindProjection(body.projection);
  if (op === 'aggregate') return mongoColumnsFromAggregatePipeline(body.pipeline);
  return [];
}

function mongoColumnsFromInclusionSpec(spec: Record<string, unknown>): string[] {
  const entries = Object.entries(spec);
  if (entries.length === 0) return [];

  const included: string[] = [];
  let idExcluded = false;

  for (const [key, val] of entries) {
    if (key === '_id' && (val === 0 || val === false)) {
      idExcluded = true;
      continue;
    }
    if (val === 0 || val === false) continue;
    included.push(key);
  }

  if (included.length === 0) return [];

  const cols: string[] = [];
  if (!idExcluded) cols.push('_id');
  for (const k of included) {
    if (k !== '_id') cols.push(k);
  }
  return cols;
}

function mongoColumnsFromFindProjection(projection: unknown): string[] {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return [];
  return mongoColumnsFromInclusionSpec(projection as Record<string, unknown>);
}

function mongoColumnsFromAggregatePipeline(pipeline: unknown): string[] {
  if (!Array.isArray(pipeline) || pipeline.length === 0) return [];

  let lastShapeIndex = -1;
  let lastShapeColumns: string[] = [];

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) continue;
    const obj = stage as Record<string, unknown>;

    if ('$project' in obj) {
      const proj = obj['$project'];
      if (proj && typeof proj === 'object' && !Array.isArray(proj)) {
        const cols = mongoColumnsFromInclusionSpec(proj as Record<string, unknown>);
        if (cols.length > 0) {
          lastShapeIndex = i;
          lastShapeColumns = cols;
        }
      }
    } else if ('$group' in obj) {
      const grp = obj['$group'];
      if (grp && typeof grp === 'object' && !Array.isArray(grp)) {
        const cols = Object.keys(grp as Record<string, unknown>);
        if (cols.length > 0) {
          lastShapeIndex = i;
          lastShapeColumns = cols;
        }
      }
    } else if ('$count' in obj) {
      const field = obj['$count'];
      if (typeof field === 'string' && field.trim()) {
        lastShapeIndex = i;
        lastShapeColumns = [field.trim()];
      }
    }
  }

  if (lastShapeIndex < 0) return [];

  const seen = new Set(lastShapeColumns.map((c) => c.toLowerCase()));
  for (let i = lastShapeIndex + 1; i < pipeline.length; i++) {
    const stage = pipeline[i];
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) continue;
    const obj = stage as Record<string, unknown>;
    if ('$addFields' in obj) {
      const added = obj['$addFields'];
      if (added && typeof added === 'object' && !Array.isArray(added)) {
        for (const key of Object.keys(added as Record<string, unknown>)) {
          if (!seen.has(key.toLowerCase())) {
            lastShapeColumns.push(key);
            seen.add(key.toLowerCase());
          }
        }
      }
    }
  }

  return lastShapeColumns;
}

export function cardConfigFromUiState(opts: {
  carouselEnabled: boolean;
  conversationExcludedColumns: string[];
  titleColumn: string;
  imageColumn: string;
  publicBucketUrl: string;
  detailColumns: string[];
  maxCards: number;
  linkBasePath: string;
  linkPathSegments: Array<{ column: string }>;
  linkQueryParams: Array<{ name: string; column: string }>;
}): QueryTemplateCardConfig | null {
  const hasExcludedColumns = opts.conversationExcludedColumns.length > 0;
  const hasMapping = opts.carouselEnabled && opts.titleColumn.trim();
  const hasLink = opts.linkBasePath.trim().length > 0;

  if (!opts.carouselEnabled && !hasExcludedColumns && !hasLink) {
    return null;
  }

  const config: QueryTemplateCardConfig = {
    carouselEnabled: opts.carouselEnabled,
  };

  if (hasExcludedColumns) {
    config.conversationExcludedColumns = opts.conversationExcludedColumns.filter((c) => c.trim());
  }

  if (hasMapping) {
    const mapping: QueryTemplateCardMapping = {
      titleColumn: opts.titleColumn.trim(),
      detailColumns: opts.detailColumns.filter((c) => c.trim()),
    };
    if (opts.imageColumn.trim()) {
      mapping.imageColumn = opts.imageColumn.trim();
    }
    if (opts.publicBucketUrl.trim()) {
      mapping.publicBucketUrl = opts.publicBucketUrl.trim();
    }
    if (opts.maxCards > 0 && opts.maxCards !== MAX_CARDS_DEFAULT) {
      mapping.maxCards = opts.maxCards;
    }
    config.cardMapping = mapping;
  }

  if (hasLink) {
    const link: QueryTemplateCardLinkConfig = {
      basePath: opts.linkBasePath.trim(),
    };
    const segs = opts.linkPathSegments.filter((s) => s.column.trim());
    if (segs.length > 0) link.pathSegments = segs;
    const params = opts.linkQueryParams.filter((p) => p.name.trim() && p.column.trim());
    if (params.length > 0) link.queryParams = params;
    config.link = link;
  }

  return config;
}

export function uiStateFromCardConfig(config: QueryTemplateCardConfig | null): {
  carouselEnabled: boolean;
  conversationExcludedColumns: string[];
  titleColumn: string;
  imageColumn: string;
  publicBucketUrl: string;
  detailColumns: string[];
  maxCards: number;
  linkBasePath: string;
  linkPathSegments: Array<{ column: string }>;
  linkQueryParams: Array<{ name: string; column: string }>;
} {
  if (!config) {
    return {
      carouselEnabled: false,
      conversationExcludedColumns: [],
      titleColumn: '',
      imageColumn: '',
      publicBucketUrl: '',
      detailColumns: [],
      maxCards: MAX_CARDS_DEFAULT,
      linkBasePath: '',
      linkPathSegments: [],
      linkQueryParams: [],
    };
  }
  return {
    carouselEnabled: config.carouselEnabled ?? false,
    conversationExcludedColumns: config.conversationExcludedColumns ?? [],
    titleColumn: config.cardMapping?.titleColumn ?? '',
    imageColumn: config.cardMapping?.imageColumn ?? '',
    publicBucketUrl: config.cardMapping?.publicBucketUrl ?? '',
    detailColumns: config.cardMapping?.detailColumns ?? [],
    maxCards: config.cardMapping?.maxCards ?? MAX_CARDS_DEFAULT,
    linkBasePath: config.link?.basePath ?? '',
    linkPathSegments: config.link?.pathSegments ?? [],
    linkQueryParams: config.link?.queryParams ?? [],
  };
}

export function buildCardImagePreviewUrl(opts: {
  publicBucketUrl: string;
  imageColumn: string;
}): string {
  const bucketUrl = String(opts.publicBucketUrl ?? '').trim();
  const imageColumn = String(opts.imageColumn ?? '').trim();
  if (!bucketUrl || !imageColumn) return '';
  const normalizedBucket = bucketUrl.replace(/\/+$/, '');
  const normalizedImageColumn = imageColumn.replace(/^\/+/, '');
  return `${normalizedBucket}/{${normalizedImageColumn}}`;
}

export function buildCardLinkPreviewUrl(opts: {
  projectDomain: string | null;
  basePath: string;
  pathSegments: Array<{ column: string }>;
  queryParams: Array<{ name: string; column: string }>;
}): string {
  const base = String(opts.basePath ?? '').trim();
  if (!base) return '';
  const origin = (() => {
    const raw = String(opts.projectDomain ?? '').trim();
    if (!raw) return '';
    try {
      const u = new URL(projectDomainToOpenUrl(raw));
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  })();
  const segs = opts.pathSegments
    .filter((s) => String(s.column ?? '').trim())
    .map((s) => `/{${String(s.column).trim()}}`)
    .join('');
  const qp = opts.queryParams
    .filter((p) => String(p.name ?? '').trim() && String(p.column ?? '').trim())
    .map((p) => `${String(p.name).trim()}={${String(p.column).trim()}}`)
    .join('&');
  return `${origin}${base}${segs}${qp ? `?${qp}` : ''}`;
}

/** Same pill styling as Query templates table STATUS (Active / Inactive). */
export function carouselCardStatusPresentation(carouselEnabled: boolean): {
  label: string;
  className: string;
} {
  return {
    label: carouselEnabled ? 'Enabled' : 'Disabled',
    className: databaseSchemaStatusPillClassNameCn(carouselEnabled ? 'connected' : 'disconnected'),
  };
}
