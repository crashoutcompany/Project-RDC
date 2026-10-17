"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Home's no-scroll layout keys off `body:has([data-fullscreen-stage])` so it
 * applies on first paint. After a client-side navigation Next keeps Home
 * mounted but hidden, so that selector would still match and lock /members
 * and /games. This marks <html data-stage-released> whenever Home isn't the
 * visible page (effects are cleaned up when it's hidden or unmounted, and the
 * pathname check covers the rest), which switches the lock off.
 */
export function FullscreenStageLock() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (pathname !== "/") {
      root.setAttribute("data-stage-released", "");
      return;
    }
    root.removeAttribute("data-stage-released");
    return () => root.setAttribute("data-stage-released", "");
  }, [pathname]);
  return null;
}
