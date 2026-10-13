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
