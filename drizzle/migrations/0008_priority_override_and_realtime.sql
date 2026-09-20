-- Temporary priority image override (chosen duration lives in override_until).
ALTER TABLE public.display_settings
  ADD COLUMN IF NOT EXISTS override_slide_id uuid REFERENCES public.slides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_until timestamptz;

-- Realtime so the display screen and the approval portal update without a refresh.
ALTER TABLE public.display_settings REPLICA IDENTITY FULL;
ALTER TABLE public.slides REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'display_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.display_settings;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'slides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slides;
  END IF;
END $$;