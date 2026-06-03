-- =============================================================================
-- EcoSphere Energy CRM — Core schema
-- =============================================================================
-- Design goals:
--   * This database is the SHARED SOURCE OF TRUTH for the EcoSphere software
--     sphere: the CRM (this app), Dispatch (field/installation layer) and
--     Pulse (business-intelligence / financial layer) all read from it.
--   * Money, stages, dates and sources are stored as CLEAN STRUCTURED FIELDS
--     (numeric + enums + timestamps) — never free text — so downstream tools
--     can query them reliably.
--   * Read-only reporting VIEWS (prefixed v_) are provided for Pulse so the BI
--     layer never has to reverse-engineer business logic.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enumerated types  (structured, queryable — the backbone of BI reporting)
-- -----------------------------------------------------------------------------

-- Pipeline stages, in board order.
create type pipeline_stage as enum (
  'new_enquiry',   -- New Enquiry (Uncontacted)
  'contacted',
  'survey_booked',
  'quoted',
  'won',
  'lost'
);

-- What the customer is buying / interested in.
create type product_type as enum (
  'ashp',            -- Air Source Heat Pump
  'solar_pv',        -- Solar PV
  'battery',         -- Battery storage
  'heating_upgrade', -- Heating upgrade
  'service'          -- Service / maintenance
);

-- Where the lead came from.
create type lead_source as enum (
  'google_ads',
  'facebook',
  'referral',
  'website',
  'other'
);

-- Property type.
create type property_type as enum (
  'detached',
  'semi_detached',
  'terraced',
  'bungalow',
  'flat',
  'commercial',
  'other'
);

-- Tag categories (a tag belongs to exactly one category).
create type tag_category as enum (
  'lead_source',
  'product_interest',
  'pipeline_stage',
  'job_status',
  'customer_type',
  'property_characteristic'
);

-- -----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users — who owns / works each deal)
-- -----------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- deals  (the central entity)
-- -----------------------------------------------------------------------------
create table deals (
  id                uuid primary key default gen_random_uuid(),

  -- Customer / contact
  customer_name     text not null,
  address           text,
  postcode          text,
  phone             text,
  email             text,
  property_type     property_type,

  -- Commercial — structured numeric money fields (stored in GBP, 2dp).
  -- value_net is GENERATED so it can never drift from gross - grant.
  value_gross       numeric(12,2) not null default 0,
  value_bus_grant   numeric(12,2) not null default 0,   -- Boiler Upgrade Scheme grant
  value_net         numeric(12,2) generated always as (value_gross - value_bus_grant) stored,

  -- Categorisation
  product_interest  product_type not null,
  lead_source       lead_source   not null default 'other',

  -- Pipeline
  stage             pipeline_stage not null default 'new_enquiry',
  stage_changed_at  timestamptz   not null default now(),  -- drives "stage age" / aged-deal logic
  lost_reason       text,                                  -- only set when stage = 'lost'

  -- Ownership / audit
  owner_id          uuid references profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint lost_requires_reason
    check (stage <> 'lost' or lost_reason is not null)
);

create index deals_stage_idx        on deals (stage);
create index deals_lead_source_idx  on deals (lead_source);
create index deals_product_idx      on deals (product_interest);
create index deals_owner_idx        on deals (owner_id);
create index deals_stage_changed_idx on deals (stage_changed_at);

-- Keep updated_at fresh.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deals_set_updated_at
  before update on deals
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- stage_history  (append-only audit of every stage transition)
--   Lets Pulse compute time-in-stage, conversion velocity, cohort analysis.
-- -----------------------------------------------------------------------------
create table stage_history (
  id          bigint generated always as identity primary key,
  deal_id     uuid not null references deals (id) on delete cascade,
  from_stage  pipeline_stage,
  to_stage    pipeline_stage not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references profiles (id) on delete set null
);

create index stage_history_deal_idx on stage_history (deal_id, changed_at);

-- When a deal's stage changes: stamp stage_changed_at and log history.
create or replace function log_stage_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, new.owner_id);
  elsif new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    insert into stage_history (deal_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, new.owner_id);
  end if;
  return new;
end;
$$;

create trigger deals_log_stage_insert
  after insert on deals
  for each row execute function log_stage_change();

create trigger deals_log_stage_update
  before update on deals
  for each row execute function log_stage_change();

-- -----------------------------------------------------------------------------
-- activities  (notes / activity log, timestamped)
-- -----------------------------------------------------------------------------
create type activity_type as enum ('note', 'call', 'email', 'sms', 'meeting', 'system');

create table activities (
  id          bigint generated always as identity primary key,
  deal_id     uuid not null references deals (id) on delete cascade,
  type        activity_type not null default 'note',
  body        text not null,
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index activities_deal_idx on activities (deal_id, created_at desc);

-- -----------------------------------------------------------------------------
-- tags  +  deal_tags  (many-to-many, multiple tags per deal across categories)
-- -----------------------------------------------------------------------------
create table tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   tag_category not null,
  color      text not null default '#6B7280',
  created_at timestamptz not null default now(),
  unique (name, category)
);

create table deal_tags (
  deal_id uuid not null references deals (id) on delete cascade,
  tag_id  uuid not null references tags (id)  on delete cascade,
  primary key (deal_id, tag_id)
);

create index deal_tags_tag_idx on deal_tags (tag_id);

-- =============================================================================
-- REPORTING VIEWS  (read surface for Pulse / financial dashboard)
-- =============================================================================

-- Per-stage pipeline value & count.
create or replace view v_pipeline_by_stage as
select
  stage,
  count(*)                       as deal_count,
  coalesce(sum(value_net), 0)    as total_net_value,
  coalesce(sum(value_gross), 0)  as total_gross_value,
  coalesce(avg(value_net), 0)    as avg_net_value
from deals
group by stage;

-- Pipeline value by lead source.
create or replace view v_deals_by_source as
select
  lead_source,
  count(*)                       as deal_count,
  coalesce(sum(value_net), 0)    as total_net_value
from deals
group by lead_source;

-- Headline KPIs (single row) — win rate, avg deal size, open pipeline value.
create or replace view v_deal_metrics as
select
  count(*)                                                          as total_deals,
  count(*) filter (where stage = 'won')                            as won_deals,
  count(*) filter (where stage = 'lost')                           as lost_deals,
  count(*) filter (where stage not in ('won','lost'))              as open_deals,
  -- Win rate = won / (won + lost), null-safe.
  case when count(*) filter (where stage in ('won','lost')) = 0 then 0
       else round(
         count(*) filter (where stage = 'won')::numeric
         / count(*) filter (where stage in ('won','lost')), 4)
  end                                                               as win_rate,
  coalesce(avg(value_net), 0)                                       as avg_deal_size,
  coalesce(sum(value_net) filter (where stage not in ('won','lost')), 0) as open_pipeline_value,
  coalesce(sum(value_net) filter (where stage = 'won'), 0)          as won_value
from deals;

-- Aged deals: open deals sitting > 14 days in their current stage.
create or replace view v_aged_deals as
select
  id,
  customer_name,
  stage,
  value_net,
  product_interest,
  lead_source,
  stage_changed_at,
  (extract(epoch from (now() - stage_changed_at)) / 86400)::int as days_in_stage
from deals
where stage not in ('won','lost')
  and stage_changed_at < now() - interval '14 days'
order by stage_changed_at asc;

-- Flat, BI-friendly fact view of every deal (stable column names for Pulse).
create or replace view v_deal_facts as
select
  d.id                as deal_id,
  d.customer_name,
  d.postcode,
  d.property_type,
  d.product_interest,
  d.lead_source,
  d.stage,
  d.value_gross,
  d.value_bus_grant,
  d.value_net,
  d.lost_reason,
  d.stage_changed_at,
  (extract(epoch from (now() - d.stage_changed_at)) / 86400)::int as days_in_stage,
  d.created_at,
  d.updated_at,
  p.full_name         as owner_name
from deals d
left join profiles p on p.id = d.owner_id;
