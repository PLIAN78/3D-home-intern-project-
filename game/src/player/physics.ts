import type { Box } from "../world/map";

/**
 * Arcade movement for every way of getting around. Pure functions so the feel
 * can be unit tested: the renderer calls `stepBody` once per frame.
 *
 * Headings are radians where 0 faces +x (east) and π/2 faces +z (south), so a
 * body moves by (cos h, sin h).
 */

export type ModeId = "walk" | "truck" | "horse" | "car" | "jetpack";

export interface ModeSpec {
  label: string;
  /** Top speed (m/s) and sprint top speed for modes that sprint. */
  maxSpeed: number;
  sprintSpeed?: number;
  /** Forward acceleration and braking (m/s²). */
  accel: number;
  brake: number;
  /** Steering: rad/s at full lock (vehicles scale it with speed). */
  turnRate: number;
  /** Collision radius (m). */
  radius: number;
  /** Camera-relative movement (on foot, jetpack) vs. steered (vehicles, horse). */
  steered: boolean;
  jump?: number;
  /** Jetpack: upward thrust (m/s²) and fuel seconds. */
  thrust?: number;
  fuel?: number;
}

export const MODES: Record<ModeId, ModeSpec> = {
  walk: { label: "On foot", maxSpeed: 5, sprintSpeed: 9, accel: 30, brake: 40, turnRate: 12, radius: 0.45, steered: false, jump: 6 },
  truck: { label: "Company truck", maxSpeed: 22, accel: 9, brake: 18, turnRate: 1.7, radius: 1.6, steered: true },
  horse: { label: "Horse", maxSpeed: 14, sprintSpeed: 19, accel: 12, brake: 20, turnRate: 2.6, radius: 0.9, steered: true, jump: 7 },
  car: { label: "Sports car", maxSpeed: 42, accel: 16, brake: 28, turnRate: 1.6, radius: 1.5, steered: true },
  jetpack: { label: "Jetpack", maxSpeed: 11, sprintSpeed: 16, accel: 18, brake: 18, turnRate: 10, radius: 0.5, steered: false, jump: 6, thrust: 24, fuel: 9 },
};

export const GRAVITY = 20;
/** How tall a body is, for bumping its head on things. */
export const BODY_HEIGHT = 1.9;

export interface Body {
  x: number;
  y: number;
  z: number;
  /** Vertical speed (m/s, up positive). */
  vy: number;
  heading: number;
  /** Forward speed (m/s); negative reverses. */
  speed: number;
  /** Jetpack fuel left (s). */
  fuel: number;
  grounded: boolean;
}

export interface MoveInput {
  /** −1 (back) … 1 (forward). */
  forward: number;
  /** −1 (left) … 1 (right). */
  side: number;
  /** Jump / jetpack thrust held. */
  up: boolean;
  sprint: boolean;
  /** Camera yaw (same convention as headings): "forward" points this way on foot. */
  cameraYaw: number;
}

export interface World {
  boxes: Box[];
  /** Walkable height under (x, z) for a body that was at height y. */
  groundAt: (x: number, z: number, y: number) => number;
  /** Overhead limit at (x, z) for a body that was at height y (Infinity when open sky). */
  ceilingAt?: (x: number, z: number, y: number) => number;
  /** Half-size of the playable square. */
  half: number;
}

export function createBody(x: number, z: number, heading: number, y = 0): Body {
  return { x, y, z, vy: 0, heading, speed: 0, fuel: MODES.jetpack.fuel ?? 0, grounded: true };
}

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Push a circle out of every box it overlaps (only boxes taller than the body's height). */
export function resolveCollisions(x: number, z: number, y: number, radius: number, boxes: Box[]): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (y >= b.h - 0.05) continue;
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: leave by the nearest side.
        const exits = [x - b.x0 + radius, b.x1 - x + radius, z - b.z0 + radius, b.z1 - z + radius];
        const i = exits.indexOf(Math.min(...exits));
        if (i === 0) x = b.x0 - radius;
        else if (i === 1) x = b.x1 + radius;
        else if (i === 2) z = b.z0 - radius;
        else z = b.z1 + radius;
      }
    }
  }
  return { x, z, hit };
}

/** Advance a body by one frame. Returns a new body (the input is not changed). */
export function stepBody(body: Body, input: MoveInput, mode: ModeId, dt: number, world: World): Body {
  const spec = MODES[mode];
  const b = { ...body };
  const top = input.sprint && spec.sprintSpeed ? spec.sprintSpeed : spec.maxSpeed;

  if (spec.steered) {
    // Vehicles and the horse: throttle, brake/reverse, speed-scaled steering.
    const target = input.forward > 0 ? top * input.forward : input.forward < 0 ? -top * 0.35 * -input.forward : 0;
    const rate = input.forward === 0 ? spec.brake * 0.35 : Math.sign(target - b.speed) === Math.sign(b.speed) || b.speed === 0 ? spec.accel : spec.brake;
    b.speed = approach(b.speed, target, rate * dt);
    const grip = Math.min(1, Math.abs(b.speed) / 4);
    b.heading += input.side * spec.turnRate * grip * Math.sign(b.speed || 1) * dt;
  } else {
    // On foot / jetpack: move relative to the camera, turn to face the way you go.
    const mag = Math.min(1, Math.hypot(input.forward, input.side));
    if (mag > 0.01) {
      const dir = input.cameraYaw + Math.atan2(input.side, input.forward);
      const d = angleDelta(b.heading, dir);
      b.heading += Math.sign(d) * Math.min(Math.abs(d), spec.turnRate * dt);
    }
    b.speed = approach(b.speed, top * mag, (mag > 0.01 ? spec.accel : spec.brake) * dt);
  }

  // Vertical: jump, jetpack thrust, gravity, landing (on the ground or the tower deck).
  if (mode === "jetpack") {
    if (input.up && b.fuel > 0) {
      b.vy = Math.min(9, b.vy + (spec.thrust ?? 0) * dt);
      b.fuel = Math.max(0, b.fuel - dt);
    } else {
      b.vy -= GRAVITY * 0.55 * dt;
    }
  } else {
    if (input.up && b.grounded && spec.jump) b.vy = spec.jump;
    b.vy -= GRAVITY * dt;
  }

  let x = b.x + Math.cos(b.heading) * b.speed * dt;
  let z = b.z + Math.sin(b.heading) * b.speed * dt;
  let y = b.y + b.vy * dt;

  const res = resolveCollisions(x, z, y, spec.radius, world.boxes);
  if (res.hit && spec.steered) b.speed *= 0.55;
  x = Math.max(-world.half, Math.min(world.half, res.x));
  z = Math.max(-world.half, Math.min(world.half, res.z));

  const ceiling = world.ceilingAt?.(x, z, b.y) ?? Infinity;
  if (y + BODY_HEIGHT > ceiling) {
    y = ceiling - BODY_HEIGHT;
    if (b.vy > 0) b.vy = 0;
  }
  const floor = world.groundAt(x, z, b.y);
  b.grounded = false;
  if (y <= floor) {
    y = floor;
    if (b.vy < 0) b.vy = 0;
    b.grounded = true;
  }
  // Refuel on the ground.
  if (b.grounded && mode === "jetpack") b.fuel = Math.min(spec.fuel ?? 0, b.fuel + dt * 1.5);
  if (b.grounded && mode !== "jetpack") b.fuel = Math.min(MODES.jetpack.fuel ?? 0, b.fuel + dt * 3);

  b.x = x;
  b.y = y;
  b.z = z;
  return b;
}
