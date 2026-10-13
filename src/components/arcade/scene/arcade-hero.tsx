"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BoardEntry } from "./arcade-scene";
import { useInView, useStageRoot, useStageSupport } from "./use-stage-support";
import { startZoom } from "./zoom";

const ArcadeScene = dynamic(() => import("./arcade-scene"), { ssr: false });

/**
 * The 3D arcade room behind the home hero. Renders nothing until the client
 * confirms a capable GPU, so the server-rendered CSS hero is the fallback.
 */
export function ArcadeHeroScene({ board }: { board: BoardEntry[] }) {
  const { anchor, root } = useStageRoot();
  const inView = useInView(root);
  const { webgl, reducedMotion } = useStageSupport();

  return (
    <>
      <span ref={anchor} hidden />
      {webgl ? (
        <div className="animate-rise-in absolute inset-0">
          <ArcadeScene board={board} animate={!reducedMotion} active={inView} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Normal link to `href`; when the 3D room is showing it first flies the camera
 * into the cabinet screen, then navigates.
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
        if (!startZoom(() => router.push(href))) return;
        e.preventDefault();
        // Fade the hero copy while the camera flies in (see page.tsx).
        e.currentTarget
          .closest("[data-stage-root]")
          ?.setAttribute("data-zooming", "");
      }}
    />
  );
}
