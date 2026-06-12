-- =============================================================================
-- 0008_app_settings.sql
-- Generic key/value settings store so the office can edit operational defaults
-- (labour model, design assumptions) from the central Settings page instead of
-- them being hardcoded in standingAssumptions.ts.
--
-- The proposal engine reads key 'proposal_assumptions' (a StandingAssumptions
-- JSON blob) and merges it over the code defaults; absence of the row/table is
-- tolerated (falls back to DEFAULT_ASSUMPTIONS).
--
-- Idempotent.
-- =============================================================================

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='app_settings_all'
  ) then
    create policy "app_settings_all" on app_settings
      for all to authenticated using (true) with check (true);
  end if;
end $$;
