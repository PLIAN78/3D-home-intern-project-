import type { Collider, KinematicCharacterController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, type Rapier } from "./rapier";
import { approach, clamp, damp, quatFromHeading } from "./math";

/** The Lakerunner motorboat. Speeds in m/s. */
export const BOAT = {
  radius: 1.15,
  halfHeight: 0.45,
  accel: 5.5,
  top: 17,
  reverse: 5,
  drag: 0.55,
  turn: 1.15,
  /** The hull rides this far below the waterline. */
  draft: 0.25,
};

/**
 * A motorboat on Heron Lake. It stays on the water surface, throttles up and
 * coasts down, turns harder at speed (like a real hull with a prop wash), and
 * is moved by a character controller so the shore, the island and the jetties
 * stop it. It runs aground in shallow water.
 */
export class BoatController {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly kcc: KinematicCharacterController;
  x: number;
  z: number;
  readonly y: number;
  heading: number;
  speed = 0;
  /** Visual roll and pitch (radians). */
  roll = 0;
  pitch = 0;
  private t = 0;

  constructor(
    private readonly R: Rapier,
    world: World,
    x: number,
    z: number,
    heading: number,
    waterY: number,
    readonly spec:typeof BOAT & {halfLength?:number}=BOAT,
  ) {
    this.x = x;
    this.z = z;
    this.y = waterY;
    this.heading = heading;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, this.centreY, z).setRotation(quatFromHeading(heading)));
    this.collider = world.createCollider((this.spec.halfLength?R.ColliderDesc.cuboid(this.spec.halfLength,this.spec.halfHeight,this.spec.radius):R.ColliderDesc.capsule(this.spec.halfHeight,this.spec.radius)).setCollisionGroups(groups(LAYER.VEHICLE, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL)), this.body);
    this.kcc = world.createCharacterController(0.05);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle((4 * Math.PI) / 180);
    this.kcc.setSlideEnabled(true);
  }

  /** The capsule's centre: its bottom sits a little under the water. */
  private get centreY() {
    return this.spec.halfLength?this.y+.4:this.y + this.spec.halfHeight + this.spec.radius - this.spec.draft - 0.55;
  }

  place(x: number, z: number, heading = this.heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.body.setTranslation({ x, y: this.centreY, z }, true);
    this.body.setNextKinematicTranslation({ x, y: this.centreY, z });
  }

  step(dt: number, input: { forward: number; side: number } | null) {
    this.t += dt;
    const fwd = input ? clamp(input.forward, -1, 1) : 0;
    const side = input ? clamp(input.side, -1, 1) : 0;
    const want = fwd > 0 ? this.spec.top * fwd : fwd < 0 ? -this.spec.reverse : 0;
    this.speed = fwd === 0 ? this.speed * (1 - damp(this.spec.drag, dt)) : approach(this.speed, want, this.spec.accel * dt);
    // Boats steer by the prop wash: a little at rest, more with way on.
    const steer = this.spec.turn * (0.35 + 0.65 * clamp(Math.abs(this.speed) / 8, 0, 1)) * (this.speed < -0.2 ? -1 : 1);
    this.heading += side * steer * dt;
    this.roll += (side * clamp(Math.abs(this.speed) / this.spec.top, 0, 1) * 0.18 - this.roll) * damp(3, dt);
    this.pitch += ((this.speed > 0 ? clamp(this.speed / this.spec.top, 0, 1) * 0.08 : 0) + (fwd > 0 ? 0.03 : 0) - this.pitch) * damp(2, dt);

    const desired = { x: Math.cos(this.heading) * this.speed * dt, y: 0, z: Math.sin(this.heading) * this.speed * dt };
    this.kcc.computeColliderMovement(this.collider, desired, this.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(LAYER.VEHICLE, LAYER.STATIC | LAYER.BREAKABLE | LAYER.VEHICLE | LAYER.ANIMAL));
    const m = this.kcc.computedMovement();
    const planned = Math.hypot(desired.x, desired.z);
    // Bumping the shore or a jetty takes the way off.
    if (planned > 1e-3 && Math.hypot(m.x, m.z) < planned * 0.6) this.speed *= 1 - damp(6, dt);
    this.x += m.x;
    this.z += m.z;
    this.body.setNextKinematicTranslation({ x: this.x, y: this.centreY, z: this.z });
    this.body.setNextKinematicRotation(quatFromHeading(this.heading));
  }

  /** A gentle bob for drawing. */
  get bob() {
    return Math.sin(this.t * 1.7) * 0.05 + Math.sin(this.t * 2.9 + 1) * 0.025;
  }
}

