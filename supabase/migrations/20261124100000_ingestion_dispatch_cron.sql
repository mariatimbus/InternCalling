-- Start the GitHub ingestion workflow every 10 minutes from Supabase.
-- GitHub's own `schedule` trigger is best-effort and rarely fires for this repository.
--
-- The token is never stored here. Create it once per project in Vault:
--   select vault.create_secret('<fine-grained token>', 'github_dispatch_token',
--     'Actions: read and write on mariatimbus/InternCalling only');
-- Without that secret the job runs but sends nothing, so other projects stay inert.
-- Overlapping dispatches queue in the workflow's concurrency group; they never overlap.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
     OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'pg_cron, pg_net or Vault unavailable; ingestion dispatch not scheduled';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
  -- Same name replaces the job, so replaying the migration is safe.
  PERFORM cron.schedule(
    'dispatch-ingestion',
    '*/10 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://api.github.com/repos/mariatimbus/InternCalling/actions/workflows/scheduled-ingestion.yml/dispatches',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || decrypted_secret,
          'Accept', 'application/vnd.github+json',
          'X-GitHub-Api-Version', '2022-11-28',
          'User-Agent', 'interncalling-cron'),
        body := '{"ref":"main","inputs":{"mode":"apply"}}'::jsonb)
      FROM vault.decrypted_secrets
      WHERE name = 'github_dispatch_token'
    $job$
  );
END
$migration$;
