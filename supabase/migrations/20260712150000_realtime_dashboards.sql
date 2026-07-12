-- =============================================================================
-- Publish `dashboards` for Realtime so dashboard-level changes (e.g. rename)
-- propagate to everyone viewing it, alongside the widget-level changes already
-- published in Tier 2. RLS still governs delivery: only team members receive
-- changes for their dashboards.
-- =============================================================================

alter publication supabase_realtime add table public.dashboards;

-- Full row in UPDATE/DELETE payloads so clients can reconcile without a refetch.
alter table public.dashboards replica identity full;
