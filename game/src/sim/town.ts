import type { RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
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
  model: "car" | "truck";
  color: string;
  /** Wheel spin (radians), for drawing. */
  spin: number;
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

  /** Ground height the town sits on (Owawa is up on its plateau). */
  readonly y: number;

  constructor(R: Rapier, world: World, loops: P[][], walkLoops: P[][], opts: { carsPerLoop: number[]; walkersPerLoop: number; laneOffset: number; y?: number }) {
    this.y = opts.y ?? 0;
    let id = 0;
    loops.forEach((loop, li) => {
      const path = new Path(laneOf(loop, opts.laneOffset));
      const n = opts.carsPerLoop[li] ?? 2;
      for (let k = 0; k < n; k++) {
        const s = (path.length / n) * k + li * 7;
        const p = path.at(s);
        const truck = (id * 7) % 5 === 0;
        const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, this.y + 0.85, p.z).setRotation(quatFromHeading(p.heading)));
        world.createCollider(
          R.ColliderDesc.cuboid(truck ? 2.75 : 2.3, truck ? 0.75 : 0.6, 0.98)
            .setTranslation(0, truck ? 0.15 : 0, 0)
            .setCollisionGroups(groups(LAYER.VEHICLE)),
          body,
        );
        this.cars.push({ id: id++, path, s, speed: 0, cruise: 10 + ((id * 13) % 5), x: p.x, z: p.z, heading: p.heading, body, model: truck ? "truck" : "car", color: CAR_COLORS[id % CAR_COLORS.length], spin: 0 });
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

  step(dt: number, obstacles: Obstacle[]) {
    // Cars
    for (const c of this.cars) {
      const here = c.path.at(c.s);
      let target = here.toCorner < 14 ? Math.min(c.cruise, 4 + here.toCorner * 0.5) : c.cruise;
      const fx = Math.cos(c.heading);
      const fz = Math.sin(c.heading);
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
