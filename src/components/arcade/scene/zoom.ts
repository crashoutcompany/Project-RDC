/**
 * Bridges the static "Press start" link and the 3D scene: while the scene is
 * mounted it registers a handler that flies the camera into the screen and
 * then calls `done` (which navigates). Without a scene the link works as-is.
 */
type ZoomHandler = (done: () => void) => void;

let handler: ZoomHandler | null = null;

export function setZoomHandler(next: ZoomHandler) {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** Returns false when no scene is listening, so the caller navigates normally. */
export function startZoom(done: () => void) {
  if (!handler) return false;
  handler(done);
  return true;
}

let resetHandler: (() => void) | null = null;

/** The scene registers how to snap back to the room view. */
export function setResetHandler(next: () => void) {
  resetHandler = next;
  return () => {
    if (resetHandler === next) resetHandler = null;
  };
}

/**
 * After Press start navigates, wait for the hero to be hidden (Next keeps the
 * previous page mounted but hidden), then undo the fade and reset the camera
 * so Back lands on the normal hero even if it's pressed straight away.
 */
export function resetWhenHidden(stage: HTMLElement | null) {
  if (!stage) return;
  const started = performance.now();
  const timer = setInterval(() => {
    const hidden = !stage.isConnected || stage.offsetParent === null;
    if (hidden || performance.now() - started > 15000) {
      clearInterval(timer);
      stage.removeAttribute("data-zooming");
      resetHandler?.();
    }
  }, 100);
}
