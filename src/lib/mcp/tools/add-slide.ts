import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { subFromToken, supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_slide",
  title: "Add slide",
  description:
    "Add a slide from a public image URL. Requires an admin account; display-only accounts cannot add slides.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Short label for the slide."),
    imageUrl: z.string().url().describe("Public https URL of the image to show."),
    durationSeconds: z
      .number()
      .int()
      .min(2)
      .max(86400)
      .optional()
      .describe("How long this slide stays on screen. Omit to use the default duration."),
    position: z.number().int().min(0).optional().describe("Order in the slideshow."),
    isActive: z.boolean().optional().describe("Whether the slide shows on screen. Defaults to true."),
    scheduledStart: z
      .string()
      .datetime()
      .optional()
      .describe("ISO timestamp to start showing this slide. Omit to show immediately."),
    scheduledEnd: z
      .string()
      .datetime()
      .optional()
      .describe("ISO timestamp to stop showing this slide. Omit to never expire."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    { title, imageUrl, durationSeconds, position, isActive, scheduledStart, scheduledEnd },
    ctx,
  ) => {
    const supabase = supabaseForUser(ctx);

    let nextPosition = position;
    if (nextPosition === undefined) {
      const { data: last } = await supabase
        .from("slides")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextPosition = (last?.position ?? -1) + 1;
    }

    // Attribute the slide to whoever's token is calling this tool.
    const userId = subFromToken(ctx.getToken());
    let createdByName: string | null = null;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      createdByName = profile?.display_name ?? null;
    }

    const { data, error } = await supabase
      .from("slides")
      .insert({
        title,
        image_url: imageUrl,
        duration_seconds: durationSeconds ?? null,
        position: nextPosition,
        is_active: isActive ?? true,
        created_by: userId,
        created_by_name: createdByName,
        scheduled_start: scheduledStart ?? null,
        scheduled_end: scheduledEnd ?? null,
      })
      .select("id, title, position, is_active")
      .single();

    if (error) throw new ToolError(error.message);

    return {
      content: [{ type: "text", text: `Added slide "${data.title}" at position ${data.position}.` }],
      structuredContent: {
        slide: { id: data.id, title: data.title, position: data.position, isActive: data.is_active },
      },
    };
  },
});
