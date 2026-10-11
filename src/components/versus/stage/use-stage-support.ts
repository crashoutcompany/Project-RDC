"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

let webglSupport: boolean | undefined;

/**
 * Only use the 3D stage on a real GPU. `failIfMajorPerformanceCaveat` rejects
 * software rendering, and low-memory devices (e.g. a Raspberry Pi) keep the
 * flat portraits so the page stays responsive. `?stage=off` forces the
 * fallback, `?stage=on` forces 3D.
 */
function detectStage() {
  if (webglSupport !== undefined) return webglSupport;
  const param = new URLSearchParams(window.location.search).get("stage");
  if (param === "off") return (webglSupport = false);
  if (param === "on") return (webglSupport = true);

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if ((memory !== undefined && memory < 4) || navigator.hardwareConcurrency <= 4)
    return (webglSupport = false);
  try {
    const canvas = document.createElement("canvas");
    const opts = { failIfMajorPerformanceCaveat: true };
    webglSupport = Boolean(
      canvas.getContext("webgl2", opts) ?? canvas.getContext("webgl", opts),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const noopSubscribe = () => () => {};
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const mql = window.matchMedia(REDUCED_MOTION);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};

/**
 * `webgl` is null on the server and during hydration, so both render the
 * flat-portrait fallback first.
 */
export function useStageSupport() {
  const webgl = useSyncExternalStore<boolean | null>(noopSubscribe, detectStage, () => null);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  return { webgl, reducedMotion };
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
 * The stage canvas fills the nearest `[data-stage-root]` ancestor of the
 * element given `anchor`, so the hero title can be static server markup.
 */
export function useStageRoot() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const anchor = useCallback((el: HTMLElement | null) => {
    setRoot(el?.closest<HTMLElement>("[data-stage-root]") ?? null);
  }, []);
  return { anchor, root };
}

/** Stable callback refs that collect `count` slot elements into state. */
export function useSlotRefs(
  count: number,
  setEls: React.Dispatch<React.SetStateAction<(HTMLElement | null)[]>>,
) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => (el: HTMLElement | null) =>
        setEls((prev) => {
          if (prev[i] === el) return prev;
          const next = [...prev];
          next[i] = el;
          return next;
        }),
      ),
    [count, setEls],
  );
}
