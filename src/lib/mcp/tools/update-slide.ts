import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import type { TablesUpdate } from "@/integrations/supabase/types";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_slide",
  title: "Update slide",
  description:
    "Change a slide's title, image, duration, order, or on/off state. Requires an admin account.",
  inputSchema: {
    id: z.string().uuid().describe("Slide id from list_slides."),
    title: z.string().trim().min(1).optional(),
    imageUrl: z.string().url().optional().describe("Replacement public https image URL."),
    durationSeconds: z.number().int().min(2).max(86400).nullable().optional(),
    position: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
    scheduledStart: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .describe("ISO timestamp to start showing this slide, or null to clear it."),
    scheduledEnd: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .describe("ISO timestamp to stop showing this slide, or null to clear it."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    { id, title, imageUrl, durationSeconds, position, isActive, scheduledStart, scheduledEnd },
    ctx,
  ) => {
    const patch: TablesUpdate<"slides"> = {};
    if (title !== undefined) patch["title"] = title;
    if (imageUrl !== undefined) {
      patch["image_url"] = imageUrl;
      patch["storage_path"] = null;
    }
    if (durationSeconds !== undefined) patch["duration_seconds"] = durationSeconds;
    if (position !== undefined) patch["position"] = position;
    if (isActive !== undefined) patch["is_active"] = isActive;
    if (scheduledStart !== undefined) patch["scheduled_start"] = scheduledStart;
    if (scheduledEnd !== undefined) patch["scheduled_end"] = scheduledEnd;

    if (Object.keys(patch).length === 0) throw new ToolError("Nothing to update");

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("slides")
      .update(patch)
      .eq("id", id)
      .select("id, title, position, is_active")
      .maybeSingle();

    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Slide not found, or you do not have permission to change it");

    return {
      content: [{ type: "text", text: `Updated slide "${data.title}".` }],
      structuredContent: {
        slide: { id: data.id, title: data.title, position: data.position, isActive: data.is_active },
      },
    };
  },
});
