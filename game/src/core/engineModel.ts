import type { Simulation } from "../sim/simulation";
import { HELI } from "../sim/helicopter";
import { PLANE } from "../sim/plane";
import type { VehicleId } from "../sim/vehicle";

/**
 * What each engine sounds like, and how fast it's turning. Pure data and maths
 * (no Web Audio), so it can be tested; engineSound.ts turns it into sound.
 *
 * Piston engines fire `cylinders / 2` times per revolution, so the note is
 * rpm / 60 × cylinders / 2: a four-cylinder idles near 27 Hz and screams past
 * 200 Hz, a V12 shrieks near 850 Hz, a diesel bus never gets far above 130 Hz.
 */
export type EngineKey = VehicleId | "boat" | "jetski" | "heli" | "plane";

export interface EngineProfile {
  /** Label for tests and tooling. */
  name: string;
  /** 0 for the electric motor. */
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  /** Gears to shift through (1 = no gearbox: boats, props, the electric motor). */
  gears: number;
  wave: OscillatorType;
  /** Mix of the second harmonic (rasp) and of a sub-octave (V8 burble). */
  harmonic: number;
  sub: number;
  /** Broadband noise: intake, diesel clatter, water, rotor wash. */
  noise: number;
  noiseHz: number;
  /** Low-pass cutoff as a multiple of the note, idle..full load. */
  cutoff: [number, number];
  /** A high sine on top: turbo, supercharger, turbine or electric whine (Hz at idle..redline). */
  whine?: [number, number];
  whineMix?: number;
  /** Amplitude pulsing: rotor blades (Hz at full rotor speed) or a propeller. */
  pulse?: "rotor" | "prop";
  /** For a turbine: the low rumble's note at idle..full (Hz), under the whine. */
  baseHz?: [number, number];
  volume: number;
}

const piston = (p: Omit<EngineProfile, "wave" | "harmonic" | "sub" | "noise" | "noiseHz" | "cutoff" | "volume"> & Partial<EngineProfile>): EngineProfile => ({
  wave: "sawtooth",
  harmonic: 0.35,
  sub: 0.2,
  noise: 0.12,
  noiseHz: 900,
  cutoff: [5, 11],
  volume: 0.5,
  ...p,
});

export const ENGINES: Record<EngineKey, EngineProfile> = {
  sedan: piston({ name: "Commuter LX four-cylinder", cylinders: 4, idleRpm: 800, redlineRpm: 6200, gears: 5, wave: "triangle", harmonic: 0.45, sub: 0.05, volume: 0.38 }),
  roadster: piston({ name: "Breeze RS turbo four", cylinders: 4, idleRpm: 900, redlineRpm: 7800, gears: 6, wave: "square", harmonic: 0.5, sub: 0.05, whine: [1800, 4200], whineMix: 0.05, cutoff: [6, 14] }),
  coupe: piston({ name: "Sterling 88 straight-six", cylinders: 6, idleRpm: 800, redlineRpm: 7000, gears: 5, harmonic: 0.4, sub: 0.15, cutoff: [5, 13], volume: 0.52 }),
  super: piston({ name: "Apex V12", cylinders: 12, idleRpm: 1000, redlineRpm: 8500, gears: 7, harmonic: 0.55, sub: 0.25, whine: [900, 2600], whineMix: 0.04, cutoff: [4, 9], volume: 0.55 }),
  truck: piston({ name: "Company pickup V8", cylinders: 8, idleRpm: 650, redlineRpm: 5200, gears: 5, sub: 0.6, harmonic: 0.3, cutoff: [4, 8], volume: 0.55 }),
  trail: piston({ name: "Ridgeback V6", cylinders: 6, idleRpm: 700, redlineRpm: 5800, gears: 5, sub: 0.35, cutoff: [4, 9] }),
  suv: piston({ name: "Trailhead V6", cylinders: 6, idleRpm: 700, redlineRpm: 6000, gears: 6, wave: "triangle", sub: 0.25, cutoff: [4, 9], volume: 0.42 }),
  hauler: piston({ name: "Haul HD diesel six", cylinders: 6, idleRpm: 600, redlineRpm: 3200, gears: 6, wave: "square", sub: 0.45, noise: 0.35, noiseHz: 1400, cutoff: [5, 9], volume: 0.55 }),
  bus: piston({ name: "School bus diesel", cylinders: 6, idleRpm: 550, redlineRpm: 2600, gears: 4, wave: "square", sub: 0.5, noise: 0.4, noiseHz: 1200, cutoff: [4, 8], volume: 0.55 }),
  car: { name: "Volt GT electric motor", cylinders: 0, idleRpm: 0, redlineRpm: 16000, gears: 1, wave: "sine", harmonic: 0.25, sub: 0, noise: 0.08, noiseHz: 600, cutoff: [8, 12], whine: [120, 1700], whineMix: 0.5, volume: 0.32 },
  boat: piston({ name: "Lakerunner outboard", cylinders: 4, idleRpm: 750, redlineRpm: 6000, gears: 1, wave: "square", harmonic: 0.5, sub: 0.1, noise: 0.3, noiseHz: 700, cutoff: [5, 10], volume: 0.48 }),
  jetski: piston({ name: "Jet ski three-cylinder", cylinders: 3, idleRpm: 1300, redlineRpm: 7800, gears: 1, harmonic: 0.6, sub: 0, noise: 0.35, noiseHz: 1600, cutoff: [6, 14], whine: [700, 2200], whineMix: 0.06, volume: 0.45 }),
  heli: { name: "Turbine helicopter", cylinders: 0, idleRpm: 0, redlineRpm: 0, gears: 1, wave: "sawtooth", harmonic: 0.2, sub: 0.5, noise: 0.7, noiseHz: 380, cutoff: [3, 5], whine: [600, 1450], whineMix: 0.08, pulse: "rotor", baseHz: [38, 72], volume: 0.6 },
  plane: piston({ name: "Light aircraft flat-four", cylinders: 4, idleRpm: 700, redlineRpm: 2700, gears: 1, harmonic: 0.5, sub: 0.3, noise: 0.25, noiseHz: 800, cutoff: [6, 10], pulse: "prop", volume: 0.55 }),
};

/** Fraction of the rev range (0 idle .. 1 redline) for a road speed, shifting up through the gears. */
export function gearRpm(speedRatio: number, gears: number) {
  const r = Math.min(1, Math.max(0, speedRatio));
  if (gears <= 1) return 0.06 + 0.94 * r;
  const g = Math.min(gears - 1e-6, r * gears), frac = g - Math.floor(g);
  return g < 1 ? 0.06 + 0.84 * frac : 0.42 + 0.56 * frac;
}

/** The note for a profile at a rev fraction: firing frequency, or the motor's whine. */
export function engineHz(p: EngineProfile, rpm: number) {
  if (p.baseHz) return p.baseHz[0] + (p.baseHz[1] - p.baseHz[0]) * rpm;
  if (p.cylinders === 0) return p.whine ? p.whine[0] + (p.whine[1] - p.whine[0]) * rpm : 0;
  return ((p.idleRpm + (p.redlineRpm - p.idleRpm) * rpm) / 60) * (p.cylinders / 2);
}

export interface EngineState {
  key: EngineKey;
  /** 0 idle .. 1 redline. */
  rpm: number;
  /** 0 coasting .. 1 full throttle. */
  load: number;
  /** m/s. */
  speed: number;
  /** Sideways slide (radians), for tyre squeal; 0 off the road. */
  slip: number;
  /** 0..1 rotor or propeller speed (pulsing rate and loudness). */
  spin: number;
}

/** What the player is driving or flying, and how hard, or null on foot or on an animal. */
export function engineState(sim: Simulation): EngineState | null {
  const c = sim.control;
  if (c.kind === "vehicle") {
    const v = sim.vehicles[c.id];
    if (!v) return null;
    const p = ENGINES[c.id], speed = Math.abs(v.speed);
    // Revving against the brakes or from a standstill pushes the needle up before the car moves.
    const rpm = Math.max(gearRpm(speed / v.spec.topSpeed, p.gears), v.load * (speed < 3 ? 0.45 : 0.2));
    return { key: c.id, rpm, load: v.load, speed, slip: v.drifting ? v.slip : 0, spin: 1 };
  }
  if (c.kind === "boat") {
    const b = sim.boat, key: EngineKey = c.id?.endsWith("jetski") ? "jetski" : "boat", speed = Math.abs(b.speed);
    const r = speed / b.spec.top;
    return { key, rpm: gearRpm(r, 1), load: Math.min(1, 0.25 + r), speed, slip: 0, spin: 1 };
  }
  if (c.kind === "heli") {
    const h = sim.flying();
    if (!h) return null;
    const r = h.rotor;
    return { key: "heli", rpm: r * (0.85 + 0.15 * Math.min(1, h.speed / HELI.cruise)), load: r * (h.grounded ? 0.6 : 1), speed: h.speed, slip: 0, spin: r };
  }
  if (c.kind === "plane") {
    const a = sim.planes[c.id];
    const t = Math.abs(a.throttle);
    return { key: "plane", rpm: 0.12 + 0.88 * Math.max(t, Math.abs(a.speed) / PLANE.top * 0.6), load: t, speed: Math.abs(a.speed), slip: 0, spin: 0.25 + 0.75 * t };
  }
  return null;
}
