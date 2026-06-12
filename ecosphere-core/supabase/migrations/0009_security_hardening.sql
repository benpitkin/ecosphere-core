-- =============================================================================
-- 0009_security_hardening.sql
-- Addresses Supabase security + performance advisor findings (platform audit
-- 2026-06-12). All changes are behaviour-preserving — they harden access and
-- add indexes without altering what the app can read/write.
-- =============================================================================

-- 1) Lock down the SECURITY DEFINER trigger functions so they cannot be invoked
--    via the public RPC endpoint (/rest/v1/rpc/...). Triggers still fire on the
--    underlying DML; only direct anon/authenticated RPC calls are removed.
-- Functions grant EXECUTE to the built-in PUBLIC group by default, so anon/
-- authenticated inherit it — must revoke from PUBLIC, not just those roles.
revoke execute on function public.notify_dispatch_on_won() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) Pin a non-mutable search_path on the flagged functions. All four reference
--    only public objects + pg_catalog, so `public` preserves behaviour.
alter function public.set_updated_at()                    set search_path = public;
alter function public.deals_derive_stage()                set search_path = public;
alter function public.deals_log_history()                 set search_path = public;
alter function public.markup_for(product_category)        set search_path = public;

-- 3) Covering indexes for foreign keys flagged as unindexed.
create index if not exists activities_created_by_idx        on activities (created_by);
create index if not exists kit_template_items_product_idx   on kit_template_items (product_id);
create index if not exists mapping_rules_bundle_template_idx on mapping_rules (bundle_template_id);
create index if not exists mapping_rules_product_idx         on mapping_rules (product_id);
create index if not exists po_lines_product_idx              on po_lines (product_id);
create index if not exists proposal_lines_product_idx        on proposal_lines (product_id);
create index if not exists proposals_design_input_idx        on proposals (design_input_id);
create index if not exists purchase_orders_supplier_idx      on purchase_orders (supplier_id);
create index if not exists stage_history_changed_by_idx      on stage_history (changed_by);

-- 4) profiles UPDATE policy: evaluate auth.uid() once per query (subselect)
--    instead of once per row. Same semantics, better at scale.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 5) part-images is a PUBLIC bucket accessed via getPublicUrl (and only
--    uploaded to). The broad SELECT/list policy let anon enumerate every
--    filename and isn't used by the app — drop it. Public object URLs still
--    resolve (public buckets don't require a SELECT policy for object reads).
drop policy if exists part_images_read on storage.objects;
