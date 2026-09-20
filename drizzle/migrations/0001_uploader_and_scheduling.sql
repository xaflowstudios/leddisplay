CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.profiles (id, display_name, email)
SELECT id, COALESCE(NULLIF(split_part(email, '@', 1), ''), 'User'), email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), split_part(NEW.email, '@', 1), 'User'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.slides
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN created_by_name text,
  ADD COLUMN scheduled_start timestamptz,
  ADD COLUMN scheduled_end timestamptz;

CREATE INDEX slides_schedule_idx ON public.slides (is_active, scheduled_start, scheduled_end);

DROP POLICY IF EXISTS "Anyone can view active slides" ON public.slides;
CREATE POLICY "Anyone can view active slides" ON public.slides
  FOR SELECT TO anon USING (
    is_active
    AND (scheduled_start IS NULL OR scheduled_start <= now())
    AND (scheduled_end IS NULL OR scheduled_end > now())
  );