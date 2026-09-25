// Garments and footwear. Each garment is lofted over the same rings and skin weights as
// the body (slightly inflated), so clothes deform exactly with the limbs underneath.

import * as THREE from "three";
import type { Footwear, Garment, Look, Pattern } from "../../shared/look";
import {
  armChain,
  armStations,
  armWeights,
  buildFoot,
  legChain,
  legStations,
  legWeights,
  limbRings,
  sideSign,
  torsoRings,
  torsoStations,
  torsoWeights,
  type Side,
} from "./body";
import { CLOTH_SURF, LEATHER_SURF, METAL_SURF, MeshBuilder, SILK_SURF, SKIN_SURF, STRAW_SURF, type RingSpec, type Surf, type Weights } from "./meshkit";
import { BI, type BoneName, type Proportions } from "./skeleton";

export const PATTERN_INDEX: Record<Pattern, number> = { none: 0, waves: 1, hemp: 2, stripes: 3, checks: 4, dots: 5, cranes: 6, stars: 7 };

export interface Coverage {
  torso: boolean;
  /** Leg skin starts at this t (legs hidden above). -1 = legs fully visible. */
  legsFrom: number;
  armsFrom: number;
  feet: boolean;
}

const wrap = (a: number) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

function withPattern(rings: RingSpec[], base: THREE.Color, pat: number) {
  for (const r of rings) {
    if (Array.isArray(r.colors)) r.pats = r.colors.map((c) => (c === base ? pat : 0));
    else r.pats = r.points.map(() => (r.colors === base ? pat : 0));
  }
  return rings;
}

export function coverageOf(look: Look): Coverage {
  const c: Coverage = { torso: false, legsFrom: -1, armsFrom: -1, feet: false };
  for (const g of look.garments) {
    switch (g.kind) {
      case "kimono":
        if (g.sleeves === "narrow" || g.sleeves === "wide") c.armsFrom = Math.max(c.armsFrom, 0.72);
        else if (g.sleeves === "short") c.armsFrom = Math.max(c.armsFrom, 0.2);
        break;
      case "long_kimono":
        c.legsFrom = Math.max(c.legsFrom, 0.9);
        c.armsFrom = Math.max(c.armsFrom, 0.72);
        break;
      case "shirt":
        if (!g.open) c.torso = true;
        if (g.sleeves === "long") c.armsFrom = Math.max(c.armsFrom, 0.8);
        else if (g.sleeves === "short" || g.sleeves === "rolled") c.armsFrom = Math.max(c.armsFrom, 0.2);
        break;
      case "track_jacket":
        c.torso = true;
        c.armsFrom = Math.max(c.armsFrom, 0.8);
        break;
      case "hakama":
        c.legsFrom = Math.max(c.legsFrom, 0.92);
        break;
      case "pants":
        c.legsFrom = Math.max(c.legsFrom, g.length === "long" ? 0.9 : g.length === "knee" ? 0.5 : 0.3);
        break;
    }
  }
  return c;
}

export function buildGarments(mb: MeshBuilder, p: Proportions, look: Look) {
  const has = (k: Garment["kind"]) => look.garments.some((g) => g.kind === k);
  const hasHakama = has("hakama") || has("long_kimono");
  for (const g of look.garments) {
    mb.paint = { pat: 0, accent: new THREE.Color("#ffffff") };
    switch (g.kind) {
      case "kimono":
        kimonoTop(mb, p, g, hasHakama, look);
        break;
      case "long_kimono":
        longKimono(mb, p, g);
        break;
      case "haori":
        haori(mb, p, g);
        break;
      case "hakama":
        hakama(mb, p, g);
        break;
      case "pants":
        pants(mb, p, g);
        break;
      case "shirt":
        shirt(mb, p, g, look);
        break;
      case "vest":
        vest(mb, p, g);
        break;
      case "track_jacket":
        trackJacket(mb, p, g);
        break;
      case "sash":
        band(mb, p, 0.555, g.wide ? 0.06 : 0.028, new THREE.Color(g.color), g.wide ? 0.026 : 0.02, SILK_SURF);
        if (g.bow) bow(mb, p, new THREE.Color(g.color), g.wide ? 1.3 : 0.8);
        break;
      case "haramaki":
        band(mb, p, 0.585, 0.055, new THREE.Color(g.color), 0.018, CLOTH_SURF);
        break;
      case "belt":
        band(mb, p, 0.56, g.wide ? 0.048 : 0.018, new THREE.Color(g.color), 0.02, LEATHER_SURF);
        buckle(mb, p, new THREE.Color(g.buckle ?? "#c9a24a"), g.wide ? 1.6 : 1);
        break;
      case "rope_belt":
        ropeBelt(mb, p, new THREE.Color(g.color));
        break;
      case "waist_cloth":
        waistCloth(mb, p, new THREE.Color(g.color));
        break;
      case "scarf":
        scarf(mb, p, new THREE.Color(g.color), g.long ?? false);
        break;
      case "neck_bandana":
        neckBandana(mb, p, new THREE.Color(g.color));
        break;
      case "wristbands":
        for (const s of ["L", "R"] as Side[]) armBand(mb, p, s, 0.86, 0.99, new THREE.Color(g.color), 0.008);
        break;
      case "armguards":
        for (const s of ["L", "R"] as Side[]) armBand(mb, p, s, 0.62, 0.97, new THREE.Color(g.color), 0.006, LEATHER_SURF);
        break;
      case "arm_bandana":
        armBand(mb, p, "L", 0.2, 0.3, new THREE.Color(g.color), 0.012);
        break;
      case "apron":
        apron(mb, p, new THREE.Color(g.color));
        break;
      case "do_armor":
        doArmor(mb, p, new THREE.Color(g.color), new THREE.Color(g.lacing));
        break;
      case "kesa":
        diagonalBand(mb, p, new THREE.Color(g.color), 0.55, 0.022, -1.25, 1.45);
        break;
      case "chest_strap":
        diagonalBand(mb, p, new THREE.Color(g.color), 0.16, 0.024, 1.2, -1.35, LEATHER_SURF);
        break;
      case "cape":
        cape(mb, p, new THREE.Color(g.color), new THREE.Color(g.lining ?? g.color));
        break;
      case "tabi":
      case "gloves":
        break; // handled by body colours / footwear
    }
  }
  mb.paint = { pat: 0, accent: new THREE.Color("#ffffff") };
  if (look.marks?.includes("chest_x_scar")) chestScar(mb, p, new THREE.Color(look.skin));
}

// ——— tops ——————————————————————————————————————————————————————————

function kimonoTop(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "kimono" }>, tucked: boolean, look: Look) {
  const base = new THREE.Color(g.color);
  const collar = new THREE.Color(g.collar ?? "#e8e0d0");
  const nk = p.pos.neck.y / p.H;
  const bottom = tucked ? 0.545 : 0.47;
  const pat = PATTERN_INDEX[g.pattern ?? "none"];
  mb.paint = { pat, accent: new THREE.Color(g.accent ?? g.color) };
  vNeckTop(mb, p, base, collar, bottom, nk, g.open ? 0.2 : 0.085, g.open ? 0.9 : 0.46, pat, (y) => (y < 0.62 ? 0.018 : 0.013), (y) => (y < 0.56 ? (0.56 - y) * 1.2 : 0));
  if (g.sleeves !== "none") sleeves(mb, p, base, g.sleeves, pat);
  void look;
}

/**
 * A wrapped top with a V neckline: full rings below the V, open arcs above it (so the
 * body shows through with a crisp edge), and a raised collar band along each edge.
 */
function vNeckTop(
  mb: MeshBuilder,
  p: Proportions,
  base: THREE.Color,
  collar: THREE.Color,
  bottom: number,
  nk: number,
  depth: number,
  maxHalf: number,
  pat: number,
  grow: (y: number) => number,
  flare?: (y: number, th: number) => number,
) {
  const yV = nk - depth;
  const lower = torsoRings(p, base, { grow, from: bottom, to: yV, flare, segments: 32, subdivide: 2 });
  withPattern(lower, base, pat);
  mb.loft(lower, CLOTH_SURF);
  const half = (y: number) => Math.max(0.0005, maxHalf * Math.pow(Math.max(0, (y - yV) / (nk + 0.004 - yV)), 0.85));
  const upper = torsoRings(p, base, { grow, from: yV, to: nk + 0.004, segments: 30, subdivide: 3, arc: (y) => [half(y), Math.PI * 2 - half(y)] });
  withPattern(upper, base, pat);
  mb.loft(upper, CLOTH_SURF, { open: true });
  // Collar bands: the under-kimono shows as a white strip along each edge.
  for (const side of [1, -1]) {
    const band = torsoRings(p, collar, {
      grow: (y) => grow(y) + 0.004,
      from: yV,
      to: nk + 0.012,
      segments: 3,
      subdivide: 3,
      arc: (y) => {
        const h = half(Math.min(y, nk + 0.004));
        const w = 0.2;
        return side > 0 ? [h - 0.02, h + w] : [Math.PI * 2 - h - w, Math.PI * 2 - h + 0.02];
      },
    });
    for (const r of band) r.pats = r.points.map(() => 0);
    mb.loft(band, SILK_SURF, { open: true });
  }
}

function sleeves(mb: MeshBuilder, p: Proportions, color: THREE.Color, kind: "wide" | "narrow" | "short" | "none" | "long" | "rolled", pat = 0, extra = 0) {
  for (const side of ["L", "R"] as Side[]) {
    const to = kind === "short" ? 0.3 : kind === "rolled" ? 0.5 : kind === "wide" ? 0.93 : 0.95;
    const grow = (t: number) => {
      if (kind === "wide") return 0.012 + extra + Math.max(0, t - 0.25) * 0.035;
      if (kind === "short" || kind === "rolled") return 0.01 + extra + (t / to) * 0.006;
      return 0.009 + extra;
    };
    const rings = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), color, {
      from: -0.075,
      to,
      grow: (t) => (t < -0.04 ? grow(0) * Math.max(0.35, (t + 0.075) / 0.035) : grow(t)),
      scaleXZ: kind === "wide" ? (t) => [1 - Math.min(0.35, Math.max(0, t - 0.3) * 0.7), 1 + Math.min(1.6, Math.max(0, t - 0.25) * 2.6)] : undefined,
    });
    // Wide sleeves hang: push the rear of the lower sleeve down and back.
    if (kind === "wide") {
      const down = new THREE.Vector3(0, -1, 0);
      rings.forEach((r, j) => {
        const t = j / (rings.length - 1);
        r.points.forEach((pt, i) => {
          const th = (i / r.points.length) * Math.PI * 2;
          const back = Math.max(0, -Math.cos(th));
          pt.addScaledVector(down, back * t * t * 0.07 * p.H);
        });
      });
    }
    for (const r of rings) r.pats = r.points.map(() => pat);
    mb.loft(rings, CLOTH_SURF, { capEnd: kind !== "wide" && kind !== "long" && kind !== "narrow" ? false : false });
    if (kind === "rolled") {
      const cuff = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), color.clone().multiplyScalar(0.85), { from: to - 0.06, to, grow: 0.018 });
      mb.loft(cuff, CLOTH_SURF);
    }
    // Inside of the sleeve opening reads dark.
    const inner = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), color.clone().multiplyScalar(0.35), { from: to - 0.03, to: to - 0.005, grow: (t) => grow(t) - 0.003 });
    mb.loft(inner, CLOTH_SURF, { flip: true });
  }
}

function longKimono(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "long_kimono" }>) {
  const base = new THREE.Color(g.color);
  const collar = new THREE.Color(g.collar ?? "#efe7d8");
  const nk = p.pos.neck.y / p.H;
  const yV = nk - 0.1;
  const pat = PATTERN_INDEX[g.pattern ?? "none"];
  mb.paint = { pat, accent: new THREE.Color(g.accent ?? "#e6dccb") };
  vNeckTop(mb, p, base, collar, 0.5, nk, nk - yV, 0.55, pat, () => 0.014);
  // Skirt: one tube around both legs, each vertex following the nearer leg.
  const seg = 24;
  const rings: RingSpec[] = [];
  const hipY = 0.52;
  const steps = [0.52, 0.45, 0.38, 0.3, 0.22, 0.14, 0.07, 0.035];
  let v = 0;
  const st = torsoStations(p);
  const hipRx = st[2].rx * p.width;
  for (const fy of steps) {
    const k = (hipY - fy) / (hipY - 0.035);
    const rx = (hipRx * (1 - k * 0.2)) * p.H + 0.02;
    const rz = (0.075 - k * 0.012) * p.H * p.depth + 0.02;
    const pts: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const pw: Weights[] = [];
    const cols: THREE.Color[] = [];
    const y = fy * p.H;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const x = -Math.sin(th) * rx;
      const z = Math.cos(th) * rz;
      pts.push(new THREE.Vector3(x, y, z + 0.004 * p.H));
      nrm.push(new THREE.Vector3(-Math.sin(th) / rx, 0, Math.cos(th) / rz).normalize());
      const legT = (0.52 - fy) / 0.48;
      const side: Side = x >= 0 ? "L" : "R";
      const follow = Math.min(1, Math.abs(x) / rx) * Math.min(1, k * 1.4);
      const lw = legWeights(p, side, legT);
      const w: Weights = [[BI.hips, 1 - follow * 0.7], ...lw.map(([b, ww]) => [b, ww * follow * 0.7] as [number, number])];
      pw.push(w);
      // Overlap line of the kimono front.
      const a = wrap(th);
      cols.push(a > 0.15 && a < 0.28 ? base.clone().multiplyScalar(0.8) : base);
    }
    if (rings.length) v += (steps[rings.length - 1] - fy) * p.H;
    rings.push({ points: pts, normals: nrm, weights: [[BI.hips, 1]], pointWeights: pw, colors: cols, v });
  }
  withPattern(rings, base, pat);
  mb.loft(rings, CLOTH_SURF);
  sleeves(mb, p, base, "wide", pat);
}

function haori(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "haori" }>) {
  const base = new THREE.Color(g.color);
  const nk = p.pos.neck.y / p.H;
  const bottom = g.long ? 0.3 : 0.47;
  const gap = 0.32;
  const rings = torsoRings(p, base, {
    grow: (y) => (y < 0.55 ? 0.03 + (0.55 - y) * 0.2 : 0.024),
    from: bottom,
    to: nk + 0.004,
    arc: (y) => {
      const open = y > nk - 0.1 ? gap + ((y - (nk - 0.1)) / 0.1) * 0.35 : gap;
      return [open, Math.PI * 2 - open];
    },
    flare: (y) => (y < 0.55 ? (0.55 - y) * 1.5 : 0),
  });
  // Long coats below the hips follow the legs a little.
  if (g.long) {
    for (const r of rings) {
      const y = r.points[0].y / p.H;
      if (y > 0.5) continue;
      const k = (0.5 - y) / 0.2;
      r.pointWeights = r.points.map((pt) => {
        const side: Side = pt.x >= 0 ? "L" : "R";
        const lw = legWeights(p, side, (0.52 - y) / 0.48);
        return [[BI.hips, 1 - k * 0.4], ...lw.map(([b, w]) => [b, w * k * 0.4] as [number, number])];
      });
    }
  }
  mb.loft(rings, CLOTH_SURF, { open: true });
  if (!g.sleeveless) sleeves(mb, p, base, "wide", 0, 0.014);
  if (g.crest) {
    // Family crest (kamon) between the shoulders: a ring around three tomoe-like dots.
    const st = torsoStations(p);
    const back = st[8];
    const crest = new THREE.Color(g.crest);
    const at = new THREE.Vector3(0, back.y * p.H - 0.01, -(back.rb * p.H * p.depth + 0.028));
    const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const ring = new THREE.RingGeometry(0.019 * p.H, 0.023 * p.H, 28);
    mb.add(ring, new THREE.Matrix4().compose(at, face, new THREE.Vector3(1, 1, 1)), crest, CLOTH_SURF, [[BI.chest, 1]]);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const dot = new THREE.CircleGeometry(0.0055 * p.H, 12);
      const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * 0.009 * p.H, Math.sin(a) * 0.009 * p.H, -0.0005));
      mb.add(dot, new THREE.Matrix4().compose(pos, face, new THREE.Vector3(1, 1, 1)), crest, CLOTH_SURF, [[BI.chest, 1]]);
    }
  }
}

function shirt(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "shirt" }>, look: Look) {
  const base = new THREE.Color(g.color);
  const nk = p.pos.neck.y / p.H;
  if (g.open) {
    const rings = torsoRings(p, base, {
      grow: 0.011,
      from: 0.53,
      to: nk + 0.002,
      arc: (y) => {
        const o = y > nk - 0.14 ? 0.2 + ((y - (nk - 0.14)) / 0.14) * 0.5 : 0.2;
        return [o, Math.PI * 2 - o];
      },
    });
    mb.loft(rings, CLOTH_SURF, { open: true });
  } else {
    const rings = torsoRings(p, base, { grow: 0.01, from: 0.53, to: nk + 0.002 });
    mb.loft(rings, CLOTH_SURF);
  }
  if (g.sleeves !== "none") sleeves(mb, p, base, g.sleeves === "long" ? "narrow" : g.sleeves);
  if (g.collar) {
    const c = torsoRings(p, base.clone().multiplyScalar(0.92), { grow: 0.02, from: nk - 0.01, to: nk + 0.012 });
    mb.loft(c, CLOTH_SURF);
  }
  void look;
}

function vest(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "vest" }>) {
  const base = new THREE.Color(g.color);
  const nk = p.pos.neck.y / p.H;
  const rings = torsoRings(p, base, {
    grow: 0.012,
    from: 0.555,
    to: nk,
    arc: (y) => {
      const o = 0.42 + Math.max(0, (y - 0.7) / (nk - 0.7)) * 0.55;
      return [o, Math.PI * 2 - o];
    },
  });
  mb.loft(rings, CLOTH_SURF, { open: true });
  if (g.buttons) {
    const st = torsoStations(p);
    for (let k = 0; k < 3; k++) {
      const y = (0.6 + k * 0.045) * p.H;
      const s = st[5];
      const btn = new THREE.SphereGeometry(0.006 * p.H, 8, 6);
      const x = Math.sin(0.44) * s.rx * p.H * p.width * -1;
      const z = Math.cos(0.44) * s.rf * p.H * p.depth + 0.014;
      mb.add(btn, new THREE.Matrix4().makeTranslation(x, y, z), new THREE.Color(g.buttons), SILK_SURF, torsoWeights(p, y));
    }
  }
}

function trackJacket(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "track_jacket" }>) {
  const body = new THREE.Color(g.color);
  const shoulders = new THREE.Color(g.shoulders);
  const zip = new THREE.Color(g.zip ?? "#2a2624");
  const nk = p.pos.neck.y / p.H;
  const colorFn = (y: number, th: number) => {
    const a = Math.abs(wrap(th));
    if (a < 0.022) return zip;
    if (y > nk - 0.075) return shoulders;
    return body;
  };
  const rings = torsoRings(p, colorFn, { grow: (y) => (y < 0.6 ? 0.022 : 0.016), from: 0.47, to: nk + 0.003 });
  mb.loft(rings, CLOTH_SURF);
  for (const side of ["L", "R"] as Side[]) {
    const r = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), (t) => (t < 0.18 ? shoulders : body), {
      from: -0.075,
      to: 0.97,
      grow: (t) => (t < -0.04 ? 0.012 * Math.max(0.2, (t + 0.075) / 0.035) : 0.012 + Math.max(0, t) * 0.008),
    });
    mb.loft(r, CLOTH_SURF);
    const cuff = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), shoulders, { from: 0.92, to: 0.98, grow: 0.022 });
    mb.loft(cuff, CLOTH_SURF);
  }
  const col = new THREE.Color(g.collar ?? g.color);
  const collar = torsoRings(p, col, { grow: 0.03, from: nk - 0.01, to: nk + 0.022 });
  mb.loft(collar, CLOTH_SURF);
}

// ——— bottoms ————————————————————————————————————————————————————————

function hakama(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "hakama" }>) {
  const base = new THREE.Color(g.color);
  const pleat = base.clone().multiplyScalar(0.78);
  const stripe = g.stripes ? new THREE.Color(g.stripes) : null;
  // Waist section.
  const waist = torsoRings(p, base, { grow: 0.028, from: 0.47, to: 0.575, flare: (y) => (y < 0.53 ? (0.53 - y) * 2.2 : 0) });
  mb.loft(waist, CLOTH_SURF);
  for (const side of ["L", "R"] as Side[]) {
    const colorFn = (_t: number, th: number) => {
      const k = Math.abs(Math.sin(th * 5));
      if (stripe && k > 0.85) return stripe;
      return k > 0.8 ? pleat : base;
    };
    const rings = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), colorFn, {
      from: -0.09,
      to: 0.98,
      grow: (t) => 0.03 + Math.max(0, t) * 0.085 * p.H,
      segments: 20,
    });
    // Open hem.
    mb.loft(rings, CLOTH_SURF);
    const inner = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), base.clone().multiplyScalar(0.3), {
      from: 0.95,
      to: 0.975,
      grow: (t) => 0.027 + Math.max(0, t) * 0.085 * p.H,
      segments: 20,
    });
    mb.loft(inner, CLOTH_SURF, { flip: true });
  }
}

function pants(mb: MeshBuilder, p: Proportions, g: Extract<Garment, { kind: "pants" }>) {
  const base = new THREE.Color(g.color);
  const stripe = g.stripe ? new THREE.Color(g.stripe) : null;
  const to = g.length === "long" ? 0.97 : g.length === "knee" ? 0.56 : 0.36;
  const waist = torsoRings(p, base, { grow: 0.014, from: 0.47, to: 0.575 });
  mb.loft(waist, CLOTH_SURF);
  for (const side of ["L", "R"] as Side[]) {
    const s = sideSign(side);
    const colorFn = (_t: number, th: number) => {
      // Stripe on the outer side of each leg.
      const outer = s > 0 ? -Math.sin(th) : Math.sin(th);
      if (stripe && outer > 0.93) return stripe;
      return base;
    };
    const rings = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), colorFn, {
      from: -0.09,
      to,
      grow: (t) => 0.011 + (g.baggy ? Math.max(0, t) * 0.03 : 0),
      segments: 16,
    });
    mb.loft(rings, g.color === "#3b5f8c" || g.cuffs ? CLOTH_SURF : CLOTH_SURF);
    if (g.cuffs) {
      const cuff = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), new THREE.Color(g.cuffs), { from: to - 0.05, to, grow: 0.022, segments: 16 });
      mb.loft(cuff, CLOTH_SURF);
    }
  }
}

function waistCloth(mb: MeshBuilder, p: Proportions, color: THREE.Color) {
  // Navy cloth wrapped around the hips, open at the front.
  const rings: RingSpec[] = torsoRings(p, color, {
    grow: (y) => 0.04 + (0.56 - y) * 0.25,
    from: 0.4,
    to: 0.575,
    arc: () => [0.55, Math.PI * 2 - 0.55],
    flare: (y) => (y < 0.53 ? (0.53 - y) * 1.6 : 0),
  });
  for (const r of rings) {
    const y = r.points[0].y / p.H;
    const k = Math.max(0, (0.52 - y) / 0.12);
    r.pointWeights = r.points.map((pt) => {
      const side: Side = pt.x >= 0 ? "L" : "R";
      return [[BI.hips, 1 - k * 0.5], [BI[`thigh${side}` as BoneName], k * 0.5]];
    });
  }
  mb.loft(rings, CLOTH_SURF, { open: true });
}

function apron(mb: MeshBuilder, p: Proportions, color: THREE.Color) {
  const rings = torsoRings(p, color, {
    grow: (y) => 0.03 + Math.max(0, 0.56 - y) * 0.3,
    from: 0.32,
    to: 0.74,
    arc: () => [-0.95, 0.95],
    stations: torsoStations(p).map((s) => ({ ...s })),
  });
  for (const r of rings) {
    const y = r.points[0].y / p.H;
    if (y < 0.5) {
      const k = Math.min(1, (0.5 - y) / 0.18);
      r.pointWeights = r.points.map((pt) => {
        const side: Side = pt.x >= 0 ? "L" : "R";
        return [[BI.hips, 1 - k * 0.6], [BI[`thigh${side}` as BoneName], k * 0.6]];
      });
    }
  }
  mb.loft(rings, CLOTH_SURF, { open: true });
}

// ——— bands & accessories ——————————————————————————————————————————————

function band(mb: MeshBuilder, p: Proportions, yCentre: number, height: number, color: THREE.Color, grow: number, surf: Surf) {
  const rings = torsoRings(p, color, { grow, from: yCentre - height / 2, to: yCentre + height / 2 });
  mb.loft(rings, surf);
}

function bow(mb: MeshBuilder, p: Proportions, color: THREE.Color, size: number) {
  const st = torsoStations(p);
  const y = 0.57 * p.H;
  const z = -(st[4].rb * p.H * p.depth + 0.04);
  for (const sx of [-1, 1]) {
    const loop = new THREE.SphereGeometry(1, 10, 8);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.05 * size * p.H, y + 0.01, z - 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * 0.4)), new THREE.Vector3(0.05 * size * p.H, 0.03 * size * p.H, 0.018 * p.H));
    mb.add(loop, m, color, SILK_SURF, [[BI.spine, 1]]);
  }
  const knot = new THREE.SphereGeometry(0.018 * size * p.H, 8, 6);
  mb.add(knot, new THREE.Matrix4().makeTranslation(0, y + 0.01, z - 0.03), color.clone().multiplyScalar(0.85), SILK_SURF, [[BI.spine, 1]]);
}

function buckle(mb: MeshBuilder, p: Proportions, color: THREE.Color, size: number) {
  const st = torsoStations(p);
  const y = 0.56 * p.H;
  const z = st[4].rf * p.H * p.depth + 0.028;
  const g = new THREE.BoxGeometry(0.05 * size * p.H, 0.03 * size * p.H, 0.008);
  mb.add(g, new THREE.Matrix4().makeTranslation(0, y, z), color, METAL_SURF, torsoWeights(p, y));
}

function ropeBelt(mb: MeshBuilder, p: Proportions, color: THREE.Color) {
  band(mb, p, 0.56, 0.02, color, 0.03, CLOTH_SURF);
  const st = torsoStations(p);
  const y = 0.56 * p.H;
  const z = -(st[4].rb * p.H * p.depth + 0.045);
  // Big bow at the back with trailing ends.
  for (const sx of [-1, 1]) {
    const loop = new THREE.TorusGeometry(0.045 * p.H, 0.012 * p.H, 6, 14);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.05 * p.H, y + 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * 0.3)), new THREE.Vector3(1, 0.7, 1));
    mb.add(loop, m, color, CLOTH_SURF, [[BI.spine, 1]]);
    const tail = new THREE.CylinderGeometry(0.011 * p.H, 0.009 * p.H, 0.2 * p.H, 6);
    const tm = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.03 * p.H, y - 0.1 * p.H, z - 0.005), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, sx * 0.12)), new THREE.Vector3(1, 1, 1));
    mb.add(tail, tm, color, CLOTH_SURF, [[BI.hips, 1]]);
  }
}

function scarf(mb: MeshBuilder, p: Proportions, color: THREE.Color, long: boolean) {
  const nk = p.pos.neck.y / p.H;
  const ring = torsoRings(p, color, { grow: 0.03, from: nk - 0.03, to: nk + 0.015 });
  mb.loft(ring, SILK_SURF);
  // Two long ends down the back and over one shoulder.
  const st = torsoStations(p);
  const len = long ? 0.5 : 0.25;
  for (const [x, zSign] of [[0.04, -1], [-0.06, 1]] as const) {
    const top = new THREE.Vector3(x * p.H, (nk - 0.02) * p.H, zSign * (st[8].rb * p.H * p.depth + 0.03));
    const g = new THREE.BoxGeometry(0.065 * p.H, len * p.H, 0.006);
    const m = new THREE.Matrix4().compose(top.clone().add(new THREE.Vector3(0, -len * p.H * 0.5, zSign * 0.01)), new THREE.Quaternion().setFromEuler(new THREE.Euler(zSign * -0.1, 0, x * 1.5)), new THREE.Vector3(1, 1, 1));
    mb.add(g, m, color, SILK_SURF, (v) => torsoWeights(p, Math.max(v.y, 0.56 * p.H)));
  }
}

function neckBandana(mb: MeshBuilder, p: Proportions, color: THREE.Color) {
  const nk = p.pos.neck.y / p.H;
  mb.loft(torsoRings(p, color, { grow: 0.02, from: nk - 0.025, to: nk + 0.01 }), CLOTH_SURF);
  const st = torsoStations(p);
  const tri = new THREE.ConeGeometry(0.06 * p.H, 0.09 * p.H, 3, 1);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0, (nk - 0.055) * p.H, st[8].rf * p.H * p.depth + 0.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - 0.15, 0, 0)), new THREE.Vector3(1, 1, 0.18));
  mb.add(tri, m, color, CLOTH_SURF, [[BI.chest, 1]]);
}

function armBand(mb: MeshBuilder, p: Proportions, side: Side, from: number, to: number, color: THREE.Color, grow: number, surf: Surf = CLOTH_SURF) {
  const r = limbRings(p, armChain(p, side), armStations(p), (t) => armWeights(p, side, t), color, { from, to, grow });
  mb.loft(r, surf, { capEnd: false });
}

function doArmor(mb: MeshBuilder, p: Proportions, color: THREE.Color, lacing: THREE.Color) {
  const colorFn = (y: number) => (Math.floor(y * p.H / 0.04) % 2 === 0 ? color : color.clone().lerp(lacing, 0.35));
  const rings = torsoRings(p, (y) => colorFn(y), { grow: 0.032, from: 0.56, to: 0.795, segments: 22 });
  mb.loft(rings, [0.4, 0.2, 0]);
  // Kusazuri: hanging skirt plates.
  const st = torsoStations(p);
  for (let i = 0; i < 5; i++) {
    const a = -1.4 + i * 0.7 + Math.PI * (i > 2 ? 0 : 0);
    const r = st[3].rx * p.H * p.width + 0.045;
    const x = -Math.sin(a) * r;
    const z = Math.cos(a) * (st[3].rf * p.H * p.depth + 0.045);
    const plate = new THREE.BoxGeometry(0.085 * p.H, 0.12 * p.H, 0.012);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.49 * p.H, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, a, 0)), new THREE.Vector3(1, 1, 1));
    const side: Side = x >= 0 ? "L" : "R";
    mb.add(plate, m, (v) => (Math.floor(v.y / 0.03) % 2 ? color : color.clone().lerp(lacing, 0.4)), [0.4, 0.2, 0], [[BI.hips, 0.6], [BI[`thigh${side}` as BoneName], 0.4]]);
  }
  // Sode shoulder plates.
  for (const side of ["L", "R"] as Side[]) {
    const s = sideSign(side);
    const at = p.pos[`upperArm${side}` as BoneName];
    const plate = new THREE.BoxGeometry(0.02, 0.1 * p.H, 0.1 * p.H);
    const m = new THREE.Matrix4().compose(at.clone().add(new THREE.Vector3(s * 0.045 * p.H, -0.04 * p.H, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * 0.2)), new THREE.Vector3(1, 1, 1));
    mb.add(plate, m, (v) => (Math.floor(v.y / 0.025) % 2 ? color : color.clone().lerp(lacing, 0.4)), [0.4, 0.2, 0], [[BI[`upperArm${side}` as BoneName], 1]]);
  }
}

/** A band that wraps diagonally across the torso (monk's kesa, sword strap). */
function diagonalBand(mb: MeshBuilder, p: Proportions, color: THREE.Color, halfWidth: number, grow: number, thTop: number, thBottom: number, surf: Surf = CLOTH_SURF) {
  const nk = p.pos.neck.y / p.H;
  const y0 = 0.56;
  const y1 = nk - 0.02;
  const rings = torsoRings(p, color, {
    grow,
    from: y0,
    to: y1,
    arc: (y) => {
      const k = (y - y0) / (y1 - y0);
      const c = thBottom + (thTop - thBottom) * k;
      return [c - halfWidth, c + halfWidth];
    },
    segments: 8,
  });
  mb.loft(rings, surf, { open: true });
}

function cape(mb: MeshBuilder, p: Proportions, color: THREE.Color, lining: THREE.Color) {
  const nk = p.pos.neck.y / p.H;
  const rings = torsoRings(p, color, {
    grow: (y) => 0.03 + (nk - y) * 0.25,
    from: 0.3,
    to: nk,
    arc: () => [Math.PI * 0.55, Math.PI * 1.45],
  });
  mb.loft(rings, CLOTH_SURF, { open: true });
  void lining;
}

function chestScar(mb: MeshBuilder, p: Proportions, skin: THREE.Color) {
  const st = torsoStations(p);
  const s = st[6];
  const col = skin.clone().lerp(new THREE.Color("#8a4a44"), 0.4);
  const y = s.y * p.H;
  const z = s.rf * p.H * p.depth + 0.003;
  for (const rot of [0.75, -0.75]) {
    const g = new THREE.BoxGeometry(0.16 * p.H, 0.006 * p.H, 0.002);
    mb.add(g, new THREE.Matrix4().compose(new THREE.Vector3(0, y - 0.015 * p.H, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rot)), new THREE.Vector3(1, 1, 1)), col, SKIN_SURF, [[BI.chest, 1]]);
  }
}

// ——— footwear ——————————————————————————————————————————————————————————

export function buildFootwear(mb: MeshBuilder, p: Proportions, look: Look) {
  const kind: Footwear = look.footwear;
  const tabi = look.garments.find((g) => g.kind === "tabi");
  const skin = new THREE.Color(look.skin);
  const fc = new THREE.Color(look.footwearColor ?? "#2a2624");
  for (const side of ["L", "R"] as Side[]) {
    const ankle = p.pos[`foot${side}` as BoneName];
    const fb = BI[`foot${side}` as BoneName];
    const shin = BI[`shin${side}` as BoneName];
    switch (kind) {
      case "waraji":
      case "zori":
      case "geta": {
        if (tabi) buildFoot(mb, p, side, new THREE.Color((tabi as { color: string }).color), 0.003, CLOTH_SURF);
        const sole = kind === "geta" ? new THREE.BoxGeometry(0.06 * p.H, 0.018 * p.H, 0.15 * p.H) : new THREE.BoxGeometry(0.058 * p.H, 0.008 * p.H, 0.155 * p.H);
        const soleCol = kind === "geta" ? new THREE.Color("#8a6a48") : new THREE.Color("#cdb27a");
        const m = new THREE.Matrix4().makeTranslation(ankle.x, kind === "geta" ? 0.006 * p.H : 0.002, ankle.z + 0.045 * p.H);
        mb.add(sole, m, soleCol, kind === "geta" ? [0.7, 0.3, 0] : STRAW_SURF, [[fb, 1]]);
        // Thong straps.
        const strap = new THREE.TorusGeometry(0.022 * p.H, 0.0035 * p.H, 4, 10, Math.PI);
        const sm = new THREE.Matrix4().compose(new THREE.Vector3(ankle.x, 0.012 * p.H, ankle.z + 0.07 * p.H), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)), new THREE.Vector3(1, 0.7, 1.3));
        mb.add(strap, sm, kind === "waraji" ? new THREE.Color("#d9c7a0") : new THREE.Color("#8a2a24"), CLOTH_SURF, [[fb, 1]]);
        break;
      }
      case "boots":
      case "wrestling_boots": {
        buildFoot(mb, p, side, fc, 0.008, LEATHER_SURF, 1.15);
        const top = kind === "wrestling_boots" ? 0.62 : 0.8;
        const shaft = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), fc, { from: top, to: 1.04, grow: 0.012, segments: 14 });
        mb.loft(shaft, LEATHER_SURF);
        if (kind === "wrestling_boots") {
          const lace = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), new THREE.Color("#f2f2f2"), { from: top, to: top + 0.03, grow: 0.016, segments: 14 });
          mb.loft(lace, CLOTH_SURF);
        }
        break;
      }
      case "ninja_sandals": {
        buildFoot(mb, p, side, skin, 0.001, SKIN_SURF);
        const sole = new THREE.BoxGeometry(0.06 * p.H, 0.012 * p.H, 0.16 * p.H);
        mb.add(sole, new THREE.Matrix4().makeTranslation(ankle.x, 0.004, ankle.z + 0.045 * p.H), fc, LEATHER_SURF, [[fb, 1]]);
        const wrap = limbRings(p, legChain(p, side), legStations(p), (t) => legWeights(p, side, t), fc, { from: 0.86, to: 1.0, grow: 0.006, segments: 14 });
        mb.loft(wrap, LEATHER_SURF);
        const heel = new THREE.BoxGeometry(0.05 * p.H, 0.035 * p.H, 0.06 * p.H);
        mb.add(heel, new THREE.Matrix4().makeTranslation(ankle.x, 0.02 * p.H, ankle.z - 0.01 * p.H), fc, LEATHER_SURF, [[fb, 1]]);
        break;
      }
      case "bare":
        break;
    }
    void shin;
  }
}

export function footIsCovered(look: Look): boolean {
  return look.footwear === "boots" || look.footwear === "wrestling_boots" || look.garments.some((g) => g.kind === "tabi");
}
