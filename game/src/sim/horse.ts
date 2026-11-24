import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { approach, clamp, damp, quatFromHeading } from "./math";

/** Biscuit the horse: walk, trot, gallop, and jump fences. Speeds in m/s. */
export const HORSE = {
  radius: 0.62,
  halfHeight: 0.45,
  walk: 2.2,
  trot: 8,
  gallop: 15,
  accel: 9,
  brake: 14,
  /** Turn rate (rad/s) at a walk; slower at a gallop. */
  turn: 2.6,
  jumpSpeed: 7.2,
  gravity: 22,
};

const CENTRE = HORSE.halfHeight + HORSE.radius;

/**
 * Riding is steered like an animal, not a vehicle: W asks for more pace (walk,
 * trot, gallop with Shift), A/D turn, S slows. The horse keeps its momentum and
 * turns wider the faster it goes. Moved by its own character controller.
 */
export class HorseController {
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
  /** Seconds since the last time it was given an order (for idle grazing). */
  idle = 0;

  constructor(
    private readonly R: Rapier,
    world: World,
    x: number,
    z: number,
    heading: number,
  ) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, CENTRE, z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(HORSE.halfHeight, HORSE.radius).setCollisionGroups(groups(LAYER.ANIMAL, LAYER.STATIC | LAYER.BREAKABLE | LAYER.DEBRIS | LAYER.VEHICLE | LAYER.PLAYER)),
      this.body,
    );
    this.kcc = world.createCharacterController(0.04);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(0.6, 0.2, false);
    this.kcc.enableSnapToGround(0.4);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(500);
  }

  place(x: number, z: number, heading = this.heading) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.heading = heading;
    this.speed = 0;
    this.vy = 0;
    this.body.setTranslation({ x, y: CENTRE, z }, true);
    this.body.setNextKinematicTranslation({ x, y: CENTRE, z });
  }

  step(dt: number, input: { forward: number; side: number; sprint: boolean; jump: boolean } | null) {
    const fwd = input ? clamp(input.forward, -1, 1) : 0;
    const side = input ? clamp(input.side, -1, 1) : 0;
    this.idle = fwd === 0 && side === 0 ? this.idle + dt : 0;
    const want = fwd > 0 ? (input?.sprint ? HORSE.gallop : HORSE.trot) * fwd : fwd < 0 ? -HORSE.walk * 0.6 : 0;
    this.speed = approach(this.speed, want, (Math.abs(want) < Math.abs(this.speed) ? HORSE.brake : HORSE.accel) * dt);
    // Turning: tight at a walk, wide at a gallop; you can turn on the spot from a standstill.
    const turn = HORSE.turn * (1 - 0.55 * clamp(Math.abs(this.speed) / HORSE.gallop, 0, 1));
    this.heading += side * turn * dt;

    if (this.grounded && input?.jump && this.speed > 2) {
      this.vy = HORSE.jumpSpeed;
      this.grounded = false;
    }
    this.vy = this.grounded ? -2 : Math.max(-30, this.vy - HORSE.gravity * dt);

    const desired = { x: Math.cos(this.heading) * this.speed * dt, y: this.vy * dt, z: Math.sin(this.heading) * this.speed * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(LAYER.ANIMAL, LAYER.STATIC | LAYER.BREAKABLE | LAYER.DEBRIS | LAYER.VEHICLE | LAYER.PLAYER));
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded() && this.vy <= 0.01;
    // Walked into something: stop (horses don't push through walls).
    const planned = Math.hypot(desired.x, desired.z);
    const got = Math.hypot(m.x, m.z);
    if (planned > 1e-3 && got < planned * 0.5) this.speed *= 1 - damp(10, dt);
    if (this.grounded) this.vy = 0;
    this.x += m.x;
    this.y += m.y;
    this.z += m.z;
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + CENTRE, z: this.z });
    this.body.setNextKinematicRotation(quatFromHeading(this.heading));
  }
}
