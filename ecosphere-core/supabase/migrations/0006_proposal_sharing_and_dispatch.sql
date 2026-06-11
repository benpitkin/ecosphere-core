-- =============================================================================
-- 0006_proposal_sharing_and_dispatch.sql
-- Back-fill of schema changes that were applied directly to the live Core DB
-- (jfeuvyjszidmocnggyox) via the Supabase MCP/dashboard and were NOT previously
-- captured in a migration file. See HANDOVER §5/§8/§10.6.
--
-- Covers:
--   1. proposals.share_token        — gated customer link  /p/<token>
--   2. proposals.customer_content   — editable per-proposal customer doc overrides
--   3. proposals.heatloss_report_path — path in the heatloss-reports bucket
--   4. deals_ghl_opportunity_id_idx — lookup index for the cross-app join key
--   5. pg_net extension             — async HTTP for the Dispatch notify trigger
--   6. heatloss-reports bucket      — private; MCS PDFs served via signed URLs
--   7. notify_dispatch_on_won() + trg_notify_dispatch_on_won — Core->Dispatch
--
-- Idempotent: safe to run more than once.
--
-- ⚠ SECRET HANDLING: the live DB currently hardcodes the Dispatch ingest secret
--   inside the trigger function. This migration instead reads it from a database
--   setting so the secret is NOT committed to git. Before this function can post
--   to Dispatch, set the GUC once per database (or move to Supabase Vault):
--     alter database postgres set app.dispatch_ingest_secret = '<the-shared-secret>';
--   The function degrades safely if unset (it still never blocks a deal write).
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_bytes() for share_token
create extension if not exists pg_net;      -- net.http_post() for the trigger

-- -----------------------------------------------------------------------------
-- 1-3. proposals: customer-facing sharing columns
-- -----------------------------------------------------------------------------
alter table proposals
  add column if not exists share_token          text default encode(gen_random_bytes(9), 'hex'),
  add column if not exists customer_content      jsonb,
  add column if not exists heatloss_report_path  text;

-- Unique share token (matches live index proposals_share_token_key).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='proposals_share_token_key'
  ) then
    create unique index proposals_share_token_key on proposals (share_token);
  end if;
end $$;

-- Backfill tokens for any pre-existing rows that predate the column.
update proposals
   set share_token = encode(gen_random_bytes(9), 'hex')
 where share_token is null;

-- -----------------------------------------------------------------------------
-- 4. Lookup index on the cross-app join key (deals.ghl_opportunity_id)
--    (a unique constraint already exists; this btree mirrors the live index)
-- -----------------------------------------------------------------------------
create index if not exists deals_ghl_opportunity_id_idx
  on deals using btree (ghl_opportunity_id);

-- -----------------------------------------------------------------------------
-- 6. Private storage bucket for MCS heat-loss PDFs (served via signed URLs only;
--    no RLS policies — access is via the server-side service-role client).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('heatloss-reports', 'heatloss-reports', false)
on conflict (id) do update set public = false;

-- -----------------------------------------------------------------------------
-- 7. Core -> Dispatch: on a deal becoming 'won' with a proposal+design, POST a
--    draft-job payload to the Dispatch ingest-deal edge function (async, pg_net).
--    SECURITY DEFINER + swallow-all so it can NEVER block a deal write.
-- -----------------------------------------------------------------------------
create or replace function notify_dispatch_on_won()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
declare
  v_proposal_id uuid;
  v_bus_grant numeric;
  v_payload jsonb;
  v_days numeric;
  v_rate numeric;
  v_body jsonb;
  v_secret text;
begin
  -- Only act when the deal is newly 'won', has a GHL id, and has a proposal+design.
  if coalesce(new.stage::text,'') <> 'won' then return new; end if;
  if tg_op = 'UPDATE' and old.stage is not distinct from new.stage then return new; end if;
  if new.ghl_opportunity_id is null then return new; end if;

  select p.id, p.bus_grant, di.payload
    into v_proposal_id, v_bus_grant, v_payload
  from proposals p
  join design_inputs di on di.id = p.design_input_id
  where p.deal_id = new.id and p.design_input_id is not null
  order by p.created_at desc nulls last
  limit 1;

  if v_proposal_id is null then return new; end if; -- no design to send

  select nullif(coalesce(sum(qty),0),0), nullif(coalesce(max(unit_cost),0),0)
    into v_days, v_rate
  from proposal_lines
  where proposal_id = v_proposal_id and category = 'labour';

  v_body := jsonb_build_object(
    'ghl_opportunity_id', new.ghl_opportunity_id,
    'client_name', new.customer_name,
    'postcode', new.postcode,
    'customer_email', new.email,
    'bus_grant', coalesce(v_bus_grant, 0),
    'estimated_days', v_days,
    'day_rate', v_rate,
    'design', v_payload
  );

  -- Secret is read from a DB setting (see header) rather than hardcoded.
  v_secret := current_setting('app.dispatch_ingest_secret', true);

  perform net.http_post(
    url := 'https://vmocndzlznzfvuedginn.supabase.co/functions/v1/ingest-deal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', coalesce(v_secret, '')
    ),
    body := v_body
  );

  return new;
exception when others then
  -- Never let the integration block a deal write.
  return new;
end;
$function$;

drop trigger if exists trg_notify_dispatch_on_won on deals;
create trigger trg_notify_dispatch_on_won
  after insert or update on deals
  for each row execute function notify_dispatch_on_won();
