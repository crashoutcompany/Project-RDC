"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { FighterArt } from "@/lib/fighters";

/** Where a fighter stands and how it should be posed, in world units. */
export type FighterPose = {
  x: number;
  feetY: number;
  height: number;
  width: number;
  /** Target yaw in radians. 0 faces the camera, + turns toward screen right. */
  yaw: number;
  /** Step toward the camera, e.g. for the hovered fighter. */
  forward: number;
};

const FRAME_COLORS = {
  gold: "#ffc21a",
  red: "#d7192f",
  blue: "#1b4fe0",
} as const;
export type FrameColor = keyof typeof FRAME_COLORS;

/** Skewed frame matching the CSS clip-path polygon(10% 0,100% 0,90% 100%,0 100%). */
function skewShape(inset = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5 + inset, inset);
  shape.lineTo(0.4 - inset, inset);
  shape.lineTo(0.5 - inset, 1 - inset);
  shape.lineTo(-0.4 + inset, 1 - inset);
  shape.closePath();
  return shape;
}

function photoGeometry() {
  const geometry = new THREE.ShapeGeometry(skewShape(0.035));
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i));
  uv.needsUpdate = true;
  return geometry;
}

/** Wraps a fighter body with the idle bob and damped turn-to-face. */
function PoseGroup({
  pose,
  animate,
  phase,
  children,
}: {
  pose: FighterPose;
  animate: boolean;
  phase: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const motion = useRef({ yaw: animate ? Math.PI : pose.yaw, forward: pose.forward });

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const m = motion.current;
    const dt = Math.min(delta, 0.1);
    m.yaw = animate ? THREE.MathUtils.damp(m.yaw, pose.yaw, 4, dt) : pose.yaw;
    m.forward = animate
      ? THREE.MathUtils.damp(m.forward, pose.forward, 6, dt)
      : pose.forward;
    const t = clock.elapsedTime + phase;
    const bob = animate ? Math.sin(t * 2.2) * pose.height * 0.012 : 0;
    g.position.set(pose.x, pose.feetY + bob, m.forward);
    g.rotation.set(0, m.yaw + (animate ? Math.sin(t * 0.9) * 0.04 : 0), 0);
  });

  return (
    <group ref={group}>
      <GroundShadow width={pose.width} />
      {children}
    </group>
  );
}

function GroundShadow({ width }: { width: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[width * 1.3, width * 0.5, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** A member's photo as a thick, skewed standee that turns in 3D. */
export function PortraitFighter({
  src,
  pose,
  frame,
  animate,
  phase,
}: {
  src: string;
  pose: FighterPose;
  frame: FrameColor;
  animate: boolean;
  phase: number;
}) {
  const base = useTexture(src);
  const aspect = pose.width / pose.height;

  const texture = useMemo(() => {
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    const image = base.image as { width: number; height: number } | undefined;
    const imageAspect = image ? image.width / image.height : 1;
    // object-fit: cover
    if (imageAspect > aspect) {
      t.repeat.set(aspect / imageAspect, 1);
      t.offset.set((1 - t.repeat.x) / 2, 0);
    } else {
      t.repeat.set(1, imageAspect / aspect);
      t.offset.set(0, (1 - t.repeat.y) / 2);
    }
    t.needsUpdate = true;
    return t;
  }, [base, aspect]);
  useEffect(() => () => texture.dispose(), [texture]);

  const photo = useMemo(() => photoGeometry(), []);
  const slab = useMemo(
    () => new THREE.ExtrudeGeometry(skewShape(), { depth: 0.08, bevelEnabled: false }),
    [],
  );
  useEffect(
    () => () => {
      photo.dispose();
      slab.dispose();
    },
    [photo, slab],
  );

  return (
    <PoseGroup pose={pose} animate={animate} phase={phase}>
      <group scale={[pose.width, pose.height, pose.width]}>
        <mesh geometry={slab} position={[0, 0, -0.08]}>
          <meshStandardMaterial color={FRAME_COLORS[frame]} roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh geometry={photo} position={[0, 0, 0.002]}>
          <meshStandardMaterial
            map={texture}
            emissiveMap={texture}
            emissive="#ffffff"
            emissiveIntensity={0.55}
            roughness={0.85}
          />
        </mesh>
      </group>
    </PoseGroup>
  );
}

/** A rigged glTF fighter playing its idle clip. Scaled to the slot height. */
export function ModelFighter({
  src,
  idleClip,
  scale: scaleOverride,
  pose,
  animate,
  phase,
}: {
  src: string;
  idleClip?: string;
  scale?: number;
  pose: FighterPose;
  animate: boolean;
  phase: number;
}) {
  const { scene, animations } = useGLTF(src);
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const { actions, names } = useAnimations(animations, model);

  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1;
    return scaleOverride ?? pose.height / height;
  }, [model, pose.height, scaleOverride]);

  useEffect(() => {
    const action = actions[idleClip ?? names[0]];
    if (!action) return;
    action.reset().fadeIn(0.3).play().setEffectiveTimeScale(animate ? 1 : 0);
    return () => {
      action.fadeOut(0.3);
    };
  }, [actions, names, idleClip, animate]);

  return (
    <PoseGroup pose={pose} animate={animate} phase={phase}>
      <primitive object={model} scale={fit} />
    </PoseGroup>
  );
}

export function Fighter({
  art,
  ...props
}: {
  art: FighterArt;
  pose: FighterPose;
  frame: FrameColor;
  animate: boolean;
  phase: number;
}) {
  if (art.kind === "model")
    return (
      <ModelFighter
        src={art.model}
        idleClip={art.idleClip}
        scale={art.scale}
        pose={props.pose}
        animate={props.animate}
        phase={props.phase}
      />
    );
  return <PortraitFighter src={art.portrait} {...props} />;
}
