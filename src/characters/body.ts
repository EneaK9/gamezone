// The skinned body: torso, neck, arms, legs, hands and bare feet. Also exports the ring
// and weight helpers that clothing reuses so garments deform exactly like the body.

import * as THREE from "three";
import { BI, type BoneName, type Proportions } from "./skeleton";
import { MeshBuilder, SKIN_SURF, ellipseRing, ringFrame, sstep, type RingSpec, type Surf, type Weights } from "./meshkit";

export type Side = "L" | "R";
export const sideSign = (s: Side) => (s === "L" ? 1 : -1);

// ——— weights ————————————————————————————————————————————————————————

/** Torso weights by height fraction (y / H). */
export function torsoWeights(p: Proportions, y: number): Weights {
  const f = y / p.H;
  const hs = p.pos.hips.y / p.H;
  const sp = p.pos.spine.y / p.H;
  const ch = p.pos.chest.y / p.H;
  const nk = p.pos.neck.y / p.H;
  if (f < hs + 0.02) return [[BI.hips, 1]];
  if (f < sp + 0.04) {
    const t = sstep(hs + 0.02, sp + 0.04, f);
    return [[BI.hips, 1 - t], [BI.spine, t]];
  }
  if (f < ch + 0.04) {
    const t = sstep(sp + 0.04, ch + 0.04, f);
    return [[BI.spine, 1 - t], [BI.chest, t]];
  }
  if (f < nk - 0.01) return [[BI.chest, 1]];
  const t = sstep(nk - 0.01, nk + 0.04, f);
  return [[BI.chest, 1 - t * 0.7], [BI.neck, t * 0.7]];
}

/** Arm weights by parameter along shoulder→wrist (0..1). */
export function armWeights(p: Proportions, side: Side, t: number): Weights {
  const s = side;
  const ua = BI[`upperArm${s}` as BoneName];
  const fa = BI[`foreArm${s}` as BoneName];
  const hand = BI[`hand${s}` as BoneName];
  const sh = BI[`shoulder${s}` as BoneName];
  const e = elbowT(p, side);
  if (t < 0.1) {
    const k = sstep(-0.06, 0.1, t);
    return [[sh, (1 - k) * 0.45], [BI.chest, (1 - k) * 0.25], [ua, 0.3 + k * 0.7]];
  }
  if (t < e - 0.07) return [[ua, 1]];
  if (t < e + 0.07) {
    const k = sstep(e - 0.07, e + 0.07, t);
    return [[ua, 1 - k], [fa, k]];
  }
  if (t < 0.93) return [[fa, 1]];
  const k = sstep(0.93, 1.05, t);
  return [[fa, 1 - k * 0.5], [hand, k * 0.5]];
}

export function legWeights(p: Proportions, side: Side, t: number): Weights {
  const th = BI[`thigh${side}` as BoneName];
  const sh = BI[`shin${side}` as BoneName];
  const ft = BI[`foot${side}` as BoneName];
  const k0 = kneeT(p, side);
  if (t < 0.08) {
    const k = sstep(-0.08, 0.08, t);
    return [[BI.hips, (1 - k) * 0.55], [th, 0.45 + k * 0.55]];
  }
  if (t < k0 - 0.06) return [[th, 1]];
  if (t < k0 + 0.06) {
    const k = sstep(k0 - 0.06, k0 + 0.06, t);
    return [[th, 1 - k], [sh, k]];
  }
  if (t < 0.94) return [[sh, 1]];
  const k = sstep(0.94, 1.06, t);
  return [[sh, 1 - k * 0.5], [ft, k * 0.5]];
}

export function elbowT(p: Proportions, side: Side) {
  const a = p.pos[`upperArm${side}` as BoneName];
  const e = p.pos[`foreArm${side}` as BoneName];
  const w = p.pos[`hand${side}` as BoneName];
  const l1 = a.distanceTo(e);
  return l1 / (l1 + e.distanceTo(w));
}

export function kneeT(p: Proportions, side: Side) {
  const a = p.pos[`thigh${side}` as BoneName];
  const k = p.pos[`shin${side}` as BoneName];
  const f = p.pos[`foot${side}` as BoneName];
  const l1 = a.distanceTo(k);
  return l1 / (l1 + k.distanceTo(f));
}

/** Point and direction at parameter t along a polyline (by arc length). t may extend past 0..1. */
export function alongChain(pts: THREE.Vector3[], t: number): { p: THREE.Vector3; d: THREE.Vector3 } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = pts[i].distanceTo(pts[i + 1]);
    lens.push(l);
    total += l;
  }
  let dist = t * total;
  if (dist <= 0) {
    const d = pts[1].clone().sub(pts[0]).normalize();
    return { p: pts[0].clone().addScaledVector(d, dist), d };
  }
  for (let i = 0; i < lens.length; i++) {
    if (dist <= lens[i] || i === lens.length - 1) {
      const d = pts[i + 1].clone().sub(pts[i]).normalize();
      return { p: pts[i].clone().addScaledVector(d, dist), d };
    }
    dist -= lens[i];
  }
  const d = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
  return { p: pts[pts.length - 1].clone(), d };
}

export function armChain(p: Proportions, side: Side) {
  return [p.pos[`upperArm${side}` as BoneName], p.pos[`foreArm${side}` as BoneName], p.pos[`hand${side}` as BoneName]];
}

export function legChain(p: Proportions, side: Side) {
  return [p.pos[`thigh${side}` as BoneName], p.pos[`shin${side}` as BoneName], p.pos[`foot${side}` as BoneName]];
}

// ——— ring stations ——————————————————————————————————————————————————

export interface Station {
  t: number;
  /** Radius as a fraction of H. */
  r: number;
  /** Optional front/back and width multipliers. */
  f?: number;
  b?: number;
  x?: number;
}

/** Radii profile of an arm (fraction of H), shaped by muscle. */
export function armStations(p: Proportions): Station[] {
  const m = p.muscle;
  const w = p.female ? 0.9 : 1;
  const k = (0.9 + (p.width - 0.88) * 0.45) * w;
  return [
    // Rounded deltoid cap above the shoulder joint.
    { t: -0.075, r: 0.004 * k },
    { t: -0.066, r: 0.016 * k * (1 + m * 0.2) },
    { t: -0.05, r: 0.025 * k * (1 + m * 0.22) },
    { t: -0.03, r: 0.031 * k * (1 + m * 0.3), x: 1.03 },
    { t: 0.0, r: 0.033 * k * (1 + m * 0.3), x: 1.05 },
    { t: 0.1, r: 0.031 * k * (1 + m * 0.3), x: 1.08 },
    { t: 0.28, r: 0.027 * k * (1 + m * 0.35), f: 1.08 },
    { t: 0.45, r: 0.024 * k * (1 + m * 0.2) },
    { t: 0.55, r: 0.021 * k },
    { t: 0.62, r: 0.022 * k * (1 + m * 0.15) },
    { t: 0.7, r: 0.023 * k * (1 + m * 0.2), x: 1.08 },
    { t: 0.85, r: 0.019 * k },
    { t: 1.0, r: 0.0155 * k, x: 1.2, f: 0.8, b: 0.8 },
  ];
}

export function legStations(p: Proportions): Station[] {
  const m = p.muscle;
  const k = (0.88 + (p.width - 0.88) * 0.5) * (p.female ? 1.04 : 1);
  return [
    { t: -0.09, r: 0.05 * k },
    { t: 0.0, r: 0.051 * k * (1 + m * 0.1) },
    { t: 0.14, r: 0.048 * k * (1 + m * 0.12), f: 1.05 },
    { t: 0.3, r: 0.042 * k * (1 + m * 0.1) },
    { t: 0.44, r: 0.033 * k },
    { t: 0.5, r: 0.031 * k },
    { t: 0.58, r: 0.033 * k * (1 + m * 0.1), b: 1.15 },
    { t: 0.68, r: 0.034 * k * (1 + m * 0.15), b: 1.22 },
    { t: 0.82, r: 0.025 * k },
    { t: 0.95, r: 0.019 * k },
    { t: 1.02, r: 0.019 * k },
  ];
}

/**
 * Build rings for a limb along a chain. `grow` adds an absolute offset (m) for clothing;
 * `from`/`to` clip the stations.
 */
export function limbRings(
  p: Proportions,
  chain: THREE.Vector3[],
  stations: Station[],
  weights: (t: number) => Weights,
  color: THREE.Color | ((t: number, th: number) => THREE.Color),
  opts: { grow?: number | ((t: number) => number); from?: number; to?: number; segments?: number; fwd?: THREE.Vector3; sag?: (t: number, th: number) => number; arc?: [number, number]; scaleXZ?: (t: number) => [number, number] } = {},
): RingSpec[] {
  const seg = opts.segments ?? 14;
  const from = opts.from ?? -1;
  const to = opts.to ?? 2;
  const st = stations.filter((s) => s.t >= from - 1e-6 && s.t <= to + 1e-6);
  // Interpolated end stations when clipping.
  const interp = (t: number): Station => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / (b.t - a.t);
        return { t, r: a.r + (b.r - a.r) * k, f: (a.f ?? 1) + ((b.f ?? 1) - (a.f ?? 1)) * k, b: (a.b ?? 1) + ((b.b ?? 1) - (a.b ?? 1)) * k, x: (a.x ?? 1) + ((b.x ?? 1) - (a.x ?? 1)) * k };
      }
    }
    return { ...stations[t < stations[0].t ? 0 : stations.length - 1], t };
  };
  if (from > stations[0].t && !st.some((s) => Math.abs(s.t - from) < 1e-6)) st.unshift(interp(from));
  if (to < stations[stations.length - 1].t && !st.some((s) => Math.abs(s.t - to) < 1e-6)) st.push(interp(to));
  const fwdHint = opts.fwd ?? new THREE.Vector3(0, 0, 1);
  const rings: RingSpec[] = [];
  let v = 0;
  let prev: THREE.Vector3 | null = null;
  for (const s of st) {
    const { p: c, d } = alongChain(chain, s.t);
    const { right, fwd } = ringFrame(d, fwdHint);
    const grow = typeof opts.grow === "function" ? opts.grow(s.t) : opts.grow ?? 0;
    const r = s.r * p.H + grow;
    const [kx, kz] = opts.scaleXZ ? opts.scaleXZ(s.t) : [1, 1];
    const ring = ellipseRing(c, right, fwd, {
      rx: r * (s.x ?? 1) * kx,
      rf: r * (s.f ?? 1) * kz,
      rb: r * (s.b ?? 1) * kz,
      segments: seg,
      bulge: opts.sag ? (th) => opts.sag!(s.t, th) : undefined,
      arc: opts.arc,
    });
    if (prev) v += prev.distanceTo(c);
    prev = c;
    const angle = (i: number) => (opts.arc ? opts.arc[0] + ((opts.arc[1] - opts.arc[0]) * i) / seg : (i / seg) * Math.PI * 2);
    const colors = typeof color === "function" ? ring.points.map((_, i) => color(s.t, angle(i))) : color;
    rings.push({ points: ring.points, normals: ring.normals, weights: weights(s.t), colors, v });
  }
  return rings;
}

// ——— torso ————————————————————————————————————————————————————————————

export interface TorsoStation {
  /** Height as a fraction of H. */
  y: number;
  rx: number;
  rf: number;
  rb: number;
  /** Forward offset of the ring centre (fraction of H). */
  z?: number;
}

export function torsoStations(p: Proportions): TorsoStation[] {
  const f = p.female;
  const hs = p.pos.hips.y / p.H;
  const nk = p.pos.neck.y / p.H;
  const sh = p.pos.upperArmL.y / p.H;
  // Heights scale between the crotch and the neck.
  const crotch = hs - 0.075;
  const span = nk - crotch;
  const Y = (k: number) => crotch + span * k;
  const belly = Math.max(0, p.depth - 1.05) * 0.06;
  const bust = f && !p.child ? 0.022 : 0;
  const hipW = f ? 1.1 : 1;
  const waistW = f ? 0.84 : 1;
  const chestW = f ? 0.9 : 1 + p.muscle * 0.08;
  const s: TorsoStation[] = [
    { y: Y(0.0), rx: 0.048, rf: 0.035, rb: 0.04 },
    { y: Y(0.07), rx: 0.083 * hipW, rf: 0.052, rb: 0.064 },
    { y: Y(0.16), rx: 0.094 * hipW, rf: 0.058, rb: 0.07 },
    { y: Y(0.28), rx: 0.092 * hipW, rf: 0.058 + belly * 0.6, rb: 0.062 },
    { y: Y(0.42), rx: 0.08 * waistW, rf: 0.055 + belly, rb: 0.05 },
    { y: Y(0.55), rx: 0.085 * chestW, rf: 0.06 + belly * 0.8, rb: 0.05 },
    { y: Y(0.68), rx: 0.094 * chestW, rf: 0.07 + bust + belly * 0.3, rb: 0.055 },
    { y: Y(0.79), rx: 0.098 * chestW, rf: 0.072 + bust, rb: 0.058 },
    { y: sh - 0.02, rx: 0.09 * chestW, rf: 0.06, rb: 0.056 },
    { y: sh + 0.004, rx: 0.078 * chestW, rf: 0.047, rb: 0.052 },
    // Trapezius: the shoulders slope up into a broad neck base.
    { y: (sh + nk) / 2 + 0.008, rx: 0.062 * chestW, rf: 0.04, rb: 0.048, z: -0.002 },
    { y: nk + 0.008, rx: 0.045, rf: 0.034, rb: 0.04, z: -0.004 },
    { y: nk + 0.016, rx: 0.037, rf: 0.031, rb: 0.035, z: -0.004 },
  ];
  return s;
}

export function torsoRings(
  p: Proportions,
  color: THREE.Color | ((y: number, th: number) => THREE.Color),
  opts: { grow?: number | ((y: number) => number); from?: number; to?: number; segments?: number; stations?: TorsoStation[]; flare?: (y: number, th: number) => number; arc?: (y: number) => [number, number]; subdivide?: number } = {},
): RingSpec[] {
  const seg = opts.segments ?? 22;
  let all = opts.stations ?? torsoStations(p);
  if (opts.subdivide && opts.subdivide > 1) {
    const out: TorsoStation[] = [];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      for (let k = 0; k < opts.subdivide; k++) {
        const t = k / opts.subdivide;
        out.push({ y: a.y + (b.y - a.y) * t, rx: a.rx + (b.rx - a.rx) * t, rf: a.rf + (b.rf - a.rf) * t, rb: a.rb + (b.rb - a.rb) * t, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t });
      }
    }
    out.push(all[all.length - 1]);
    all = out;
  }
  const from = opts.from ?? -1;
  const to = opts.to ?? 9;
  const interp = (y: number): TorsoStation => {
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i];
      const b = all[i + 1];
      if (y >= a.y && y <= b.y) {
        const k = (y - a.y) / (b.y - a.y);
        return { y, rx: a.rx + (b.rx - a.rx) * k, rf: a.rf + (b.rf - a.rf) * k, rb: a.rb + (b.rb - a.rb) * k, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * k };
      }
    }
    return { ...all[y < all[0].y ? 0 : all.length - 1], y };
  };
  const st = all.filter((s) => s.y >= from && s.y <= to);
  if (from > all[0].y) st.unshift(interp(from));
  if (to < all[all.length - 1].y) st.push(interp(to));
  const rings: RingSpec[] = [];
  const right = new THREE.Vector3(-1, 0, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  let v = 0;
  let prevY: number | null = null;
  for (const s of st) {
    const y = s.y * p.H;
    const g = typeof opts.grow === "function" ? opts.grow(s.y) : opts.grow ?? 0;
    const c = new THREE.Vector3(0, y, (s.z ?? 0) * p.H);
    const ring = ellipseRing(c, right, fwd, {
      rx: s.rx * p.H * p.width + g,
      rf: s.rf * p.H * p.depth + g,
      rb: s.rb * p.H * p.depth + g,
      pow: 2.3,
      segments: seg,
      mod: opts.flare ? (th) => 1 + opts.flare!(s.y, th) : undefined,
      arc: opts.arc ? opts.arc(s.y) : undefined,
    });
    if (prevY !== null) v += y - prevY;
    prevY = y;
    const arc = opts.arc ? opts.arc(s.y) : null;
    const angle = (i: number) => (arc ? arc[0] + ((arc[1] - arc[0]) * i) / seg : (i / seg) * Math.PI * 2);
    const colors = typeof color === "function" ? ring.points.map((_, i) => color(s.y, angle(i))) : color;
    rings.push({ points: ring.points, normals: ring.normals, weights: torsoWeights(p, y), colors, v });
  }
  return rings;
}

// ——— the body itself ————————————————————————————————————————————————

export interface BodyOpts {
  skin: THREE.Color;
  /** Skip parts fully hidden by clothing. */
  hideTorso?: boolean;
  hideLegsAbove?: number;
  hideArmsAbove?: number;
  gloves?: THREE.Color;
  feet?: THREE.Color;
  /** Visible abs & pecs definition (El Primo). */
  definition?: number;
  /** Footwear builds its own foot shape (boots, tabi). */
  skipFeet?: boolean;
}

export function buildBody(mb: MeshBuilder, p: Proportions, o: BodyOpts) {
  const skin = o.skin;
  const shade = skin.clone().multiplyScalar(0.86);
  const def = o.definition ?? 0;
  // Torso with subtle muscle shading.
  if (!o.hideTorso) {
    const colorFn = (y: number, th: number) => {
      if (def <= 0) return skin;
      const front = Math.cos(th);
      const side = Math.sin(th);
      const yy = y / (p.pos.neck.y / p.H);
      // Pec lower edge and ab grid, painted as soft shading.
      let k = 0;
      if (front > 0.6 && yy > 0.72 && yy < 0.78) k = 0.5;
      if (front > 0.75 && yy > 0.58 && yy < 0.72 && Math.abs(side) < 0.08) k = 0.6;
      if (front > 0.75 && yy > 0.58 && yy < 0.7 && Math.abs(((yy - 0.58) / 0.04) % 1 - 0.5) < 0.08) k = 0.4;
      return skin.clone().lerp(shade, k * def);
    };
    mb.loft(torsoRings(p, colorFn), SKIN_SURF, { capStart: true });
  }
  // Neck.
  const neckA = new THREE.Vector3(0, p.pos.neck.y - 0.02 * p.H, -0.006 * p.H);
  const neckB = new THREE.Vector3(0, p.pos.head.y + 0.035 * p.H, -0.004 * p.H);
  const nr = (p.female ? 0.032 : 0.039) * p.H * (0.92 + p.muscle * 0.18);
  const neckRings = limbRings(
    p,
    [neckA, neckB],
    [
      { t: 0, r: nr / p.H * 1.1 },
      { t: 0.5, r: nr / p.H },
      { t: 1, r: nr / p.H * 0.95 },
    ],
    (t) => [[BI.neck, 1 - t * 0.6], [BI.head, t * 0.6]],
    skin,
    { segments: 14 },
  );
  mb.loft(neckRings, SKIN_SURF);

  for (const side of ["L", "R"] as Side[]) {
    const s = sideSign(side);
    // Arms.
    const arm = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), skin, {
      from: o.hideArmsAbove ?? -1,
      fwd: new THREE.Vector3(0, 0, 1),
    });
    mb.loft(arm, SKIN_SURF, { capStart: (o.hideArmsAbove ?? -1) > 0 });
    // Hands.
    buildHand(mb, p, side, o.gloves ?? skin);
    // Legs.
    const leg = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), skin, {
      from: o.hideLegsAbove ?? -1,
    });
    mb.loft(leg, SKIN_SURF, { capStart: (o.hideLegsAbove ?? -1) > 0 });
    if (!o.skipFeet) buildFoot(mb, p, side, o.feet ?? skin);
    void s;
  }
}

/** Mitten hand with a thumb; fingers weighted to the fingers bone so they can curl. */
export function buildHand(mb: MeshBuilder, p: Proportions, side: Side, color: THREE.Color) {
  const s = sideSign(side);
  const H = p.H;
  const k = (p.female ? 1.02 : 1.14) * (1 + p.muscle * 0.08) * (p.child ? 0.92 : 1);
  const wrist = p.pos[`hand${side}` as BoneName];
  const knuckle = p.pos[`fingers${side}` as BoneName];
  const hb = BI[`hand${side}` as BoneName];
  const fb = BI[`fingers${side}` as BoneName];
  const palm = new THREE.SphereGeometry(1, 12, 10);
  const palmM = new THREE.Matrix4().compose(
    wrist.clone().lerp(knuckle, 0.5).add(new THREE.Vector3(0, 0, 0.004 * H)),
    new THREE.Quaternion(),
    new THREE.Vector3(0.0085 * H * k, 0.027 * H * k, 0.024 * H * k),
  );
  mb.add(palm, palmM, color, SKIN_SURF, [[hb, 1]]);
  const fingers = new THREE.SphereGeometry(1, 12, 10);
  const fingM = new THREE.Matrix4().compose(
    knuckle.clone().add(new THREE.Vector3(-0.001 * s * H, -0.022 * H * k, 0.004 * H)),
    new THREE.Quaternion(),
    new THREE.Vector3(0.0075 * H * k, 0.029 * H * k, 0.022 * H * k),
  );
  mb.add(fingers, fingM, color, SKIN_SURF, [[fb, 1]]);
  const thumb = new THREE.CapsuleGeometry(0.0055 * H * k, 0.022 * H * k, 4, 8);
  const thumbM = new THREE.Matrix4().compose(
    wrist.clone().add(new THREE.Vector3(-0.004 * s * H, -0.02 * H, 0.02 * H * k)),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, -0.35 * s)),
    new THREE.Vector3(1, 1, 1),
  );
  mb.add(thumb, thumbM, color, SKIN_SURF, [[hb, 1]]);
}

/** Bare foot; footwear is layered on top by clothes.ts. */
export function buildFoot(mb: MeshBuilder, p: Proportions, side: Side, color: THREE.Color, grow = 0, surf: Surf = SKIN_SURF, height = 1) {
  const H = p.H;
  const ankle = p.pos[`foot${side}` as BoneName];
  const toe = p.pos[`toes${side}` as BoneName];
  const fb = BI[`foot${side}` as BoneName];
  const tb = BI[`toes${side}` as BoneName];
  const len = toe.z - ankle.z + 0.035 * H;
  const heelZ = ankle.z - 0.03 * H;
  const rings: RingSpec[] = [];
  const steps = [
    { t: 0, w: 0.022, h: 0.024 },
    { t: 0.18, w: 0.026, h: 0.034 },
    { t: 0.45, w: 0.03, h: 0.03 },
    { t: 0.72, w: 0.034, h: 0.02 },
    { t: 0.92, w: 0.031, h: 0.014 },
    { t: 1.0, w: 0.018, h: 0.008 },
  ];
  let v = 0;
  for (const st of steps) {
    const z = heelZ + len * st.t;
    const c = new THREE.Vector3(ankle.x, 0, z);
    const pts: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const seg = 12;
    const hh = (st.h * H + grow) * height;
    const ww = st.w * H + grow;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // Flat sole: y never below 0.
      const y = Math.max(0.004, hh * (0.5 + 0.5 * Math.cos(a)) + (st.t < 0.3 ? 0.01 * H * (1 - st.t / 0.3) : 0));
      const x = ww * Math.sin(a) * 0.5 * (1.8 - Math.abs(Math.cos(a)) * 0.8);
      pts.push(new THREE.Vector3(c.x + x, y, z));
      nrm.push(new THREE.Vector3(Math.sin(a), Math.cos(a), 0).normalize());
    }
    const w: Weights = st.t > 0.7 ? [[tb, sstep(0.7, 0.85, st.t)], [fb, 1 - sstep(0.7, 0.85, st.t)]] : [[fb, 1]];
    if (rings.length) v += len * (st.t - steps[rings.length - 1].t);
    rings.push({ points: pts, normals: nrm, weights: w, colors: color, v });
  }
  mb.loft(rings, surf, { capStart: true, capEnd: true });
}
