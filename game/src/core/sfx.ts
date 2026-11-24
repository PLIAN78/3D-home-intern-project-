/** Tiny synthesized sound effects (no audio files). Silent wherever Web Audio isn't available. */

type Sound = "cash" | "blip" | "good" | "bad" | "step" | "fanfare" | "switch" | "pickup" | "crash" | "thud";

const NOTES: Record<Sound, [number, number, OscillatorType][]> = {
  cash: [
    [880, 0.07, "square"],
    [1320, 0.12, "square"],
  ],
  blip: [[660, 0.05, "sine"]],
  good: [
    [660, 0.08, "triangle"],
    [990, 0.12, "triangle"],
  ],
  bad: [[220, 0.18, "sawtooth"]],
  step: [
    [523, 0.08, "triangle"],
    [784, 0.12, "triangle"],
  ],
  fanfare: [
    [523, 0.1, "square"],
    [659, 0.1, "square"],
    [784, 0.1, "square"],
    [1047, 0.25, "square"],
  ],
  switch: [[440, 0.06, "sine"]],
  pickup: [
    [988, 0.05, "sine"],
    [1319, 0.08, "sine"],
  ],
  crash: [],
  thud: [],
};

/** Filtered noise burst: splintering wood (crash) or a heavy landing (thud). */
function noise(c: AudioContext, kind: "crash" | "thud") {
  const dur = kind === "crash" ? 0.55 : 0.25;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** (kind === "crash" ? 2 : 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = kind === "crash" ? "bandpass" : "lowpass";
  filter.frequency.value = kind === "crash" ? 1400 : 220;
  const gain = c.createGain();
  gain.gain.value = kind === "crash" ? 0.18 : 0.3;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start();
}

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

export function sfx(sound: Sound) {
  if (muted || typeof window === "undefined" || !("AudioContext" in window)) return;
  try {
    ctx ??= new AudioContext();
    if (sound === "crash" || sound === "thud") {
      noise(ctx, sound);
      return;
    }
    let t = ctx.currentTime;
    for (const [freq, dur, type] of NOTES[sound]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.9;
    }
  } catch {
    // Audio is a nicety; never let it break the game.
  }
}
