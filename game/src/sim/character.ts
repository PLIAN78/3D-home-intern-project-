import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { angleDelta, approach, clamp, damp, quatFromHeading, type Vec3 } from "./math";

/** What the player asks for this step (already camera-relative where it matters). */
export interface MoveIntent {
  /** −1..1, W/S. */
  forward: number;
  /** −1..1, D/A. */
  side: number;
  /** Space this step (pressed, not held). */
  jump: boolean;
  /** Space held. */
  jumpHeld: boolean;
  sprint: boolean;
  /** Camera yaw, so "forward" means "away from the camera". */
  cameraYaw: number;
}

export const NO_INTENT: MoveIntent = { forward: 0, side: 0, jump: false, jumpHeld: false, sprint: false, cameraYaw: 0 };

/** Tuning for walking and the SkyHopper jetpack. Speeds in m/s, accelerations in m/s². */
export const FOOT = {
  radius: 0.34,
  halfHeight: 0.56,
  walk: 4.6,
  run: 7.6,
  groundAccel: 38,
  airAccel: 7,
  turnRate: 11,
  jumpSpeed: 6.6,
  gravity: 21,
  terminal: 32,
};

export const JETPACK = {
  /** Upward thrust while Space is held, before gravity. */
  thrust: 31,
  maxRise: 10,
  /** Horizontal acceleration and top speeds in the air. */
  airAccel: 15,
  cruise: 15,
  boost: 24,
  /** Air drag on horizontal speed (per second). */
  drag: 0.55,
  /** Seconds of full thrust; boosting burns twice as fast. */
  fuel: 11,
  refuelRate: 2.8,
  /** A landing faster than this (m/s down) is a hard one: bigger dust, camera shake. */
  hardLanding: 13,
};

/** Centre of the capsule above the feet. */
const CENTRE = FOOT.halfHeight + FOOT.radius;

/**
 * The player on foot: a kinematic capsule moved by Rapier's character controller
 * (slides along walls, climbs curbs, snaps to the ground, pushes loose planks).
 * Walking accelerates toward the stick direction; the jetpack is a small flight
 * model with thrust, momentum, air drag and a fuel tank.
 */
export class CharacterController {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;

  /** Feet position. */
  x: number;
  y: number;
  z: number;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  heading: number;
  grounded = true;
  jetpack = false;
  fuel = JETPACK.fuel;
  /** Meal boosts: run speed multiplier and jetpack fuel burn multiplier (1 = normal). */
  runBoost = 1;
  fuelBurn = 1;
  thrusting = false;
  /** Body lean for rendering (radians): forward pitch and sideways roll while flying or running. */
  pitch = 0;
  roll = 0;
  /** Set for one step when the player lands hard, with the impact speed. */
  landedHard = 0;
  /** Breakable colliders the capsule touched this step, with the speed it hit them at. */
  readonly hits: { collider: Collider; speed: number }[] = [];

  constructor(
    private readonly R: Rapier,
    private readonly world: World,
    x: number,
    z: number,
    heading: number,
  ) {
    this.x = x;
    this.y = 0;
    this.z = z;
    this.heading = heading;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, CENTRE, z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(FOOT.halfHeight, FOOT.radius).setCollisionGroups(groups(LAYER.PLAYER, LAYER.WATER | LAYER.STATIC | LAYER.BREAKABLE | LAYER.DEBRIS | LAYER.VEHICLE | LAYER.ANIMAL)),
      this.body,
    );
    this.kcc = world.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.kcc.enableAutostep(0.45, 0.15, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(85);
  }

  /** Turns the capsule on or off (off while driving or riding). */
  setActive(active: boolean) {
    this.collider.setEnabled(active);
  }

  place(x: number, z: number, y = 0, heading = this.heading) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.vel = { x: 0, y: 0, z: 0 };
    this.body.setTranslation({ x, y: y + CENTRE, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + CENTRE, z });
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  step(dt: number, intent: MoveIntent) {
    this.hits.length = 0;
    this.landedHard = 0;
    const fwd = clamp(intent.forward, -1, 1);
    const side = clamp(intent.side, -1, 1);
    const mag = Math.min(1, Math.hypot(fwd, side));
    // Camera-relative direction on the ground.
    const cy = intent.cameraYaw;
    const dirX = mag > 0 ? (Math.cos(cy) * fwd - Math.sin(cy) * side) / Math.max(1, Math.hypot(fwd, side)) : 0;
    const dirZ = mag > 0 ? (Math.sin(cy) * fwd + Math.cos(cy) * side) / Math.max(1, Math.hypot(fwd, side)) : 0;

    const flying = this.jetpack && !this.grounded;
    this.thrusting = false;

    // Horizontal motion
    let ax = 0;
    let az = 0;
    if (flying) {
      const top = intent.sprint ? JETPACK.boost : JETPACK.cruise;
      const tx = dirX * top;
      const tz = dirZ * top;
      // Accelerate toward the stick direction, with drag when you let go.
      const a = JETPACK.airAccel * dt;
      const nx = mag > 0 ? approach(this.vel.x, tx, a * Math.abs(dirX) + 0.2 * a) : this.vel.x * (1 - damp(JETPACK.drag, dt));
      const nz = mag > 0 ? approach(this.vel.z, tz, a * Math.abs(dirZ) + 0.2 * a) : this.vel.z * (1 - damp(JETPACK.drag, dt));
      ax = (nx - this.vel.x) / dt;
      az = (nz - this.vel.z) / dt;
      this.vel.x = nx;
      this.vel.z = nz;
    } else {
      const top = (intent.sprint ? FOOT.run : FOOT.walk) * this.runBoost;
      const accel = (this.grounded ? FOOT.groundAccel : FOOT.airAccel) * dt;
      const tx = dirX * top * mag;
      const tz = dirZ * top * mag;
      const dx = tx - this.vel.x;
      const dz = tz - this.vel.z;
      const d = Math.hypot(dx, dz);
      const k = d > accel ? accel / d : 1;
      ax = (dx * k) / dt;
      az = (dz * k) / dt;
      this.vel.x += dx * k;
      this.vel.z += dz * k;
    }

    // Vertical motion
    if (this.grounded && intent.jump) {
      this.vel.y = FOOT.jumpSpeed;
      this.grounded = false;
    }
    const canThrust = this.jetpack && intent.jumpHeld && this.fuel > 0;
    if (canThrust) {
      this.thrusting = true;
      this.vel.y = Math.min(JETPACK.maxRise, this.vel.y + (JETPACK.thrust - FOOT.gravity) * dt);
      this.fuel = Math.max(0, this.fuel - dt * (intent.sprint && mag > 0 ? 2 : 1) * this.fuelBurn);
      this.grounded = false;
    } else if (!this.grounded) {
      this.vel.y = Math.max(-FOOT.terminal, this.vel.y - FOOT.gravity * dt);
    } else {
      this.vel.y = -2; // keep pressed onto the ground so slopes and snapping work
      if (this.jetpack) this.fuel = Math.min(JETPACK.fuel, this.fuel + JETPACK.refuelRate * dt);
    }

    // Face where you are going (on foot) or ease toward it (flying).
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4 && (mag > 0 || flying)) {
      const want = Math.atan2(this.vel.z, this.vel.x);
      this.heading += angleDelta(this.heading, want) * damp(flying ? 4 : FOOT.turnRate, dt);
    }
    // Lean into acceleration: a jetpack pilot tilts the way they're pushing.
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);
    const aFwd = ax * cosH + az * sinH;
    const aSide = -ax * sinH + az * cosH;
    const leanScale = flying ? 0.035 : 0.012;
    this.pitch += (clamp(aFwd * leanScale, -0.5, 0.5) + (flying ? clamp(sp / JETPACK.boost, 0, 1) * 0.35 : 0) - this.pitch) * damp(6, dt);
    this.roll += (clamp(-aSide * leanScale, -0.45, 0.45) - this.roll) * damp(6, dt);

    // Let Rapier resolve the move against the world.
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(LAYER.PLAYER, LAYER.WATER | LAYER.STATIC | LAYER.BREAKABLE | LAYER.DEBRIS | LAYER.VEHICLE | LAYER.ANIMAL));
    const moved = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded() && this.vel.y <= 0.01;
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const c = this.kcc.computedCollision(i);
      if (c?.collider) this.hits.push({ collider: c.collider, speed: Math.hypot(this.vel.x, this.vel.y, this.vel.z) });
    }
    // Blocked: lose the velocity that went into the wall (or ceiling, or floor).
    if (Math.abs(moved.x - desired.x) > 1e-4) this.vel.x = moved.x / dt;
    if (Math.abs(moved.z - desired.z) > 1e-4) this.vel.z = moved.z / dt;
    if (this.vel.y > 0 && moved.y < desired.y - 1e-4) this.vel.y = 0;
    if (this.grounded && !wasGrounded) {
      if (fallSpeed > JETPACK.hardLanding) this.landedHard = fallSpeed;
      this.vel.y = 0;
    }

    this.x += moved.x;
    this.y += moved.y;
    this.z += moved.z;
    if (this.y < -5) this.place(this.x, this.z, 0); // fell out of the world: put back on the ground
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + CENTRE, z: this.z });
    this.body.setNextKinematicRotation(quatFromHeading(0));
  }
}
