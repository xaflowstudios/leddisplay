import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "display";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadingSession(false);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const rolesQuery = useQuery({
    queryKey: ["roles", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((row) => row.role as AppRole);
    },
  });

  const roles = rolesQuery.data ?? [];
  const isAdmin = roles.includes("admin");

  // The primary admin is the first admin account; only they approve images.
  const primaryAdminQuery = useQuery({
    queryKey: ["primary-admin", userId],
    enabled: Boolean(userId) && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_primary_admin", { _user_id: userId! });
      if (error) throw error;
      return Boolean(data);
    },
  });

  return {
    session,
    user: session?.user ?? null,
    roles,
    isAdmin,
    isPrimaryAdmin: isAdmin && primaryAdminQuery.data === true,
    isDisplay: roles.includes("display"),
    loading: loadingSession || (Boolean(userId) && rolesQuery.isLoading),
    refreshRoles: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      void queryClient.invalidateQueries({ queryKey: ["primary-admin"] });
    },
  };
}

export async function signOutEverywhere(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
}
