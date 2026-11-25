import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { mayGo, signalAt } from "../world/signals";
import { angleDelta, approach, damp, quatFromHeading } from "./math";

/**
 * Town life: cars driving loops through the streets and people walking the
 * sidewalks. Cars are kinematic bodies (you bump into them, they don't get
 * pushed around), keep to the right lane, slow for corners, queue behind each
 * other and stop for you. Pedestrians stroll their block, pause when you're in
 * their way and hop aside from anything driving at them.
 */

type P = [number, number];

/** A closed polyline with cumulative lengths, for walking along it by distance. */
class Path {
  readonly pts: P[];
  readonly cum: number[];
  readonly length: number;
  constructor(pts: P[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.cum.push(this.cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = this.cum[pts.length];
  }
  at(s: number): { x: number; z: number; heading: number; toCorner: number } {
    s = ((s % this.length) + this.length) % this.length;
    let i = 0;
    while (i < this.pts.length - 1 && this.cum[i + 1] < s) i++;
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const L = this.cum[i + 1] - this.cum[i];
    const t = L > 0 ? (s - this.cum[i]) / L : 0;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[1] - a[1], b[0] - a[0]), toCorner: this.cum[i + 1] - s };
  }
}

/** Offsets a closed centre line to the right of travel (right-hand traffic). */
export function laneOf(loop: P[], offset: number): P[] {
  const n = loop.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = loop[(i - 1 + n) % n];
    const p1 = loop[i];
    const p2 = loop[(i + 1) % n];
    const d1 = norm([p1[0] - p0[0], p1[1] - p0[1]]);
    const d2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    // Right of heading (cos h, sin h) is (−sin h, cos h).
    const r1: P = [-d1[1], d1[0]];
    const r2: P = [-d2[1], d2[0]];
    const m = norm([r1[0] + r2[0], r1[1] + r2[1]]);
    const k = offset / Math.max(0.3, m[0] * r2[0] + m[1] * r2[1]);
    out.push([p1[0] + m[0] * k, p1[1] + m[1] * k]);
  }
  return out;
}

function norm(v: P): P {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

export interface TrafficCar {
  id: number;
  path: Path;
  s: number;
  speed: number;
  cruise: number;
  x: number;
  z: number;
  heading: number;
  body: RigidBody;
  model: "car" | "truck" | "police";
  color: string;
  /** Wheel spin (radians), for drawing. */
  spin: number;
  /** The car's collider handle (so a collision can be traced back to it). */
  collider: number;
  /** A police cruiser you hit: chasing you, then driving back to its beat. */
  chase?: Chase;
}

/** How a police chase runs: seconds on your tail, top speed, the gap it keeps, the speed it drives back at. */
export const CHASE = { seconds: 10, speed: 27, gap: 9, back: 15, accel: 9 };
export interface Chase {
  phase: "chase" | "return";
  /** Seconds of chase left. */
  left: number;
  /** Where you went (the cruiser follows your path, so it stays on the roads you used). */
  trail: P[];
  /** Where the cruiser went, to drive back the same way. */
  driven: P[];
  /** Index of the trail or return point it is heading for. */
  next: number;
}

export interface Walker {
  id: number;
  path: Path;
  s: number;
  dir: 1 | -1;
  speed: number;
  x: number;
  z: number;
  heading: number;
  /** Sideways step (m) when dodging traffic. */
  aside: number;
  moving: number;
  outfit: number;
}

const CAR_COLORS = ["#c9ccd1", "#20232a", "#8c1d18", "#1d3b6a", "#e6e2d8", "#4b5258", "#2e5a3b", "#a7a39a", "#6b2c3e"];

export interface Obstacle {
  x: number;
  z: number;
  /** Is it something cars should wait for (the player and whatever they're in)? */
  radius: number;
  /** Speed, so pedestrians dodge fast things. */
  speed: number;
}

export class Town {
  readonly cars: TrafficCar[] = [];
  readonly walkers: Walker[] = [];
  /** Seconds since the town started (traffic lights run on it). */
  clock = 0;
  /** Junctions with traffic lights (empty in the Ridge: stop signs and courtesy). */
  readonly signals: [number, number][];

  /** Ground height the town sits on (Owawa is up on its plateau). */
  readonly y: number;

  constructor(R: Rapier, world: World, loops: P[][], walkLoops: P[][], opts: { carsPerLoop: number[]; walkersPerLoop: number; laneOffset: number; y?: number; signals?: [number, number][]; policeEvery?: number }) {
    this.y = opts.y ?? 0;
    this.signals = opts.signals ?? [];
    let id = 0;
    loops.forEach((loop, li) => {
      const path = new Path(laneOf(loop, opts.laneOffset));
      const n = opts.carsPerLoop[li] ?? 2;
      for (let k = 0; k < n; k++) {
        const s = (path.length / n) * k + li * 7;
        const p = path.at(s);
        const police = !!opts.policeEvery && id % opts.policeEvery === 3;
        const truck = !police && (id * 7) % 5 === 0;
        const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, this.y + 0.85, p.z).setRotation(quatFromHeading(p.heading)));
        const collider = world.createCollider(
          R.ColliderDesc.cuboid(truck ? 2.75 : 2.3, truck ? 0.75 : 0.6, 0.98)
            .setTranslation(0, truck ? 0.15 : 0, 0)
            .setCollisionGroups(groups(LAYER.VEHICLE)),
          body,
        );
        this.cars.push({ id: id++, path, s, speed: 0, cruise: 10 + ((id * 13) % 5), x: p.x, z: p.z, heading: p.heading, body, model: police ? "police" : truck ? "truck" : "car", color: police ? "#f2f2ef" : CAR_COLORS[id % CAR_COLORS.length], spin: 0, collider: collider.handle });
      }
    });
    walkLoops.forEach((loop, li) => {
      const path = new Path(loop);
      for (let k = 0; k < opts.walkersPerLoop; k++) {
        const s = (path.length / opts.walkersPerLoop) * (k + 0.37 * li);
        const p = path.at(s);
        this.walkers.push({ id: id++, path, s, dir: (k + li) % 2 ? 1 : -1, speed: 1.1 + ((id * 7) % 5) * 0.08, x: p.x, z: p.z, heading: p.heading, aside: 0, moving: 1, outfit: id % 9 });
      }
    });
  }

  /** Police alarms raised and called off since the simulation last looked. */
  readonly alarms: { phase: "chase" | "gave-up"; id: number }[] = [];
  /** Is a police cruiser chasing you right now? */
  get chasing() {
    return this.cars.some((c) => c.chase?.phase === "chase");
  }
  carByCollider(handle: number) {
    return this.cars.find((c) => c.collider === handle);
  }
  /** You hit a police cruiser: siren on, and it follows you for CHASE.seconds. Hit it again to start over. */
  alarm(c: TrafficCar) {
    if (c.model !== "police") return;
    if (c.chase?.phase === "chase") {
      c.chase.left = CHASE.seconds;
      return;
    }
    const back = c.chase?.phase === "return" ? c.chase.driven.slice(0, c.chase.next + 1) : [[c.x, c.z] as P];
    c.chase = { phase: "chase", left: CHASE.seconds, trail: [[c.x, c.z]], driven: back, next: 0 };
    this.alarms.push({ phase: "chase", id: c.id });
  }

  /** A cruiser on a chase: along your trail, keeping its distance; then back along its own way to its beat. */
  private pursue(c: TrafficCar, dt: number, target: Obstacle) {
    const ch = c.chase!;
    let want = 0;
    let to: P | null = null;
    if (ch.phase === "chase") {
      ch.left -= dt;
      const last = ch.trail[ch.trail.length - 1];
      if (Math.hypot(target.x - last[0], target.z - last[1]) > 2) ch.trail.push([target.x, target.z]);
      while (ch.next < ch.trail.length - 1 && Math.hypot(ch.trail[ch.next][0] - c.x, ch.trail[ch.next][1] - c.z) < 2.5) ch.next++;
      to = ch.trail[ch.next];
      const gap = Math.hypot(target.x - c.x, target.z - c.z);
      // Close up fast but no faster than it can brake by the hold point; then hold the gap (matching your speed), and stop if you stop.
      const room = gap - CHASE.gap;
      want = room > 0 ? Math.min(CHASE.speed, target.speed + Math.sqrt(2 * CHASE.accel * 0.7 * room)) : Math.min(target.speed, Math.max(0, (gap - CHASE.gap * 0.6) * 1.5));
      if (ch.left <= 0) {
        ch.phase = "return";
        ch.next = ch.driven.length - 1;
        this.alarms.push({ phase: "gave-up", id: c.id });
      }
    } else {
      while (ch.next > 0 && Math.hypot(ch.driven[ch.next][0] - c.x, ch.driven[ch.next][1] - c.z) < 2.5) ch.next--;
      to = ch.driven[ch.next];
      const home = c.path.at(c.s);
      if (ch.next === 0 && Math.hypot(home.x - c.x, home.z - c.z) < 2.5) {
        c.chase = undefined;
        c.speed = 0;
        return;
      }
      if (ch.next === 0) to = [home.x, home.z];
      want = CHASE.back;
    }
    c.speed = approach(c.speed, want, CHASE.accel * dt);
    const dx = to[0] - c.x, dz = to[1] - c.z, d = Math.hypot(dx, dz);
    if (d > 0.3) {
      const step = Math.min(d, c.speed * dt);
      c.x += (dx / d) * step;
      c.z += (dz / d) * step;
      c.heading += angleDelta(c.heading, Math.atan2(dz, dx)) * damp(5, dt);
    }
    if (ch.phase === "chase") {
      const last = ch.driven[ch.driven.length - 1];
      if (Math.hypot(c.x - last[0], c.z - last[1]) > 2) ch.driven.push([c.x, c.z]);
    }
    c.spin += (c.speed * dt) / 0.36;
    c.body.setNextKinematicTranslation({ x: c.x, y: this.y + 0.85, z: c.z });
    c.body.setNextKinematicRotation(quatFromHeading(c.heading));
  }

  step(dt: number, obstacles: Obstacle[]) {
    this.clock += dt;
    // Cars
    for (const c of this.cars) {
      // obstacles[0] is the player (on foot or in whatever they drive).
      if (c.chase && obstacles[0]) {
        this.pursue(c, dt, obstacles[0]);
        continue;
      }
      const here = c.path.at(c.s);
      let target = here.toCorner < 14 ? Math.min(c.cruise, 4 + here.toCorner * 0.5) : c.cruise;
      const fx = Math.cos(c.heading);
      const fz = Math.sin(c.heading);
      // Traffic lights: stop at the line (9 m before the junction's centre) unless it's green our way.
      const eastWest = Math.abs(fx) > Math.abs(fz);
      for (const [sx, sz] of this.signals) {
        const dx = sx - c.x, dz = sz - c.z, ahead = dx * fx + dz * fz, lateral = Math.abs(-dx * fz + dz * fx);
        if (ahead < 7.5 || ahead > 30 || lateral > 6) continue;
        if (!mayGo(signalAt(this.clock, sx, sz), eastWest)) target = Math.min(target, Math.max(0, (ahead - 9.5) * 0.7));
      }
      const gap = (ox: number, oz: number, r: number) => {
        const dx = ox - c.x;
        const dz = oz - c.z;
        const ahead = dx * fx + dz * fz;
        const lateral = Math.abs(-dx * fz + dz * fx);
        return ahead > 0 && lateral < 1.6 + r ? ahead - r : Infinity;
      };
      for (const o of this.cars) {
        if (o === c) continue;
        // Follow cars going roughly the same way; ignore cross traffic (avoids gridlock at junctions).
        if (Math.cos(o.heading - c.heading) < 0.3) continue;
        const g = gap(o.x, o.z, 2.6);
        if (g < 14) target = Math.min(target, Math.max(0, (g - 3) * 0.9));
      }
      for (const o of obstacles) {
        const g = gap(o.x, o.z, o.radius);
        if (g < 16) target = Math.min(target, Math.max(0, (g - 3) * 0.8));
      }
      c.speed = approach(c.speed, target, (target < c.speed ? 9 : 3) * dt);
      c.s += c.speed * dt;
      // Steer toward a point a little ahead so corners are rounded.
      const look = c.path.at(c.s + 4);
      const p = c.path.at(c.s);
      const want = Math.atan2(look.z - p.z, look.x - p.x);
      c.heading += angleDelta(c.heading, want) * damp(6, dt);
      c.x += (p.x - c.x) * damp(10, dt);
      c.z += (p.z - c.z) * damp(10, dt);
      c.spin += (c.speed * dt) / 0.36;
      c.body.setNextKinematicTranslation({ x: c.x, y: this.y + 0.85, z: c.z });
      c.body.setNextKinematicRotation(quatFromHeading(c.heading));
    }
    // Pedestrians
    for (const w of this.walkers) {
      const fx = Math.cos(w.heading);
      const fz = Math.sin(w.heading);
      let blocked = false;
      let dodge = 0;
      for (const o of obstacles) {
        const dx = o.x - w.x;
        const dz = o.z - w.z;
        const d = Math.hypot(dx, dz);
        if (o.speed > 3 && d < 7) dodge = 1;
        else if (d < 1.4 + o.radius * 0.3 && dx * fx + dz * fz > 0) blocked = true;
      }
      w.aside = approach(w.aside, dodge ? 2.2 : 0, (dodge ? 8 : 1.5) * dt);
      w.moving = approach(w.moving, blocked || dodge ? 0 : 1, 4 * dt);
      w.s += w.dir * w.speed * w.moving * dt;
      const p = w.path.at(w.s);
      const h = w.dir > 0 ? p.heading : p.heading + Math.PI;
      // Step to the inside of the block (left of a clockwise loop).
      const sx = Math.sin(p.heading) * w.aside;
      const sz = -Math.cos(p.heading) * w.aside;
      w.x = p.x + sx;
      w.z = p.z + sz;
      w.heading += angleDelta(w.heading, h) * damp(5, dt);
    }
  }
}
