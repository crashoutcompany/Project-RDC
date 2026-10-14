"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { POWER_EVENT } from "./crt-power";

/** Reveal anyway if the next route never commits. */
const POWER_TIMEOUT_MS = 4000;

/**
 * The app's "monitor": a fixed CRT bezel, glass glare and vignette over every
 * page (scanlines live on body::after). After Press start it holds the screen
 * black through the navigation and then plays a short power-on, so the camera
 * flying into the cabinet hands off to a page that looks like that screen.
 */
export function CrtScreen() {
  return (
    <>
      <div aria-hidden className="crt-bezel">
        <span className="crt-led" />
      </div>
      {/* usePathname needs a Suspense boundary on prerendered dynamic routes. */}
      <Suspense fallback={null}>
        <CrtPower />
      </Suspense>
    </>
  );
}

function CrtPower() {
  const pathname = usePathname();
  const [power, setPower] = useState<"idle" | "off" | "on">("idle");
  const from = useRef(pathname);

  useEffect(() => {
    const off = () => {
      from.current = window.location.pathname;
      setPower("off");
    };
    window.addEventListener(POWER_EVENT, off);
    return () => window.removeEventListener(POWER_EVENT, off);
  }, []);

  useEffect(() => {
    if (power !== "off") return;
    if (pathname !== from.current) return setPower("on");
    const timer = setTimeout(() => setPower("on"), POWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pathname, power]);

  if (power === "idle") return null;
  return (
    <div
      aria-hidden
      className="crt-power"
      data-state={power}
      onAnimationEnd={(e) => {
        if (e.animationName === "crt-power-on" && power === "on")
          setPower("idle");
      }}
    />
  );
}
