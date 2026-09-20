-- The primary admin is the very first admin account (earliest admin role row).
CREATE OR REPLACE FUNCTION public.primary_admin_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
  ORDER BY created_at, user_id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.primary_admin_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.primary_admin_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_primary_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _user_id = public.primary_admin_id()
$$;
REVOKE ALL ON FUNCTION public.is_primary_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_primary_admin(uuid) TO authenticated, service_role;

-- Only the primary admin may add an already-approved image; everyone else's
-- submission must start out pending.
CREATE POLICY "Signed in users can submit slides" ON public.slides
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (public.is_primary_admin(auth.uid()) OR is_approved = false)
  );

-- Belt and braces: a secondary admin cannot flip an image to approved.
CREATE OR REPLACE FUNCTION public.enforce_slide_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() is NULL for trusted server-side (service role) work.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.is_approved AND NOT public.is_primary_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the primary administrator can approve images';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_approved AND NOT OLD.is_approved
     AND NOT public.is_primary_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the primary administrator can approve images';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_slide_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS slides_enforce_approval ON public.slides;
CREATE TRIGGER slides_enforce_approval BEFORE INSERT OR UPDATE ON public.slides
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slide_approval();

-- Sign-in events from accounts that are asking for admin access.
CREATE TABLE IF NOT EXISTS public.admin_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_access_requests TO authenticated;
GRANT ALL ON public.admin_access_requests TO service_role;
ALTER TABLE public.admin_access_requests ENABLE ROW LEVEL SECURITY;

-- Only the primary admin can read (and therefore be notified about) these.
DROP POLICY IF EXISTS "Primary admin can read access requests" ON public.admin_access_requests;
CREATE POLICY "Primary admin can read access requests" ON public.admin_access_requests
  FOR SELECT TO authenticated USING (public.is_primary_admin(auth.uid()));

-- Rows are only ever written through this function, which also throttles
-- repeats so the same person does not spam the primary admin.
CREATE OR REPLACE FUNCTION public.request_admin_access()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(uid, 'admin') THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_access_requests
    WHERE user_id = uid AND created_at > now() - interval '12 hours'
  ) THEN RETURN false; END IF;

  INSERT INTO public.admin_access_requests (user_id, display_name, email)
  SELECT p.id, p.display_name, p.email FROM public.profiles p WHERE p.id = uid;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.request_admin_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_admin_access() TO authenticated;

ALTER TABLE public.admin_access_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_access_requests;