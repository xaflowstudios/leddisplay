import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

const toSlideJson = (slide: {
  id: string;
  title: string;
  image_url: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  position: number;
  is_active: boolean;
  created_by_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
}) => ({
  id: slide.id,
  title: slide.title,
  imageUrl: slide.image_url,
  storagePath: slide.storage_path,
  durationSeconds: slide.duration_seconds,
  position: slide.position,
  isActive: slide.is_active,
  uploadedBy: slide.created_by_name,
  scheduledStart: slide.scheduled_start,
  scheduledEnd: slide.scheduled_end,
});

export default defineTool({
  name: "list_slides",
  title: "List slides",
  description: "List the signage slides in display order, optionally only the active ones.",
  inputSchema: {
    onlyActive: z.boolean().optional().describe("Return only slides currently shown on screen."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ onlyActive }, ctx) => {
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("slides")
      .select(
        "id, title, image_url, storage_path, duration_seconds, position, is_active, created_by_name, scheduled_start, scheduled_end",
      )
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (onlyActive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const slides = (data ?? []).map(toSlideJson);
    return {
      content: [{ type: "text", text: `${slides.length} slide(s).\n${JSON.stringify(slides, null, 2)}` }],
      structuredContent: { slides },
    };
  },
});
