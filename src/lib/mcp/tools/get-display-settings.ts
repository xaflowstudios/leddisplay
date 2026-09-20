import { defineTool, ToolError } from "@lovable.dev/mcp-js";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_display_settings",
  title: "Get display settings",
  description: "Read the screen settings: default slide duration, image fit, fade, shuffle, clock.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("display_settings")
      .select("default_duration_seconds, object_fit, transition_ms, shuffle, show_clock")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Display settings not found");

    const settings = {
      defaultDurationSeconds: data.default_duration_seconds,
      objectFit: data.object_fit,
      transitionMs: data.transition_ms,
      shuffle: data.shuffle,
      showClock: data.show_clock,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(settings, null, 2) }],
      structuredContent: { settings },
    };
  },
});
