"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

let stageSupport: boolean | undefined;

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Only load the 3D arcade room where it's cheap. Skipped (the poster stays) on:
 * reduced motion, Data Saver or a slow connection, low-memory or <=4-core
 * devices (most low-end phones and boards like a Raspberry Pi), and software
 * WebGL (`failIfMajorPerformanceCaveat`). `?stage=off` forces the poster,
 * `?stage=on` forces 3D for testing.
 */
function detectStage() {
  if (stageSupport !== undefined) return stageSupport;
  const param = new URLSearchParams(window.location.search).get("stage");
  if (param === "off") return (stageSupport = false);
  if (param === "on") return (stageSupport = true);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return (stageSupport = false);
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: NetworkInfo;
  };
  if (
    nav.connection?.saveData ||
    /(^|-)2g$|^3g$/.test(nav.connection?.effectiveType ?? "")
  )
    return (stageSupport = false);
  if (
    (nav.deviceMemory !== undefined && nav.deviceMemory < 4) ||
    nav.hardwareConcurrency <= 4
  )
    return (stageSupport = false);
  try {
    const canvas = document.createElement("canvas");
    const opts: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl =
      canvas.getContext("webgl2", opts) ?? canvas.getContext("webgl", opts);
    stageSupport = Boolean(gl);
    // Free the probe context now; browsers cap how many can be alive at once.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    stageSupport = false;
  }
  return stageSupport;
}

const noopSubscribe = () => () => {};
/**
 * True once the client confirms the 3D room should load. Null on the server
 * and during hydration, so both render the poster first.
 */
export function useStageSupport() {
  return useSyncExternalStore<boolean | null>(
    noopSubscribe,
    detectStage,
    () => null,
  );
}

/** True while `el` is on screen, so offscreen stages stop rendering. */
export function useInView(el: HTMLElement | null) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return inView;
}

/**
 * The scene fills the nearest `[data-stage-root]` ancestor of the element given
 * `anchor`, so the hero title can be static server markup.
 */
export function useStageRoot() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const anchor = useCallback((el: HTMLElement | null) => {
    setRoot(el?.closest<HTMLElement>("[data-stage-root]") ?? null);
  }, []);
  return { anchor, root };
}
