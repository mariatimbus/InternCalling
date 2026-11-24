-- Start the daily job-alerts workflow at 07:00 UTC from Supabase, like ingestion:
-- GitHub's own `schedule` trigger rarely fires for this repository.
-- Uses the same Vault secret as ingestion (github_dispatch_token, Actions write on this
-- repository only). Without the secret the job sends nothing. The workflow itself stays
-- off unless the ALERTS_ENABLED variable is true.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net')
     OR NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE NOTICE 'pg_cron, pg_net or Vault unavailable; job alerts dispatch not scheduled';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
  PERFORM cron.schedule(
    'dispatch-job-alerts',
    '0 7 * * *',
    $job$
      SELECT net.http_post(
        url := 'https://api.github.com/repos/mariatimbus/InternCalling/actions/workflows/job-alerts.yml/dispatches',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || decrypted_secret,
          'Accept', 'application/vnd.github+json',
          'X-GitHub-Api-Version', '2022-11-28',
          'User-Agent', 'interncalling-cron'),
        body := '{"ref":"main","inputs":{"mode":"send"}}'::jsonb)
      FROM vault.decrypted_secrets
      WHERE name = 'github_dispatch_token'
    $job$
  );
END
$migration$;
