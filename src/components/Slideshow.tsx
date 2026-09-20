import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  durationFor,
  fetchDisplayData,
  isLiveNow,
  resolveSlides,
  type DisplaySettings,
  type ResolvedSlide,
} from "@/lib/signage";

// How often to re-poll the playlist from the server. Kept short so a slide
// whose scheduled start/end time has just arrived shows up (or disappears)
// promptly instead of waiting a long time for the next refetch.
const POLL_INTERVAL_MS = 15_000;
// How often to re-check the already-fetched slides against the clock, so a
// schedule boundary that falls between polls still takes effect immediately.
const SCHEDULE_TICK_MS = 5_000;

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function Slideshow() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["display", "public"],
    queryFn: async () => {
      const { slides, settings } = await fetchDisplayData(true);
      return { slides: await resolveSlides(slides), settings };
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Live updates, so an urgent image (or any playlist change) reaches the
  // screen instantly instead of on the next poll.
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["display"] });
    };
    const channel = supabase
      .channel("display-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "display_settings" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "slides" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Re-checked on a short tick so a slide's scheduled start/end time takes
  // effect the moment it arrives, without waiting for the next server poll.
  const [scheduleClock, setScheduleClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setScheduleClock(Date.now()), SCHEDULE_TICK_MS);
    return () => clearInterval(t);
  }, []);

  const settings: DisplaySettings | undefined = data?.settings;
  const slides = useMemo<ResolvedSlide[]>(() => {
    if (!data) return [];
    // scheduleClock isn't read here directly, but is a dependency so this
    // recomputes on each tick and re-applies isLiveNow() against the clock.
    const live = data.slides.filter((slide) => isLiveNow(slide));
    return settings?.shuffle ? shuffled(live) : live;
  }, [data, settings?.shuffle, scheduleClock]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = slides[index] ?? null;
  const total = slides.length;

  // An urgent image can take over the screen for a chosen length of time. While
  // it is up the normal slideshow (and its timer) stays completely paused.
  const overrideUntilMs = settings?.override_until
    ? new Date(settings.override_until).getTime()
    : 0;
  const [, setOverrideTick] = useState(0);
  useEffect(() => {
    const remaining = overrideUntilMs - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setOverrideTick((n) => n + 1), remaining + 50);
    return () => clearTimeout(t);
  }, [overrideUntilMs]);

  const overrideSlide =
    overrideUntilMs > Date.now() && settings?.override_slide_id
      ? (data?.slides.find((slide) => slide.id === settings.override_slide_id) ?? null)
      : null;
  const overrideActive = overrideSlide !== null;

  const go = useCallback(
    (step: number) => {
      setIndex((prev) => {
        if (total === 0) return 0;
        return (prev + step + total) % total;
      });
    },
    [total],
  );

  // Keep the index valid when the playlist changes under us.
  useEffect(() => {
    if (total > 0 && index >= total) setIndex(0);
  }, [index, total]);

  // When a brand-new image becomes available, show it right away instead of
  // waiting for the current image's timer to run out.
  const seenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (total === 0) return;
    const ids = slides.map((slide) => slide.id);
    const seen = seenIdsRef.current;
    seenIdsRef.current = new Set(ids);
    if (!seen) return; // first playlist we ever received
    if (overrideActive) return; // stay put while an urgent image is on screen
    const newIndex = ids.findIndex((id) => !seen.has(id));
    if (newIndex >= 0) setIndex(newIndex);
  }, [slides, total, overrideActive]);

  // Advance on the current slide's own duration.
  useEffect(() => {
    if (!current || !settings || paused || overrideActive || total < 2) return;
    const ms = durationFor(current, settings);
    timerRef.current = setTimeout(() => go(1), ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, settings, paused, overrideActive, total, go, index]);

  // Preload the next image so a transition never shows a blank frame.
  useEffect(() => {
    if (total < 2) return;
    const next = slides[(index + 1) % total];
    if (!next) return;
    const img = new Image();
    img.src = next.src;
  }, [index, slides, total]);

  useEffect(() => {
    if (!settings?.show_clock) return;
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, [settings?.show_clock]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "arrowright") go(1);
      else if (key === "arrowleft") go(-1);
      else if (key === " ") {
        event.preventDefault();
        setPaused((p) => !p);
      } else if (key === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      } else if (key === "r") {
        window.location.reload();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const fit = settings?.object_fit === "contain" ? "object-contain" : "object-cover";
  const transition = settings?.transition_ms ?? 800;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {slides.map((slide, i) => (
        <img
          key={slide.id}
          src={slide.src}
          alt={slide.title}
          className={`absolute inset-0 h-full w-full ${fit}`}
          style={{
            opacity: i === index ? 1 : 0,
            transition: `opacity ${transition}ms ease-in-out`,
          }}
          draggable={false}
        />
      ))}

      {settings?.show_clock && (
        <div className="absolute right-[3vw] bottom-[3vh] rounded-full bg-black/45 px-[1.6vw] py-[0.8vh] text-[2.2vh] font-display text-white/90 backdrop-blur-sm">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {!isLoading && total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="max-w-3xl text-[3vh] text-white/70">
            No images are scheduled yet. An administrator can add images from the admin portal.
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <p className="text-[3vh] text-white/70">Waiting for the playlist…</p>
        </div>
      )}
    </div>
  );
}
