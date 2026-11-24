import type { Collider, EventQueue, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { StageId } from "@/lib/models/construction";
import { collisionBoxes, FLAT_GROUND_HALF, LANDMARKS, ROAD, TOWER, TRAFFIC_LOOPS, WALK_LOOPS, type Box } from "../world/map";
import { PLAY_HALF, TERRAIN_STEP, terrainHeight } from "../world/terrain";
import { AnimalController, ANIMALS, type AnimalId } from "./animal";
import { Breakables, BREAK_SPEED, type BreakEvent, type TreeInput } from "./breakables";
import { CharacterController, JETPACK, NO_INTENT, type MoveIntent } from "./character";
import { HelicopterController } from "./helicopter";
import { quatFromHeading, rotate, type Quat, type Vec3 } from "./math";
import { groups, LAYER, loadRapier, type Rapier } from "./rapier";
import { Town, type Obstacle } from "./town";
import { PARKED, VEHICLES, VehicleController, type VehicleId } from "./vehicle";

/** Who the player is controlling right now. */
export type Control = { kind: "foot" } | { kind: "vehicle"; id: VehicleId } | { kind: "animal"; id: AnimalId } | { kind: "heli" };

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

/** What the camera, HUD and story follow: the player, or what they're driving, riding or flying. */
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

/** Something you can get in or on. */
export type Ride = { kind: "vehicle"; id: VehicleId } | { kind: "animal"; id: AnimalId } | { kind: "heli" };

export interface SimOptions {
  stages: Record<string, StageId>;
  trees: TreeInput[];
  spawn: { position: [number, number]; heading: number };
  /** Traffic and pedestrians (off in most unit tests). */
  town?: boolean;
}

/**
 * The whole physical world, independent of rendering: terrain and static
 * colliders built from the map, the player's character, vehicles, animals and
 * the helicopter (separate bodies that stay where you leave them), everything
 * breakable, and the town's traffic and pedestrians. It runs at a fixed 60 Hz
 * and exposes interpolated poses for drawing.
 */
export class Simulation {
  readonly player: CharacterController;
  readonly vehicles: Partial<Record<VehicleId, VehicleController>> = {};
  readonly animals: Partial<Record<AnimalId, AnimalController>> = {};
  heli: HelicopterController | null = null;
  readonly breakables: Breakables;
  readonly town: Town | null;
  control: Control = { kind: "foot" };
  readonly events: SimEvent[] = [];
  time = 0;

  readonly world: World;
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

    // Flat community slab, and the hills as a heightfield matching what's drawn.
    add(R.ColliderDesc.cuboid(FLAT_GROUND_HALF, 0.5, FLAT_GROUND_HALF).setTranslation(0, -0.5, 0).setFriction(1));
    const n = Math.round((PLAY_HALF * 2) / TERRAIN_STEP);
    const heights = new Float32Array((n + 1) * (n + 1));
    // Rapier's heightfield: rows run along z, columns along x, stored column by column.
    for (let c = 0; c <= n; c++) for (let r = 0; r <= n; r++) heights[r + c * (n + 1)] = terrainHeight(-PLAY_HALF + c * TERRAIN_STEP, -PLAY_HALF + r * TERRAIN_STEP);
    this.world.createCollider(R.ColliderDesc.heightfield(n, n, heights, { x: PLAY_HALF * 2, y: 1, z: PLAY_HALF * 2 }).setCollisionGroups(g).setFriction(1), this.staticBody);
    // Invisible walls at the edge of the playable land.
    const H = PLAY_HALF - 4;
    for (const [x, z, hx, hz] of [
      [H + 1, 0, 1, H + 2],
      [-H - 1, 0, 1, H + 2],
      [0, H + 1, H + 2, 1],
      [0, -H - 1, H + 2, 1],
    ])
      add(R.ColliderDesc.cuboid(hx, 200, hz).setTranslation(x, 100, z));
    // The water tank: a drum you can land on (its deck) and stand under.
    const [tx, tz] = LANDMARKS.tower.position;
    const tankHalf = (TOWER.deckY - TOWER.tankBottom) / 2;
    add(R.ColliderDesc.cylinder(tankHalf, TOWER.tankRadius).setTranslation(tx, TOWER.tankBottom + tankHalf, tz));

    this.breakables = new Breakables(R, this.world, opts.trees);
    this.setStages(opts.stages);

    const [sx, sz] = opts.spawn.position;
    this.player = new CharacterController(R, this.world, sx, sz, opts.spawn.heading);
    this.town = opts.town ? new Town(R, this.world, TRAFFIC_LOOPS, WALK_LOOPS, { carsPerLoop: [3, 3, 2, 5, 2], walkersPerLoop: 3, laneOffset: ROAD.width / 4 }) : null;
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
    const hx = (b.x1 - b.x0) / 2;
    const hz = (b.z1 - b.z0) / 2;
    return this.world.createCollider(
      this.R.ColliderDesc.cuboid(hx, b.h / 2, hz)
        .setTranslation(b.x0 + hx, (b.y ?? 0) + b.h / 2, b.z0 + hz)
        .setCollisionGroups(groups(LAYER.STATIC)),
      this.staticBody,
    );
  }

  // ── Spawning ──────────────────────────────────────────────────────────

  spawnVehicle(id: VehicleId, x: number, z: number, heading: number) {
    let v = this.vehicles[id];
    if (!v) {
      v = new VehicleController(this.R, this.world, VEHICLES[id], x, z, heading);
      this.vehicles[id] = v;
      this.vehicleByCollider.set(v.collider.handle, id);
    }
    v.place(x, z, heading, terrainHeight(x, z));
    this.snapshot();
    return v;
  }

  spawnAnimal(id: AnimalId, x: number, z: number, heading: number) {
    let a = this.animals[id];
    if (!a) {
      a = new AnimalController(this.R, this.world, ANIMALS[id], x, z, heading, terrainHeight(x, z));
      this.animals[id] = a;
    } else a.place(x, z, heading, terrainHeight(x, z));
    this.snapshot();
    return a;
  }

  spawnHeli(x: number, z: number, heading: number) {
    if (!this.heli) this.heli = new HelicopterController(this.R, this.world, x, z, heading, terrainHeight(x, z));
    else this.heli.place(x, z, heading, terrainHeight(x, z));
    this.snapshot();
    return this.heli;
  }

  /** Kept for older callers: the horse is just an animal. */
  get horse() {
    return this.animals.horse ?? null;
  }

  // ── Getting in and out ────────────────────────────────────────────────

  /** The closest thing you could get in or on, within reach (and allowed by `can`). */
  nearestRide(can: (r: Ride) => boolean = () => true): (Ride & { distance: number }) | null {
    if (this.control.kind !== "foot") return null;
    const p = this.player;
    let best: (Ride & { distance: number }) | null = null;
    const consider = (r: Ride, d: number) => {
      if (d < BOARD_RANGE - 1.5 && (!best || d < best.distance) && can(r)) best = { ...r, distance: d };
    };
    for (const [id, v] of Object.entries(this.vehicles) as [VehicleId, VehicleController][]) {
      const t = v.position;
      const q = v.rotation;
      const local = rotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, { x: p.x - t.x, y: 0, z: p.z - t.z });
      const [hx, , hz] = v.spec.half;
      consider({ kind: "vehicle", id }, Math.hypot(Math.max(0, Math.abs(local.x) - hx), Math.max(0, Math.abs(local.z) - hz)));
    }
    // Big animals are climbed from a little further away (Peanut kneels for you).
    for (const [id, a] of Object.entries(this.animals) as [AnimalId, AnimalController][]) consider({ kind: "animal", id }, Math.hypot(a.x - p.x, a.z - p.z) - a.spec.radius * 1.6 - 0.4);
    if (this.heli) consider({ kind: "heli" }, Math.hypot(this.heli.x - p.x, this.heli.z - p.z) - 2);
    return best;
  }

  /** Gets in or on something. */
  board(r: Ride) {
    if (this.control.kind !== "foot") return false;
    if (r.kind === "vehicle" && !this.vehicles[r.id]) return false;
    if (r.kind === "animal" && !this.animals[r.id]) return false;
    if (r.kind === "heli" && !this.heli) return false;
    this.player.jetpack = false;
    this.player.setActive(false);
    this.control = r.kind === "vehicle" ? { kind: "vehicle", id: r.id } : r.kind === "animal" ? { kind: "animal", id: r.id } : { kind: "heli" };
    return true;
  }

  enterVehicle(id: VehicleId) {
    return this.board({ kind: "vehicle", id });
  }

  mountHorse() {
    return this.board({ kind: "animal", id: "horse" });
  }

  /** Gets out at the driver's door (or the nearest free side). */
  exit() {
    const c = this.control;
    if (c.kind === "foot") return false;
    let origin: Vec3;
    let heading: number;
    let sides: Vec3[];
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
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
      const body = c.kind === "animal" ? this.animals[c.id]! : this.heli!;
      origin = { x: body.x, y: body.y, z: body.z };
      heading = body.heading;
      if (c.kind === "animal") (body as AnimalController).speed = 0;
      const out = c.kind === "animal" ? (body as AnimalController).spec.radius + 1.1 : 2.8;
      const l = { x: Math.sin(heading) * out, y: 0, z: -Math.cos(heading) * out };
      sides = [l, { x: -l.x, y: 0, z: -l.z }, { x: -Math.cos(heading) * (out + 1.5), y: 0, z: -Math.sin(heading) * (out + 1.5) }];
    }
    const spot = sides.map((o) => ({ x: origin.x + o.x, z: origin.z + o.z })).find((s) => this.isFree(s.x, s.z)) ?? { x: origin.x, z: origin.z };
    const ground = terrainHeight(spot.x, spot.z);
    const y = this.isFree(spot.x, spot.z) ? Math.max(ground, c.kind === "heli" ? origin.y : ground) : origin.y + 2.6;
    this.player.setActive(true);
    this.player.place(spot.x, spot.z, y, heading);
    this.control = { kind: "foot" };
    this.snapshot();
    return true;
  }

  /** Is there room to stand at (x, z)? */
  isFree(x: number, z: number) {
    let hit = false;
    this.world.intersectionsWithShape(
      { x, y: terrainHeight(x, z) + 0.95, z },
      { x: 0, y: 0, z: 0, w: 1 },
      new this.R.Capsule(0.55, 0.36),
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

  /** Brings something you own to the player: a few metres to their side, on free ground. */
  call(kind: VehicleId | AnimalId | "heli") {
    const f = this.focus();
    const right = { x: -Math.sin(f.heading), z: Math.cos(f.heading) };
    const back = { x: -Math.cos(f.heading), z: -Math.sin(f.heading) };
    const far = kind === "heli" ? 2 : 1;
    const tries = [
      [right.x * 5 * far, right.z * 5 * far],
      [-right.x * 5 * far, -right.z * 5 * far],
      [back.x * 7 * far, back.z * 7 * far],
      [right.x * 9 * far, right.z * 9 * far],
      [-right.x * 9 * far, -right.z * 9 * far],
    ];
    const spot = tries.map(([dx, dz]) => ({ x: f.x + dx, z: f.z + dz })).find((s) => this.isFreeWide(s.x, s.z, kind === "heli" ? 4 : 2.9)) ?? { x: f.x + back.x * 8 * far, z: f.z + back.z * 8 * far };
    if (kind === "heli") this.spawnHeli(spot.x, spot.z, f.heading);
    else if (kind === "horse" || kind === "elephant") this.spawnAnimal(kind, spot.x, spot.z, f.heading);
    else this.spawnVehicle(kind, spot.x, spot.z, f.heading);
  }

  private isFreeWide(x: number, z: number, half: number) {
    let hit = false;
    this.world.intersectionsWithShape(
      { x, y: terrainHeight(x, z) + 1.3, z },
      quatFromHeading(0),
      new this.R.Cuboid(half, 1, half * 0.5),
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(LAYER.PLAYER, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL),
    );
    return !hit && Math.abs(x) < PLAY_HALF - 10 && Math.abs(z) < PLAY_HALF - 10;
  }

  /** Moves whatever the player controls (for tests, respawns and story beats). y is height above the ground. */
  teleport(x: number, z: number, y = 0, heading?: number) {
    const c = this.control;
    const ground = terrainHeight(x, z);
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      v.place(x, z, heading ?? v.heading, ground);
      if (y > 0) v.body.setTranslation({ x, y: ground + y + 1, z }, true);
    } else if (c.kind === "animal") this.animals[c.id]!.place(x, z, heading, ground + y);
    else if (c.kind === "heli") this.heli!.place(x, z, heading, ground + y);
    else this.player.place(x, z, ground + y, heading);
    this.snapshot();
  }

  // ── Stepping ──────────────────────────────────────────────────────────

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

    for (const [id, v] of Object.entries(this.vehicles) as [VehicleId, VehicleController][]) {
      const driving = c.kind === "vehicle" && c.id === id;
      v.step(dt, driving ? { throttle: input.forward, steer: input.side, handbrake: input.handbrake } : PARKED);
    }
    for (const [id, a] of Object.entries(this.animals) as [AnimalId, AnimalController][]) a.step(dt, c.kind === "animal" && c.id === id ? input : null);
    if (this.heli) this.heli.step(dt, c.kind === "heli" ? { forward: input.forward, side: input.side, up: input.jumpHeld, down: input.sprint } : null);
    if (c.kind === "foot") this.player.step(dt, input);
    else this.syncRider();

    if (this.town) this.town.step(dt, this.obstacles());

    this.world.step(this.queue);
    this.time += dt;

    // Impacts: a fast vehicle knocks over trees and street lights, flattens frames, and keeps most of its speed.
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
      if (owner?.kind === "tree") {
        const pole = this.breakables.trees[owner.index]?.variant === 3;
        if (speed >= (pole ? BREAK_SPEED.pole : BREAK_SPEED.tree) && this.breakables.breakTree(owner.index, dir, speed)) v.body.setLinvel({ x: pv.x * (pole ? 0.92 : 0.8), y: pv.y, z: pv.z * (pole ? 0.92 : 0.8) }, true);
      } else if (owner?.kind === "frame" && speed >= BREAK_SPEED.frame) {
        if (this.breakables.breakFrame(owner.lotId, v.position, dir, speed)) v.body.setLinvel({ x: pv.x * 0.7, y: pv.y, z: pv.z * 0.7 }, true);
      } else if (!owner && speed > 9 && (other.collisionGroups() >>> 16) & LAYER.STATIC) {
        this.events.push({ kind: "crash", id: vid, speed });
      }
    });

    // Bodies moved by character controllers break things they run into: a fast jetpack pilot,
    // a helicopter, or Peanut the elephant leaning on a tree.
    const smash = (hits: Collider[], speed: number, threshold: number, dir: Vec3, at: Vec3) => {
      if (speed < threshold) return;
      for (const h of hits) {
        const owner = this.breakables.ownerOf(h);
        if (owner?.kind === "tree") this.breakables.breakTree(owner.index, dir, Math.max(speed, 8));
        else if (owner?.kind === "frame") this.breakables.breakFrame(owner.lotId, at, dir, Math.max(speed, 8));
      }
    };
    if (c.kind === "foot") {
      const p = this.player;
      const sp = Math.hypot(p.vel.x, p.vel.z) || 1;
      smash(
        p.hits.map((h) => h.collider),
        Math.hypot(p.vel.x, p.vel.y, p.vel.z),
        10,
        { x: p.vel.x / sp, y: 0, z: p.vel.z / sp },
        { x: p.x, y: p.y, z: p.z },
      );
      if (p.landedHard) this.events.push({ kind: "landed-hard", x: p.x, z: p.z, speed: p.landedHard });
    } else if (c.kind === "animal") {
      const a = this.animals[c.id]!;
      smash(a.hits, Math.abs(a.speed), a.spec.breaksAt, { x: Math.cos(a.heading), y: 0, z: Math.sin(a.heading) }, { x: a.x, y: a.y, z: a.z });
    } else if (c.kind === "heli" && this.heli) {
      const h = this.heli;
      smash(h.hits, h.preSpeed, 8, { x: Math.cos(h.heading), y: 0, z: Math.sin(h.heading) }, { x: h.x, y: h.y, z: h.z });
    }

    const f = this.focus();
    this.breakables.update(dt, f);
    this.events.push(...this.breakables.events.splice(0));
  }

  /** Things traffic waits for and pedestrians step around: the player and anything nobody is riding. */
  private obstacles(): Obstacle[] {
    const f = this.focus();
    const out: Obstacle[] = [{ x: f.x, z: f.z, radius: this.control.kind === "foot" ? 0.6 : 2.5, speed: Math.abs(f.speed) }];
    for (const v of Object.values(this.vehicles)) if (v) out.push({ x: v.position.x, z: v.position.z, radius: 2.4, speed: Math.abs(v.speed) });
    return out;
  }

  private syncRider() {
    const c = this.control;
    const p = this.player;
    let src: { x: number; y: number; z: number; heading: number } | null = null;
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      const t = v.position;
      src = { x: t.x, y: Math.max(0, t.y - 1), z: t.z, heading: v.heading };
    } else if (c.kind === "animal") src = this.animals[c.id]!;
    else if (c.kind === "heli" && this.heli) src = this.heli;
    if (src) {
      p.x = src.x;
      p.y = src.y;
      p.z = src.z;
      p.heading = src.heading;
    }
    p.vel = { x: 0, y: 0, z: 0 };
    p.body.setNextKinematicTranslation({ x: p.x, y: -50, z: p.z });
  }

  focus(): Focus {
    const c = this.control;
    const p = this.player;
    const base = { fuel: 0, fuelMax: 0, thrusting: false, control: c };
    if (c.kind === "vehicle") {
      const v = this.vehicles[c.id]!;
      const t = v.position;
      return { ...base, x: t.x, y: t.y - v.spec.half[1] - v.spec.wheelRadius, z: t.z, heading: v.heading, speed: v.speed, vy: v.body.linvel().y, grounded: true };
    }
    if (c.kind === "animal") {
      const a = this.animals[c.id]!;
      return { ...base, x: a.x, y: a.y, z: a.z, heading: a.heading, speed: a.speed, vy: a.vy, grounded: a.grounded };
    }
    if (c.kind === "heli" && this.heli) {
      const h = this.heli;
      return { ...base, x: h.x, y: h.y, z: h.z, heading: h.heading, speed: h.speed, vy: h.vel.y, grounded: h.grounded };
    }
    return { x: p.x, y: p.y, z: p.z, heading: p.heading, speed: p.speed, vy: p.vel.y, grounded: p.grounded, fuel: p.jetpack ? p.fuel : 0, fuelMax: p.jetpack ? JETPACK.fuel : 0, thrusting: p.thrusting, control: c };
  }

  // ── Interpolated poses for drawing ────────────────────────────────────

  private snapshot() {
    this.prev.set("player", this.rawPose("player"));
    for (const id of Object.keys(this.animals)) this.prev.set(id, this.rawPose(id));
    for (const id of Object.keys(this.vehicles)) this.prev.set(id, this.rawPose(id));
    if (this.heli) this.prev.set("heli", this.rawPose("heli"));
  }

  private rawPose(name: string): Pose {
    if (name === "player") return { x: this.player.x, y: this.player.y, z: this.player.z, q: quatFromHeading(this.player.heading) };
    if (name === "heli" && this.heli) return { x: this.heli.x, y: this.heli.y, z: this.heli.z, q: quatFromHeading(this.heli.heading) };
    const a = this.animals[name as AnimalId];
    if (a) return { x: a.x, y: a.y, z: a.z, q: quatFromHeading(a.heading) };
    const v = this.vehicles[name as VehicleId];
    if (v) {
      const t = v.position;
      return { x: t.x, y: t.y, z: t.z, q: { ...v.rotation } };
    }
    return { x: 0, y: 0, z: 0, q: { x: 0, y: 0, z: 0, w: 1 } };
  }

  /** Pose of "player", an animal, a vehicle or "heli", blended `alpha` of the way from the previous step. */
  pose(name: string, alpha: number): Pose {
    const now = this.rawPose(name);
    const before = this.prev.get(name);
    if (!before) return now;
    return { x: before.x + (now.x - before.x) * alpha, y: before.y + (now.y - before.y) * alpha, z: before.z + (now.z - before.z) * alpha, q: slerp(before.q, now.q, alpha) };
  }

  /** Name of what the player is controlling, for pose() and the camera. */
  focusName(): string {
    const c = this.control;
    return c.kind === "vehicle" || c.kind === "animal" ? c.id : c.kind === "heli" ? "heli" : "player";
  }

  /** Free distance from `from` toward `to` before hitting solid world (for the camera). */
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
  let bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
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
