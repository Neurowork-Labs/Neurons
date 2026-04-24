-- Carousel / card presentation config for query templates
-- Date: 2026-04-14
-- Idempotent for Supabase SQL Editor.
-- Prerequisites: 2026-04-12 (non-relational templates).
--
-- Adds a nullable JSONB column `card_config` to
-- `database_connection_query_templates`.
--
-- When NULL the template has no carousel; the agent runtime passes
-- query results to the LLM for a conversational text answer (existing
-- behaviour).
--
-- When set it must be a JSON object.  Application-level validation
-- enforces the allowed shape; the DB constraint only checks it is an
-- object so the schema can evolve without DDL changes.
--
-- Expected application-level shape (enforced in backend, not in DB):
-- {
--   "carouselEnabled": true,
--   "conversationExcludedColumns": ["id", "slug"],
--   "cardMapping": {
--     "titleColumn": "name",
--     "imageColumn": "image_url",          -- optional
--     "publicBucketUrl": "https://<host>/storage/v1/object/public/property-images", -- optional
--     "detailColumns": ["price", "city"],   -- ordered
--     "maxCards": 10                         -- optional, default 10
--   },
--   "link": {
--     "basePath": "/property/details",
--     "pathSegments": [                      -- optional
--       { "column": "slug" }
--     ],
--     "queryParams": [                       -- optional
--       { "name": "id", "column": "property_id" }
--     ]
--   }
-- }

-- ============================================================
-- 1) COLUMN
-- ============================================================

ALTER TABLE public.database_connection_query_templates
  ADD COLUMN IF NOT EXISTS card_config jsonb;

-- ============================================================
-- 2) CHECK: when not null must be a JSON object
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_db_conn_query_templates_card_config_object'
      AND conrelid = 'public.database_connection_query_templates'::regclass
  ) THEN
    ALTER TABLE public.database_connection_query_templates
      ADD CONSTRAINT chk_db_conn_query_templates_card_config_object
      CHECK (
        card_config IS NULL
        OR jsonb_typeof(card_config) = 'object'
      );
  END IF;
END $$;
