-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Model: EcoSphere is a single team. Any authenticated staff member can read
-- and write all deals (shared pipeline). Tighten later if you add roles.
-- The service_role key (used by Dispatch/Pulse server-side integrations)
-- bypasses RLS automatically.
-- =============================================================================

alter table profiles      enable row level security;
alter table deals         enable row level security;
alter table stage_history enable row level security;
alter table activities    enable row level security;
alter table tags          enable row level security;
alter table deal_tags     enable row level security;

-- Profiles: a user can see all profiles, edit only their own.
create policy "profiles_read_all"   on profiles for select to authenticated using (true);
create policy "profiles_update_self" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Deals + related tables: full access for any authenticated user.
create policy "deals_all"         on deals         for all to authenticated using (true) with check (true);
create policy "stage_history_all" on stage_history for all to authenticated using (true) with check (true);
create policy "activities_all"    on activities    for all to authenticated using (true) with check (true);
create policy "tags_all"          on tags          for all to authenticated using (true) with check (true);
create policy "deal_tags_all"     on deal_tags     for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Reporting views: run with the querying user's privileges (respect RLS) and
-- grant SELECT to the authenticated role so the dashboard / Pulse can read them.
-- -----------------------------------------------------------------------------
alter view v_pipeline_by_stage set (security_invoker = on);
alter view v_deals_by_source   set (security_invoker = on);
alter view v_deal_metrics      set (security_invoker = on);
alter view v_aged_deals        set (security_invoker = on);
alter view v_deal_facts        set (security_invoker = on);

grant select on
  v_pipeline_by_stage, v_deals_by_source, v_deal_metrics, v_aged_deals, v_deal_facts
  to authenticated;
