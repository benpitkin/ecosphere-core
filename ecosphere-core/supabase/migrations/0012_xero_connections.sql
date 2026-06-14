-- Single-row store for the Xero OAuth connection (one Xero organisation).
-- Tokens are secrets: RLS is ON with NO policy, so only the service-role client
-- (used by the /api/xero/* routes) can read or write them — never the browser.
create table if not exists public.xero_connections (
  id            integer primary key default 1,
  tenant_id     text,
  tenant_name   text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  connected_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  constraint xero_connections_singleton check (id = 1)
);

alter table public.xero_connections enable row level security;
-- Intentionally no policy: tokens are server-only. The service role bypasses RLS.
