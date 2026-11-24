import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { approach, clamp, damp, quatFromHeading, type Vec3 } from "./math";

/** The Skylark helicopter. Speeds in m/s, accelerations in m/s². */
export const HELI = {
  radius: 1.5,
  halfHeight: 0.35,
  /** Seconds for the rotor to spool up to flying speed. */
  spool: 2.2,
  climb: 7.5,
  descend: 6,
  vAccel: 7,
  accel: 11,
  cruise: 34,
  reverse: 9,
  drag: 0.5,
  yawRate: 1.35,
  gravity: 14,
};

export interface HeliInput {
  /** W/S: nose down (go) / nose up (back off). */
  forward: number;
  /** A/D: yaw. */
  side: number;
  /** Space: climb. */
  up: boolean;
  /** Shift: descend. */
  down: boolean;
}

/**
 * Arcade helicopter flight: spool the rotor, then Space climbs, Shift descends,
 * W/S tilt forward and back to build or bleed speed, A/D yaw. It carries its
 * momentum, banks into turns and settles on its skids when it touches down.
 * Moved by a character controller so it collides with buildings and terrain.
 */
export class HelicopterController {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  x: number;
  y: number;
  z: number;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  heading: number;
  /** 0 = stopped, 1 = flying speed. */
  rotor = 0;
  grounded = true;
  pitch = 0;
  roll = 0;
  readonly hits: Collider[] = [];
  /** Ground speed before this step's collisions (what an impact is judged on). */
  preSpeed = 0;

  constructor(
    private readonly R: Rapier,
    world: World,
    x: number,
    z: number,
    heading: number,
    groundY = 0,
  ) {
    this.x = x;
    this.y = groundY;
    this.z = z;
    this.heading = heading;
    const centre = HELI.halfHeight + HELI.radius;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, groundY + centre, z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(HELI.halfHeight, HELI.radius).setCollisionGroups(groups(LAYER.VEHICLE, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL | LAYER.PLAYER)),
      this.body,
    );
    this.kcc = world.createCharacterController(0.05);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableSnapToGround(0.3);
    this.kcc.setMaxSlopeClimbAngle((35 * Math.PI) / 180);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  place(x: number, z: number, heading = this.heading, y = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.vel = { x: 0, y: 0, z: 0 };
    const centre = HELI.halfHeight + HELI.radius;
    this.body.setTranslation({ x, y: y + centre, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + centre, z });
  }

  step(dt: number, input: HeliInput | null) {
    this.hits.length = 0;
    // Rotor spools while someone's at the controls.
    this.rotor = approach(this.rotor, input ? 1 : 0, dt / HELI.spool);
    const lift = this.rotor > 0.85;
    const fwd = input ? clamp(input.forward, -1, 1) : 0;
    const yaw = input ? clamp(input.side, -1, 1) : 0;

    if (lift) {
      const targetVy = input?.up ? HELI.climb : input?.down ? -HELI.descend : 0;
      this.vel.y = approach(this.vel.y, targetVy, HELI.vAccel * dt);
      if (!this.grounded || fwd !== 0) {
        this.heading += yaw * HELI.yawRate * dt;
        const ax = Math.cos(this.heading) * fwd * HELI.accel;
        const az = Math.sin(this.heading) * fwd * HELI.accel;
        this.vel.x += ax * dt;
        this.vel.z += az * dt;
      } else this.heading += yaw * HELI.yawRate * 0.5 * dt;
      // Drag, and kill sideways drift so it flies where it points.
      const along = this.vel.x * Math.cos(this.heading) + this.vel.z * Math.sin(this.heading);
      const side = -this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
      const top = along >= 0 ? HELI.cruise : HELI.reverse;
      const a2 = clamp(along, -top, top) * (fwd === 0 ? 1 - damp(HELI.drag, dt) : 1);
      const s2 = side * (1 - damp(2.5, dt));
      this.vel.x = a2 * Math.cos(this.heading) - s2 * Math.sin(this.heading);
      this.vel.z = a2 * Math.sin(this.heading) + s2 * Math.cos(this.heading);
    } else {
      this.vel.y = this.grounded ? -1 : Math.max(-25, this.vel.y - HELI.gravity * dt);
      const k = this.grounded ? 1 - damp(6, dt) : 1;
      this.vel.x *= k;
      this.vel.z *= k;
    }

    // Visual attitude: nose down when accelerating, bank into turns.
    const sp = this.speed;
    this.pitch += (clamp(fwd * 0.22 + (sp / HELI.cruise) * 0.12, -0.25, 0.35) * (this.grounded ? 0 : 1) - this.pitch) * damp(3, dt);
    this.roll += (clamp(yaw * (0.1 + (sp / HELI.cruise) * 0.35), -0.45, 0.45) * (this.grounded ? 0 : 1) - this.roll) * damp(3, dt);

    this.preSpeed = sp;
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(LAYER.VEHICLE, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL));
    const m = this.kcc.computedMovement();
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const c = this.kcc.computedCollision(i);
      if (c?.collider) this.hits.push(c.collider);
    }
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded() && this.vel.y <= 0.05;
    if (Math.abs(m.x - desired.x) > 1e-4) this.vel.x = m.x / dt;
    if (Math.abs(m.z - desired.z) > 1e-4) this.vel.z = m.z / dt;
    if (this.vel.y > 0 && m.y < desired.y - 1e-4) this.vel.y = 0;
    if (this.grounded && !wasGrounded) this.vel.y = 0;
    this.x += m.x;
    this.y += m.y;
    this.z += m.z;
    if (this.y < -20) this.place(this.x, this.z, this.heading, 5);
    const centre = HELI.halfHeight + HELI.radius;
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + centre, z: this.z });
    this.body.setNextKinematicRotation(quatFromHeading(this.heading));
  }
}
