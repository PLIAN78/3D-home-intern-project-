import type { MoveInput } from "./physics";

/**
 * Keyboard and mouse state. WASD moves (or steers), Space jumps / thrusts,
 * Shift sprints, E interacts, 1–5 switch gear, arrow keys or mouse drag turn
 * the camera, wheel zooms.
 */

const held = new Set<string>();
const pressed = new Set<string>();
export const mouse = { dx: 0, dy: 0, wheel: 0, dragging: false, lastMove: 0 };

const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function isHeld(code: string) {
  return held.has(code);
}

/** True once per key press (cleared by `endFrame`). */
export function wasPressed(code: string) {
  return pressed.has(code);
}

export function endFrame() {
  pressed.clear();
  mouse.dx = 0;
  mouse.dy = 0;
  mouse.wheel = 0;
}

export function releaseAll() {
  held.clear();
  pressed.clear();
}

export function moveInput(cameraYaw: number): MoveInput {
  const f = (isHeld("KeyW") ? 1 : 0) - (isHeld("KeyS") ? 1 : 0);
  const s = (isHeld("KeyD") ? 1 : 0) - (isHeld("KeyA") ? 1 : 0);
  return { forward: f, side: s, up: isHeld("Space"), sprint: isHeld("ShiftLeft") || isHeld("ShiftRight"), cameraYaw };
}

/** Camera turn from arrow keys (rad/s units, −1…1). */
export function cameraKeys() {
  return { yaw: (isHeld("ArrowRight") ? 1 : 0) - (isHeld("ArrowLeft") ? 1 : 0), pitch: (isHeld("ArrowUp") ? 1 : 0) - (isHeld("ArrowDown") ? 1 : 0) };
}

export function bindInput(canvas: HTMLElement) {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    // A fresh press (not keyboard auto-repeat) counts once, even if a key-up was ever missed.
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => held.delete(e.code);
  const blur = () => releaseAll();
  const mdown = (e: PointerEvent) => {
    mouse.dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const mup = () => {
    mouse.dragging = false;
  };
  const mmove = (e: PointerEvent) => {
    if (!mouse.dragging && document.pointerLockElement !== canvas) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
    mouse.lastMove = performance.now();
  };
  const wheel = (e: WheelEvent) => {
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  canvas.addEventListener("pointerdown", mdown);
  window.addEventListener("pointerup", mup);
  window.addEventListener("pointermove", mmove);
  canvas.addEventListener("wheel", wheel, { passive: false });
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    canvas.removeEventListener("pointerdown", mdown);
    window.removeEventListener("pointerup", mup);
    window.removeEventListener("pointermove", mmove);
    canvas.removeEventListener("wheel", wheel);
  };
}
