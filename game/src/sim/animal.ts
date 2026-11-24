import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { approach, clamp, damp, quatFromHeading } from "./math";

export type AnimalId = "horse" | "elephant";

/** How a rideable animal moves. Speeds in m/s, turn rates in rad/s. */
export interface AnimalSpec {
  id: AnimalId;
  name: string;
  radius: number;
  halfHeight: number;
  walk: number;
  trot: number;
  gallop: number;
  accel: number;
  brake: number;
  turn: number;
  /** 0 = can't jump. */
  jumpSpeed: number;
  gravity: number;
  mass: number;
  /** Pushes over trees, posts and frames it walks into above this speed (Infinity = never). */
  breaksAt: number;
}

export const ANIMALS: Record<AnimalId, AnimalSpec> = {
  horse: { id: "horse", name: "Biscuit", radius: 0.62, halfHeight: 0.45, walk: 2.2, trot: 8, gallop: 15, accel: 9, brake: 14, turn: 2.6, jumpSpeed: 7.2, gravity: 22, mass: 500, breaksAt: Infinity },
  elephant: { id: "elephant", name: "Peanut", radius: 1.35, halfHeight: 0.55, walk: 1.6, trot: 4.2, gallop: 7.5, accel: 3, brake: 6, turn: 1.3, jumpSpeed: 0, gravity: 22, mass: 4000, breaksAt: 3 },
};

/**
 * A rideable animal, steered like an animal rather than a vehicle: W asks for
 * more pace (walk, trot, then gallop with Shift), A/D turn, S slows. It keeps
 * its momentum and turns wider the faster it goes. Moved by its own character
 * controller; Peanut the elephant also shoves trees over.
 */
export class AnimalController {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  x: number;
  y = 0;
  z: number;
  heading: number;
  speed = 0;
  vy = 0;
  grounded = true;
  idle = 0;
  /** Breakable colliders walked into this step. */
  readonly hits: Collider[] = [];
  private readonly filter: number;

  constructor(
    private readonly R: Rapier,
    world: World,
    readonly spec: AnimalSpec,
    x: number,
    z: number,
    heading: number,
    groundY = 0,
  ) {
    this.x = x;
    this.z = z;
    this.y = groundY;
    this.heading = heading;
    const centre = spec.halfHeight + spec.radius;
    // Animals that knock things over wade through the wreckage instead of getting stuck on it.
    this.filter = LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.PLAYER | (spec.breaksAt === Infinity ? LAYER.DEBRIS : 0);
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, groundY + centre, z));
    this.collider = world.createCollider(R.ColliderDesc.capsule(spec.halfHeight, spec.radius).setCollisionGroups(groups(LAYER.ANIMAL, this.filter)), this.body);
    this.kcc = world.createCharacterController(0.04);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(0.6, 0.2, false);
    this.kcc.enableSnapToGround(0.6);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(spec.mass);
  }

  private get centre() {
    return this.spec.halfHeight + this.spec.radius;
  }

  place(x: number, z: number, heading = this.heading, y = 0) {
    this.x = x;
    this.z = z;
    this.y = y;
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
    this.body.setTranslation({ x, y: y + this.centre, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + this.centre, z });
  }

  step(dt: number, input: { forward: number; side: number; sprint: boolean; jump: boolean } | null) {
    const S = this.spec;
    this.hits.length = 0;
    const fwd = input ? clamp(input.forward, -1, 1) : 0;
    const side = input ? clamp(input.side, -1, 1) : 0;
    this.idle = fwd === 0 && side === 0 ? this.idle + dt : 0;
    const want = fwd > 0 ? (input?.sprint ? S.gallop : S.trot) * fwd : fwd < 0 ? -S.walk * 0.6 : 0;
    this.speed = approach(this.speed, want, (Math.abs(want) < Math.abs(this.speed) ? S.brake : S.accel) * dt);
    const turn = S.turn * (1 - 0.55 * clamp(Math.abs(this.speed) / S.gallop, 0, 1));
    this.heading += side * turn * dt;

    if (this.grounded && input?.jump && S.jumpSpeed > 0 && this.speed > 2) {
      this.vy = S.jumpSpeed;
      this.grounded = false;
    }
    this.vy = this.grounded ? -2 : Math.max(-30, this.vy - S.gravity * dt);

    const desired = { x: Math.cos(this.heading) * this.speed * dt, y: this.vy * dt, z: Math.sin(this.heading) * this.speed * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(LAYER.ANIMAL, this.filter));
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded() && this.vy <= 0.01;
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const c = this.kcc.computedCollision(i);
      if (c?.collider) this.hits.push(c.collider);
    }
    const planned = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(m.x, m.z);
    if (planned > 1e-3 && got < planned * 0.5) this.speed *= 1 - damp(10, dt);
    if (this.grounded) this.vy = 0;
    this.x += m.x;
    this.y += m.y;
    this.z += m.z;
    if (this.y < -20) this.place(this.x, this.z, this.heading, 2);
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + this.centre, z: this.z });
    this.body.setNextKinematicRotation(quatFromHeading(this.heading));
  }
}
