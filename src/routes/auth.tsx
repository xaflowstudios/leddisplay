import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Campus Signage" },
      { name: "description", content: "Sign in to manage the campus signage slideshow." },
      { property: "og:title", content: "Sign in — Campus Signage" },
      {
        property: "og:description",
        content: "Sign in to manage the campus signage slideshow.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isAdmin, loading } = useAuth();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (next) {
      window.location.replace(next);
      return;
    }
    void navigate({ to: isAdmin ? "/admin" : "/", replace: true });
  }, [session, isAdmin, loading, navigate, next]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Lets the primary admin know a non-admin account just signed in and
        // would like admin access. The function ignores admins and repeats.
        await supabase.rpc("request_admin_access");
        await queryClient.invalidateQueries();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + (next || "/admin"),
            data: { display_name: fullName.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <MonitorPlay className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">Campus Signage</h1>
            <p className="text-sm text-muted-foreground">Staff sign in</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="cursor-pointer text-left underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create the first admin account" : "I already have an account"}
          </button>
          <button
            type="button"
            className="cursor-pointer text-left underline-offset-4 hover:text-foreground hover:underline sm:text-right"
            onClick={() => void navigate({ to: "/" })}
          >
            Go to display screen
          </button>
        </div>
      </div>
    </main>
  );
}
