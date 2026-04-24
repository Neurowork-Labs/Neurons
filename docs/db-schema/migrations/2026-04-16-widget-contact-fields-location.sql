-- Allow 'location' in project_agent_widget_configs.required_contact_fields (GPS capture in widget).

CREATE OR REPLACE FUNCTION public.is_valid_contact_fields(val jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(val) = 'array'
    AND bool_and(elem IN ('name', 'email', 'phone', 'location'))
  FROM jsonb_array_elements_text(val) AS t(elem)
  UNION ALL
  SELECT jsonb_typeof(val) = 'array' AND jsonb_array_length(val) = 0
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(val))
  LIMIT 1;
$$;
