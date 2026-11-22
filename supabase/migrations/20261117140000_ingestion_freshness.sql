-- Server-managed freshness. Unknown observations are never backfilled as facts.
ALTER TABLE public.opportunities
 ADD COLUMN last_seen_at timestamptz,
 ADD COLUMN last_checked_on date,
 ADD COLUMN missing_runs integer NOT NULL DEFAULT 0 CHECK (missing_runs >= 0),
 ADD COLUMN inactive_reason varchar(40) CHECK (inactive_reason IN ('deadline_expired','source_missing'));
CREATE INDEX ix_opportunities_source_seen ON public.opportunities(source,last_seen_at);
CREATE TABLE public.ingestion_source_state (
 source varchar(100) PRIMARY KEY,
 last_success_at timestamptz NOT NULL,
 last_snapshot_on date NOT NULL,
 fetched integer NOT NULL CHECK (fetched > 0),
 rejection_ratio double precision NOT NULL DEFAULT 0 CHECK (rejection_ratio BETWEEN 0 AND 1),
 duplicate_ratio double precision NOT NULL DEFAULT 0 CHECK (duplicate_ratio BETWEEN 0 AND 1)
);
ALTER TABLE public.ingestion_source_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingestion_source_state FROM anon, authenticated;
GRANT ALL ON public.ingestion_source_state TO service_role;
