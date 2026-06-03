-- =============================================================================
-- EcoSphere Hub — Proposal Engine seed (run AFTER 0004_proposal_engine.sql)
-- Starter catalogue + margin rules + ASHP base kit + per-radiator bundle +
-- mapping rules. Safe to re-run.
-- =============================================================================

truncate table po_lines, purchase_orders, proposal_lines, proposals, design_inputs,
  mapping_rules, kit_template_items, kit_templates, margin_rules, products, suppliers
  restart identity cascade;

-- Suppliers --------------------------------------------------------------------
insert into suppliers (id, name, contact, email, active) values
  ('cc000000-0000-4000-8000-000000000001', 'BPH Wholesale',        'Trade desk', 'orders@bph.example',        true),
  ('cc000000-0000-4000-8000-000000000002', 'Wolseley',             'Trade desk', 'orders@wolseley.example',   true),
  ('cc000000-0000-4000-8000-000000000003', 'EcoSphere Subcontractors', 'Install team', 'install@ecosphere.example', true);

-- Margin rules (category NULL = global default) --------------------------------
insert into margin_rules (category, markup_pct) values
  (null,          25.00),
  ('heat_pump',   12.00),
  ('cylinder',    18.00),
  ('radiator',    30.00),
  ('consumable',  40.00),
  ('valve',       40.00),
  ('fitting',     40.00),
  ('pipe',        35.00),
  ('control',     20.00),
  ('electrical',  30.00),
  ('labour',      0.00);

-- Products (COST price only; sell derived from margin) -------------------------
insert into products (id, sku, name, category, supplier_id, unit, cost_price, vat_rate, attrs) values
  -- heat pumps
  ('dd000000-0000-4000-8000-000000000001', 'HP-VAIL-7',  'Vaillant aroTHERM plus 7kW',  'heat_pump', 'cc000000-0000-4000-8000-000000000001', 'each', 3200.00, 0, '{"kw":7}'),
  ('dd000000-0000-4000-8000-000000000002', 'HP-VAIL-12', 'Vaillant aroTHERM plus 12kW', 'heat_pump', 'cc000000-0000-4000-8000-000000000001', 'each', 3900.00, 0, '{"kw":12}'),
  ('dd000000-0000-4000-8000-000000000003', 'HP-MITS-14', 'Mitsubishi Ecodan 14kW',      'heat_pump', 'cc000000-0000-4000-8000-000000000002', 'each', 4250.00, 0, '{"kw":14}'),
  -- cylinders
  ('dd000000-0000-4000-8000-000000000010', 'CYL-210',  'Pre-plumbed cylinder 210L', 'cylinder', 'cc000000-0000-4000-8000-000000000001', 'each', 980.00, 0, '{"litres":210}'),
  ('dd000000-0000-4000-8000-000000000011', 'CYL-250',  'Pre-plumbed cylinder 250L', 'cylinder', 'cc000000-0000-4000-8000-000000000001', 'each', 1120.00, 0, '{"litres":250}'),
  -- radiators (matched by type + width)
  ('dd000000-0000-4000-8000-000000000020', 'RAD-T22-600',  'Radiator T22 600x1000', 'radiator', 'cc000000-0000-4000-8000-000000000002', 'each', 85.00, 20, '{"type":"T22","height_mm":600,"width_mm":1000}'),
  ('dd000000-0000-4000-8000-000000000021', 'RAD-T22-700',  'Radiator T22 700x1200', 'radiator', 'cc000000-0000-4000-8000-000000000002', 'each', 110.00, 20, '{"type":"T22","height_mm":700,"width_mm":1200}'),
  ('dd000000-0000-4000-8000-000000000022', 'RAD-K2-600',   'Radiator K2 600x800',   'radiator', 'cc000000-0000-4000-8000-000000000002', 'each', 78.00, 20, '{"type":"K2","height_mm":600,"width_mm":800}'),
  -- per-radiator bundle parts
  ('dd000000-0000-4000-8000-000000000030', 'VLV-TRV',   'Thermostatic radiator valve', 'valve',   'cc000000-0000-4000-8000-000000000001', 'each', 9.50,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000031', 'VLV-LOCK',  'Lockshield valve',            'valve',   'cc000000-0000-4000-8000-000000000001', 'each', 6.20,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000032', 'FIT-BRACK', 'Radiator wall bracket',       'fitting', 'cc000000-0000-4000-8000-000000000001', 'each', 3.10,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000033', 'FIT-TAILS', 'Radiator tail pair',          'fitting', 'cc000000-0000-4000-8000-000000000001', 'pair', 4.80,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000034', 'PIPE-15',   '15mm copper pipe',            'pipe',    'cc000000-0000-4000-8000-000000000001', 'm',    3.40,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000035', 'FIT-15EL',  '15mm fitting (elbow/tee)',    'fitting', 'cc000000-0000-4000-8000-000000000001', 'each', 1.25,  20, '{}'),
  -- ASHP base-kit consumables
  ('dd000000-0000-4000-8000-000000000040', 'CON-MAGFIL', 'Magnetic system filter',   'consumable', 'cc000000-0000-4000-8000-000000000001', 'each', 62.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000041', 'CON-INHIB',  'System inhibitor',          'consumable', 'cc000000-0000-4000-8000-000000000001', 'each', 14.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000042', 'CON-ANTIFR', 'Antifreeze (glycol)',       'consumable', 'cc000000-0000-4000-8000-000000000001', 'each', 28.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000043', 'ELE-ISO',    'Rotary isolator',           'electrical', 'cc000000-0000-4000-8000-000000000002', 'each', 18.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000044', 'ELE-SPUR',   'Fused spur',                'electrical', 'cc000000-0000-4000-8000-000000000002', 'each', 9.00,  20, '{}'),
  ('dd000000-0000-4000-8000-000000000045', 'CTL-PACK',   'Heat pump control pack',    'control',    'cc000000-0000-4000-8000-000000000001', 'each', 145.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000046', 'CON-FEET',   'Anti-vibration feet set',   'consumable', 'cc000000-0000-4000-8000-000000000001', 'set',  34.00, 20, '{}'),
  ('dd000000-0000-4000-8000-000000000047', 'CON-FIX',    'Fixings pack',              'consumable', 'cc000000-0000-4000-8000-000000000001', 'each', 22.00, 20, '{}'),
  -- labour (subcontractor)
  ('dd000000-0000-4000-8000-000000000050', 'LAB-INSTALL','ASHP install labour (day)', 'labour',  'cc000000-0000-4000-8000-000000000003', 'day',  320.00, 0, '{}');

-- Kit templates ----------------------------------------------------------------
insert into kit_templates (id, key, name, notes) values
  ('ee000000-0000-4000-8000-000000000001', 'ashp_base_kit',        'ASHP base kit',          'Consumables every ASHP install needs that a design never lists.'),
  ('ee000000-0000-4000-8000-000000000002', 'per_radiator_replaced','Per radiator (replaced)','Parts to swap one radiator.');

insert into kit_template_items (template_id, product_id, qty) values
  -- ASHP base kit
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000040', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000041', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000042', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000043', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000044', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000045', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000046', 1),
  ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000047', 1),
  -- Per radiator bundle: 1 TRV, 1 lockshield, 2 brackets, 1 tail pair, 3m pipe, 4 fittings
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000030', 1),
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000031', 1),
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000032', 2),
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000033', 1),
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000034', 3),
  ('ee000000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000035', 4);

-- Mapping rules ----------------------------------------------------------------
insert into mapping_rules (type, trigger_key, target_category, match_attrs, qty_per, bundle_template_id, notes) values
  ('direct',   'heat_pump',        'heat_pump', '{}', 1, null, 'Match the design heat pump to a product by kW.'),
  ('direct',   'cylinder',         'cylinder',  '{}', 1, null, 'Match the design cylinder to a product by litres.'),
  ('schedule', 'emitter_schedule', 'radiator',  '{}', 1, 'ee000000-0000-4000-8000-000000000002', 'Each replaced row: 1 radiator (by type+size) + per-radiator bundle.'),
  ('base_kit', 'ashp',             null,        '{}', 1, 'ee000000-0000-4000-8000-000000000001', 'Always add the ASHP base kit consumables.');
