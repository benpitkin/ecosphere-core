-- =============================================================================
-- 0010_manufacturers_and_unit_kits.sql
-- Catalogue improvements:
--   1. products.manufacturer — first-class brand (Vaillant, Daikin, …) so part
--      names can be clean and the matcher can be brand-aware.
--   2. products.kit_template_id — a unit (e.g. a specific heat pump) can point
--      to its own kit template; when that unit is selected, its specific parts
--      (controller, etc.) are added ON TOP OF the universal base kit.
-- Idempotent.
-- =============================================================================

alter table products
  add column if not exists manufacturer    text,
  add column if not exists kit_template_id uuid references kit_templates (id) on delete set null;

create index if not exists products_kit_template_idx on products (kit_template_id);

comment on column products.manufacturer is
  'Brand (Vaillant, Daikin, …). Kept separate from name so matching can be brand-aware.';
comment on column products.kit_template_id is
  'Optional per-unit kit; its kit_template_items are added when this product is selected by the proposal engine (additive with the universal base kit).';
