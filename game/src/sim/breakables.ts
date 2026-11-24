import type { Collider, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { Box } from "../world/map";
import { groups, LAYER, type Rapier } from "./rapier";
import type { Vec3 } from "./math";

/** A tree's physical size, from its variant and scale (matches how it is drawn). */
export function treeShape(variant: TreeVariant, scale: number) {
  if (variant === 3) return { height: 7.4, trunkRadius: 0.11, trunkHeight: 7.4, canopyRadius: 0, canopyY: 7 };
  const height = (variant === 1 ? 9.5 : variant === 2 ? 6.5 : 7.5) * scale;
  const trunkRadius = (variant === 1 ? 0.2 : 0.17) * scale + 0.08;
  const trunkHeight = height * (variant === 1 ? 0.3 : 0.45);
  const canopyRadius = (variant === 1 ? 1.9 : variant === 2 ? 2.4 : 2.2) * scale;
  const canopyY = variant === 1 ? height * 0.5 : trunkHeight + canopyRadius * 0.75;
  return { height, trunkRadius, trunkHeight, canopyRadius, canopyY };
}

/** 0–2: kinds of tree; 3: a street light pole (same physics: stands until hit, falls, comes back). */
export type TreeVariant = 0 | 1 | 2 | 3;

export interface TreeInput {
  position: [number, number];
  scale: number;
  variant: TreeVariant;
  /** Ground height at the foot (trees on the hills); 0 in town. */
  y?: number;
}

export type TreeStatus = "standing" | "fallen";

export interface TreeBody {
  index: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  variant: TreeVariant;
  body: RigidBody;
  colliders: Collider[];
  status: TreeStatus;
  /** Seconds since it was knocked down. */
  timer: number;
}

export interface Plank {
  body: RigidBody;
  /** Half extents. */
  half: [number, number, number];
}

export interface FrameBody {
  lotId: string;
  box: Box;
  body: RigidBody;
  wall: Collider;
  broken: boolean;
  timer: number;
  planks: Plank[];
}

export type BreakEvent =
  | { kind: "tree-down"; index: number; x: number; z: number; speed: number }
  | { kind: "tree-back"; index: number }
  | { kind: "frame-down"; lotId: string; x: number; z: number; speed: number }
  | { kind: "frame-back"; lotId: string };

/** How hard you have to hit things to knock them over (m/s ≈ ×3.6 for km/h). */
export const BREAK_SPEED = { tree: 7, frame: 6, pole: 4 };
/** Seconds before a crew stands a tree back up or re-frames a house (if you're not watching). */
export const RESPAWN = { tree: 30, frame: 40, force: 120, awayFrom: 35 };

const STUD_SPACING = 1.25;
const STUD_HALF: [number, number, number] = [0.045, 1.35, 0.07];
const PLATE_HALF_LEN = 1.5;
const MAX_PLANKS_PER_FRAME = 72;

/**
 * Things that break: every tree, and the wood frames of houses at the framing
 * stage. They stand as fixed bodies until something heavy hits them fast enough;
 * then trees become dynamic and topple, frames collapse into loose planks. Both
 * come back after a while (out of sight, if possible).
 */
export class Breakables {
  readonly trees: TreeBody[] = [];
  frames = new Map<string, FrameBody>();
  /** Collider handle → what it belongs to. */
  private readonly owner = new Map<number, { kind: "tree"; index: number } | { kind: "frame"; lotId: string }>();
  readonly events: BreakEvent[] = [];
  /** Tree indices whose transform changed since the renderer last looked. */
  readonly dirtyTrees = new Set<number>();

  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    trees: TreeInput[],
  ) {
    trees.forEach((t, index) => {
      const s = treeShape(t.variant, t.scale);
      const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(t.position[0], t.y ?? 0, t.position[1]).setCcdEnabled(true));
      const g = groups(LAYER.BREAKABLE);
      const trunk = world.createCollider(
        R.ColliderDesc.cylinder(s.trunkHeight / 2, s.trunkRadius)
          .setTranslation(0, s.trunkHeight / 2, 0)
          .setDensity(650)
          .setCollisionGroups(g)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      const colliders = [trunk];
      if (t.variant !== 3) {
        colliders.push(
          world.createCollider(
            R.ColliderDesc.ball(s.canopyRadius * 0.8)
              .setTranslation(0, s.canopyY, 0)
              .setDensity(18)
              .setFriction(0.9)
              .setCollisionGroups(g)
              .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
            body,
          ),
        );
      }
      const tree: TreeBody = { index, x: t.position[0], y: t.y ?? 0, z: t.position[1], scale: t.scale, variant: t.variant, body, colliders, status: "standing", timer: 0 };
      this.trees.push(tree);
      for (const c of colliders) this.owner.set(c.handle, { kind: "tree", index });
    });
  }

  /** Which breakable (if any) a collider belongs to. */
  ownerOf(c: Collider) {
    return this.owner.get(c.handle) ?? null;
  }

  /** Keeps one breakable frame per framing-stage lot (called when construction stages change). */
  setFrames(boxes: Box[]) {
    const want = new Map(boxes.filter((b) => b.kind === "frame" && b.id).map((b) => [b.id as string, b]));
    for (const [lotId, f] of this.frames) {
      if (want.has(lotId)) continue;
      this.clearPlanks(f);
      this.owner.delete(f.wall.handle);
      this.world.removeRigidBody(f.body);
      this.frames.delete(lotId);
    }
    for (const [lotId, box] of want) {
      if (this.frames.has(lotId)) continue;
      const cx = (box.x0 + box.x1) / 2;
      const cz = (box.z0 + box.z1) / 2;
      const hx = (box.x1 - box.x0) / 2;
      const hz = (box.z1 - box.z0) / 2;
      const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(cx, 0, cz));
      // The floor deck stays put when the walls come down.
      this.world.createCollider(this.R.ColliderDesc.cuboid(hx, 0.15, hz).setTranslation(0, 0.15, 0).setCollisionGroups(groups(LAYER.STATIC)), body);
      const wall = this.world.createCollider(
        this.R.ColliderDesc.cuboid(hx, box.h / 2, hz)
          .setTranslation(0, box.h / 2, 0)
          .setCollisionGroups(groups(LAYER.BREAKABLE))
          .setActiveEvents(this.R.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      this.frames.set(lotId, { lotId, box, body, wall, broken: false, timer: 0, planks: [] });
      this.owner.set(wall.handle, { kind: "frame", lotId });
    }
  }

  /** Knocks a tree over in direction `dir` (unit, horizontal) from an impact at `speed` m/s. */
  breakTree(index: number, dir: Vec3, speed: number) {
    const t = this.trees[index];
    if (!t || t.status !== "standing") return false;
    const s = treeShape(t.variant, t.scale);
    t.status = "fallen";
    t.timer = 0;
    t.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    t.body.setLinearDamping(0.3);
    t.body.setAngularDamping(0.6);
    for (const c of t.colliders) c.setCollisionGroups(groups(LAYER.DEBRIS));
    // Tip it over the way you hit it: spin about the horizontal axis across the hit direction.
    // (Set velocities directly: they don't depend on the mass Rapier recomputes next step.)
    const hit = Math.min(speed, 25);
    const spin = (hit / Math.max(2, s.canopyY)) * 0.55;
    t.body.setAngvel({ x: dir.z * spin, y: (Math.random() - 0.5) * 0.3, z: -dir.x * spin }, true);
    t.body.setLinvel({ x: dir.x * hit * 0.22, y: 0.6, z: dir.z * hit * 0.22 }, true);
    this.dirtyTrees.add(index);
    this.events.push({ kind: "tree-down", index, x: t.x, z: t.z, speed });
    return true;
  }

  /** Collapses a house frame into loose studs and plates. */
  breakFrame(lotId: string, from: Vec3, dir: Vec3, speed: number) {
    const f = this.frames.get(lotId);
    if (!f || f.broken) return false;
    f.broken = true;
    f.timer = 0;
    f.wall.setEnabled(false);
    const { x0, z0, x1, z1 } = f.box;
    const storeys = Math.max(1, Math.round((f.box.h - 3) / 2.9));
    const spots: { x: number; z: number; y: number; half: [number, number, number]; rotY: number }[] = [];
    for (let lv = 0; lv < Math.min(storeys, 2); lv++) {
      const y = 0.3 + lv * 2.9 + STUD_HALF[1];
      for (let x = x0 + 0.2; x <= x1 - 0.2; x += STUD_SPACING) {
        spots.push({ x, z: z0 + 0.15, y, half: STUD_HALF, rotY: 0 }, { x, z: z1 - 0.15, y, half: STUD_HALF, rotY: 0 });
      }
      for (let z = z0 + STUD_SPACING; z <= z1 - STUD_SPACING; z += STUD_SPACING) {
        spots.push({ x: x0 + 0.15, z, y, half: STUD_HALF, rotY: 0 }, { x: x1 - 0.15, z, y, half: STUD_HALF, rotY: 0 });
      }
      // Top plates, in 3 m lengths
      const py = 0.3 + lv * 2.9 + STUD_HALF[1] * 2 + 0.06;
      for (let x = x0 + PLATE_HALF_LEN; x <= x1 - PLATE_HALF_LEN + 0.01; x += PLATE_HALF_LEN * 2) {
        spots.push({ x, z: z0 + 0.15, y: py, half: [PLATE_HALF_LEN, 0.05, 0.07], rotY: 0 }, { x, z: z1 - 0.15, y: py, half: [PLATE_HALF_LEN, 0.05, 0.07], rotY: 0 });
      }
    }
    // Keep the nearest pieces to the impact, and never spawn a plank inside the vehicle.
    spots.sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    for (const sp of spots) {
      if (f.planks.length >= MAX_PLANKS_PER_FRAME) break;
      if (Math.hypot(sp.x - from.x, sp.z - from.z) < 2.2) continue;
      const body = this.world.createRigidBody(
        this.R.RigidBodyDesc.dynamic()
          .setTranslation(sp.x, sp.y, sp.z)
          .setRotation({ x: 0, y: Math.sin(sp.rotY / 2), z: 0, w: Math.cos(sp.rotY / 2) })
          .setLinearDamping(0.2)
          .setAngularDamping(0.4)
          .setCanSleep(true),
      );
      this.world.createCollider(this.R.ColliderDesc.cuboid(...sp.half).setDensity(480).setFriction(0.7).setCollisionGroups(groups(LAYER.DEBRIS)), body);
      // The closer to the hit, the harder it flies.
      const d = Math.hypot(sp.x - from.x, sp.z - from.z);
      const k = Math.max(0, 1 - d / 9) * Math.min(speed, 22) * 0.6 + 0.4;
      body.setLinvel({ x: dir.x * k + (Math.random() - 0.5) * 0.6, y: (0.6 + Math.random() * 0.8) * (k > 1 ? 1.4 : 0.3), z: dir.z * k + (Math.random() - 0.5) * 0.6 }, true);
      body.setAngvel({ x: (Math.random() - 0.5) * 3 + dir.z * k * 0.6, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 3 - dir.x * k * 0.6 }, true);
      f.planks.push({ body, half: sp.half });
    }
    this.events.push({ kind: "frame-down", lotId, x: from.x, z: from.z, speed });
    return true;
  }

  private clearPlanks(f: FrameBody) {
    for (const p of f.planks) this.world.removeRigidBody(p.body);
    f.planks = [];
  }

  /** All loose planks, for drawing. */
  *planks(): Generator<Plank> {
    for (const f of this.frames.values()) yield* f.planks;
  }

  /** Timers: the crew tidies up when you've moved on. */
  update(dt: number, player: { x: number; z: number }) {
    for (const t of this.trees) {
      if (t.status === "standing") continue;
      t.timer += dt;
      if (!t.body.isSleeping()) this.dirtyTrees.add(t.index);
      const away = Math.hypot(t.x - player.x, t.z - player.z) > RESPAWN.awayFrom;
      if ((t.timer > RESPAWN.tree && away) || t.timer > RESPAWN.force) this.standUp(t);
    }
    for (const f of this.frames.values()) {
      if (!f.broken) continue;
      f.timer += dt;
      const cx = (f.box.x0 + f.box.x1) / 2;
      const cz = (f.box.z0 + f.box.z1) / 2;
      const away = Math.hypot(cx - player.x, cz - player.z) > RESPAWN.awayFrom;
      if ((f.timer > RESPAWN.frame && away) || f.timer > RESPAWN.force) {
        this.clearPlanks(f);
        f.broken = false;
        f.wall.setEnabled(true);
        this.events.push({ kind: "frame-back", lotId: f.lotId });
      }
    }
  }

  private standUp(t: TreeBody) {
    t.body.setBodyType(this.R.RigidBodyType.Fixed, true);
    t.body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
    t.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    for (const c of t.colliders) c.setCollisionGroups(groups(LAYER.BREAKABLE));
    t.status = "standing";
    t.timer = 0;
    this.dirtyTrees.add(t.index);
    this.events.push({ kind: "tree-back", index: t.index });
  }
}
