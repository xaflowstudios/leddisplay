import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import type { TablesUpdate } from "@/integrations/supabase/types";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_display_settings",
  title: "Update display settings",
  description: "Change the screen settings. Requires an admin account.",
  inputSchema: {
    defaultDurationSeconds: z.number().int().min(2).max(86400).optional(),
    objectFit: z.enum(["cover", "contain"]).optional().describe("How images fill the screen."),
    transitionMs: z.number().int().min(0).max(10000).optional().describe("Fade length in milliseconds."),
    shuffle: z.boolean().optional(),
    showClock: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    const patch: TablesUpdate<"display_settings"> = {};
    if (args.defaultDurationSeconds !== undefined)
      patch["default_duration_seconds"] = args.defaultDurationSeconds;
    if (args.objectFit !== undefined) patch["object_fit"] = args.objectFit;
    if (args.transitionMs !== undefined) patch["transition_ms"] = args.transitionMs;
    if (args.shuffle !== undefined) patch["shuffle"] = args.shuffle;
    if (args.showClock !== undefined) patch["show_clock"] = args.showClock;

    if (Object.keys(patch).length === 0) throw new ToolError("Nothing to update");

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("display_settings")
      .update(patch)
      .eq("id", 1)
      .select("default_duration_seconds, object_fit, transition_ms, shuffle, show_clock")
      .maybeSingle();

    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Only an admin account can change display settings");

    const settings = {
      defaultDurationSeconds: data.default_duration_seconds,
      objectFit: data.object_fit,
      transitionMs: data.transition_ms,
      shuffle: data.shuffle,
      showClock: data.show_clock,
    };

    return {
      content: [{ type: "text", text: `Settings updated.\n${JSON.stringify(settings, null, 2)}` }],
      structuredContent: { settings },
    };
  },
});
