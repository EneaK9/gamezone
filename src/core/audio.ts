// Procedural audio: a generative koto/shakuhachi score in the miyako-bushi scale, taiko
// when fighting, river/wind/bird/cricket ambience, and synthesized sound effects.

import { clamp, makeRng } from "./math";

type Sfx =
  | "step"
  | "swing"
  | "swingHeavy"
  | "hit"
  | "hitBlunt"
  | "block"
  | "parry"
  | "coin"
  | "click"
  | "open"
  | "close"
  | "special"
  | "boom"
  | "splash"
  | "bell"
  | "dice"
  | "thunder"
  | "poof"
  | "whoosh"
  | "down"
  | "quest"
  | "error"
  | "eat";

// Miyako-bushi: D Eb G A Bb (semitones from D).
const SCALE = [0, 1, 5, 7, 8];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private river!: GainNode;
  private wind!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rng = makeRng(9);
  private nextNote = 0;
  private nextDrone = 0;
  private nextBird = 0;
  private nextCricket = 0;
  private nextDrum = 0;
  private drumStep = 0;
  combat = 0;
  night = 0;
  musicOn = true;
  volume = 0.8;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.5;
    // A little room reverb for music.
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.musicBus.connect(this.master);
    this.musicBus.connect(verb).connect(wet).connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    // Ambient loops.
    this.river = this.loopNoise(380, 0);
    this.wind = this.loopNoise(900, 0);
    this.nextNote = ctx.currentTime + 1;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      // Slightly pink.
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w;
      d[i] = w * 0.6 + b * 3;
    }
    return buf;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private loopNoise(cutoff: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    return g;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, bus: GainNode, sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, this.rng.range(0, 1.5));
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, peak: number, bus: GainNode, glideTo?: number, attack = 0.004) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  /** Plucked string: a bright attack through a closing lowpass. */
  private koto(t: number, freq: number, peak = 0.22) {
    const ctx = this.ctx!;
    for (const [mult, amp] of [[1, 1], [2, 0.35], [3, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = mult === 1 ? "triangle" : "sine";
      o.frequency.value = freq * mult * (1 + this.rng.range(-0.002, 0.002));
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(freq * 8, t);
      f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 1.2);
      const g = ctx.createGain();
      this.env(g, t, 0.003, peak * amp, 1.8);
      o.connect(f).connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 2);
    }
    this.noiseBurst(t, 0.03, "highpass", 3000, 0.7, peak * 0.15, this.musicBus);
  }

  private shakuhachi(t: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 0.97, t);
    o.frequency.linearRampToValueAtTime(freq, t + 0.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.35);
    g.gain.setValueAtTime(0.09, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
    // Breath.
    this.noiseBurst(t, dur, "bandpass", freq * 2, 3, 0.02, this.musicBus);
  }

  private taiko(t: number, strong: boolean) {
    this.tone(t, strong ? 90 : 120, 0.35, "sine", strong ? 0.5 : 0.28, this.musicBus, 45);
    this.noiseBurst(t, 0.08, "lowpass", 600, 0.7, strong ? 0.25 : 0.12, this.musicBus);
  }

  /** Called every frame with context for ambience and music. */
  update(context: { riverDist: number; night: number; combat: boolean; indoorsQuiet?: boolean }) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    this.night = context.night;
    this.combat += ((context.combat ? 1 : 0) - this.combat) * 0.02;
    // Ambience.
    const riverGain = clamp(1 - context.riverDist / 45, 0, 1) * 0.55;
    this.river.gain.setTargetAtTime(riverGain, t, 0.3);
    this.wind.gain.setTargetAtTime(0.08 + 0.06 * Math.sin(t * 0.13) + this.night * 0.04, t, 0.8);
    if (t > this.nextBird && context.night < 0.4) {
      this.nextBird = t + this.rng.range(2, 7);
      const base = this.rng.range(2200, 3800);
      for (let i = 0; i < this.rng.int(2, 5); i++) this.tone(t + i * 0.11, base * this.rng.range(0.9, 1.1), 0.08, "sine", 0.03, this.ambBus, base * 1.3);
    }
    if (t > this.nextCricket && context.night > 0.6) {
      this.nextCricket = t + this.rng.range(0.4, 1.4);
      for (let i = 0; i < 4; i++) this.tone(t + i * 0.045, 4800, 0.025, "square", 0.006, this.ambBus);
    }
    // Music.
    if (!this.musicOn) return;
    if (t > this.nextNote) {
      const slow = 1 + this.night * 0.8;
      this.nextNote = t + this.rng.pick([0.45, 0.6, 0.9, 1.2, 1.8]) * slow;
      if (this.rng.chance(0.82)) {
        const octave = this.rng.pick([0, 12, 12, 24]);
        const deg = SCALE[this.rng.int(0, SCALE.length - 1)];
        const freq = 146.83 * Math.pow(2, (deg + octave) / 12);
        this.koto(t + 0.02, freq, 0.16 + this.rng.range(0, 0.08));
        if (this.rng.chance(0.2)) this.koto(t + 0.14, freq * Math.pow(2, 7 / 12), 0.08);
      }
    }
    if (t > this.nextDrone) {
      this.nextDrone = t + this.rng.range(9, 16);
      if (this.rng.chance(0.55)) {
        const deg = this.rng.pick([0, 5, 7]);
        this.shakuhachi(t + 0.1, 293.66 * Math.pow(2, deg / 12), this.rng.range(3, 5));
      }
    }
    if (this.combat > 0.3 && t > this.nextDrum) {
      this.nextDrum = t + 0.24;
      const pat = [1, 0, 0, 1, 0, 1, 0, 0];
      const step = this.drumStep++ % pat.length;
      if (pat[step]) this.taiko(t, step === 0);
    }
  }

  play(s: Sfx, volume = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.005;
    const b = this.sfxBus;
    const v = volume;
    switch (s) {
      case "step":
        this.noiseBurst(t, 0.07, "lowpass", this.rng.range(500, 800), 0.8, 0.07 * v, b);
        break;
      case "swing":
        this.noiseBurst(t, 0.2, "bandpass", 1800, 1.5, 0.22 * v, b, 500);
        break;
      case "swingHeavy":
        this.noiseBurst(t, 0.35, "bandpass", 1200, 1.2, 0.3 * v, b, 250);
        break;
      case "hit":
        this.noiseBurst(t, 0.12, "lowpass", 1400, 0.7, 0.35 * v, b);
        this.tone(t, 180, 0.15, "sine", 0.25 * v, b, 60);
        break;
      case "hitBlunt":
        this.tone(t, 110, 0.18, "sine", 0.4 * v, b, 50);
        this.noiseBurst(t, 0.09, "lowpass", 700, 0.7, 0.3 * v, b);
        break;
      case "block":
      case "parry":
        for (const f of s === "parry" ? [2100, 3150, 4700] : [1500, 2350]) this.tone(t, f * this.rng.range(0.97, 1.03), s === "parry" ? 0.6 : 0.3, "triangle", 0.09 * v, b);
        this.noiseBurst(t, 0.05, "highpass", 3000, 0.7, 0.2 * v, b);
        break;
      case "coin":
        this.tone(t, 1760, 0.12, "sine", 0.12 * v, b);
        this.tone(t + 0.07, 2640, 0.2, "sine", 0.1 * v, b);
        break;
      case "click":
        this.tone(t, 900, 0.04, "sine", 0.06 * v, b);
        break;
      case "open":
        this.tone(t, 520, 0.12, "triangle", 0.07 * v, b, 780);
        break;
      case "close":
        this.tone(t, 700, 0.1, "triangle", 0.06 * v, b, 420);
        break;
      case "special":
        this.noiseBurst(t, 0.8, "bandpass", 400, 1.5, 0.3 * v, b, 3500);
        this.tone(t, 220, 0.8, "sawtooth", 0.05 * v, b, 880);
        break;
      case "boom":
        this.noiseBurst(t, 0.4, "lowpass", 900, 0.7, 0.7 * v, b);
        this.tone(t, 90, 0.4, "sine", 0.6 * v, b, 35);
        break;
      case "splash":
        this.noiseBurst(t, 0.3, "bandpass", 1200, 0.8, 0.2 * v, b, 400);
        break;
      case "bell":
        for (const [f, a] of [[523, 0.2], [1310, 0.08], [2093, 0.05]] as const) this.tone(t, f, 3, "sine", a * v, b);
        break;
      case "dice":
        for (let i = 0; i < 8; i++) this.noiseBurst(t + i * 0.06 + this.rng.range(0, 0.02), 0.03, "bandpass", 2500, 2, 0.12 * v, b);
        break;
      case "thunder":
        this.noiseBurst(t, 0.6, "bandpass", 3000, 0.8, 0.35 * v, b, 800);
        this.tone(t, 60, 0.5, "square", 0.08 * v, b, 30);
        break;
      case "poof":
        this.noiseBurst(t, 0.35, "lowpass", 1400, 0.6, 0.3 * v, b, 300);
        break;
      case "whoosh":
        this.noiseBurst(t, 0.45, "bandpass", 800, 1, 0.3 * v, b, 2400);
        break;
      case "down":
        this.tone(t, 140, 0.3, "sine", 0.35 * v, b, 60);
        this.noiseBurst(t + 0.05, 0.2, "lowpass", 500, 0.7, 0.25 * v, b);
        break;
      case "quest":
        [0, 7, 12].forEach((st, i) => this.koto(t + i * 0.12, 293.66 * Math.pow(2, st / 12), 0.2));
        break;
      case "error":
        this.tone(t, 220, 0.18, "triangle", 0.1 * v, b, 180);
        break;
      case "eat":
        for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.12, 0.05, "bandpass", 1600, 1.2, 0.1 * v, b);
        break;
    }
  }
}
