import { auth, defineMcp } from "@lovable.dev/mcp-js";

import addSlideTool from "./tools/add-slide";
import deleteSlideTool from "./tools/delete-slide";
import getDisplaySettingsTool from "./tools/get-display-settings";
import listSlidesTool from "./tools/list-slides";
import updateDisplaySettingsTool from "./tools/update-display-settings";
import updateSlideTool from "./tools/update-slide";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "display-manager",
  title: "Display Manager",
  version: "0.1.0",
  instructions:
    "Tools for the campus signage slideshow. Use `list_slides` to see what is on screen, `add_slide` / `update_slide` / `delete_slide` to manage images, and `get_display_settings` / `update_display_settings` for screen behaviour. Writes require an admin account.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listSlidesTool,
    addSlideTool,
    updateSlideTool,
    deleteSlideTool,
    getDisplaySettingsTool,
    updateDisplaySettingsTool,
  ],
});
