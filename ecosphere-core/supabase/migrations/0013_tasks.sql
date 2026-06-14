-- Lightweight office tasks (dashboard "Tasks" panel): chase invoices, DNO
-- responses, send certs, etc. Single-tenant internal tool, so permissive RLS
-- like the rest of the schema ([[rls-single-tenant-decision]]).
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all using (true) with check (true);
