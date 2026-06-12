-- =============================================================================
-- DISPATCH-SIDE migration — runs on the DISPATCH/PULSE project
-- (vmocndzlznzfvuedginn), NOT on Core. Kept in the Core repo for version
-- control because the two halves of the integration must stay in sync.
--
-- Reverse integration: when a Dispatch job's status changes to a terminal
-- milestone (completed / ready_for_handover), POST the new status back to the
-- Core receiver so the Core deal reflects install progress.
--
-- Mirrors Core's forward trigger (notify_dispatch_on_won): pg_net async POST,
-- SECURITY DEFINER, EXCEPTION WHEN OTHERS so it can NEVER block a job write.
-- Only fires on a genuine transition and only when ghl_opportunity_id is set.
--
-- SECRET: read from Supabase Vault (encrypted at rest), not hardcoded and not a
-- plaintext GUC. Create the secret once on the Dispatch project (same shared
-- secret used by the forward direction):
--   select vault.create_secret('<the-shared-secret>', 'dispatch_ingest_secret',
--                              'Core<->Dispatch reverse-sync shared secret');
--
-- Idempotent.
-- =============================================================================

create extension if not exists pg_net;

create or replace function notify_core_on_job_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
declare
  v_secret text;
begin
  -- Only report the terminal milestones Core cares about (per handover spec).
  if coalesce(new.status::text,'') not in ('completed','ready_for_handover') then
    return new;
  end if;
  -- Only on a genuine change into that status.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;
  if new.ghl_opportunity_id is null then return new; end if;

  -- Shared secret from Supabase Vault (encrypted at rest), not a plaintext GUC.
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'dispatch_ingest_secret'
   limit 1;

  perform net.http_post(
    url := 'https://ecosphere-core.vercel.app/api/dispatch/job-update',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'ghl_opportunity_id', new.ghl_opportunity_id,
      'status', new.status::text,
      'job_id', new.id
    )
  );

  return new;
exception when others then
  -- Never let the callback block a job write.
  return new;
end;
$function$;

drop trigger if exists trg_notify_core_on_job_status on jobs;
create trigger trg_notify_core_on_job_status
  after insert or update on jobs
  for each row execute function notify_core_on_job_status();
