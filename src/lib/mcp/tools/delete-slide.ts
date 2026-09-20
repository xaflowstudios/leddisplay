import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "delete_slide",
  title: "Delete slide",
  description: "Permanently remove a slide from the slideshow. Requires an admin account.",
  inputSchema: {
    id: z.string().uuid().describe("Slide id from list_slides."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("slides")
      .delete()
      .eq("id", id)
      .select("id, title")
      .maybeSingle();

    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Slide not found, or you do not have permission to delete it");

    return {
      content: [{ type: "text", text: `Deleted slide "${data.title}".` }],
      structuredContent: { deleted: { id: data.id, title: data.title } },
    };
  },
});
