"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { powerCycleScreen } from "../crt-power";
import type { BoardEntry } from "./arcade-scene";
import { useInView, useStageRoot, useStageSupport } from "./use-stage-support";
import { resetWhenHidden, startZoom } from "./zoom";

const ArcadeScene = dynamic(() => import("./arcade-scene"), { ssr: false });

/** Give up on the 3D room (the poster stays) if it isn't drawing by then. */
const LOAD_TIMEOUT_MS = 8000;

/**
 * Upgrades the static poster to the live 3D arcade room. three.js is only
 * fetched after the page has fully loaded and the browser is idle, only on
 * capable devices (see useStageSupport), and the scene fades in once it has
 * drawn a frame. Slow or failed loads leave the poster in place.
 */
export function ArcadeHeroScene({ board }: { board: BoardEntry[] }) {
  const { anchor, root } = useStageRoot();
  const inView = useInView(root);
  const supported = useStageSupport();
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const arm = () => {
      const whenIdle =
        window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      whenIdle(() => {
        if (!cancelled) setArmed(true);
      });
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", arm);
    };
  }, [supported]);

  useEffect(() => {
    if (!armed || status !== "loading") return;
    const timer = setTimeout(
      () => setStatus((s) => (s === "loading" ? "failed" : s)),
      LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [armed, status]);

  // Leaving the page (Press start hides it) or scrolling away undoes the
  // zoom fade, so Back always returns to the normal hero.
  useEffect(() => {
    if (!inView) root?.removeAttribute("data-zooming");
  }, [inView, root]);

  // Restored from the back/forward cache: same reset.
  useEffect(() => {
    if (!root) return;
    const clear = () => root.removeAttribute("data-zooming");
    clear();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) clear();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [root]);

  const onReady = useCallback(() => setStatus("ready"), []);
  // Unmounting the scene leaves the poster underneath.
  const onError = useCallback(() => setStatus("failed"), []);
  // If the scene dies mid-zoom, bring the hero copy back with the poster.
  useEffect(() => {
    if (status === "failed") root?.removeAttribute("data-zooming");
  }, [status, root]);
  const mounted = supported && armed && status !== "failed";

  return (
    <>
      <span ref={anchor} hidden />
      {mounted ? (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            status === "ready" ? "opacity-100" : "opacity-0",
          )}
        >
          <ArcadeScene
            board={board}
            animate
            active={inView}
            onReady={onReady}
            interactive={status === "ready"}
            onError={onError}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * Normal link to `href`; when the 3D room is showing it first flies the camera
 * into the cabinet screen (capped by a timeout), then navigates.
 */
export function PressStartLink({
  href,
  ...props
}: React.ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        const stage = e.currentTarget.closest<HTMLElement>("[data-stage-root]");
        // Already flying in: swallow repeat clicks so we navigate only once.
        if (stage?.hasAttribute("data-zooming")) return e.preventDefault();
        const zooming = startZoom(() => {
          powerCycleScreen();
          router.push(href);
          resetWhenHidden(stage);
        });
        if (!zooming) return;
        e.preventDefault();
        // Fade the hero copy while the camera flies in (see page.tsx).
        stage?.setAttribute("data-zooming", "");
      }}
    />
  );
}
