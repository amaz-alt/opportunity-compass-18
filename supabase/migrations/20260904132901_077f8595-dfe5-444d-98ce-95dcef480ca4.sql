-- 1. Remove the duplicate cron job (jobs 1 and 2 both ran producthunt every 5 min)
SELECT cron.unschedule('producthunt-automation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'producthunt-automation');

-- 2. Seed the AI pause switch (credits are available again -> not paused)
INSERT INTO public.app_settings (key, value)
VALUES ('ai_processing_paused', jsonb_build_object('paused', false))
ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object('paused', false);

-- 3. Purge the failed-job bloat from the retry loop, keep the last 500 for reference
DELETE FROM public.ai_jobs
WHERE status = 'failed'
  AND id NOT IN (
    SELECT id FROM public.ai_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 500
  );

-- 4. Close out automation runs stuck in 'running' forever
UPDATE public.automation_runs
SET status = 'failed', stage = 'error', completed_at = now(),
    error_message = COALESCE(error_message, 'Run did not complete (stale).')
WHERE status = 'running' AND started_at < now() - interval '30 minutes';