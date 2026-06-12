-- =============================================================================
-- 0007_reverse_dispatch_sync.sql
-- Core side of the reverse integration: Dispatch reports a job's lifecycle
-- status back to Core so the deal reflects install progress.
--
-- Records the Dispatch job status in DEDICATED columns rather than touching
-- deals.stage / pipeline_* — those are owned by the GoHighLevel sync
-- (runGhlSync), and we must not contend with that writer.
--
-- job_status is plain TEXT (not an enum) so Core stays decoupled from
-- Dispatch's job_status enum; the receiver stores whatever Dispatch sends.
--
-- Idempotent. Safe to run more than once.
-- =============================================================================

alter table deals
  add column if not exists job_status     text,
  add column if not exists job_status_at  timestamptz;

comment on column deals.job_status is
  'Latest Dispatch job lifecycle status (e.g. completed, ready_for_handover), set by POST /api/dispatch/job-update. Decoupled from deals.stage.';
comment on column deals.job_status_at is
  'When deals.job_status was last updated from Dispatch.';
