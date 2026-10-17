"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * - `auto`: load the 3D room by itself once the page is idle.
 * - `tap`: show the poster with a "Tap to start" button; three.js, the
 *   cabinet model and the Draco decoder are only fetched after the tap.
 * - `none`: no usable WebGL (or `?stage=off`), poster only.
 */
export type StageMode = "auto" | "tap" | "none";

export type StageSupport = {
  mode: StageMode;
  /** Desktop gets the discrete GPU; everything else asks for low power. */
  desktop: boolean;
  reducedMotion: boolean;
};

export type StageSignals = {
  param: string | null;
  reducedMotion: boolean;
  saveData: boolean;
  effectiveType: string;
  deviceMemory: number | undefined;
  cores: number;
  coarsePointer: boolean;
  viewportWidth: number;
  /** null when WebGL isn't available at all. */
  renderer: string | null;
};

/** Phones: touch-first pointer on a narrow screen. */
export const PHONE_MAX_WIDTH = 768;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

/**
 * Decides how the 3D arcade room may start. It only auto-starts where it's
 * cheap; phones, reduced motion, Data Saver or a slow connection, low-memory
 * or <=4-core devices (boards like a Raspberry Pi) and GPU-less software
 * renderers (SwiftShader, llvmpipe) wait for a tap instead. `?stage=off`
 * forces the poster, `?stage=on` forces auto-start, `?stage=tap` the button.
 */
export function classifyStage(s: StageSignals): StageSupport {
  const phone = s.coarsePointer && s.viewportWidth <= PHONE_MAX_WIDTH;
  const desktop = !s.coarsePointer;
  const base = { desktop, reducedMotion: s.reducedMotion };

  if (s.param === "off") return { ...base, mode: "none" };
  if (s.param === "on") return { ...base, mode: "auto" };
  if (s.param === "tap") return { ...base, mode: "tap" };
  if (s.renderer === null) return { ...base, mode: "none" };

  const skip =
    phone ||
    s.reducedMotion ||
    s.saveData ||
    /(^|-)2g$|^3g$/.test(s.effectiveType) ||
    (s.deviceMemory !== undefined && s.deviceMemory < 4) ||
    s.cores <= 4 ||
    SOFTWARE_RENDERER.test(s.renderer);
  return { ...base, mode: skip ? "tap" : "auto" };
}

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Probes WebGL and returns the unmasked renderer string ("" if the browser
 * hides it), or null without WebGL. `failIfMajorPerformanceCaveat` alone
 * misses some software renderers, so the name is checked too.
 */
function probeRenderer(): string | null {
  try {
    const opts: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    let canvas = document.createElement("canvas");
    let gl =
      canvas.getContext("webgl2", opts) ?? canvas.getContext("webgl", opts);
    // Only a slow (usually software) context exists: flag it as Software.
    const caveat = !gl;
    if (!gl) {
      canvas = document.createElement("canvas");
      gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "",
    );
    // Free the probe context now; browsers cap how many can be alive at once.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return caveat ? `${renderer} (Software)` : renderer;
  } catch {
    return null;
  }
}

let stageSupport: StageSupport | undefined;

function detectStage(): StageSupport {
  if (stageSupport) return stageSupport;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: NetworkInfo;
  };
  stageSupport = classifyStage({
    param: new URLSearchParams(window.location.search).get("stage"),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
    saveData: Boolean(nav.connection?.saveData),
    effectiveType: nav.connection?.effectiveType ?? "",
    deviceMemory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
    renderer: probeRenderer(),
  });
  return stageSupport;
}

const noopSubscribe = () => () => {};
/**
 * How the 3D room may start on this device. Null on the server and during
 * hydration, so both render the poster first.
 */
export function useStageSupport() {
  return useSyncExternalStore<StageSupport | null>(
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
