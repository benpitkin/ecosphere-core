-- =============================================================================
-- EcoSphere CRM — Seed data (v2 hub schema)
-- Run AFTER 0001_init.sql, 0002_rls.sql, 0003_hub.sql.
-- Safe to re-run: clears CRM data first (does NOT touch auth users).
-- =============================================================================

truncate table
  bus_vouchers, deal_tags, activities, stage_history, deals,
  tags, contacts, pipeline_stages, pipelines
  restart identity cascade;

-- Pipelines (saved board views) ------------------------------------------------
insert into pipelines (id, slug, name, sort, is_default) values
  ('c1a90000-0000-4000-8000-000000000001', 'sales-jobs',  'Ecosphere – Sales & Jobs',        0, true),
  ('c1a90000-0000-4000-8000-000000000002', 'follow-ups',  'Follow-ups (No Initial Contact)', 1, false),
  ('c1a90000-0000-4000-8000-000000000003', 'new-sales',   'New Sales Pipeline',              2, false),
  ('c1a90000-0000-4000-8000-000000000004', 'servicing',   'Servicing / Aftercare',           3, false);

-- Pipeline stages (granular -> canonical BI bucket) ----------------------------
insert into pipeline_stages (pipeline_id, key, label, bucket, sort, color) values
  ('c1a90000-0000-4000-8000-000000000001', 'new-enquiry',      'New Enquiry (Uncontacted)',  'new_enquiry',   0,  '#64748B'),
  ('c1a90000-0000-4000-8000-000000000001', 'contact-attempt',  'Contact Attempt 1',          'contacted',     1,  '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000001', 'follow-up-sent',   'No Contact - Follow-up Sent','contacted',     2,  '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000001', 'gone-cold',        'Gone Cold (Pre-Quote)',      'contacted',     3,  '#94A3B8'),
  ('c1a90000-0000-4000-8000-000000000001', 'engaged',          'Contacted - Engaged',        'contacted',     4,  '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000001', 'survey-required',  'Survey Required',            'survey_booked', 5,  '#7C3AED'),
  ('c1a90000-0000-4000-8000-000000000001', 'survey-booked',    'Survey Booked',              'survey_booked', 6,  '#7C3AED'),
  ('c1a90000-0000-4000-8000-000000000001', 'quote-sent',       'Quote Sent',                 'quoted',        7,  '#B45309'),
  ('c1a90000-0000-4000-8000-000000000001', 'quote-followup',   'Quote Follow-up',            'quoted',        8,  '#B45309'),
  ('c1a90000-0000-4000-8000-000000000001', 'negotiation',      'Negotiation',                'quoted',        9,  '#B45309'),
  ('c1a90000-0000-4000-8000-000000000001', 'won-deposit',      'Won - Deposit Paid',         'won',           10, '#1B7A6E'),
  ('c1a90000-0000-4000-8000-000000000001', 'install-scheduled','Install Scheduled',          'won',           11, '#1B7A6E'),
  ('c1a90000-0000-4000-8000-000000000001', 'installed',        'Installed / Complete',       'won',           12, '#15803D'),
  ('c1a90000-0000-4000-8000-000000000001', 'lost',             'Lost',                       'lost',          13, '#DC2626'),
  ('c1a90000-0000-4000-8000-000000000002', 'awaiting',  'Awaiting First Contact', 'new_enquiry', 0, '#64748B'),
  ('c1a90000-0000-4000-8000-000000000002', 'attempt-1', 'Attempt 1',              'contacted',   1, '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000002', 'attempt-2', 'Attempt 2',              'contacted',   2, '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000002', 'attempt-3', 'Attempt 3',              'contacted',   3, '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000002', 'reengaged', 'Re-engaged',             'contacted',   4, '#1B7A6E'),
  ('c1a90000-0000-4000-8000-000000000002', 'dead',      'Dead Lead',              'lost',        5, '#DC2626'),
  ('c1a90000-0000-4000-8000-000000000003', 'enquiry',   'Enquiry',   'new_enquiry',   0, '#64748B'),
  ('c1a90000-0000-4000-8000-000000000003', 'qualified', 'Qualified', 'contacted',     1, '#0E7490'),
  ('c1a90000-0000-4000-8000-000000000003', 'survey',    'Survey',    'survey_booked', 2, '#7C3AED'),
  ('c1a90000-0000-4000-8000-000000000003', 'quoted',    'Quoted',    'quoted',        3, '#B45309'),
  ('c1a90000-0000-4000-8000-000000000003', 'won',       'Won',       'won',           4, '#1B7A6E'),
  ('c1a90000-0000-4000-8000-000000000003', 'lost',      'Lost',      'lost',          5, '#DC2626'),
  ('c1a90000-0000-4000-8000-000000000004', 'service-due', 'Service Due',    'new_enquiry',   0, '#64748B'),
  ('c1a90000-0000-4000-8000-000000000004', 'booked',      'Service Booked', 'survey_booked', 1, '#7C3AED'),
  ('c1a90000-0000-4000-8000-000000000004', 'in-progress', 'In Progress',    'quoted',        2, '#B45309'),
  ('c1a90000-0000-4000-8000-000000000004', 'completed',   'Completed',      'won',           3, '#15803D'),
  ('c1a90000-0000-4000-8000-000000000004', 'no-response', 'No Response',    'lost',          4, '#DC2626');

-- Tag library ------------------------------------------------------------------
insert into tags (id, name, category, color) values
  ('11111111-0000-0000-0000-000000000001', 'Google Ads',     'lead_source',            '#1B7A6E'),
  ('11111111-0000-0000-0000-000000000002', 'Facebook',        'lead_source',            '#1B7A6E'),
  ('11111111-0000-0000-0000-000000000003', 'Referral',        'lead_source',            '#1B7A6E'),
  ('11111111-0000-0000-0000-000000000004', 'Website',         'lead_source',            '#1B7A6E'),
  ('22222222-0000-0000-0000-000000000001', 'ASHP',            'product_interest',       '#0E7490'),
  ('22222222-0000-0000-0000-000000000002', 'Solar PV',        'product_interest',       '#0E7490'),
  ('22222222-0000-0000-0000-000000000003', 'Battery',         'product_interest',       '#0E7490'),
  ('22222222-0000-0000-0000-000000000004', 'Heating Upgrade', 'product_interest',       '#0E7490'),
  ('33333333-0000-0000-0000-000000000001', 'Hot Lead',        'pipeline_stage',         '#B45309'),
  ('33333333-0000-0000-0000-000000000002', 'Follow Up',       'pipeline_stage',         '#B45309'),
  ('44444444-0000-0000-0000-000000000001', 'Awaiting Survey', 'job_status',             '#6B7280'),
  ('44444444-0000-0000-0000-000000000002', 'Quote Sent',      'job_status',             '#6B7280'),
  ('44444444-0000-0000-0000-000000000003', 'Deposit Paid',    'job_status',             '#6B7280'),
  ('55555555-0000-0000-0000-000000000001', 'Domestic',        'customer_type',          '#7C3AED'),
  ('55555555-0000-0000-0000-000000000002', 'Commercial',      'customer_type',          '#7C3AED'),
  ('55555555-0000-0000-0000-000000000003', 'Landlord',        'customer_type',          '#7C3AED'),
  ('66666666-0000-0000-0000-000000000001', 'Off-Gas',         'property_characteristic','#15803D'),
  ('66666666-0000-0000-0000-000000000002', 'Listed Building', 'property_characteristic','#15803D'),
  ('66666666-0000-0000-0000-000000000003', 'New Build',       'property_characteristic','#15803D');

-- Contacts ---------------------------------------------------------------------
insert into contacts (id, full_name, first_name, last_name, email, phone, address, postcode, source, tags) values
  ('bbbb0000-0000-0000-0000-000000000001', 'Stephen West',     'Stephen', 'West',       'stephen.west@example.co.uk',     '07700 900111', '14 Moorland View, Tavistock',    'PL19 8AB', 'Referral',   '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000002', 'Helen Dale',       'Helen',   'Dale',       'helen.dale@example.co.uk',       '07700 900112', '3 Orchard Close, Okehampton',    'EX20 1HR', 'Referral',   '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000003', 'Nigel Parry',      'Nigel',   'Parry',      'nigel.parry@example.co.uk',      '07700 900113', '27 Salcombe Road, Newton Abbot', 'TQ12 2DA', 'Google Ads', '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000004', 'Malcolm Short',    'Malcolm', 'Short',      'malcolm.short@example.co.uk',    '07700 900114', '8 Fore Street, Bovey Tracey',    'TQ13 9AA', 'Website',    '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000005', 'Ewart Richardson', 'Ewart',   'Richardson', 'ewart.richardson@example.co.uk', '07700 900115', '1 Dartmoor Gardens, Ashburton',  'TQ13 7QL', 'Facebook',   '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000006', 'Alan Leach',       'Alan',    'Leach',      'alan.leach@example.co.uk',       '07700 900116', '52 Exeter Road, Crediton',       'EX17 3BL', 'Google Ads', '{Domestic}'),
  ('bbbb0000-0000-0000-0000-000000000007', 'Phil Chalker',     'Phil',    'Chalker',    'phil.chalker@example.co.uk',     '07700 900117', '11 Riverside Walk, Totnes',      'TQ9 5AB',  'Website',    '{Domestic}');

-- Deals (canonical stage derived from the granular stage by trigger) -----------
insert into deals
  (id, contact_id, customer_name, address, postcode, phone, email, property_type,
   value_gross, value_bus_grant, product_interest, lead_source, lost_reason,
   pipeline_id, pipeline_stage_id, stage_changed_at, pipeline_stage_changed_at, created_at)
values
  ('aaaa0001-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'Stephen West',
   '14 Moorland View, Tavistock', 'PL19 8AB', '07700 900111', 'stephen.west@example.co.uk', 'detached',
   11866.00, 7500.00, 'ashp', 'referral', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='installed'),
   now() - interval '20 days', now() - interval '20 days', now() - interval '48 days'),
  ('aaaa0002-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000002', 'Helen Dale',
   '3 Orchard Close, Okehampton', 'EX20 1HR', '07700 900112', 'helen.dale@example.co.uk', 'detached',
   21996.00, 7500.00, 'ashp', 'referral', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='quote-followup'),
   now() - interval '16 days', now() - interval '16 days', now() - interval '40 days'),
  ('aaaa0003-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000003', 'Nigel Parry',
   '27 Salcombe Road, Newton Abbot', 'TQ12 2DA', '07700 900113', 'nigel.parry@example.co.uk', 'semi_detached',
   15152.00, 0.00, 'solar_pv', 'google_ads', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='quote-sent'),
   now() - interval '5 days', now() - interval '5 days', now() - interval '21 days'),
  ('aaaa0004-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000004', 'Malcolm Short',
   '8 Fore Street, Bovey Tracey', 'TQ13 9AA', '07700 900114', 'malcolm.short@example.co.uk', 'bungalow',
   11500.00, 7500.00, 'ashp', 'website', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='survey-booked'),
   now() - interval '3 days', now() - interval '3 days', now() - interval '12 days'),
  ('aaaa0005-0000-0000-0000-000000000005', 'bbbb0000-0000-0000-0000-000000000005', 'Ewart Richardson',
   '1 Dartmoor Gardens, Ashburton', 'TQ13 7QL', '07700 900115', 'ewart.richardson@example.co.uk', 'detached',
   12253.00, 7500.00, 'ashp', 'facebook', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='follow-up-sent'),
   now() - interval '18 days', now() - interval '18 days', now() - interval '25 days'),
  ('aaaa0006-0000-0000-0000-000000000006', 'bbbb0000-0000-0000-0000-000000000006', 'Alan Leach',
   '52 Exeter Road, Crediton', 'EX17 3BL', '07700 900116', 'alan.leach@example.co.uk', 'detached',
   18393.00, 0.00, 'solar_pv', 'google_ads', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='new-enquiry'),
   now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'),
  ('aaaa0007-0000-0000-0000-000000000007', 'bbbb0000-0000-0000-0000-000000000007', 'Phil Chalker',
   '11 Riverside Walk, Totnes', 'TQ9 5AB', '07700 900117', 'phil.chalker@example.co.uk', 'terraced',
   13910.00, 0.00, 'heating_upgrade', 'website', null, 'c1a90000-0000-4000-8000-000000000001',
   (select id from pipeline_stages where pipeline_id='c1a90000-0000-4000-8000-000000000001' and key='new-enquiry'),
   now() - interval '9 days', now() - interval '9 days', now() - interval '9 days');

-- Deal tags --------------------------------------------------------------------
insert into deal_tags (deal_id, tag_id) values
  ('aaaa0001-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001'),
  ('aaaa0001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('aaaa0001-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001'),
  ('aaaa0001-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003'),
  ('aaaa0001-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001'),
  ('aaaa0002-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001'),
  ('aaaa0002-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003'),
  ('aaaa0002-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000001'),
  ('aaaa0002-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002'),
  ('aaaa0003-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002'),
  ('aaaa0003-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003'),
  ('aaaa0003-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('aaaa0003-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002'),
  ('aaaa0004-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001'),
  ('aaaa0004-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004'),
  ('aaaa0004-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000001'),
  ('aaaa0004-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001'),
  ('aaaa0005-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000001'),
  ('aaaa0005-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002'),
  ('aaaa0005-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000002'),
  ('aaaa0006-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002'),
  ('aaaa0006-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001'),
  ('aaaa0006-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001'),
  ('aaaa0007-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000004'),
  ('aaaa0007-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000004');

-- Activities -------------------------------------------------------------------
insert into activities (deal_id, type, body, created_at) values
  ('aaaa0001-0000-0000-0000-000000000001', 'note',    'Install complete. Sign-off received.',                 now() - interval '19 days'),
  ('aaaa0001-0000-0000-0000-000000000001', 'call',    'Confirmed MCS paperwork and BUS grant assignment.',    now() - interval '22 days'),
  ('aaaa0002-0000-0000-0000-000000000002', 'email',   'Quote sent for 12kW ASHP system. Awaiting response.',  now() - interval '16 days'),
  ('aaaa0002-0000-0000-0000-000000000002', 'note',    'Chase needed - quoted 16 days ago, no reply yet.',     now() - interval '2 days'),
  ('aaaa0003-0000-0000-0000-000000000003', 'email',   'Solar + battery proposal sent (6.4kWp + 5kWh).',       now() - interval '5 days'),
  ('aaaa0004-0000-0000-0000-000000000004', 'meeting', 'Survey booked for next week. Loft access confirmed.',  now() - interval '3 days'),
  ('aaaa0005-0000-0000-0000-000000000005', 'call',    'Spoke to customer, interested but comparing quotes.',  now() - interval '18 days'),
  ('aaaa0006-0000-0000-0000-000000000006', 'note',    'New enquiry via Google Ads. South-facing roof.',       now() - interval '2 days'),
  ('aaaa0007-0000-0000-0000-000000000007', 'note',    'Website enquiry - old gas boiler, wants efficiency upgrade.', now() - interval '9 days');

-- BUS voucher ------------------------------------------------------------------
insert into bus_vouchers (deal_id, voucher_ref, amount, status, applied_at, issued_at, redeemed_at, expires_at, notes) values
  ('aaaa0001-0000-0000-0000-000000000001', 'BUS-2026-0001', 7500.00, 'redeemed',
   (now() - interval '40 days')::date, (now() - interval '34 days')::date, (now() - interval '12 days')::date,
   (now() + interval '50 days')::date, 'Grant redeemed on install completion.');
