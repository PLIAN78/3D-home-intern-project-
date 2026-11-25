import { ENGINES, engineHz, type EngineKey, type EngineState } from "./engineModel";

/**
 * A synthesized engine (no audio files): the firing note as a shaped
 * oscillator, its second harmonic and a sub-octave, filtered noise for intake
 * and clatter, an optional whine, and amplitude pulsing for rotors and props,
 * all through a low-pass that opens with load. Plus tyre squeal for drifts.
 */
let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

const RAMP = 0.04;

export class EngineVoice {
  readonly key: EngineKey;
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly main: OscillatorNode;
  private readonly second: OscillatorNode;
  private readonly secondGain: GainNode;
  private readonly sub: OscillatorNode;
  private readonly subGain: GainNode;
  private readonly hiss: AudioBufferSourceNode;
  private readonly hissFilter: BiquadFilterNode;
  private readonly hissGain: GainNode;
  private readonly whine: OscillatorNode | null;
  private readonly whineGain: GainNode | null;
  private readonly lowpass: BiquadFilterNode;
  private readonly pulse: OscillatorNode | null;
  private readonly pulseDepth: GainNode | null;
  private readonly body: GainNode;
  private stopped = false;

  constructor(ctx: AudioContext, destination: AudioNode, key: EngineKey) {
    const p = ENGINES[key];
    this.key = key;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.Q.value = 0.9;
    // `body` carries the engine through the pulse (rotor/prop) stage into the output.
    this.body = ctx.createGain();
    this.lowpass.connect(this.body).connect(this.out);

    this.main = ctx.createOscillator();
    this.main.type = p.wave;
    this.main.connect(this.lowpass);
    this.second = ctx.createOscillator();
    this.second.type = "square";
    this.secondGain = ctx.createGain();
    this.secondGain.gain.value = p.harmonic * 0.35;
    this.second.connect(this.secondGain).connect(this.lowpass);
    this.sub = ctx.createOscillator();
    this.sub.type = "sine";
    this.subGain = ctx.createGain();
    this.subGain.gain.value = p.sub;
    this.sub.connect(this.subGain).connect(this.lowpass);

    this.hiss = noise(ctx);
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = "bandpass";
    this.hissFilter.Q.value = 0.8;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    this.hiss.connect(this.hissFilter).connect(this.hissGain).connect(this.body);

    if (p.whine && p.whineMix && p.cylinders !== 0) {
      this.whine = ctx.createOscillator();
      this.whine.type = "sine";
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain).connect(this.out);
    } else if (p.whine && p.baseHz) {
      // Turbine: the whine rides over the rumble.
      this.whine = ctx.createOscillator();
      this.whine.type = "sine";
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain).connect(this.out);
    } else {
      this.whine = null;
      this.whineGain = null;
    }

    if (p.pulse) {
      // A low-frequency oscillator nods the engine's gain up and down: blade slap.
      this.pulse = ctx.createOscillator();
      this.pulse.type = p.pulse === "rotor" ? "sawtooth" : "sine";
      this.pulseDepth = ctx.createGain();
      this.pulseDepth.gain.value = 0;
      this.pulse.connect(this.pulseDepth).connect(this.body.gain);
      this.body.gain.value = 0.7;
    } else {
      this.pulse = null;
      this.pulseDepth = null;
    }

    const t = ctx.currentTime;
    for (const o of [this.main, this.second, this.sub, this.whine, this.pulse]) o?.start(t);
    this.hiss.start(t);
  }

  update(s: EngineState) {
    if (this.stopped) return;
    const p = ENGINES[this.key], t = this.ctx.currentTime;
    const f = engineHz(p, s.rpm);
    const set = (param: AudioParam, v: number, ramp = RAMP) => param.setTargetAtTime(v, t, ramp);
    const electric = p.cylinders === 0 && !p.baseHz;
    set(this.main.frequency, Math.max(8, f));
    set(this.second.frequency, Math.max(16, f * 2));
    set(this.sub.frequency, Math.max(6, f / 2));
    const open = p.cutoff[0] + (p.cutoff[1] - p.cutoff[0]) * s.load;
    set(this.lowpass.frequency, Math.min(12000, Math.max(220, f * open + (electric ? 400 : 0))));
    set(this.hissFilter.frequency, p.noiseHz * (0.7 + 0.8 * s.rpm));
    set(this.hissGain.gain, p.noise * (0.25 + 0.75 * Math.max(s.load, s.rpm * 0.6)) * (p.pulse === "rotor" ? s.spin : 1));
    if (this.whine && this.whineGain && p.whine) {
      set(this.whine.frequency, p.whine[0] + (p.whine[1] - p.whine[0]) * s.rpm);
      set(this.whineGain.gain, (p.whineMix ?? 0) * (0.3 + 0.7 * s.load) * (p.baseHz ? s.spin : 1));
    }
    if (this.pulse && this.pulseDepth) {
      // Two-blade rotor: ~13 blade passes a second at speed; a prop beats with the engine.
      const rate = p.pulse === "rotor" ? 3 + 10 * s.spin : f * 0.5;
      set(this.pulse.frequency, Math.max(0.5, rate));
      set(this.pulseDepth.gain, (p.pulse === "rotor" ? 0.55 : 0.22) * s.spin);
    }
    // Louder under load and at high revs; electric cars hum quietly until they're moving.
    const level = electric ? 0.35 + 0.65 * Math.min(1, s.speed / 15) : p.pulse === "rotor" ? 0.15 + 0.85 * s.spin : 0.55 + 0.25 * s.load + 0.2 * s.rpm;
    set(this.out.gain, p.volume * level, 0.08);
  }

  /** Fade out and release the nodes. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.08);
    const end = t + 0.5;
    for (const o of [this.main, this.second, this.sub, this.whine, this.pulse]) o?.stop(end);
    this.hiss.stop(end);
    this.hiss.onended = () => this.out.disconnect();
  }
}

/** Tyre squeal: band-passed noise that rises with the slide. */
export class SkidVoice {
  private readonly ctx: AudioContext;
  private readonly src: AudioBufferSourceNode;
  private readonly band: BiquadFilterNode;
  private readonly gain: GainNode;
  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.src = noise(ctx);
    this.band = ctx.createBiquadFilter();
    this.band.type = "bandpass";
    this.band.frequency.value = 1700;
    this.band.Q.value = 7;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.src.connect(this.band).connect(this.gain).connect(destination);
    this.src.start();
  }
  update(slip: number, speed: number) {
    const t = this.ctx.currentTime;
    const level = Math.min(0.32, Math.max(0, (slip - 0.12) * 0.9) * Math.min(1, speed / 12));
    this.gain.gain.setTargetAtTime(level, t, 0.05);
    this.band.frequency.setTargetAtTime(1400 + 900 * Math.min(1, slip), t, 0.1);
  }
  stop() {
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.05);
    this.src.stop(t + 0.3);
    this.src.onended = () => this.gain.disconnect();
  }
}
