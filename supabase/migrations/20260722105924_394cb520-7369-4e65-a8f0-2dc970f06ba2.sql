CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage app_settings" ON public.app_settings;
CREATE POLICY "admins manage app_settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES (
  'opportunity_profile',
  jsonb_build_object(
    'target', '',
    'minimumScore', 65,
    'autoProcessLimit', 50,
    'updatedBy', 'system'
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('producthunt-automation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'producthunt-automation');

SELECT cron.schedule(
  'producthunt-automation',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://id-preview--ca0fd1e0-e66c-4314-9ee1-9258cadb73bd.lovable.app/api/public/jobs/producthunt-automation',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cHh3Z3RtYmFkdWhqbGFkYmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NjQxNDMsImV4cCI6MjEwMDA0MDE0M30.DipZgCv8Qnd9nNkGwdyI8HNGLMlLSy-2mi9Qksszh2I"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  ) AS request_id;
  $$
);