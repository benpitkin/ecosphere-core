-- =============================================================================
-- EcoSphere Hub — Proposal Engine (v3)
-- =============================================================================
-- A module of the Hub, on the same Supabase database. Turns a survey/design
-- into a costed, MCS-ready proposal + itemised kit list + supplier & labour POs.
-- Pricing rule: store COST only; SELL = round(cost x (1 + markup_pct/100), 2),
-- with a per-category default margin and a per-line override. Prices are
-- SNAPSHOTTED onto proposal_lines / po_lines because the catalogue drifts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type product_category as enum (
  'heat_pump', 'cylinder', 'radiator', 'emitter', 'pipe', 'fitting', 'valve',
  'control', 'electrical', 'consumable', 'solar_panel', 'inverter', 'battery',
  'mounting', 'labour', 'other'
);

create type line_source     as enum ('design', 'rule', 'base_kit', 'manual');
create type proposal_status as enum ('draft', 'ready', 'sent', 'accepted', 'rejected', 'expired');
create type po_status       as enum ('draft', 'sent', 'confirmed', 'received', 'cancelled');
create type po_type         as enum ('supplier', 'subcontractor');
create type mapping_type    as enum ('direct', 'schedule', 'base_kit');

-- -----------------------------------------------------------------------------
-- Suppliers + products (the catalogue)
-- -----------------------------------------------------------------------------
create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  email      text,
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique,
  name        text not null,
  category    product_category not null,
  supplier_id uuid references suppliers (id) on delete set null,
  unit        text not null default 'each',          -- each / m / pair / hour ...
  cost_price  numeric(12,2) not null default 0,       -- COST only; sell is derived
  vat_rate    numeric(5,2)  not null default 20.0,
  attrs       jsonb not null default '{}',            -- e.g. {"type":"T22","width_mm":600,"kw":12}
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_category_idx on products (category);
create index products_supplier_idx on products (supplier_id);
create index products_attrs_idx    on products using gin (attrs);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Margin rules: per-category default markup; category NULL = global default.
-- -----------------------------------------------------------------------------
create table margin_rules (
  id         uuid primary key default gen_random_uuid(),
  category   product_category,            -- NULL = global default
  markup_pct numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (category)
);

-- Resolve the markup for a category (category rule, else global default, else 0).
create or replace function markup_for(p_category product_category)
returns numeric language sql stable as $$
  select coalesce(
    (select markup_pct from margin_rules where category = p_category),
    (select markup_pct from margin_rules where category is null),
    0
  );
$$;

-- -----------------------------------------------------------------------------
-- Kit templates (the consumables a design never lists) + their items
-- -----------------------------------------------------------------------------
create table kit_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,        -- 'ashp_base_kit', 'per_radiator_replaced'
  name       text not null,
  notes      text,
  created_at timestamptz not null default now()
);

create table kit_template_items (
  id          bigint generated always as identity primary key,
  template_id uuid not null references kit_templates (id) on delete cascade,
  product_id  uuid not null references products (id) on delete restrict,
  qty         numeric(12,3) not null default 1
);
create index kit_template_items_tpl_idx on kit_template_items (template_id);

-- -----------------------------------------------------------------------------
-- Mapping rules (design -> products). Data-driven, office-overridable.
--   direct   : a named design item (heat pump, cylinder) -> a product, qty_per.
--   schedule : each replaced emitter-schedule row -> a radiator (matched by
--              match_attrs) + a per-radiator bundle (bundle_template_id).
--   base_kit : seed a kit_template's items regardless of what the design lists.
-- -----------------------------------------------------------------------------
create table mapping_rules (
  id                 uuid primary key default gen_random_uuid(),
  type               mapping_type not null,
  trigger_key        text,                       -- design payload key, e.g. 'heat_pump'
  target_category    product_category,           -- category to match within
  match_attrs        jsonb not null default '{}',-- attrs to match on the product
  product_id         uuid references products (id) on delete set null, -- explicit target (optional)
  qty_per            numeric(12,3) not null default 1,
  bundle_template_id uuid references kit_templates (id) on delete set null, -- for 'schedule'
  active             boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Design inputs (survey/design payloads; e.g. reused Spruce extraction JSON)
-- -----------------------------------------------------------------------------
create table design_inputs (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid references deals (id) on delete set null,
  source     text not null default 'manual',     -- spruce | reonic | easypv | opensolar | manual
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index design_inputs_deal_idx on design_inputs (deal_id);

-- -----------------------------------------------------------------------------
-- Proposals + lines  (lines snapshot cost, markup and the derived sell)
-- -----------------------------------------------------------------------------
create table proposals (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid references deals (id) on delete set null,
  design_input_id uuid references design_inputs (id) on delete set null,
  title           text not null default 'Heat pump proposal',
  status          proposal_status not null default 'draft',
  bus_grant       numeric(12,2) not null default 0,
  version         int not null default 1,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index proposals_deal_idx on proposals (deal_id);

create trigger proposals_set_updated_at
  before update on proposals
  for each row execute function set_updated_at();

create table proposal_lines (
  id          bigint generated always as identity primary key,
  proposal_id uuid not null references proposals (id) on delete cascade,
  product_id  uuid references products (id) on delete set null,
  description text not null,
  category    product_category,
  qty         numeric(12,3) not null default 1,
  unit        text not null default 'each',
  unit_cost   numeric(12,2) not null default 0,      -- snapshot
  markup_pct  numeric(6,2)  not null default 0,      -- snapshot (per-line override allowed)
  unit_sell   numeric(12,2) generated always as (round(unit_cost * (1 + markup_pct/100), 2)) stored,
  vat_rate    numeric(5,2)  not null default 20.0,
  source      line_source   not null default 'manual',
  needs_sku   boolean       not null default false,  -- flagged when match was 0 or >1
  sort        int           not null default 0
);
create index proposal_lines_proposal_idx on proposal_lines (proposal_id, sort);

-- -----------------------------------------------------------------------------
-- Purchase orders (supplier kit POs AND subcontractor labour POs) + lines
-- -----------------------------------------------------------------------------
create table purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals (id) on delete set null,
  supplier_id uuid references suppliers (id) on delete set null,
  type        po_type not null default 'supplier',
  status      po_status not null default 'draft',
  reference   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index purchase_orders_proposal_idx on purchase_orders (proposal_id);

create trigger purchase_orders_set_updated_at
  before update on purchase_orders
  for each row execute function set_updated_at();

create table po_lines (
  id          bigint generated always as identity primary key,
  po_id       uuid not null references purchase_orders (id) on delete cascade,
  product_id  uuid references products (id) on delete set null,
  description text not null,
  qty         numeric(12,3) not null default 1,
  unit_cost   numeric(12,2) not null default 0       -- snapshot
);
create index po_lines_po_idx on po_lines (po_id);

-- =============================================================================
-- Views
-- =============================================================================

-- Per-proposal cost / sell / margin roll-up (Pulse-friendly).
create or replace view v_proposal_totals as
select
  p.id as proposal_id,
  p.deal_id,
  p.status,
  p.bus_grant,
  coalesce(sum(l.qty * l.unit_cost), 0)                          as total_cost,
  coalesce(sum(l.qty * l.unit_sell), 0)                          as total_sell,
  coalesce(sum(l.qty * l.unit_sell), 0) - p.bus_grant            as customer_pays,
  coalesce(sum(l.qty * (l.unit_sell - l.unit_cost)), 0)          as gross_margin,
  case when coalesce(sum(l.qty * l.unit_sell), 0) = 0 then 0
       else round(
         sum(l.qty * (l.unit_sell - l.unit_cost))
         / nullif(sum(l.qty * l.unit_sell), 0), 4)
  end                                                            as margin_pct
from proposals p
left join proposal_lines l on l.proposal_id = p.id
group by p.id, p.deal_id, p.status, p.bus_grant;

-- =============================================================================
-- RLS + grants
-- =============================================================================
alter table suppliers          enable row level security;
alter table products           enable row level security;
alter table margin_rules       enable row level security;
alter table kit_templates      enable row level security;
alter table kit_template_items enable row level security;
alter table mapping_rules      enable row level security;
alter table design_inputs      enable row level security;
alter table proposals          enable row level security;
alter table proposal_lines     enable row level security;
alter table purchase_orders    enable row level security;
alter table po_lines           enable row level security;

create policy "suppliers_all"          on suppliers          for all to authenticated using (true) with check (true);
create policy "products_all"           on products           for all to authenticated using (true) with check (true);
create policy "margin_rules_all"       on margin_rules       for all to authenticated using (true) with check (true);
create policy "kit_templates_all"      on kit_templates      for all to authenticated using (true) with check (true);
create policy "kit_template_items_all" on kit_template_items for all to authenticated using (true) with check (true);
create policy "mapping_rules_all"      on mapping_rules      for all to authenticated using (true) with check (true);
create policy "design_inputs_all"      on design_inputs      for all to authenticated using (true) with check (true);
create policy "proposals_all"          on proposals          for all to authenticated using (true) with check (true);
create policy "proposal_lines_all"     on proposal_lines     for all to authenticated using (true) with check (true);
create policy "purchase_orders_all"    on purchase_orders    for all to authenticated using (true) with check (true);
create policy "po_lines_all"           on po_lines           for all to authenticated using (true) with check (true);

alter view v_proposal_totals set (security_invoker = on);
grant select on v_proposal_totals to authenticated;
