-- Add configurable widget theme color per connected agent.
alter table if exists public.project_agent_widget_configs
  add column if not exists widget_theme_color text;

comment on column public.project_agent_widget_configs.widget_theme_color
  is 'Optional widget primary theme color in hex format (#RGB or #RRGGBB).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_agent_widget_configs_widget_theme_color_chk'
      and conrelid = 'public.project_agent_widget_configs'::regclass
  ) then
    alter table public.project_agent_widget_configs
      add constraint project_agent_widget_configs_widget_theme_color_chk
      check (
        widget_theme_color is null
        or widget_theme_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'
      );
  end if;
end $$;
