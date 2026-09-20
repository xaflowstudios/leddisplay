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

  return {
    session,
    user: session?.user ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    isDisplay: roles.includes("display"),
    loading: loadingSession || (Boolean(userId) && rolesQuery.isLoading),
    refreshRoles: () => queryClient.invalidateQueries({ queryKey: ["roles"] }),
  };
}

export async function signOutEverywhere(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
}
