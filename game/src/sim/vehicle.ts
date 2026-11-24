import type { Collider, DynamicRayCastVehicleController, RigidBody, World } from "@dimforge/rapier3d-compat";
import { groups, LAYER, SOLID, type Rapier } from "./rapier";
import { clamp, damp, headingOf, quatFromHeading, rotate, uprightness, type Quat, type Vec3 } from "./math";

export type VehicleId = "truck" | "car" | "trail" | "hauler" | "roadster" | "coupe" | "super" | "suv" | "sedan";

/** Every road vehicle, in dealership order. */
export const VEHICLE_IDS: VehicleId[] = ["truck", "sedan", "roadster", "suv", "trail", "hauler", "coupe", "car", "super"];

/**
 * A raycast vehicle (the classic Bullet/Rapier design): a rigid chassis with four
 * suspension rays. Rapier handles springs, tyre grip and weight transfer; we add
 * driver aids that make it fun with a keyboard: speed-sensitive steering, a top
 * speed, auto reverse, a handbrake for drifts and self-righting.
 */
export interface VehicleSpec {
  id: VehicleId;
  name: string;
  /** kg */
  mass: number;
  /** Chassis collider half extents: length/2 (x), height/2 (y), width/2 (z). */
  half: [number, number, number];
  /** Wheel hub positions: front and rear x, half track (z), height (y) relative to the chassis centre. */
  wheelFront: number;
  wheelRear: number;
  track: number;
  wheelY: number;
  wheelRadius: number;
  suspensionRest: number;
  suspensionTravel: number;
  stiffness: number;
  compression: number;
  relaxation: number;
  frictionSlip: number;
  sideFriction: number;
  /** Newtons per driven wheel at full throttle. */
  engine: number;
  brake: number;
  /** Radians at standstill; shrinks with speed. */
  maxSteer: number;
  /** m/s */
  topSpeed: number;
  reverseSpeed: number;
  allWheelDrive: boolean;
  /** Lower the centre of mass (m below the collider centre) so it corners without rolling. */
  comDrop: number;
}

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  truck: {
    id: "truck",
    name: "Company pickup",
    mass: 1900,
    half: [2.75, 0.55, 1.0],
    wheelFront: 1.75,
    wheelRear: -1.65,
    track: 0.92,
    wheelY: -0.3,
    wheelRadius: 0.44,
    suspensionRest: 0.42,
    suspensionTravel: 0.35,
    stiffness: 30,
    compression: 3.2,
    relaxation: 3.8,
    frictionSlip: 2.4,
    sideFriction: 1,
    engine: 5600,
    brake: 90,
    maxSteer: 0.55,
    topSpeed: 25,
    reverseSpeed: 8,
    allWheelDrive: true,
    comDrop: 0.45,
  },
  car: {
    id: "car",
    name: "Volt GT",
    mass: 1350,
    half: [2.3, 0.4, 0.96],
    wheelFront: 1.45,
    wheelRear: -1.4,
    track: 0.86,
    wheelY: -0.2,
    wheelRadius: 0.36,
    suspensionRest: 0.3,
    suspensionTravel: 0.22,
    stiffness: 42,
    compression: 3.8,
    relaxation: 4.4,
    frictionSlip: 2.9,
    sideFriction: 1.15,
    engine: 5400,
    brake: 110,
    maxSteer: 0.5,
    topSpeed: 44,
    reverseSpeed: 10,
    allWheelDrive: false,
    comDrop: 0.4,
  },
  trail: {
    id: "trail",
    name: "Ridgeback 4x4",
    mass: 2000,
    half: [2.7, 0.55, 1.02],
    wheelFront: 1.72,
    wheelRear: -1.62,
    track: 0.98,
    wheelY: -0.38,
    wheelRadius: 0.52,
    suspensionRest: 0.5,
    suspensionTravel: 0.5,
    stiffness: 22,
    compression: 2.6,
    relaxation: 3.2,
    frictionSlip: 2.8,
    sideFriction: 1.05,
    engine: 5800,
    brake: 95,
    maxSteer: 0.58,
    topSpeed: 28,
    reverseSpeed: 9,
    allWheelDrive: true,
    comDrop: 0.55,
  },
  hauler: {
    id: "hauler",
    name: "Haul HD",
    mass: 2700,
    half: [2.95, 0.6, 1.05],
    wheelFront: 1.95,
    wheelRear: -1.8,
    track: 0.98,
    wheelY: -0.32,
    wheelRadius: 0.46,
    suspensionRest: 0.42,
    suspensionTravel: 0.32,
    stiffness: 34,
    compression: 3.4,
    relaxation: 4,
    frictionSlip: 2.6,
    sideFriction: 1.1,
    engine: 8200,
    brake: 130,
    maxSteer: 0.5,
    topSpeed: 31,
    reverseSpeed: 8,
    allWheelDrive: false,
    comDrop: 0.5,
  },
  roadster: {
    id: "roadster",
    name: "Breeze RS",
    mass: 1060,
    half: [1.95, 0.36, 0.86],
    wheelFront: 1.2,
    wheelRear: -1.15,
    track: 0.76,
    wheelY: -0.18,
    wheelRadius: 0.32,
    suspensionRest: 0.28,
    suspensionTravel: 0.2,
    stiffness: 40,
    compression: 3.6,
    relaxation: 4.2,
    frictionSlip: 3.0,
    sideFriction: 1.2,
    engine: 3900,
    brake: 95,
    maxSteer: 0.55,
    topSpeed: 52,
    reverseSpeed: 9,
    allWheelDrive: false,
    comDrop: 0.35,
  },
  coupe: {
    id: "coupe",
    name: "Sterling 88",
    mass: 1250,
    half: [2.15, 0.38, 0.92],
    wheelFront: 1.38,
    wheelRear: -1.3,
    track: 0.82,
    wheelY: -0.2,
    wheelRadius: 0.35,
    suspensionRest: 0.3,
    suspensionTravel: 0.22,
    stiffness: 40,
    compression: 3.8,
    relaxation: 4.4,
    frictionSlip: 2.8,
    sideFriction: 1.1,
    engine: 4700,
    brake: 100,
    maxSteer: 0.5,
    topSpeed: 54,
    reverseSpeed: 10,
    allWheelDrive: false,
    comDrop: 0.38,
  },
  super: {
    id: "super",
    name: "Apex V12",
    mass: 1480,
    half: [2.3, 0.34, 1.0],
    wheelFront: 1.5,
    wheelRear: -1.38,
    track: 0.9,
    wheelY: -0.17,
    wheelRadius: 0.36,
    suspensionRest: 0.26,
    suspensionTravel: 0.18,
    stiffness: 52,
    compression: 4.2,
    relaxation: 4.8,
    frictionSlip: 3.4,
    sideFriction: 1.3,
    engine: 7600,
    brake: 140,
    maxSteer: 0.46,
    topSpeed: 72,
    reverseSpeed: 10,
    allWheelDrive: true,
    comDrop: 0.42,
  },
  suv: {
    id: "suv",
    name: "Trailhead SUV",
    mass: 1950,
    half: [2.4, 0.6, 0.98],
    wheelFront: 1.5,
    wheelRear: -1.45,
    track: 0.9,
    wheelY: -0.34,
    wheelRadius: 0.44,
    suspensionRest: 0.42,
    suspensionTravel: 0.28,
    stiffness: 34,
    compression: 3.4,
    relaxation: 4.0,
    frictionSlip: 2.6,
    sideFriction: 1.0,
    engine: 4300,
    brake: 110,
    maxSteer: 0.52,
    topSpeed: 40,
    reverseSpeed: 9,
    allWheelDrive: true,
    comDrop: 0.55,
  },
  sedan: {
    id: "sedan",
    name: "Commuter LX",
    mass: 1400,
    half: [2.35, 0.45, 0.92],
    wheelFront: 1.45,
    wheelRear: -1.4,
    track: 0.84,
    wheelY: -0.24,
    wheelRadius: 0.36,
    suspensionRest: 0.32,
    suspensionTravel: 0.24,
    stiffness: 36,
    compression: 3.6,
    relaxation: 4.2,
    frictionSlip: 2.6,
    sideFriction: 1.05,
    engine: 3600,
    brake: 100,
    maxSteer: 0.52,
    topSpeed: 38,
    reverseSpeed: 9,
    allWheelDrive: false,
    comDrop: 0.42,
  },
};

export interface DriveInput {
  /** −1..1: W accelerates, S brakes then reverses. */
  throttle: number;
  /** −1..1: D steers right. */
  steer: number;
  handbrake: boolean;
}

export const PARKED: DriveInput = { throttle: 0, steer: 0, handbrake: true };

export class VehicleController {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly controller: DynamicRayCastVehicleController;
  steer = 0;
  /** Seconds spent upside down or on the side (self-rights after a moment). */
  private flipped = 0;
  /** Engine load 0..1 for sound and exhaust. */
  load = 0;
  /** Velocity before the last physics step, for breaking things on impact. */
  preVel: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    R: Rapier,
    private readonly world: World,
    readonly spec: VehicleSpec,
    x: number,
    z: number,
    heading: number,
  ) {
    const [hx, hy, hz] = spec.half;
    const rideY = spec.wheelRadius + spec.suspensionRest - spec.wheelY + 0.05;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, rideY, z)
        .setRotation(quatFromHeading(heading))
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true)
        .setCanSleep(true),
    );
    const volume = 8 * hx * hy * hz;
    this.collider = world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setDensity(spec.mass / volume)
        .setFriction(0.4)
        .setRestitution(0.05)
        .setCollisionGroups(groups(LAYER.VEHICLE))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    // Lower centre of mass: keeps it planted in corners like a real car.
    this.body.setAdditionalMassProperties(0, { x: 0, y: -spec.comDrop, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, true);

    this.controller = world.createVehicleController(this.body);
    const wheels: [number, number][] = [
      [spec.wheelFront, spec.track],
      [spec.wheelFront, -spec.track],
      [spec.wheelRear, spec.track],
      [spec.wheelRear, -spec.track],
    ];
    wheels.forEach(([wx, wz], i) => {
      this.controller.addWheel({ x: wx, y: spec.wheelY, z: wz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, spec.suspensionRest, spec.wheelRadius);
      this.controller.setWheelSuspensionStiffness(i, spec.stiffness);
      this.controller.setWheelSuspensionCompression(i, spec.compression);
      this.controller.setWheelSuspensionRelaxation(i, spec.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i, spec.suspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, spec.mass * 40);
      this.controller.setWheelFrictionSlip(i, spec.frictionSlip);
      this.controller.setWheelSideFrictionStiffness(i, spec.sideFriction);
    });
  }

  get position(): Vec3 {
    return this.body.translation();
  }

  get rotation(): Quat {
    return this.body.rotation();
  }

  get heading(): number {
    return headingOf(this.rotation);
  }

  /** Signed speed along the vehicle's nose (m/s). */
  get speed(): number {
    const v = this.body.linvel();
    const f = rotate(this.rotation, { x: 1, y: 0, z: 0 });
    return v.x * f.x + v.y * f.y + v.z * f.z;
  }

  /** Puts the vehicle somewhere, upright and still. */
  place(x: number, z: number, heading: number, groundY = 0) {
    const s = this.spec;
    this.body.setTranslation({ x, y: groundY + s.wheelRadius + s.suspensionRest - s.wheelY + 0.1, z }, true);
    this.body.setRotation(quatFromHeading(heading), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
  }

  step(dt: number, input: DriveInput) {
    const s = this.spec;
    const v = this.speed;
    this.preVel = { ...this.body.linvel() };

    // Throttle, brake and reverse the way drivers expect: S brakes while rolling forward, then reverses.
    let engine = 0;
    let brake = 0;
    if (input.throttle > 0.05) {
      if (v < -1) brake = s.brake;
      else engine = v < s.topSpeed ? s.engine * input.throttle : 0;
    } else if (input.throttle < -0.05) {
      if (v > 1) brake = s.brake;
      else engine = v > -s.reverseSpeed ? s.engine * 0.6 * input.throttle : 0;
    } else {
      // Coasting: gentle engine braking so it doesn't roll forever.
      brake = Math.abs(v) < 0.5 ? s.brake * 0.3 : s.brake * 0.04;
    }
    this.load = clamp(Math.abs(engine) / s.engine, 0, 1);

    // Speed-sensitive steering: full lock at a crawl, much less at speed.
    const lock = s.maxSteer / (1 + Math.abs(v) / 12);
    this.steer += (-clamp(input.steer, -1, 1) * lock - this.steer) * damp(8, dt);

    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const rear = !front;
      this.controller.setWheelSteering(i, front ? this.steer : 0);
      const driven = s.allWheelDrive || rear;
      this.controller.setWheelEngineForce(i, driven ? engine / (s.allWheelDrive ? 2 : 1) : 0);
      const hb = input.handbrake && rear ? s.brake * 1.2 : 0;
      this.controller.setWheelBrake(i, brake + hb);
      // Handbrake turns: the rear tyres let go so the tail can slide.
      this.controller.setWheelSideFrictionStiffness(i, rear && input.handbrake ? s.sideFriction * 0.35 : s.sideFriction);
    }
    if (input.throttle !== 0 || input.steer !== 0) this.body.wakeUp();

    this.controller.updateVehicle(dt, undefined, groups(LAYER.VEHICLE, SOLID & ~LAYER.ANIMAL), (c) => c.handle !== this.collider.handle);

    // Self-righting: after a couple of seconds on its side or roof, flip back onto the wheels.
    if (uprightness(this.rotation) < 0.35) {
      this.flipped += dt;
      if (this.flipped > 2.2) {
        const p = this.position;
        this.place(p.x, p.z, this.heading, Math.max(0, p.y - 1.5));
        this.flipped = 0;
      }
    } else this.flipped = 0;
  }

  /** Wheel state for drawing: spin angle, steer angle and suspension compression per wheel. */
  wheel(i: number) {
    return {
      spin: this.controller.wheelRotation(i) ?? 0,
      steer: this.controller.wheelSteering(i) ?? 0,
      suspension: this.controller.wheelSuspensionLength(i) ?? this.spec.suspensionRest,
      contact: this.controller.wheelIsInContact(i),
    };
  }

  dispose() {
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
