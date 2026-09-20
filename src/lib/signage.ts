import { supabase } from "@/integrations/supabase/client";

export const IMAGE_BUCKET = "signage-images";

export type Slide = {
  id: string;
  title: string;
  image_url: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  position: number;
  is_active: boolean;
  is_approved: boolean;
  created_by: string | null;
  created_by_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
};

export type ScheduleStatus = "active" | "scheduled" | "expired";

/** Where a slide currently sits relative to its optional schedule window. */
export function scheduleStatus(
  slide: Pick<Slide, "scheduled_start" | "scheduled_end" | "is_active">,
  now: Date = new Date(),
): ScheduleStatus {
  if (slide.scheduled_end && new Date(slide.scheduled_end) <= now) return "expired";
  if (slide.scheduled_start && new Date(slide.scheduled_start) > now) return "scheduled";
  return "active";
}

/** Whether a slide should be shown on screen right now: approved, switched on AND inside its schedule window. */
export function isLiveNow(
  slide: Pick<Slide, "scheduled_start" | "scheduled_end" | "is_active"> & {
    is_approved?: boolean;
  },
  now: Date = new Date(),
) {
  if (!slide.is_active) return false;
  if (slide.is_approved === false) return false;
  return scheduleStatus(slide, now) === "active";
}

export type DisplaySettings = {
  id: number;
  default_duration_seconds: number;
  object_fit: string;
  transition_ms: number;
  shuffle: boolean;
  show_clock: boolean;
};

export type ResolvedSlide = Slide & { src: string };

/** Turns a stored slide into something with a usable image URL. */
export async function resolveSlides(slides: Slide[]): Promise<ResolvedSlide[]> {
  const resolved = await Promise.all(
    slides.map(async (slide) => {
      if (slide.storage_path) {
        const { data } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(slide.storage_path, 60 * 60 * 12);
        return data?.signedUrl ? { ...slide, src: data.signedUrl } : null;
      }
      if (slide.image_url) return { ...slide, src: slide.image_url };
      return null;
    }),
  );
  return resolved.filter((slide): slide is ResolvedSlide => slide !== null);
}

export async function fetchDisplayData(onlyActive: boolean) {
  const slidesQuery = supabase
    .from("slides")
    .select(
      "id, title, image_url, storage_path, duration_seconds, position, is_active, is_approved, created_by, created_by_name, scheduled_start, scheduled_end",
    )
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const [{ data: slides, error: slidesError }, { data: settings, error: settingsError }] =
    await Promise.all([
      onlyActive ? slidesQuery.eq("is_active", true) : slidesQuery,
      supabase.from("display_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

  if (slidesError) throw slidesError;
  if (settingsError) throw settingsError;

  const allSlides = (slides ?? []) as Slide[];
  // The database already filters anonymous (display) requests to slides whose
  // schedule window is currently open, but the admin portal fetches everything
  // and the public feed can lag a poll cycle behind a schedule boundary, so
  // filter here too as the source of truth for "should this be on screen now".
  const visible = onlyActive ? allSlides.filter((slide) => isLiveNow(slide)) : allSlides;

  return {
    slides: visible,
    settings: (settings ?? {
      id: 1,
      default_duration_seconds: 600,
      object_fit: "cover",
      transition_ms: 800,
      shuffle: false,
      show_clock: false,
    }) as DisplaySettings,
  };
}

export function durationFor(slide: Slide, settings: DisplaySettings) {
  const seconds = slide.duration_seconds ?? settings.default_duration_seconds;
  return Math.max(2, seconds) * 1000;
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = seconds / 60;
  return Number.isInteger(mins) ? `${mins} min` : `${mins.toFixed(1)} min`;
}

export type TimeUnit = "seconds" | "minutes";

/**
 * Turns what someone typed into a number of seconds.
 * In minutes mode the value is always minutes (0.5 -> 30s, 1.5 -> 90s).
 * In seconds mode a decimal or a value under 2 is read as minutes too, so
 * typing 0.5 still means half a minute rather than an impossible half second.
 */
export function toSeconds(raw: string | number, unit: TimeUnit = "seconds"): number | null {
  const text = String(raw).trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "minutes" || !Number.isInteger(value) || value < 2) {
    return Math.max(2, Math.round(value * 60));
  }
  return Math.round(value);
}

