-- =============================================================================
-- EcoSphere CRM — v2 "hub" schema
-- =============================================================================
-- Adds, as ORIGINAL work (no third-party code), the pieces that turn the CRM
-- into a hub:
--   * pipelines + pipeline_stages  → multiple saved board views with granular,
--     orderable stages. Each granular stage maps to a canonical BI "bucket"
--     (the existing pipeline_stage enum) so Pulse keeps clean macro-stage data.
--   * contacts                      → a GoHighLevel-syncable contact record.
--   * bus_vouchers                  → Boiler Upgrade Scheme grant lifecycle.
--   * dashboard KPI + BUS cash-flow views.
-- The canonical deals.stage enum is kept and auto-derived from the granular
-- stage's bucket by a trigger, so old views / BI logic keep working unchanged.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pipelines (saved board views)  +  pipeline_stages (granular, ordered)
-- -----------------------------------------------------------------------------
create table pipelines (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort       int  not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines (id) on delete cascade,
  key         text not null,                 -- stable slug within a pipeline
  label       text not null,                 -- display label (granular)
  bucket      pipeline_stage not null,       -- maps to canonical BI macro-stage
  sort        int  not null default 0,
  color       text not null default '#64748B',
  unique (pipeline_id, key)
);

create index pipeline_stages_pipeline_idx on pipeline_stages (pipeline_id, sort);

-- -----------------------------------------------------------------------------
-- contacts (source of truth can be GoHighLevel; ghl_id links the two)
-- -----------------------------------------------------------------------------
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  ghl_id      text unique,                   -- GoHighLevel contact id (sync key)
  full_name   text not null,
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  address     text,
  postcode    text,
  source      text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contacts_ghl_idx on contacts (ghl_id);

create trigger contacts_set_updated_at
  before update on contacts
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- deals: link to a pipeline / granular stage / contact + GHL opportunity id
-- -----------------------------------------------------------------------------
alter table deals add column pipeline_id              uuid references pipelines (id) on delete set null;
alter table deals add column pipeline_stage_id        uuid references pipeline_stages (id) on delete set null;
alter table deals add column contact_id               uuid references contacts (id) on delete set null;
alter table deals add column ghl_opportunity_id       text unique;
alter table deals add column pipeline_stage_changed_at timestamptz not null default now();

create index deals_pipeline_idx       on deals (pipeline_id);
create index deals_pipeline_stage_idx on deals (pipeline_stage_id);
create index deals_contact_idx        on deals (contact_id);

-- -----------------------------------------------------------------------------
-- Consolidated stage handling.
-- Replace the v1 stage triggers with:
--   * BEFORE: derive canonical stage (bucket) from the granular stage, and
--     bump the relevant "changed_at" timestamps.
--   * AFTER : log macro-stage transitions to stage_history.
-- -----------------------------------------------------------------------------
drop trigger if exists deals_log_stage_insert on deals;
drop trigger if exists deals_log_stage_update on deals;
drop function if exists log_stage_change();

create or replace function deals_derive_stage()
returns trigger language plpgsql as $$
declare b pipeline_stage;
begin
  if new.pipeline_stage_id is not null then
    select bucket into b from pipeline_stages where id = new.pipeline_stage_id;
    if b is not null then
      new.stage := b;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
    new.pipeline_stage_changed_at := coalesce(new.pipeline_stage_changed_at, now());
  else
    if new.stage is distinct from old.stage then
      new.stage_changed_at := now();
    end if;
    if new.pipeline_stage_id is distinct from old.pipeline_stage_id then
      new.pipeline_stage_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function deals_log_history()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, new.owner_id);
  elsif new.stage is distinct from old.stage then
    insert into stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, new.owner_id);
  end if;
  return new;
end;
$$;

create trigger deals_derive_stage
  before insert or update on deals
  for each row execute function deals_derive_stage();

create trigger deals_log_history
  after insert or update on deals
  for each row execute function deals_log_history();

-- -----------------------------------------------------------------------------
-- bus_vouchers (Boiler Upgrade Scheme grant lifecycle)
-- -----------------------------------------------------------------------------
create type bus_status as enum ('applied', 'issued', 'redeemed', 'paid', 'expired', 'rejected');

create table bus_vouchers (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals (id) on delete cascade,
  voucher_ref text,
  amount      numeric(12,2) not null default 7500,
  status      bus_status not null default 'applied',
  applied_at  date,
  issued_at   date,
  redeemed_at date,
  paid_at     date,
  expires_at  date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index bus_vouchers_deal_idx   on bus_vouchers (deal_id);
create index bus_vouchers_status_idx on bus_vouchers (status);

create trigger bus_vouchers_set_updated_at
  before update on bus_vouchers
  for each row execute function set_updated_at();

-- =============================================================================
-- Dashboard / reporting views
-- =============================================================================

-- Headline tiles for the dashboard (single row).
create or replace view v_dashboard_kpis as
select
  (select count(*) from deals where stage = 'won')                                          as active_jobs,
  (select count(*) from deals where stage = 'won'
     and date_trunc('month', stage_changed_at) = date_trunc('month', now()))                as won_jobs_this_month,
  coalesce((select sum(value_net) from deals where stage = 'won'
     and date_trunc('month', stage_changed_at) = date_trunc('month', now())), 0)            as won_value_this_month,
  coalesce((select sum(value_net) from deals where stage not in ('won','lost')), 0)         as open_pipeline_value,
  (select count(*) from deals where stage not in ('won','lost'))                            as open_opportunities,
  (select count(*) from contacts)                                                           as contacts_count;

-- BUS voucher cash-flow: amount by status.
create or replace view v_bus_cashflow as
select
  status,
  count(*)                    as voucher_count,
  coalesce(sum(amount), 0)    as total_amount
from bus_vouchers
group by status;

-- Stale / needs-attention: open deals with no recent movement.
create or replace view v_needs_attention as
select
  d.id,
  d.customer_name,
  d.stage,
  d.value_net,
  d.product_interest,
  d.postcode,
  ps.label as stage_label,
  (extract(epoch from (now() - d.pipeline_stage_changed_at)) / 86400)::int as days_in_stage
from deals d
left join pipeline_stages ps on ps.id = d.pipeline_stage_id
where d.stage not in ('won','lost')
  and d.pipeline_stage_changed_at < now() - interval '14 days'
order by d.pipeline_stage_changed_at asc;

-- -----------------------------------------------------------------------------
-- RLS for the new tables + grants for the new views
-- -----------------------------------------------------------------------------
alter table pipelines       enable row level security;
alter table pipeline_stages enable row level security;
alter table contacts        enable row level security;
alter table bus_vouchers    enable row level security;

create policy "pipelines_all"       on pipelines       for all to authenticated using (true) with check (true);
create policy "pipeline_stages_all" on pipeline_stages for all to authenticated using (true) with check (true);
create policy "contacts_all"        on contacts        for all to authenticated using (true) with check (true);
create policy "bus_vouchers_all"    on bus_vouchers    for all to authenticated using (true) with check (true);

alter view v_dashboard_kpis set (security_invoker = on);
alter view v_bus_cashflow   set (security_invoker = on);
alter view v_needs_attention set (security_invoker = on);

grant select on v_dashboard_kpis, v_bus_cashflow, v_needs_attention to authenticated;
