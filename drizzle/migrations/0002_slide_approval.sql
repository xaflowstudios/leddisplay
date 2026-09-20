ALTER TABLE public.slides
  ADD COLUMN is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Everything that already exists was live, so it stays approved.
UPDATE public.slides SET is_approved = true, approved_at = now();

-- Public screen only ever shows approved, switched-on, in-window slides.
DROP POLICY IF EXISTS "Anyone can view active slides" ON public.slides;
CREATE POLICY "Anyone can view active slides" ON public.slides
  FOR SELECT TO anon USING (
    is_active
    AND is_approved
    AND (scheduled_start IS NULL OR scheduled_start <= now())
    AND (scheduled_end IS NULL OR scheduled_end > now())
  );

-- Any signed-in account may submit an image; it waits for approval unless an
-- admin added it. Admins keep full control.
DROP POLICY IF EXISTS "Admins can insert slides" ON public.slides;
CREATE POLICY "Signed in users can submit slides" ON public.slides
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR is_approved = false)
  );

-- Submitters can withdraw their own not-yet-approved image.
CREATE POLICY "Users can delete their own pending slides" ON public.slides
  FOR DELETE TO authenticated USING (created_by = auth.uid() AND is_approved = false);