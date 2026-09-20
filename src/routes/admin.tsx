import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Image as ImageIcon,
  Link2,
  LogOut,
  MonitorPlay,
  Plus,
  Settings2,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  createAppUser,
  deleteAppUser,
  listAppUsers,
  setAppUserRole,
} from "@/lib/admin.functions";
import {
  fetchDisplayData,
  formatDuration,
  IMAGE_BUCKET,
  resolveSlides,
  scheduleStatus,
  toSeconds,
  type DisplaySettings,
  type ResolvedSlide,
  type ScheduleStatus,
  type TimeUnit,
} from "@/lib/signage";

/** The current user's profile row, used to auto-attribute uploads to them. */
function useMyProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function scheduleLabel(status: ScheduleStatus) {
  if (status === "scheduled") return "Scheduled";
  if (status === "expired") return "Expired";
  return "Active";
}

function scheduleBadgeClass(status: ScheduleStatus) {
  if (status === "scheduled") return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (status === "expired") return "bg-muted text-muted-foreground";
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Converts an ISO timestamp to the value a <input type="datetime-local"> expects, in local time. */
function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a <input type="datetime-local"> value (local time, no timezone) back to an ISO string. */
function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Campus Signage" },
      {
        name: "description",
        content: "Manage the slideshow images, timing and screen settings for your LED displays.",
      },
      { property: "og:title", content: "Admin Portal — Campus Signage" },
      {
        property: "og:description",
        content: "Manage the slideshow images, timing and screen settings for your LED displays.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isAdmin, loading, user, refreshRoles } = useAuth();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  async function claimAdmin() {
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      if (data) {
        toast.success("You are now the administrator.");
        refreshRoles();
      } else {
        toast.error("An administrator already exists. Ask them to give you access.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not claim admin access");
    } finally {
      setClaiming(false);
    }
  }

  if (loading || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="panel w-full max-w-md p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold">Display access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account can watch the display screen but cannot change the settings.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to="/">Open display screen</Link>
            </Button>
            <Button variant="secondary" onClick={claimAdmin} disabled={claiming}>
              I am the first admin
            </Button>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-6 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <MonitorPlay className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">Admin portal</h1>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to="/">
                <MonitorPlay className="size-4" />
                <span className="hidden sm:inline">Display</span>
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={signOut} aria-label="Sign out">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Tabs defaultValue="slides">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="slides">
              <ImageIcon className="size-4" />
              <span className="hidden xs:inline sm:inline">Images</span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 className="size-4" />
              <span className="hidden xs:inline sm:inline">Screen</span>
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="size-4" />
              <span className="hidden xs:inline sm:inline">Users</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="slides" className="mt-6">
            <SlidesTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function useAdminData() {
  return useQuery({
    queryKey: ["display", "admin"],
    queryFn: async () => {
      const { slides, settings } = await fetchDisplayData(false);
      const resolved = await resolveSlides(slides);
      // Keep rows whose image could not be resolved visible, so they can be fixed.
      const withFallback = slides.map(
        (slide) => resolved.find((r) => r.id === slide.id) ?? { ...slide, src: "" },
      );
      return { slides: withFallback as ResolvedSlide[], settings };
    },
  });
}

function SlidesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminData();
  const { user, isPrimaryAdmin } = useAuth();
  const allSlides = data?.slides ?? [];
  const settings = data?.settings;

  // Waiting for approval vs. already in the playlist.
  const pending = allSlides.filter((slide) => !slide.is_approved);
  const playlist = allSlides.filter((slide) => slide.is_approved);

  const [selected, setSelected] = useState<string[]>([]);
  const [pendingSelected, setPendingSelected] = useState<string[]>([]);

  // Drop selections for images that are no longer in their list.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => playlist.some((s) => s.id === id)));
    setPendingSelected((prev) => prev.filter((id) => pending.some((s) => s.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["display"] });

  const updateSlide = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        title?: string;
        duration_seconds?: number | null;
        is_active?: boolean;
        scheduled_start?: string | null;
        scheduled_end?: string | null;
      };
    }) => {
      const { error } = await supabase.from("slides").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  /** Deletes one or many images (and their stored files) in a single go. */
  const removeSlides = useMutation({
    mutationFn: async (targets: ResolvedSlide[]) => {
      const paths = targets.map((s) => s.storage_path).filter((p): p is string => Boolean(p));
      if (paths.length) await supabase.storage.from(IMAGE_BUCKET).remove(paths);
      const { error } = await supabase
        .from("slides")
        .delete()
        .in(
          "id",
          targets.map((s) => s.id),
        );
      if (error) throw error;
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Image removed" : `${count} images removed`);
      setSelected([]);
      setPendingSelected([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Approves one or many pending images at once. */
  const approveSlides = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("slides")
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user?.id ?? null,
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Image approved" : `${count} images approved`);
      setPendingSelected([]);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const move = useMutation({
    mutationFn: async ({ index, direction }: { index: number; direction: -1 | 1 }) => {
      const target = index + direction;
      const a = playlist[index];
      const b = playlist[target];
      if (!a || !b) return;
      const updates = [
        supabase.from("slides").update({ position: b.position }).eq("id", a.id),
        supabase.from("slides").update({ position: a.position }).eq("id", b.id),
      ];
      // Swap positions; if both were equal, renumber the whole list instead.
      if (a.position === b.position) {
        await Promise.all(
          playlist.map((slide, i) =>
            supabase
              .from("slides")
              .update({ position: i === index ? target + 1 : i === target ? index + 1 : i + 1 })
              .eq("id", slide.id),
          ),
        );
        return;
      }
      await Promise.all(updates);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const totalLoop = playlist
    .filter((slide) => slide.is_active)
    .reduce(
      (sum, slide) => sum + (slide.duration_seconds ?? settings?.default_duration_seconds ?? 600),
      0,
    );

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    id: string,
    on: boolean,
  ) => setList(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <div className="space-y-6">
      <AddSlideForm nextPosition={allSlides.length + 1} onAdded={invalidate} />

      {pending.length > 0 && (
        <section className="panel p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold sm:text-lg">Waiting for approval</h2>
              <p className="text-sm text-muted-foreground">
                {pending.length} image{pending.length === 1 ? "" : "s"} not on screen yet
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={pendingSelected.length === pending.length && pending.length > 0}
                onCheckedChange={(checked) =>
                  setPendingSelected(checked ? pending.map((s) => s.id) : [])
                }
                aria-label="Select all pending images"
              />
              <span>Select all</span>
            </label>
            <span className="text-xs text-muted-foreground">
              {pendingSelected.length} selected
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pendingSelected.length === 0 || approveSlides.isPending}
                onClick={() => {
                  if (confirm(`Approve ${pendingSelected.length} selected image(s)?`)) {
                    approveSlides.mutate(pendingSelected);
                  }
                }}
              >
                <Check className="size-4" /> Approve all
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pendingSelected.length === 0 || removeSlides.isPending}
                onClick={() => {
                  if (confirm(`Delete ${pendingSelected.length} selected image(s)?`)) {
                    removeSlides.mutate(
                      pending.filter((s) => pendingSelected.includes(s.id)),
                    );
                  }
                }}
              >
                <Trash2 className="size-4" /> Delete all
              </Button>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {pending.map((slide) => (
              <li
                key={slide.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center"
              >
                <Checkbox
                  checked={pendingSelected.includes(slide.id)}
                  onCheckedChange={(checked) =>
                    toggle(pendingSelected, setPendingSelected, slide.id, Boolean(checked))
                  }
                  aria-label="Select image"
                />
                <div className="h-28 w-full shrink-0 overflow-hidden rounded-lg bg-black sm:h-16 sm:w-28">
                  {slide.src ? (
                    <img src={slide.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      Image unavailable
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm">
                    <UserIcon className="size-3.5 shrink-0" />
                    {slide.created_by_name ?? "Unknown"}
                  </p>
                  {(slide.scheduled_start || slide.scheduled_end) && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {slide.scheduled_start && (
                        <span>From {formatDateTime(slide.scheduled_start)}</span>
                      )}
                      {slide.scheduled_end && (
                        <span>Until {formatDateTime(slide.scheduled_end)}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveSlides.mutate([slide.id])}
                    disabled={approveSlides.isPending}
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    aria-label="Delete image"
                    onClick={() => {
                      if (confirm("Delete this image?")) removeSlides.mutate([slide]);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">Playlist</h2>
            <p className="text-sm text-muted-foreground">
              {playlist.filter((s) => s.is_active).length} active · full loop{" "}
              {formatDuration(totalLoop)}
            </p>
          </div>
        </div>

        {playlist.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={selected.length === playlist.length && playlist.length > 0}
                onCheckedChange={(checked) =>
                  setSelected(checked ? playlist.map((s) => s.id) : [])
                }
                aria-label="Select all images"
              />
              <span>Select all</span>
            </label>
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button
              size="sm"
              variant="destructive"
              className="ml-auto"
              disabled={selected.length === 0 || removeSlides.isPending}
              onClick={() => {
                if (confirm(`Delete ${selected.length} selected image(s)?`)) {
                  removeSlides.mutate(playlist.filter((s) => selected.includes(s.id)));
                }
              }}
            >
              <Trash2 className="size-4" /> Delete all
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading images…</p>
        ) : playlist.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No images yet. Add your first image above.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {playlist.map((slide, index) => (
              <li
                key={slide.id}
                className="rounded-xl border border-border bg-background/40 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Checkbox
                    className="mt-1"
                    checked={selected.includes(slide.id)}
                    onCheckedChange={(checked) =>
                      toggle(selected, setSelected, slide.id, Boolean(checked))
                    }
                    aria-label="Select image"
                  />
                  <div className="h-36 w-full shrink-0 overflow-hidden rounded-lg bg-black sm:h-24 sm:w-40">
                    {slide.src ? (
                      <img src={slide.src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-muted-foreground">
                        Image unavailable
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const status = scheduleStatus(slide);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${scheduleBadgeClass(status)}`}
                          >
                            {scheduleLabel(status)}
                          </span>
                        );
                      })()}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <UserIcon className="size-3.5" />
                        {slide.created_by_name ?? "Unknown"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`duration-${slide.id}`} className="text-xs">
                          Show for (seconds)
                        </Label>
                        <Input
                          id={`duration-${slide.id}`}
                          type="number"
                          min={2}
                          step={0.5}
                          inputMode="decimal"
                          defaultValue={slide.duration_seconds ?? ""}
                          placeholder={`Default (${settings?.default_duration_seconds ?? 600})`}
                          onBlur={(e) => {
                            const value = toSeconds(e.target.value);
                            if (value !== slide.duration_seconds) {
                              updateSlide.mutate({
                                id: slide.id,
                                patch: { duration_seconds: value },
                              });
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`start-${slide.id}`} className="text-xs">
                          Show starting (optional)
                        </Label>
                        <Input
                          id={`start-${slide.id}`}
                          type="datetime-local"
                          defaultValue={toLocalInputValue(slide.scheduled_start)}
                          onBlur={(e) => {
                            const value = fromLocalInputValue(e.target.value);
                            if (value !== slide.scheduled_start) {
                              updateSlide.mutate({
                                id: slide.id,
                                patch: { scheduled_start: value },
                              });
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`end-${slide.id}`} className="text-xs">
                          Stop showing (optional)
                        </Label>
                        <Input
                          id={`end-${slide.id}`}
                          type="datetime-local"
                          defaultValue={toLocalInputValue(slide.scheduled_end)}
                          onBlur={(e) => {
                            const value = fromLocalInputValue(e.target.value);
                            if (value !== slide.scheduled_end) {
                              updateSlide.mutate({
                                id: slide.id,
                                patch: { scheduled_end: value },
                              });
                            }
                          }}
                        />
                      </div>
                    </div>
                    {(slide.scheduled_start || slide.scheduled_end) && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5 shrink-0" />
                        {slide.scheduled_start && (
                          <span>From {formatDateTime(slide.scheduled_start)}</span>
                        )}
                        {slide.scheduled_start && slide.scheduled_end && <span>·</span>}
                        {slide.scheduled_end && (
                          <span>Until {formatDateTime(slide.scheduled_end)}</span>
                        )}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={slide.is_active}
                          onCheckedChange={(checked) =>
                            updateSlide.mutate({ id: slide.id, patch: { is_active: checked } })
                          }
                        />
                        <span className="text-muted-foreground">
                          {slide.is_active ? "On screen" : "Hidden"}
                        </span>
                      </label>

                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => move.mutate({ index, direction: -1 })}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label="Move down"
                          disabled={index === playlist.length - 1}
                          onClick={() => move.mutate({ index, direction: 1 })}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          aria-label="Delete image"
                          onClick={() => {
                            if (confirm("Remove this image from the slideshow?")) {
                              removeSlides.mutate([slide]);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}


function AddSlideForm({
  nextPosition,
  onAdded,
}: {
  nextPosition: number;
  onAdded: () => void;
}) {
  const { user, isPrimaryAdmin } = useAuth();
  const { data: profile } = useMyProfile(user?.id);
  const uploaderName = profile?.display_name ?? user?.email ?? "Unknown";

  const [source, setSource] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const startIso = fromLocalInputValue(scheduledStart);
      const endIso = fromLocalInputValue(scheduledEnd);
      if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
        throw new Error("End time must be after the start time");
      }

      // One or many images: uploading from a folder can select several at once.
      const items: { storagePath: string | null; imageUrl: string | null; title: string }[] = [];

      if (source === "upload") {
        if (files.length === 0) throw new Error("Choose an image file first");
        for (const file of files) {
          const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
          const storagePath = `${crypto.randomUUID()}-${safeName}`;
          const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(storagePath, file, {
            contentType: file.type || "image/jpeg",
          });
          if (error) throw error;
          items.push({ storagePath, imageUrl: null, title: file.name });
        }
      } else {
        if (!url.trim()) throw new Error("Paste an image link first");
        items.push({ storagePath: null, imageUrl: url.trim(), title: url.trim() });
      }

      const { error } = await supabase.from("slides").insert(
        items.map((item, i) => ({
          // Named automatically from the file or link — no title field to fill in.
          title: item.title || "Untitled",
          storage_path: item.storagePath,
          image_url: item.imageUrl,
          duration_seconds: null,
          position: nextPosition + i,
          is_active: true,
          // Only the primary admin's own uploads go live straight away;
          // everyone else (including other admins) waits for approval.
          is_approved: isPrimaryAdmin,
          approved_at: isPrimaryAdmin ? new Date().toISOString() : null,
          approved_by: isPrimaryAdmin ? (user?.id ?? null) : null,
          // Uploader is always the signed-in account — never a free-text field.
          created_by: user?.id ?? null,
          created_by_name: uploaderName,
          scheduled_start: startIso,
          scheduled_end: endIso,
        })),
      );
      if (error) throw error;

      const many = items.length > 1 ? `${items.length} images` : "Image";
      toast.success(
        !isPrimaryAdmin
          ? `${many} sent for approval`
          : startIso
            ? `${many} scheduled for the slideshow`
            : `${many} added to the slideshow`,
      );
      setUrl("");
      setFiles([]);
      setScheduledStart("");
      setScheduledEnd("");
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the image");
    } finally {
      setBusy(false);
    }
  }


  return (
    <section className="panel p-4 sm:p-6">
      <h2 className="text-base font-semibold sm:text-lg">Add an image</h2>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserIcon className="size-3.5" />
        Uploading as <span className="font-medium text-foreground">{uploaderName}</span>
      </p>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={source === "upload" ? "default" : "secondary"}
          onClick={() => setSource("upload")}
        >
          <Upload className="size-4" /> Upload
        </Button>
        <Button
          type="button"
          size="sm"
          variant={source === "url" ? "default" : "secondary"}
          onClick={() => setSource("url")}
        >
          <Link2 className="size-4" /> Link
        </Button>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        {source === "upload" ? (
          <div className="space-y-2">
            <Label htmlFor="file">Image file</Label>
            <Input
              id="file"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-secondary-foreground"
            />
            {files.length > 1 && (
              <p className="text-xs text-muted-foreground">{files.length} images selected</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="url">Image link</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://…/poster.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-border p-3">
          <Label className="flex items-center gap-1.5 text-sm">
            <CalendarClock className="size-4" /> Schedule (optional)
          </Label>
          <p className="text-xs text-muted-foreground">
            Leave blank to show as soon as it's added. Set a start time to hold it until then, or
            an end time to stop showing it automatically.
          </p>
          <div className="grid gap-4 pt-1 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-start" className="text-xs">
                Start showing at
              </Label>
              <Input
                id="new-start"
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-end" className="text-xs">
                Stop showing at
              </Label>
              <Input
                id="new-end"
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          <Plus className="size-4" />
          {busy ? "Adding…" : "Add to slideshow"}
        </Button>
      </form>
    </section>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data } = useAdminData();
  const [form, setForm] = useState<DisplaySettings | null>(null);
  const [durationUnit, setDurationUnit] = useState<TimeUnit>("seconds");
  const [durationInput, setDurationInput] = useState("");

  useEffect(() => {
    if (data?.settings && !form) {
      setForm(data.settings);
      setDurationInput(String(data.settings.default_duration_seconds));
    }
  }, [data?.settings, form]);


  const save = useMutation({
    mutationFn: async (values: DisplaySettings) => {
      const { error } = await supabase
        .from("display_settings")
        .update({
          default_duration_seconds: Math.max(2, values.default_duration_seconds),
          object_fit: values.object_fit,
          transition_ms: Math.max(0, values.transition_ms),
          shuffle: values.shuffle,
          show_clock: values.show_clock,
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Screen settings saved");
      queryClient.invalidateQueries({ queryKey: ["display"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!form) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <section className="panel p-4 sm:p-6">
      <h2 className="text-base font-semibold sm:text-lg">Screen settings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These apply to every display screen showing this slideshow.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="default-duration">Default time per image</Label>
          <div className="flex gap-2">
            <Input
              id="default-duration"
              type="number"
              min={durationUnit === "minutes" ? 0.5 : 2}
              step={durationUnit === "minutes" ? 0.5 : 1}
              inputMode="decimal"
              className="flex-1"
              value={durationInput}
              onChange={(e) => {
                setDurationInput(e.target.value);
                const seconds = toSeconds(e.target.value, durationUnit);
                if (seconds !== null) setForm({ ...form, default_duration_seconds: seconds });
              }}
            />
            <Select
              value={durationUnit}
              onValueChange={(value) => {
                const unit = value as TimeUnit;
                setDurationUnit(unit);
                const next =
                  unit === "minutes"
                    ? String(
                        Math.round((form.default_duration_seconds / 60) * 10) / 10 || 5,
                      )
                    : String(form.default_duration_seconds);
                setDurationInput(next);
                const seconds = toSeconds(next, unit);
                if (seconds !== null) setForm({ ...form, default_duration_seconds: seconds });
              }}
            >
              <SelectTrigger className="w-32" aria-label="Time unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">Seconds</SelectItem>
                <SelectItem value="minutes">Minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {durationUnit === "minutes" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {[5, 10, 15].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={
                    form.default_duration_seconds === preset * 60 ? "default" : "secondary"
                  }
                  onClick={() => {
                    setDurationInput(String(preset));
                    setForm({ ...form, default_duration_seconds: preset * 60 });
                  }}
                >
                  {preset} minutes
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={
                  [5, 10, 15].includes(form.default_duration_seconds / 60)
                    ? "secondary"
                    : "default"
                }
                onClick={() => setDurationInput("")}
              >
                Custom
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {formatDuration(Math.max(2, form.default_duration_seconds || 2))} per image
            {durationUnit === "seconds" && " · 0.5 is read as half a minute (30s)"}
          </p>
        </div>


        <div className="space-y-2">
          <Label htmlFor="fit">How images fit the screen</Label>
          <Select
            value={form.object_fit}
            onValueChange={(value) => setForm({ ...form, object_fit: value })}
          >
            <SelectTrigger id="fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Fill screen (may crop edges)</SelectItem>
              <SelectItem value="contain">Show whole image (black bars)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="transition">Fade length (milliseconds)</Label>
          <Input
            id="transition"
            type="number"
            min={0}
            max={5000}
            inputMode="numeric"
            value={form.transition_ms}
            onChange={(e) => setForm({ ...form, transition_ms: Number(e.target.value) })}
          />
        </div>

        <div className="space-y-4 sm:pt-7">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <span className="min-w-0 text-sm">Shuffle image order</span>
            <Switch
              checked={form.shuffle}
              onCheckedChange={(checked) => setForm({ ...form, shuffle: checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <span className="min-w-0 text-sm">Show clock on screen</span>
            <Switch
              checked={form.show_clock}
              onCheckedChange={(checked) => setForm({ ...form, show_clock: checked })}
            />
          </label>
        </div>
      </div>

      <Button
        className="mt-6 w-full sm:w-auto"
        onClick={() => save.mutate(form)}
        disabled={save.isPending}
      >
        {save.isPending ? "Saving…" : "Save settings"}
      </Button>
    </section>
  );
}

function UsersTab() {
  const queryClient = useQueryClient();
  const listUsers = useServerFn(listAppUsers);
  const createUser = useServerFn(createAppUser);
  const changeRole = useServerFn(setAppUserRole);
  const removeUser = useServerFn(deleteAppUser);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "display">("display");

  const usersQuery = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listUsers(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["app-users"] });

  const create = useMutation({
    mutationFn: () =>
      createUser({ data: { email: email.trim(), password, role, displayName: displayName.trim() } }),
    onSuccess: () => {
      toast.success("Account created");
      setDisplayName("");
      setEmail("");
      setPassword("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRole = useMutation({
    mutationFn: (vars: { userId: string; role: "admin" | "display" }) =>
      changeRole({ data: vars }),
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const destroy = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Account removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section className="panel p-4 sm:p-6">
        <h2 className="text-base font-semibold sm:text-lg">Add an account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin accounts can change everything. Display accounts only see the slideshow.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="text"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "admin" | "display")}>
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="display">Display</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={create.isPending}
            className="w-full sm:col-span-2 sm:w-auto lg:col-span-4"
          >
            <Plus className="size-4" />
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>
      </section>

      <section className="panel p-4 sm:p-6">
        <h2 className="text-base font-semibold sm:text-lg">Accounts</h2>
        {usersQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading accounts…</p>
        ) : usersQuery.error ? (
          <p className="mt-4 text-sm text-destructive">Could not load accounts.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(usersQuery.data ?? []).map((account) => (
              <li
                key={account.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {account.displayName ?? account.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.role ? `Role: ${account.role}` : "No role yet"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={account.role ?? "display"}
                    onValueChange={(value) =>
                      updateRole.mutate({
                        userId: account.id,
                        role: value as "admin" | "display",
                      })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="display">Display</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="destructive"
                    aria-label="Delete account"
                    onClick={() => {
                      if (confirm(`Remove ${account.email}?`)) destroy.mutate(account.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
