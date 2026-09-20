import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthedContext = {
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
};

async function assertAdmin(context: AuthedContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireRole(value: unknown): "admin" | "display" {
  if (value !== "admin" && value !== "display") throw new Error("Invalid role");
  return value;
}

// Reads accounts through the caller's own session (RLS) instead of the
// service-role admin API, so it also works on deployments where the
// service-role key is not available to the server runtime.
export const listAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const authed = context as unknown as {
      supabase: {
        from: (table: string) => {
          select: (cols: string) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
      userId: string;
    };
    await assertAdmin(context as unknown as AuthedContext);

    const [profilesResult, rolesResult] = await Promise.all([
      authed.supabase.from("profiles").select("id, display_name, email"),
      authed.supabase.from("user_roles").select("user_id, role"),
    ]);

    if (profilesResult.error) {
      console.error("[listAppUsers] profiles query failed", profilesResult.error);
      throw new Error(`Accounts query failed: ${profilesResult.error.message}`);
    }
    if (rolesResult.error) {
      console.error("[listAppUsers] user_roles query failed", rolesResult.error);
      throw new Error(`Roles query failed: ${rolesResult.error.message}`);
    }

    const profiles = (profilesResult.data ?? []) as Array<{
      id: string;
      display_name: string | null;
      email: string | null;
    }>;
    const roles = (rolesResult.data ?? []) as Array<{ user_id: string; role: string }>;

    return profiles.map((profile) => ({
      id: profile.id,
      email: profile.email ?? "",
      displayName: profile.display_name ?? null,
      role: (roles.find((row) => row.user_id === profile.id)?.role ?? null) as
        | "admin"
        | "display"
        | null,
      lastSignInAt: null as string | null,
    }));
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password: string;
      role: "admin" | "display";
      displayName?: string;
    }) => ({
      email: requireString(input?.email, "Email"),
      password: requireString(input?.password, "Password"),
      role: requireRole(input?.role),
      displayName:
        typeof input?.displayName === "string" && input.displayName.trim().length > 0
          ? input.displayName.trim()
          : null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedContext);
    if (data.password.length < 6) throw new Error("Password must be at least 6 characters");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const displayName = data.displayName || data.email.split("@")[0] || data.email;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new Error(error.message);

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (roleError) throw new Error(roleError.message);

    // The handle_new_user trigger already creates a profile row from the
    // metadata above; make sure the chosen name sticks even if that raced.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, display_name: displayName, email: data.email });
    if (profileError) throw new Error(profileError.message);

    return { id: created.user.id };
  });

export const setAppUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "admin" | "display" }) => ({
    userId: requireString(input?.userId, "User"),
    role: requireRole(input?.role),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AuthedContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => ({
    userId: requireString(input?.userId, "User"),
  }))
  .handler(async ({ data, context }) => {
    const authed = context as unknown as AuthedContext;
    await assertAdmin(authed);
    if (data.userId === authed.userId) throw new Error("You cannot remove your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
