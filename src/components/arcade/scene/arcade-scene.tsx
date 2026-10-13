"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { setResetHandler, setZoomHandler } from "./zoom";

export type BoardEntry = { player: string; wins: number };

type Props = {
  board: BoardEntry[];
  animate: boolean;
  active: boolean;
  /** Called after the first frame is drawn, so the poster can fade out. */
  onReady: () => void;
  /** Only take over Press start once the scene is visible. */
  interactive: boolean;
};

/** Longest the Press start fly-in may take before we navigate anyway. */
const ZOOM_TIMEOUT_MS = 1600;

/** Internal render scale; the canvas is upscaled with nearest-neighbour for chunky pixels. */
const PIXEL_RATIO = 0.55;

/** Cabinet side profile in (depth, height), front at +depth. */
const PROFILE: [number, number][] = [
  [-0.45, 0],
  [0.36, 0],
  [0.36, 0.86],
  [0.47, 0.9],
  [0.3, 1.03],
  [0.22, 1.05],
  [0.06, 1.62],
  [0.15, 1.66],
  [0.15, 1.88],
  [-0.45, 1.88],
];
const WIDTH = 0.84;
/** Screen quad between (0.22, 1.05) and (0.06, 1.62) on the profile. */
const SCREEN = {
  center: new THREE.Vector3(0, (1.05 + 1.62) / 2, (0.22 + 0.06) / 2),
  tilt: -Math.atan2(0.22 - 0.06, 1.62 - 1.05),
  height: Math.hypot(0.22 - 0.06, 1.62 - 1.05),
  width: 0.66,
};
const CABINET_POS = new THREE.Vector3(1.05, 0, -0.35);
const CABINET_YAW = 0.22;

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

function useDisposable<T extends { dispose: () => void }>(make: () => T) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => make(), []);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Dusk city seen through the window. */
function WindowView() {
  const texture = useDisposable(() =>
    canvasTexture(96, 64, (ctx) => {
      const sky = ctx.createLinearGradient(0, 0, 0, 64);
      sky.addColorStop(0, "#3a1747");
      sky.addColorStop(0.45, "#b0335a");
      sky.addColorStop(0.75, "#ff8a3d");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = "#ffd25a";
      ctx.beginPath();
      ctx.arc(68, 44, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1030";
      const skyline = [8, 14, 10, 20, 12, 18, 9, 16, 22, 11, 15, 19, 10];
      skyline.forEach((h, i) => ctx.fillRect(i * 8, 64 - h - 6, 7, h + 6));
      ctx.fillStyle = "#ffcf6b";
      for (let i = 0; i < 30; i++)
        ctx.fillRect((i * 37) % 96, 64 - ((i * 13) % 16) - 4, 1, 1);
    }),
  );
  return (
    <group position={[0.35, 2.15, -2.18]}>
      <mesh>
        <planeGeometry args={[2, 1.35]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-1.02, 1.02].map((x) => (
        <mesh key={x} position={[x, 0, 0.04]}>
          <boxGeometry args={[0.08, 1.5, 0.1]} />
          <meshStandardMaterial color="#1a0d12" />
        </mesh>
      ))}
      {[-0.7, 0.7, 0].map((y) => (
        <mesh key={y} position={[0, y, 0.04]}>
          <boxGeometry args={[2.1, y === 0 ? 0.05 : 0.08, 0.1]} />
          <meshStandardMaterial color="#1a0d12" />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.05, 1.35, 0.08]} />
        <meshStandardMaterial color="#1a0d12" />
      </mesh>
      <mesh position={[0, -0.78, 0.15]}>
        <boxGeometry args={[2.3, 0.06, 0.32]} />
        <meshStandardMaterial color="#2b1519" />
      </mesh>
    </group>
  );
}

function Room() {
  const planks = useDisposable(() => {
    const t = canvasTexture(32, 32, (ctx) => {
      ctx.fillStyle = "#3a1d17";
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = "#2c1511";
      for (let y = 0; y < 32; y += 8) ctx.fillRect(0, y, 32, 1);
      ctx.fillRect(12, 0, 1, 8);
      ctx.fillRect(26, 8, 1, 8);
      ctx.fillRect(6, 16, 1, 8);
      ctx.fillRect(20, 24, 1, 8);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 8);
    return t;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial map={planks} roughness={0.9} />
      </mesh>
      <mesh position={[0, 3, -2.25]}>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#2a1620" roughness={1} />
      </mesh>
      <mesh position={[-3.2, 3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10, 6]} />
        <meshStandardMaterial color="#24121b" roughness={1} />
      </mesh>
      {/* bench and a shelf for silhouettes */}
      <mesh position={[-1.9, 0.25, -1.6]}>
        <boxGeometry args={[1.4, 0.5, 0.5]} />
        <meshStandardMaterial color="#1f0f15" />
      </mesh>
      <mesh position={[2.6, 1.2, -2.05]}>
        <boxGeometry args={[1.2, 0.06, 0.3]} />
        <meshStandardMaterial color="#2b1519" />
      </mesh>
      <WindowView />
    </group>
  );
}

/** Pixel fire in a little hearth, with a flickering warm light. */
function Fire({ animate }: { animate: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const flames = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    if (light.current) light.current.intensity = 7 * flicker;
    if (flames.current) flames.current.scale.y = flicker;
  });
  return (
    <group position={[2.45, 0, -1.55]} rotation={[0, -0.55, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1, 0.9, 0.45]} />
        <meshStandardMaterial color="#160b0d" />
      </mesh>
      <group ref={flames} position={[0, 0.12, 0.2]}>
        {(
          [
            [-0.18, 0.18, 0.12, "#ff2d55"],
            [0, 0.3, 0.16, "#ff7a2d"],
            [0.17, 0.22, 0.12, "#ff2d55"],
            [0.04, 0.16, 0.08, "#ffd400"],
          ] as const
        ).map(([x, h, w, color], i) => (
          <mesh key={i} position={[x, h / 2, 0.01 * i]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <pointLight
        ref={light}
        position={[0, 0.4, 0.6]}
        color="#ff7a2d"
        intensity={7}
        distance={6}
        decay={1.6}
      />
    </group>
  );
}

const DUST = 90;

function Dust({ animate }: { animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useDisposable(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(DUST * 3);
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < DUST; i++) {
      pos[i * 3] = -3 + rand() * 6;
      pos[i * 3 + 1] = rand() * 3;
      pos[i * 3 + 2] = -2 + rand() * 4;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  });
  useFrame((_, delta) => {
    if (!animate || !points.current) return;
    const attr = points.current.geometry.attributes.position;
    for (let i = 0; i < DUST; i++) {
      let y = attr.getY(i) + delta * 0.05;
      if (y > 3) y = 0;
      attr.setY(i, y);
      attr.setX(i, attr.getX(i) + Math.sin(y * 3 + i) * delta * 0.02);
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color="#ffd9a8" size={0.025} transparent opacity={0.6} />
    </points>
  );
}

function drawMarquee(ctx: CanvasRenderingContext2D) {
  // next/font registers a generated family name; read it from the CSS var.
  const family =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-press-start")
      .trim() || "monospace";
  ctx.fillStyle = "#16081f";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#ff4fd8";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 52);
  ctx.font = `20px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff2d55";
  ctx.fillText("RDC STATS", 130, 35);
  ctx.fillStyle = "#ffd400";
  ctx.fillText("RDC STATS", 128, 33);
}

function Marquee() {
  const texture = useDisposable(() => canvasTexture(256, 64, drawMarquee));
  const invalidate = useThree((s) => s.invalidate);
  // Redraw once the pixel font has loaded.
  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      const canvas = texture.image as HTMLCanvasElement;
      drawMarquee(canvas.getContext("2d")!);
      texture.needsUpdate = true;
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [texture, invalidate]);
  return (
    <mesh position={[0, 1.77, 0.151]}>
      <planeGeometry args={[WIDTH - 0.08, 0.2]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

const SCREEN_PX = [330, 296] as const;

/** Draws the attract screen: title, MK8 top five and a blinking Press start. */
function drawAttract(
  ctx: CanvasRenderingContext2D,
  board: BoardEntry[],
  blinkOn: boolean,
) {
  const [w, h] = SCREEN_PX;
  const family =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-press-start")
      .trim() || "monospace";
  ctx.fillStyle = "#07061a";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `7px ${family}`;
  ctx.fillStyle = "#a9a4d6";
  if (board.length) ctx.fillText("MARIO KART 8 · TOP FIVE", w / 2, 20);
  ctx.font = `20px ${family}`;
  ctx.fillStyle = "#ff2d55";
  ctx.fillText("RDC STATS", w / 2 + 2, 50);
  ctx.fillStyle = "#ffd400";
  ctx.fillText("RDC STATS", w / 2, 48);

  ctx.font = `10px ${family}`;
  if (!board.length) {
    // No stats yet: a plain attract screen rather than a table of ???.
    ctx.fillStyle = "#39ff88";
    ctx.fillText("WHO'S THE", w / 2, 120);
    ctx.fillText("BEST GAMER?", w / 2, 142);
    ctx.fillStyle = "#a9a4d6";
    ctx.font = `8px ${family}`;
    ctx.fillText("INSERT COIN", w / 2, 186);
  }
  board.slice(0, 5).forEach((row, i) => {
    const y = 88 + i * 30;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd400";
    ctx.fillText(String(i + 1), 34, y);
    ctx.fillStyle = "#f2efff";
    ctx.fillText(row.player.toUpperCase().slice(0, 10), 60, y);
    ctx.textAlign = "right";
    ctx.fillText(String(row.wins), w - 34, y);
    ctx.fillStyle = "#2a2766";
    for (let x = 34; x < w - 34; x += 6) ctx.fillRect(x, y + 11, 3, 1);
  });

  ctx.textAlign = "center";
  if (blinkOn) {
    ctx.font = `12px ${family}`;
    ctx.fillStyle = "#ff2d55";
    ctx.fillText("PRESS START", w / 2, h - 42);
  }
  ctx.font = `7px ${family}`;
  ctx.fillStyle = "#a9a4d6";
  ctx.fillText("CREDIT 00", w / 2, h - 18);

  // scanlines
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function CrtScreen({
  board,
  animate,
}: {
  board: BoardEntry[];
  animate: boolean;
}) {
  const texture = useDisposable(() =>
    canvasTexture(SCREEN_PX[0], SCREEN_PX[1], (ctx) =>
      drawAttract(ctx, board, true),
    ),
  );
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d")!;
    let on = true;
    const redraw = () => {
      drawAttract(ctx, board, on);
      texture.needsUpdate = true;
      invalidate();
    };
    void document.fonts.ready.then(redraw);
    if (!animate) return;
    const timer = setInterval(() => {
      on = !on;
      redraw();
    }, 600);
    return () => clearInterval(timer);
  }, [texture, board, animate, invalidate]);

  return (
    <mesh position={[0, 0, 0.004]}>
      <planeGeometry args={[SCREEN.width, SCREEN.height - 0.01]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function Cabinet({
  board,
  animate,
}: {
  board: BoardEntry[];
  animate: boolean;
}) {
  const body = useDisposable(() => {
    const shape = new THREE.Shape(
      PROFILE.map(([z, y]) => new THREE.Vector2(z, y)),
    );
    return new THREE.ExtrudeGeometry(shape, {
      depth: WIDTH,
      bevelEnabled: false,
    });
  });
  const side = useDisposable(() => {
    const shape = new THREE.Shape(
      PROFILE.map(([z, y]) => new THREE.Vector2(z, y)),
    );
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.01,
      bevelSegments: 1,
    });
  });

  return (
    <group position={CABINET_POS} rotation={[0, CABINET_YAW, 0]}>
      {/* the extruded profile runs along local X, so turn it to face +Z */}
      <mesh
        geometry={body}
        rotation={[0, -Math.PI / 2, 0]}
        position={[WIDTH / 2, 0, 0]}
      >
        <meshStandardMaterial color="#2b1738" roughness={0.75} />
      </mesh>
      {[WIDTH / 2 + 0.03, -WIDTH / 2].map((x) => (
        <mesh
          key={x}
          geometry={side}
          rotation={[0, -Math.PI / 2, 0]}
          position={[x, 0, 0]}
        >
          <meshStandardMaterial
            color="#45245a"
            roughness={0.6}
            emissive="#ff4fd8"
            emissiveIntensity={0.06}
          />
        </mesh>
      ))}
      <Marquee />
      {/* screen bezel + glass */}
      <group position={SCREEN.center} rotation={[SCREEN.tilt, 0, 0]}>
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={[WIDTH - 0.04, SCREEN.height + 0.04]} />
          <meshStandardMaterial color="#0b0610" roughness={0.4} />
        </mesh>
        <CrtScreen board={board} animate={animate} />
        <pointLight
          position={[0, 0, 0.35]}
          color="#6a7cff"
          intensity={1.6}
          distance={2}
        />
      </group>
      {/* control panel */}
      <group
        position={[0, 0.965, 0.385]}
        rotation={[Math.atan2(0.13, 0.17), 0, 0]}
      >
        <mesh>
          <boxGeometry args={[WIDTH + 0.02, 0.025, 0.2]} />
          <meshStandardMaterial color="#1d1230" />
        </mesh>
        {[-0.27, 0.13].map((x) => (
          <group key={x} position={[x, 0.012, 0]}>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.08]} />
              <meshStandardMaterial color="#c9c6e8" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.085, 0]}>
              <sphereGeometry args={[0.024, 12, 8]} />
              <meshStandardMaterial color="#ff2d55" roughness={0.3} />
            </mesh>
          </group>
        ))}
        {(
          [
            [-0.17, "#2d9cff"],
            [-0.12, "#ffd400"],
            [-0.07, "#39ff88"],
            [0.23, "#ff4fd8"],
            [0.28, "#2d9cff"],
            [0.33, "#ffd400"],
          ] as const
        ).map(([x, color]) => (
          <mesh key={x} position={[x, 0.016, 0.02]}>
            <cylinderGeometry args={[0.016, 0.016, 0.012, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.35}
            />
          </mesh>
        ))}
      </group>
      {/* coin door */}
      <group position={[0, 0.45, 0.362]}>
        <mesh>
          <boxGeometry args={[0.3, 0.32, 0.01]} />
          <meshStandardMaterial
            color="#120a18"
            metalness={0.4}
            roughness={0.5}
          />
        </mesh>
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.007]}>
            <planeGeometry args={[0.025, 0.06]} />
            <meshBasicMaterial color="#ff2d55" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const screenWorld = () => {
  const cabinet = new THREE.Object3D();
  cabinet.position.copy(CABINET_POS);
  cabinet.rotation.y = CABINET_YAW;
  const screen = new THREE.Object3D();
  screen.position.copy(SCREEN.center);
  screen.rotation.x = SCREEN.tilt;
  cabinet.add(screen);
  cabinet.updateMatrixWorld(true);
  const center = screen.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
    screen.getWorldQuaternion(new THREE.Quaternion()),
  );
  return { center, normal };
};

/** Frames the room, sways gently, and flies into the screen on Press start. */
function CameraRig({
  animate,
  active,
  interactive,
}: {
  animate: boolean;
  active: boolean;
  interactive: boolean;
}) {
  const get = useThree((s) => s.get);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const zoom = useRef<{
    done: () => void;
    fired: boolean;
    start: number;
  } | null>(null);
  const look = useRef(new THREE.Vector3());
  const { center, normal } = useMemo(() => screenWorld(), []);

  const home = useMemo(() => {
    // Portrait screens: step back and centre the cabinet under the text.
    if (aspect < 1)
      return {
        pos: new THREE.Vector3(0.7, 1.55, 4.4),
        target: new THREE.Vector3(1.0, 1.05, -0.3),
      };
    return {
      pos: new THREE.Vector3(-0.3, 1.45, 2.45),
      target: new THREE.Vector3(0.62, 1.22, -0.4),
    };
  }, [aspect]);

  const reset = useRef<() => void>(null);

  // Reset to the room view on mount, when the page is restored from the
  // back/forward cache, and whenever the room leaves view (Press start hides
  // the page, so Back always lands on the normal view).
  useEffect(() => {
    const resetView = () => {
      const { camera, invalidate } = get();
      zoom.current = null;
      camera.position.copy(home.pos);
      look.current.copy(home.target);
      camera.lookAt(look.current);
      invalidate();
    };
    reset.current = resetView;
    resetView();
    const unregister = setResetHandler(resetView);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetView();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      unregister();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [get, home]);

  useEffect(() => {
    if (!active) reset.current?.();
  }, [active]);

  useEffect(() => {
    if (!interactive) return;
    return setZoomHandler((done) => {
      if (!animate) return done();
      zoom.current = { done, fired: false, start: performance.now() };
    });
  }, [animate, interactive]);

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const z = zoom.current;
    if (z) {
      const targetPos = center.clone().addScaledVector(normal, 0.62);
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        targetPos.x,
        3.2,
        dt,
      );
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        targetPos.y,
        3.2,
        dt,
      );
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        targetPos.z,
        3.2,
        dt,
      );
      look.current.lerp(center, 1 - Math.exp(-4 * dt));
      camera.lookAt(look.current);
      // Never hold the visitor hostage: navigate on arrival or after the cap.
      const timedOut = performance.now() - z.start > ZOOM_TIMEOUT_MS;
      if (
        !z.fired &&
        (timedOut || camera.position.distanceTo(targetPos) < 0.05)
      ) {
        z.fired = true;
        z.done();
      }
      return;
    }
    if (!animate) return;
    const t = clock.elapsedTime;
    camera.position.set(
      home.pos.x + Math.sin(t * 0.25) * 0.06,
      home.pos.y + Math.sin(t * 0.33) * 0.03,
      home.pos.z,
    );
    camera.lookAt(look.current);
  });

  return null;
}

/** react-three-fiber arcade room. Loaded client-only via next/dynamic. */
export default function ArcadeScene({
  board,
  animate,
  active,
  onReady,
  interactive,
}: Props) {
  return (
    <Canvas
      className="!absolute inset-0 [&_canvas]:[image-rendering:pixelated]"
      dpr={PIXEL_RATIO}
      frameloop={!active ? "never" : animate ? "always" : "demand"}
      camera={{ fov: 42, near: 0.05, far: 40 }}
      gl={{ antialias: false, powerPreference: "low-power" }}
      aria-hidden
      onCreated={() => requestAnimationFrame(() => onReady())}
    >
      <color attach="background" args={["#140b12"]} />
      <fog attach="fog" args={["#140b12", 6, 14]} />
      <ambientLight intensity={0.85} color="#a07ab8" />
      <directionalLight
        position={[0.3, 2.6, -2]}
        intensity={1.8}
        color="#ff9a5a"
      />
      <Room />
      <Fire animate={animate} />
      <Dust animate={animate} />
      <Cabinet board={board} animate={animate} />
      <CameraRig animate={animate} active={active} interactive={interactive} />
    </Canvas>
  );
}
