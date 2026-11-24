-- Human review of ingested postings the scope rules could not decide on their own.
-- pending: held, waiting for a reviewer; approved: published by a reviewer and kept
-- published while its values stay the same; rejected: hidden for good unless it changes.
-- Rows held before this migration get their status from the next ingestion run.
ALTER TABLE public.opportunities
 ADD COLUMN review_status varchar(20) CHECK (review_status IN ('pending','approved','rejected')),
 ADD COLUMN review_reason varchar(500),
 ADD COLUMN reviewed_at timestamptz;
CREATE INDEX ix_opportunities_review_pending ON public.opportunities(posted_at DESC)
 WHERE review_status = 'pending';
