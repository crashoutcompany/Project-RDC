"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { powerCycleScreen } from "../crt-power";
import type { BoardEntry } from "./arcade-scene";
import { useInView, useStageRoot, useStageSupport } from "./use-stage-support";
import { resetWhenHidden, startZoom } from "./zoom";

type SceneComponent = typeof import("./arcade-scene").default;
/** Kept outside components: React Compiler can't compile `import()`. */
const loadScene = () => import("./arcade-scene").then((m) => m.default);

/** Give up on the 3D room (the poster stays) if it isn't drawing by then. */
const LOAD_TIMEOUT_MS = 8000;
/** After an explicit tap, allow longer: these are often slower devices. */
const TAP_LOAD_TIMEOUT_MS = 20000;

/**
 * Upgrades the static poster to the live 3D arcade room. On capable devices
 * three.js is fetched after the page has fully loaded and the browser is idle;
 * on phones and other skipped devices (see useStageSupport) nothing 3D is
 * fetched until the visitor taps "Tap to start". The scene fades in once it
 * has drawn a frame. Slow or failed loads (the scene chunk, the cabinet model
 * or WebGL itself) leave the poster in place with a Retry button.
 */
export function ArcadeHeroScene({ board }: { board: BoardEntry[] }) {
  const { anchor, root } = useStageRoot();
  const inView = useInView(root);
  const support = useStageSupport();
  const mode = support?.mode ?? null;
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    if (mode !== "auto") return;
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
  }, [mode]);

  useEffect(() => {
    if (!armed || status !== "loading") return;
    const timer = setTimeout(
      () => setStatus((s) => (s === "loading" ? "failed" : s)),
      mode === "tap" ? TAP_LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [armed, status, mode]);

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

  // Imported by hand rather than with next/dynamic so Retry really imports
  // again after a failed chunk load. Each attempt remounts the scene.
  const [Scene, setScene] = useState<SceneComponent | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!armed) return;
    let live = true;
    loadScene().then(
      (scene) => {
        if (live) setScene(() => scene);
      },
      () => {
        if (live) setStatus("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [armed, attempt]);
  const retry = () => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const onReady = useCallback(() => setStatus("ready"), []);
  // Unmounting the scene leaves the poster underneath.
  const onError = useCallback(() => setStatus("failed"), []);
  // If the scene dies mid-zoom, bring the hero copy back with the poster.
  useEffect(() => {
    if (status === "failed") root?.removeAttribute("data-zooming");
  }, [status, root]);
  const mounted =
    support !== null &&
    support.mode !== "none" &&
    armed &&
    status !== "failed" &&
    Scene !== null;
  const showTap = mode === "tap" && status !== "failed" && status !== "ready";
  const showRetry = armed && status === "failed";

  return (
    <>
      <span ref={anchor} hidden />
      {showTap ? (
        <button
          type="button"
          data-testid="home-tap-to-start"
          disabled={armed}
          onClick={() => setArmed(true)}
          className="ac-label bg-ac-ink/85 text-ac-gold border-ac-gold hover:bg-ac-gold hover:text-ac-ink absolute top-4 right-4 z-10 cursor-pointer border-2 px-3 py-2 transition-colors disabled:cursor-wait disabled:opacity-80"
        >
          {armed ? (
            "Loading…"
          ) : (
            <>
              <span aria-hidden>▶ </span>Tap to start
            </>
          )}
        </button>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          data-testid="home-retry-3d"
          onClick={retry}
          className="ac-label bg-ac-ink/85 text-ac-gold border-ac-gold hover:bg-ac-gold hover:text-ac-ink absolute top-4 right-4 z-10 cursor-pointer border-2 px-3 py-2 transition-colors"
        >
          <span aria-hidden>↻ </span>Retry 3D
        </button>
      ) : null}
      {mounted ? (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            status === "ready" ? "opacity-100" : "opacity-0",
          )}
        >
          <Scene
            key={attempt}
            board={board}
            animate={!support.reducedMotion}
            powerPreference={support.desktop ? "high-performance" : "low-power"}
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
