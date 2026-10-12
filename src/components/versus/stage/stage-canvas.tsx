"use client";

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { FighterArt } from "@/lib/fighters";
import { DuskStage } from "./dusk-stage";
import { Fighter, type FighterPose, type FrameColor } from "./fighter";

/**
 * A fighter pinned to a DOM element. The stage reads the element's box every
 * frame and stands the fighter exactly over it, so HP bars and names stay
 * plain, accessible HTML underneath.
 */
export type StageSlot = {
  id: string;
  art: FighterArt;
  el: HTMLElement | null;
  yaw: number;
  forward?: number;
  frame?: FrameColor;
};

type Props = {
  slots: StageSlot[];
  container: HTMLElement | null;
  animate: boolean;
  active: boolean;
  onReady: () => void;
  onError: () => void;
};

const ndc = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Intersects the camera ray through a container pixel with the z=0 plane. */
function toWorld(camera: THREE.Camera, px: number, py: number, w: number, h: number) {
  ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(camera);
  dir.copy(ndc).sub(camera.position).normalize();
  const t = -camera.position.z / dir.z;
  return { x: camera.position.x + dir.x * t, y: camera.position.y + dir.y * t };
}

function measure(slot: StageSlot, container: HTMLElement, camera: THREE.Camera) {
  if (!slot.el) return null;
  const box = container.getBoundingClientRect();
  const r = slot.el.getBoundingClientRect();
  const left = toWorld(camera, r.left - box.left, r.bottom - box.top, box.width, box.height);
  const right = toWorld(camera, r.right - box.left, r.bottom - box.top, box.width, box.height);
  const top = toWorld(camera, r.left - box.left, r.top - box.top, box.width, box.height);
  return {
    x: (left.x + right.x) / 2,
    feetY: left.y,
    width: right.x - left.x,
    height: top.y - left.y,
  };
}

function Fighters({
  slots,
  container,
  animate,
  onFloor,
}: {
  slots: StageSlot[];
  container: HTMLElement | null;
  animate: boolean;
  onFloor: (y: number) => void;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const [poses, setPoses] = useState<Record<string, FighterPose>>({});
  const last = useRef("");

  // Only fires state when the measured layout actually changes (see `last`).
  const update = useCallback(() => {
    if (!container) return;
    const next: Record<string, FighterPose> = {};
    for (const slot of slots) {
      const box = measure(slot, container, camera);
      if (box)
        next[slot.id] = { ...box, yaw: slot.yaw, forward: slot.forward ?? 0 };
    }
    const key = JSON.stringify(next);
    if (key === last.current) return;
    last.current = key;
    setPoses(next);
    const feet = Object.values(next).map((p) => p.feetY);
    if (feet.length) onFloor(Math.min(...feet));
    invalidate();
  }, [container, slots, camera, onFloor, invalidate]);

  // Layout can shift with fonts/images; re-measure cheaply each frame.
  useFrame(update);
  // Also re-measure after every commit, and on resize.
  useEffect(() => {
    update();
  });
  useEffect(() => {
    update();
  }, [size, update]);

  return (
    <>
      {slots.map((slot, i) =>
        poses[slot.id] ? (
          <Fighter
            key={slot.id}
            art={slot.art}
            pose={poses[slot.id]}
            frame={slot.frame ?? "gold"}
            animate={animate}
            phase={i * 0.7}
          />
        ) : null,
      )}
    </>
  );
}

/** Suspends until every fighter's art is loaded, then reports ready. */
function Ready({ slots, onReady }: { slots: StageSlot[]; onReady: () => void }) {
  const portraits = slots.filter((s) => s.art.kind === "portrait").map((s) => s.art.portrait);
  const models = slots.flatMap((s) => (s.art.kind === "model" ? [s.art.model] : []));
  useTexture(portraits.length ? portraits : [PIXEL]);
  useEffect(onReady, [onReady]);
  return models.length ? <PreloadModels urls={models} /> : null;
}

function PreloadModels({ urls }: { urls: string[] }) {
  useGLTF(urls);
  return null;
}

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

class StageBoundary extends Component<
  { onError: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** react-three-fiber stage. Loaded client-only via next/dynamic. */
export default function StageCanvas({
  slots,
  container,
  animate,
  active,
  onReady,
  onError,
}: Props) {
  const [floorY, setFloorY] = useState(0);
  const camera = useMemo(
    () => ({ position: [0, 1.4, 10] as [number, number, number], fov: 32, near: 0.1, far: 120 }),
    [],
  );

  return (
    <StageBoundary onError={onError}>
      <Canvas
        className="!absolute inset-0"
        camera={camera}
        dpr={[1, 1.5]}
        frameloop={!active ? "never" : animate ? "always" : "demand"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(0, 1.1, 0)}
        aria-hidden
      >
        <color attach="background" args={["#1a0d2a"]} />
        <ambientLight intensity={0.55} color="#c9a8ff" />
        <directionalLight position={[6, 6, -6]} intensity={2.2} color="#ff9a4d" />
        <directionalLight position={[-4, 3, 8]} intensity={0.9} color="#7aa2ff" />
        <DuskStage floorY={floorY} animate={animate} />
        <Suspense fallback={null}>
          <Fighters
            slots={slots}
            container={container}
            animate={animate}
            onFloor={setFloorY}
          />
          <Ready slots={slots} onReady={onReady} />
        </Suspense>
      </Canvas>
    </StageBoundary>
  );
}
