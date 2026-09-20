CREATE TYPE public.app_role AS ENUM ('admin', 'display');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text,
  storage_path text,
  duration_seconds integer,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slides TO authenticated;
GRANT ALL ON public.slides TO service_role;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active slides" ON public.slides
  FOR SELECT TO anon USING (is_active);
CREATE POLICY "Signed in users can view slides" ON public.slides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert slides" ON public.slides
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update slides" ON public.slides
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete slides" ON public.slides
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.display_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_duration_seconds integer NOT NULL DEFAULT 600,
  object_fit text NOT NULL DEFAULT 'cover',
  transition_ms integer NOT NULL DEFAULT 800,
  shuffle boolean NOT NULL DEFAULT false,
  show_clock boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.display_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.display_settings TO authenticated;
GRANT ALL ON public.display_settings TO service_role;
ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view display settings" ON public.display_settings
  FOR SELECT TO anon USING (true);
CREATE POLICY "Signed in users can view display settings" ON public.display_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update display settings" ON public.display_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert display settings" ON public.display_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER slides_touch BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.display_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Anyone can read signage images" ON storage.objects
  FOR SELECT USING (bucket_id = 'signage-images');
CREATE POLICY "Admins can upload signage images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'signage-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update signage images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'signage-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete signage images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'signage-images' AND public.has_role(auth.uid(), 'admin'));

INSERT INTO public.display_settings (id) VALUES (1);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF admin_exists THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
REVOKE ALL ON FUNCTION public.admin_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_exists() FROM anon;