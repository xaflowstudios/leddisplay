import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Slideshow } from "@/components/Slideshow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Display Screen — Campus Signage" },
      {
        name: "description",
        content: "The public LED display screen: a full-screen looping image slideshow.",
      },
      { property: "og:title", content: "Display Screen — Campus Signage" },
      {
        property: "og:description",
        content: "The public LED display screen: a full-screen looping image slideshow.",
      },
    ],
  }),
  component: DisplayScreen,
});

function DisplayScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "s") void navigate({ to: "/admin" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <main className="relative h-screen w-screen cursor-none overflow-hidden bg-black">
      <Slideshow />
    </main>
  );
}
