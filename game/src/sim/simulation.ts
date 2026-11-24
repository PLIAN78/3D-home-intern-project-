import type { Collider, EventQueue, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { StageId } from "@/lib/models/construction";
import { collisionBoxes, LANDMARKS, TOWER, WORLD_HALF, type Box } from "../world/map";
import { Breakables, BREAK_SPEED, type BreakEvent, type TreeInput } from "./breakables";
import { CharacterController, JETPACK, NO_INTENT, type MoveIntent } from "./character";
import { HorseController } from "./horse";
import { quatFromHeading, rotate, type Quat, type Vec3 } from "./math";
import { groups, LAYER, loadRapier, type Rapier } from "./rapier";
import { PARKED, VEHICLES, VehicleController, type VehicleId } from "./vehicle";

/** Who the player is controlling right now. */
export type Control = { kind: "foot" } | { kind: "vehicle"; id: VehicleId } | { kind: "horse" };

/** One frame of player input; the simulation routes it to whatever is being controlled. */
export interface SimInput extends MoveIntent {
  /** Space held while driving = handbrake. */
  handbrake: boolean;
}

export const IDLE_INPUT: SimInput = { ...NO_INTENT, handbrake: false };

export type SimEvent =
  | BreakEvent
  | { kind: "landed-hard"; x: number; z: number; speed: number }
  | { kind: "crash"; id: VehicleId; speed: number };

/** What the camera, HUD and story follow: the player, or what they're driving or riding. */
export interface Focus {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** m/s, signed (negative when reversing). */
  speed: number;
  vy: number;
  grounded: boolean;
  fuel: number;
  fuelMax: number;
  thrusting: boolean;
  control: Control;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  q: Quat;
}

const FIXED_DT = 1 / 60;
const MAX_STEPS = 8;
/** How close you need to be to get in or on something. */
export const BOARD_RANGE = 4;

export interface SimOptions {
  stages: Record<string, StageId>;
  trees: TreeInput[];
  spawn: { position: [number, number]; heading: number };
}

/**
 * The whole physical world, independent of rendering: static colliders built
 * from the map, the player's character, the vehicles and the horse (separate
 * bodies that stay where you leave them), and everything breakable. It runs at
 * a fixed 60 Hz and exposes interpolated poses for drawing.
 */
export class Simulation {
  readonly player: CharacterController;
  readonly vehicles: Partial<Record<VehicleId, VehicleController>> = {};
  horse: HorseController | null = null;
  readonly breakables: Breakables;
  control: Control = { kind: "foot" };
  readonly events: SimEvent[] = [];
  /** Seconds of simulated time. */
  time = 0;

  private readonly queue: EventQueue;
  private readonly staticBody: RigidBody;
  private houseColliders: Collider[] = [];
  private acc = 0;
  private readonly prev = new Map<string, Pose>();
  private readonly vehicleByCollider = new Map<number, VehicleId>();

  static async create(opts: SimOptions): Promise<Simulation> {
    const R = await loadRapier();
    return new Simulation(R, opts);
  }

  readonly world: World;

  constructor(
    readonly R: Rapier,
    opts: SimOptions,
  ) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.queue = new R.EventQueue(true);
    this.staticBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const g = groups(LAYER.STATIC);
    const add = (desc: ReturnType<typeof R.ColliderDesc.cuboid>) => this.world.createCollider(desc.setCollisionGroups(g), this.staticBody);
    // Ground slab and invisible walls at the edge of the map.
    add(R.ColliderDesc.cuboid(WORLD_HALF + 40, 0.5, WORLD_HALF + 40).setTranslation(0, -0.5, 0).setFriction(1));
    const H = WORLD_HALF - 2;
    for (const [x, z, hx, hz] of [
      [H + 1, 0, 1, H + 2],
      [-H - 1, 0, 1, H + 2],
      [0, H + 1, H + 2, 1],
      [0, -H - 1, H + 2, 1],
    ])
      add(R.ColliderDesc.cuboid(hx, 60, hz).setTranslation(x, 60, z));
    // The water tank: a drum you can land on (its deck) and stand under.
    const [tx, tz] = LANDMARKS.tower.position;
    const tankHalf = (TOWER.deckY - TOWER.tankBottom) / 2;
    add(R.ColliderDesc.cylinder(tankHalf, TOWER.tankRadius).setTranslation(tx, TOWER.tankBottom + tankHalf, tz));

    this.breakables = new Breakables(R, this.world, opts.trees);
    this.setStages(opts.stages);

    const [sx, sz] = opts.spawn.position;
    this.player = new CharacterController(R, this.world, sx, sz, opts.spawn.heading);
  }

  /** Rebuilds house colliders for new construction stages (framing lots become breakable frames). */
  setStages(stages: Record<string, StageId>) {
    for (const c of this.houseColliders) this.world.removeCollider(c, true);
    this.houseColliders = [];
    const boxes = collisionBoxes(stages);
    for (const b of boxes) {
      if (b.kind === "frame") continue;
      this.houseColliders.push(this.addBox(b));
    }
    this.breakables.setFrames(boxes);
  }

  private addBox(b: Box) {
    const R = this.R;
    const hx = (b.x1 - b.x0) / 2;
    const hz = (b.z1 - b.z0) / 2;
    return this.world.createCollider(
      R.ColliderDesc.cuboid(hx, b.h / 2, hz)
        .setTranslation(b.x0 + hx, b.h / 2, b.z0 + hz)
        .setCollisionGroups(groups(LAYER.STATIC)),
      this.staticBody,
    );
  }

  /** Adds (or moves) a vehicle. */
  spawnVehicle(id: VehicleId, x: number, z: number, heading: number) {
    let v = this.vehicles[id];
    if (!v) {
      v = new VehicleController(this.R, this.world, VEHICLES[id], x, z, heading);
      this.vehicles[id] = v;
      this.vehicleByCollider.set(v.collider.handle, id);
    } else v.place(x, z, heading);
    this.snapshot();
    return v;
  }

  spawnHorse(x: number, z: number, heading: number) {
    if (!this.horse) this.horse = new HorseController(this.R, this.world, x, z, heading);
    else this.horse.place(x, z, heading);
    this.snapshot();
    return this.horse;
  }

  // ── Getting in and out ────────────────────────────────────────────────

  /** The closest thing you could get in or on, within reach. */
  nearestRide(): { kind: "vehicle"; id: VehicleId; distance: number } | { kind: "horse"; distance: number } | null {
    if (this.control.kind !== "foot") return null;
    const p = this.player;
    let best: { kind: "vehicle"; id: VehicleId; distance: number } | { kind: "horse"; distance: number } | null = null;
    for (const [id, v] of Object.entries(this.vehicles) as [VehicleId, VehicleController][]) {
      const t = v.position;
      // Distance to the chassis box (in its local frame), not its centre: you get in at the door.
      const q = v.rotation;
      const inv = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      const local = rotate(inv, { x: p.x - t.x, y: 0, z: p.z - t.z });
      const [hx, , hz] = v.spec.half;
      const dx = Math.max(0, Math.abs(local.x) - hx);
      const dz = Math.max(0, Math.abs(local.z) - hz);
      const d = Math.hypot(dx, dz);
      if (d < BOARD_RANGE - 1.5 && (!best || d < best.distance)) best = { kind: "vehicle", id, distance: d };
    }
    if (this.horse) {
      const d = Math.hypot(this.horse.x - p.x, this.horse.z - p.z) - 1;
      if (d < BOARD_RANGE - 1.5 && (!best || d < best.distance)) best = { kind: "horse", distance: d };
    }
    return best;
  }

  enterVehicle(id: VehicleId) {
    if (!this.vehicles[id] || this.control.kind !== "foot") return false;
    this.player.jetpack = false;
    this.player.setActive(false);
    this.control = { kind: "vehicle", id };
    return true;
  }

  mountHorse() {
    if (!this.horse || this.control.kind !== "foot") return false;
    this.player.jetpack = false;
    this.player.setActive(false);
    this.control = { kind: "horse" };
    return true;
  }

  /** Gets out at the driver's door (or the nearest free side). */
  exit() {
    const c = this.control;
    if (c.kind === "foot") return false;
    let origin: Vec3;
    let heading: number;
    let sides: Vec3[];
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id];
      if (!v) return false;
      origin = v.position;
      heading = v.heading;
      const hz = v.spec.half[2] + 0.9;
      const hx = v.spec.half[0] + 1;
      sides = [
        { x: 0.3, y: 0, z: -hz },
        { x: 0.3, y: 0, z: hz },
        { x: -hx, y: 0, z: 0 },
        { x: hx, y: 0, z: 0 },
      ].map((o) => rotate(v.rotation, o));
      v.step(FIXED_DT, PARKED);
    } else {
      const h = this.horse!;
      origin = { x: h.x, y: h.y, z: h.z };
      heading = h.heading;
      h.speed = 0;
      const l = { x: Math.sin(heading) * 1.6, y: 0, z: -Math.cos(heading) * 1.6 };
      sides = [l, { x: -l.x, y: 0, z: -l.z }, { x: -Math.cos(heading) * 2.4, y: 0, z: -Math.sin(heading) * 2.4 }];
    }
    const spot = sides.map((o) => ({ x: origin.x + o.x, z: origin.z + o.z })).find((s) => this.isFree(s.x, s.z)) ?? { x: origin.x, z: origin.z };
    const onRoof = !this.isFree(spot.x, spot.z);
    this.player.setActive(true);
    this.player.place(spot.x, spot.z, onRoof ? 2.6 : 0, heading);
    this.control = { kind: "foot" };
    this.snapshot();
    return true;
  }

  /** Is there room to stand at (x, z)? */
  isFree(x: number, z: number) {
    const R = this.R;
    let hit = false;
    this.world.intersectionsWithShape(
      { x, y: 0.95, z },
      { x: 0, y: 0, z: 0, w: 1 },
      new R.Capsule(0.55, 0.36),
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(LAYER.PLAYER, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL),
      this.player.collider,
    );
    return !hit;
  }

  setJetpack(on: boolean) {
    if (this.control.kind !== "foot") return false;
    this.player.jetpack = on;
    return true;
  }

  /**
   * Brings an owned vehicle (or the horse) to the player: a few metres to their
   * side, facing the same way, on free ground. Like calling your car in GTA.
   */
  call(kind: VehicleId | "horse") {
    const f = this.focus();
    const right = { x: -Math.sin(f.heading), z: Math.cos(f.heading) };
    const back = { x: -Math.cos(f.heading), z: -Math.sin(f.heading) };
    const tries = [
      [right.x * 5, right.z * 5],
      [-right.x * 5, -right.z * 5],
      [back.x * 7, back.z * 7],
      [right.x * 9, right.z * 9],
      [-right.x * 9, -right.z * 9],
    ];
    const spot = tries.map(([dx, dz]) => ({ x: f.x + dx, z: f.z + dz })).find((s) => this.isFreeWide(s.x, s.z)) ?? { x: f.x + back.x * 7, z: f.z + back.z * 7 };
    if (kind === "horse") this.spawnHorse(spot.x, spot.z, f.heading);
    else this.spawnVehicle(kind, spot.x, spot.z, f.heading);
  }

  private isFreeWide(x: number, z: number) {
    let hit = false;
    this.world.intersectionsWithShape(
      { x, y: 1.2, z },
      quatFromHeading(0),
      new this.R.Cuboid(2.9, 1, 1.4),
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(LAYER.PLAYER, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL),
    );
    return !hit && Math.abs(x) < WORLD_HALF - 8 && Math.abs(z) < WORLD_HALF - 8;
  }

  /** Moves whatever the player controls (for tests, respawns and story beats). */
  teleport(x: number, z: number, y = 0, heading?: number) {
    const c = this.control;
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      v.place(x, z, heading ?? v.heading);
      if (y > 0) v.body.setTranslation({ x, y: y + 1, z }, true);
    } else if (c.kind === "horse") this.horse!.place(x, z, heading);
    else this.player.place(x, z, y, heading);
    this.snapshot();
  }

  // ── Stepping ──────────────────────────────────────────────────────────

  /**
   * Advances by a frame's worth of time in fixed 60 Hz steps. Returns the
   * interpolation factor for drawing between the last two steps.
   */
  step(frameDt: number, input: SimInput): number {
    this.acc += Math.min(frameDt, MAX_STEPS * FIXED_DT);
    let first = true;
    while (this.acc >= FIXED_DT) {
      this.fixedStep(first ? input : { ...input, jump: false });
      first = false;
      this.acc -= FIXED_DT;
    }
    return this.acc / FIXED_DT;
  }

  fixedStep(input: SimInput) {
    const dt = FIXED_DT;
    this.snapshot();
    const c = this.control;

    // Controlled thing gets the input; everything else idles.
    for (const [id, v] of Object.entries(this.vehicles) as [VehicleId, VehicleController][]) {
      const driving = c.kind === "vehicle" && c.id === id;
      v.step(dt, driving ? { throttle: input.forward, steer: input.side, handbrake: input.handbrake } : PARKED);
    }
    if (this.horse) this.horse.step(dt, c.kind === "horse" ? input : null);
    if (c.kind === "foot") this.player.step(dt, input);
    else this.syncRider();

    this.world.step(this.queue);
    this.time += dt;

    // Impacts: a fast vehicle knocks trees over and flattens frames, and keeps most of its speed.
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.world.getCollider(h1);
      const b = this.world.getCollider(h2);
      if (!a || !b) return;
      const vid = this.vehicleByCollider.get(a.handle) ?? this.vehicleByCollider.get(b.handle);
      if (!vid) return;
      const other = this.vehicleByCollider.has(a.handle) ? b : a;
      const v = this.vehicles[vid]!;
      const pv = v.preVel;
      const speed = Math.hypot(pv.x, pv.z);
      const owner = this.breakables.ownerOf(other);
      const dir = speed > 0.01 ? { x: pv.x / speed, y: 0, z: pv.z / speed } : { x: 1, y: 0, z: 0 };
      if (owner?.kind === "tree" && speed >= BREAK_SPEED.tree) {
        if (this.breakables.breakTree(owner.index, dir, speed)) v.body.setLinvel({ x: pv.x * 0.8, y: pv.y, z: pv.z * 0.8 }, true);
      } else if (owner?.kind === "frame" && speed >= BREAK_SPEED.frame) {
        if (this.breakables.breakFrame(owner.lotId, v.position, dir, speed)) v.body.setLinvel({ x: pv.x * 0.7, y: pv.y, z: pv.z * 0.7 }, true);
      } else if (!owner && speed > 9 && (other.collisionGroups() >>> 16) & LAYER.STATIC) {
        this.events.push({ kind: "crash", id: vid, speed });
      }
    });

    // A jetpack pilot flying fast into a tree or frame knocks it over too.
    const p = this.player;
    if (c.kind === "foot") {
      for (const hit of p.hits) {
        const owner = this.breakables.ownerOf(hit.collider);
        if (!owner || hit.speed < 10) continue;
        const sp = Math.hypot(p.vel.x, p.vel.z) || 1;
        const dir = { x: p.vel.x / sp, y: 0, z: p.vel.z / sp };
        if (owner.kind === "tree") this.breakables.breakTree(owner.index, dir, hit.speed);
        else this.breakables.breakFrame(owner.lotId, { x: p.x, y: p.y, z: p.z }, dir, hit.speed);
      }
      if (p.landedHard) this.events.push({ kind: "landed-hard", x: p.x, z: p.z, speed: p.landedHard });
    }

    const f = this.focus();
    this.breakables.update(dt, f);
    this.events.push(...this.breakables.events.splice(0));
  }

  /** Keeps the (hidden) character with whatever they're driving or riding. */
  private syncRider() {
    const c = this.control;
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      const t = v.position;
      this.player.x = t.x;
      this.player.y = Math.max(0, t.y - 1);
      this.player.z = t.z;
      this.player.heading = v.heading;
    } else if (c.kind === "horse" && this.horse) {
      this.player.x = this.horse.x;
      this.player.y = this.horse.y;
      this.player.z = this.horse.z;
      this.player.heading = this.horse.heading;
    }
    this.player.vel = { x: 0, y: 0, z: 0 };
    this.player.body.setNextKinematicTranslation({ x: this.player.x, y: -50, z: this.player.z });
  }

  focus(): Focus {
    const c = this.control;
    const p = this.player;
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      const t = v.position;
      const lv = v.body.linvel();
      return { x: t.x, y: Math.max(0, t.y - v.spec.half[1] - v.spec.wheelRadius), z: t.z, heading: v.heading, speed: v.speed, vy: lv.y, grounded: true, fuel: 0, fuelMax: 0, thrusting: false, control: c };
    }
    if (c.kind === "horse" && this.horse) {
      const h = this.horse;
      return { x: h.x, y: h.y, z: h.z, heading: h.heading, speed: h.speed, vy: h.vy, grounded: h.grounded, fuel: 0, fuelMax: 0, thrusting: false, control: c };
    }
    return { x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed, vy: p.vel.y, grounded: p.grounded, fuel: p.jetpack ? p.fuel : 0, fuelMax: p.jetpack ? JETPACK.fuel : 0, thrusting: p.thrusting, control: c };
  }

  // ── Interpolated poses for drawing ────────────────────────────────────

  private snapshot() {
    this.prev.set("player", this.rawPose("player"));
    if (this.horse) this.prev.set("horse", this.rawPose("horse"));
    for (const id of Object.keys(this.vehicles)) this.prev.set(id, this.rawPose(id));
  }

  private rawPose(name: string): Pose {
    if (name === "player") return { x: this.player.x, y: this.player.y, z: this.player.z, q: quatFromHeading(this.player.heading) };
    if (name === "horse" && this.horse) return { x: this.horse.x, y: this.horse.y, z: this.horse.z, q: quatFromHeading(this.horse.heading) };
    const v = this.vehicles[name as VehicleId];
    if (v) {
      const t = v.position;
      return { x: t.x, y: t.y, z: t.z, q: { ...v.rotation } };
    }
    return { x: 0, y: 0, z: 0, q: { x: 0, y: 0, z: 0, w: 1 } };
  }

  /** Pose of "player", "horse", "truck" or "car", blended `alpha` of the way from the previous step. */
  pose(name: string, alpha: number): Pose {
    const now = this.rawPose(name);
    const before = this.prev.get(name);
    if (!before) return now;
    return { x: before.x + (now.x - before.x) * alpha, y: before.y + (now.y - before.y) * alpha, z: before.z + (now.z - before.z) * alpha, q: slerp(before.q, now.q, alpha) };
  }

  /** Is the camera's view from `from` to `to` blocked by solid world? Returns the free distance. */
  cameraRay(from: Vec3, to: Vec3): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return len;
    const ray = new this.R.Ray(from, { x: dx / len, y: dy / len, z: dz / len });
    const hit = this.world.castRay(ray, len, true, undefined, groups(LAYER.PLAYER, LAYER.STATIC | LAYER.BREAKABLE));
    return hit ? hit.timeOfImpact : len;
  }
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    const r = { x: a.x + (bx - a.x) * t, y: a.y + (by - a.y) * t, z: a.z + (bz - a.z) * t, w: a.w + (bw - a.w) * t };
    const n = Math.hypot(r.x, r.y, r.z, r.w);
    return { x: r.x / n, y: r.y / n, z: r.z / n, w: r.w / n };
  }
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return { x: a.x * ka + bx * kb, y: a.y * ka + by * kb, z: a.z * ka + bz * kb, w: a.w * ka + bw * kb };
}
