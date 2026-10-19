export const POWER_EVENT = "crt:power";

/** Blank the screen until the next route commits, then play the power-on. */
export function powerCycleScreen() {
  window.dispatchEvent(new Event(POWER_EVENT));
}
