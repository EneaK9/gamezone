// Day/night cycle. One in-game day takes REAL_MINUTES_PER_DAY real minutes.

import * as THREE from "three";
import { clamp, smoothstep } from "../core/math";

export const REAL_MINUTES_PER_DAY = 24;

interface Palette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogDensity: number;
  cloud: THREE.Color;
  exposure: number;
  /** 0 day … 1 night: drives lanterns, stars, window glow. */
  night: number;
}

const c = (hex: string) => new THREE.Color(hex);

const KEYS: [number, Omit<Palette, "night"> & { night: number }][] = [
  [0, { zenith: c("#0b1428"), horizon: c("#22314f"), ground: c("#141a24"), sun: c("#8ea6d8"), sunIntensity: 0.32, hemiSky: c("#3a4f7a"), hemiGround: c("#1a1c22"), hemiIntensity: 0.55, fog: c("#1d2940"), fogDensity: 0.0030, cloud: c("#3a4660"), exposure: 1.25, night: 1 }],
  [4.6, { zenith: c("#0f1a33"), horizon: c("#2b3a5c"), ground: c("#161b25"), sun: c("#8ea6d8"), sunIntensity: 0.28, hemiSky: c("#3c4f78"), hemiGround: c("#1c1d24"), hemiIntensity: 0.5, fog: c("#243150"), fogDensity: 0.0030, cloud: c("#3e4a66"), exposure: 1.25, night: 1 }],
  [5.8, { zenith: c("#3d5a8a"), horizon: c("#f0a882"), ground: c("#4a4038"), sun: c("#ffb07a"), sunIntensity: 1.0, hemiSky: c("#9fb2d6"), hemiGround: c("#5a4a3e"), hemiIntensity: 0.65, fog: c("#d9b8a8"), fogDensity: 0.0026, cloud: c("#f6c9b0"), exposure: 1.05, night: 0.45 }],
  [7.2, { zenith: c("#5d93c9"), horizon: c("#f4d6b8"), ground: c("#6b6152"), sun: c("#ffd9ae"), sunIntensity: 2.3, hemiSky: c("#b5cde6"), hemiGround: c("#6d6250"), hemiIntensity: 0.75, fog: c("#dfe3dc"), fogDensity: 0.0019, cloud: c("#fff1e2"), exposure: 1.0, night: 0 }],
  [11, { zenith: c("#5a9bd6"), horizon: c("#cfe5ee"), ground: c("#72705f"), sun: c("#fff4e3"), sunIntensity: 3.0, hemiSky: c("#bcd8ee"), hemiGround: c("#6e6b58"), hemiIntensity: 0.85, fog: c("#d4e4ea"), fogDensity: 0.0015, cloud: c("#ffffff"), exposure: 1.0, night: 0 }],
  [15.5, { zenith: c("#5c98cf"), horizon: c("#d8e6e6"), ground: c("#726c58"), sun: c("#fff0d6"), sunIntensity: 2.8, hemiSky: c("#bad3e8"), hemiGround: c("#6e6852"), hemiIntensity: 0.82, fog: c("#d6e2e2"), fogDensity: 0.0016, cloud: c("#fffaf0"), exposure: 1.0, night: 0 }],
  [17.6, { zenith: c("#4f7fb5"), horizon: c("#f2c79a"), ground: c("#6b5a46"), sun: c("#ffc285"), sunIntensity: 2.2, hemiSky: c("#b0c0d8"), hemiGround: c("#6a5540"), hemiIntensity: 0.72, fog: c("#e6cfb4"), fogDensity: 0.0019, cloud: c("#ffe0c0"), exposure: 1.02, night: 0.05 }],
  [18.7, { zenith: c("#35507f"), horizon: c("#f08a5a"), ground: c("#4c3a30"), sun: c("#ff8a55"), sunIntensity: 1.2, hemiSky: c("#8d98bd"), hemiGround: c("#4d3a30"), hemiIntensity: 0.6, fog: c("#c98f78"), fogDensity: 0.0022, cloud: c("#f7a47e"), exposure: 1.08, night: 0.5 }],
  [19.8, { zenith: c("#18244a"), horizon: c("#5a4a6e"), ground: c("#1e1d26"), sun: c("#9aaee0"), sunIntensity: 0.35, hemiSky: c("#46547e"), hemiGround: c("#22212a"), hemiIntensity: 0.55, fog: c("#3a3b58"), fogDensity: 0.0027, cloud: c("#5a5577"), exposure: 1.2, night: 0.92 }],
  [24, { zenith: c("#0b1428"), horizon: c("#22314f"), ground: c("#141a24"), sun: c("#8ea6d8"), sunIntensity: 0.32, hemiSky: c("#3a4f7a"), hemiGround: c("#1a1c22"), hemiIntensity: 0.55, fog: c("#1d2940"), fogDensity: 0.0030, cloud: c("#3a4660"), exposure: 1.25, night: 1 }],
];

function blend(a: Palette, b: Palette, t: number, out: Palette): Palette {
  out.zenith.copy(a.zenith).lerp(b.zenith, t);
  out.horizon.copy(a.horizon).lerp(b.horizon, t);
  out.ground.copy(a.ground).lerp(b.ground, t);
  out.sun.copy(a.sun).lerp(b.sun, t);
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.cloud.copy(a.cloud).lerp(b.cloud, t);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t;
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;
  out.fogDensity = a.fogDensity + (b.fogDensity - a.fogDensity) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  out.night = a.night + (b.night - a.night) * t;
  return out;
}

export class DayNight {
  /** Hours, 0..24. */
  hour: number;
  day = 1;
  paused = false;
  readonly palette: Palette = {
    zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(),
    sunIntensity: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1,
    fog: new THREE.Color(), fogDensity: 0.0014, cloud: new THREE.Color(), exposure: 1, night: 0,
  };
  /** Direction toward the sun (may be below the horizon). */
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  /** Direction of whichever body currently casts shadows. */
  readonly lightDir = new THREE.Vector3();

  constructor(hour = 15.2) {
    this.hour = hour;
    this.update(0);
  }

  get isNight(): boolean {
    return this.palette.night > 0.6;
  }

  /** "15:24" */
  clock(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /** Traditional name of the time of day. */
  periodName(): string {
    const h = this.hour;
    if (h < 5) return "Deep night";
    if (h < 7) return "Dawn";
    if (h < 11) return "Morning";
    if (h < 14) return "Midday";
    if (h < 17.5) return "Afternoon";
    if (h < 19.5) return "Dusk";
    return "Night";
  }

  advanceTo(hour: number) {
    if (hour <= this.hour) this.day++;
    this.hour = hour;
    this.update(0);
  }

  update(dt: number) {
    if (!this.paused) {
      this.hour += (dt / 60 / REAL_MINUTES_PER_DAY) * 24;
      if (this.hour >= 24) {
        this.hour -= 24;
        this.day++;
      }
    }
    // Palette
    let i = 0;
    while (i < KEYS.length - 1 && KEYS[i + 1][0] <= this.hour) i++;
    const [h0, p0] = KEYS[i];
    const [h1, p1] = KEYS[Math.min(i + 1, KEYS.length - 1)];
    const t = h1 > h0 ? smoothstep(0, 1, (this.hour - h0) / (h1 - h0)) : 0;
    blend(p0, p1, t, this.palette);

    // Sun: rises in the east (+x) around 6:00, sets in the west around 18:40.
    const theta = ((this.hour - 6) / 12.7) * Math.PI;
    this.sunDir.set(Math.cos(theta), Math.sin(theta) * 0.86, Math.sin(theta) * 0.42 + 0.12).normalize();
    const mt = theta + Math.PI;
    this.moonDir.set(Math.cos(mt) * 0.7, Math.sin(mt) * 0.8, 0.35).normalize();
    const sunUp = smoothstep(-0.02, 0.1, this.sunDir.y);
    if (sunUp > 0.001 || this.moonDir.y < 0.12) {
      this.lightDir.copy(this.sunDir);
      if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
    } else {
      this.lightDir.copy(this.moonDir);
    }
    this.lightDir.normalize();
    this.palette.sunIntensity *= clamp(0.35 + sunUp, 0, 1) * (sunUp > 0.001 ? 1 : 1);
  }
}
