"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec3 top = vec3(0.13, 0.06, 0.26);
    vec3 mid = vec3(0.42, 0.13, 0.40);
    vec3 low = vec3(0.92, 0.36, 0.30);
    vec3 horizon = vec3(1.0, 0.55, 0.25);
    float y = vUv.y;
    vec3 col = mix(horizon, low, smoothstep(0.0, 0.18, y));
    col = mix(col, mid, smoothstep(0.18, 0.5, y));
    col = mix(col, top, smoothstep(0.5, 1.0, y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Synthwave sun: yellow-to-orange disc with horizontal cut-outs low down. */
const SUN_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float y = vUv.y;
    if (y < 0.45) {
      float band = fract(y * 14.0);
      float gap = mix(0.5, 0.05, y / 0.45);
      if (band < gap) discard;
    }
    vec3 col = mix(vec3(1.0, 0.42, 0.22), vec3(1.0, 0.86, 0.32), smoothstep(0.1, 0.9, y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vec2 grid = vUv * vec2(40.0, 30.0);
    grid.y += uTime * 0.6;
    vec2 g = abs(fract(grid) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
    float fade = smoothstep(0.0, 0.85, vUv.y);
    vec3 base = vec3(0.08, 0.04, 0.12);
    vec3 neon = vec3(1.0, 0.25, 0.75);
    vec3 col = mix(base, neon, line * (1.0 - fade) * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function neonTexture(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.strokeRect(24, 24, 464, 144);
  ctx.font = "italic 700 112px Teko, Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff6fb";
  ctx.fillText(text, 256, 104);
  ctx.shadowBlur = 0;
  ctx.fillText(text, 256, 104);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function NeonSign({
  text,
  color,
  position,
  rotation = 0,
}: {
  text: string;
  color: string;
  position: [number, number, number];
  rotation?: number;
}) {
  const texture = useMemo(() => neonTexture(text, color), [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} rotation={[0, rotation, 0]}>
      <planeGeometry args={[3.2, 1.2]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

function Skyline({ floorY }: { floorY: number }) {
  const { buildings, windows } = useMemo(() => {
    const rand = seeded(7);
    const buildings: { x: number; w: number; h: number; z: number }[] = [];
    for (let x = -34; x < 34; ) {
      const w = 1.6 + rand() * 2.6;
      const tallCenter = Math.abs(x) < 6 ? 0.55 : 1;
      buildings.push({ x: x + w / 2, w, h: (3 + rand() * 7) * tallCenter, z: -24 - rand() * 4 });
      x += w + 0.15;
    }
    const windows: { x: number; y: number; z: number }[] = [];
    for (const b of buildings)
      for (let i = 0; i < 6; i++)
        if (rand() > 0.45)
          windows.push({
            x: b.x + (rand() - 0.5) * (b.w - 0.5),
            y: 0.6 + rand() * (b.h - 1),
            z: b.z + 0.01 + 0.2,
          });
    return { buildings, windows };
  }, []);

  const windowMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = windowMesh.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    windows.forEach((w, i) => {
      m.makeTranslation(w.x, floorY + w.y, w.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [windows, floorY]);

  return (
    <group>
      {buildings.map((b) => (
        <mesh key={b.x} position={[b.x, floorY + b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, 0.4]} />
          <meshBasicMaterial color="#160b22" />
        </mesh>
      ))}
      <instancedMesh ref={windowMesh} args={[undefined, undefined, windows.length]}>
        <planeGeometry args={[0.22, 0.32]} />
        <meshBasicMaterial color="#ffcf6b" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const CROWD = 64;

function Crowd({ floorY, animate }: { floorY: number; animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(() => {
    const rand = seeded(42);
    return Array.from({ length: CROWD }, (_, i) => ({
      x: -17 + (i / CROWD) * 34 + (rand() - 0.5) * 0.4,
      z: -7 - rand() * 2.5,
      s: 0.75 + rand() * 0.45,
      phase: rand() * Math.PI * 2,
    }));
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);

  const place = (t: number) => {
    if (!mesh.current) return;
    people.forEach((p, i) => {
      const bob = animate ? Math.max(0, Math.sin(t * 3 + p.phase)) * 0.18 : 0;
      pos.set(p.x, floorY + 0.55 * p.s + bob, p.z);
      scale.set(0.42 * p.s, 0.75 * p.s, 0.42 * p.s);
      m.compose(pos, q, scale);
      mesh.current!.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => place(0));
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CROWD]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshBasicMaterial color="#1d0f2b" />
    </instancedMesh>
  );
}

/**
 * Dusk city fighting-game stage: gradient sky, striped sun, skyline with lit
 * windows, neon signs, a bobbing crowd silhouette and a scrolling neon grid.
 */
export function DuskStage({
  floorY,
  animate,
}: {
  floorY: number;
  animate: boolean;
}) {
  const floor = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }) => {
    if (animate && floor.current)
      floor.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      <fog attach="fog" args={["#3a1748", 18, 60]} />
      <mesh position={[0, floorY + 18, -46]}>
        <planeGeometry args={[220, 60]} />
        <shaderMaterial
          vertexShader={SKY_VERTEX}
          fragmentShader={SKY_FRAGMENT}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, floorY + 6.5, -44]}>
        <planeGeometry args={[15, 15]} />
        <shaderMaterial
          vertexShader={SKY_VERTEX}
          fragmentShader={SUN_FRAGMENT}
          fog={false}
          transparent
        />
      </mesh>
      <Skyline floorY={floorY} />
      <NeonSign text="RDC" color="#ff3d8b" position={[-9, floorY + 5.2, -23]} rotation={0.12} />
      <NeonSign text="K.O." color="#3da2ff" position={[9.5, floorY + 4.6, -23]} rotation={-0.12} />
      <Crowd floorY={floorY} animate={animate} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, -12]}>
        <planeGeometry args={[80, 40]} />
        <shaderMaterial
          ref={floor}
          vertexShader={SKY_VERTEX}
          fragmentShader={FLOOR_FRAGMENT}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  );
}
