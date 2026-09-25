// Hair: clumps grown from the scalp. Each clump is a tapered, slightly flattened tube (or
// a flat card for fine locks) following a curve from a direction field with gravity and
// collision against the skull, textured with procedural strands (frayed tips) and lit
// with anisotropic highlights. Styles below are written from photo references.

import * as THREE from "three";
import type { HairStyle, Look } from "../../../shared/look";
import type { Anatomy } from "./anatomy";
import type { W } from "./cloth";

// ——— geometry ——————————————————————————————————————————————————————————————————————————

class HairAcc {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];
  get count() {
    return this.pos.length / 3;
  }
  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color, w: W) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.si.push(...w.i);
    this.sw.push(...w.w);
    return this.count - 1;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

interface Palette {
  root: THREE.Color;
  mid: THREE.Color;
  tip: THREE.Color;
}

function palette(hex: string, look: Look): Palette {
  const mid = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  mid.getHSL(hsl);
  const root = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.55);
  const tip = new THREE.Color().setHSL(hsl.h, hsl.s * 0.9, Math.min(0.9, hsl.l * 1.25 + 0.03));
  if (look.age === "elder") tip.lerp(new THREE.Color("#b8b4ae"), 0.4);
  return { root, mid, tip };
}

/**
 * A clump: tube along `pts` with an elliptical section (width across, `flat` × width
 * through), width tapering by `taper(t)`. `side` gives the across direction at each point.
 */
interface Clump {
  pts: THREE.Vector3[];
  side: THREE.Vector3[];
  width: number;
  flat: number;
  taper?: (t: number) => number;
  w: (t: number) => W;
  /** Card instead of a tube (fine locks, fringes). */
  card?: boolean;
}

function writeClump(acc: HairAcc, c: Clump, pal: Palette, rnd: () => number) {
  const n = c.pts.length;
  const seg = c.card ? 1 : 7;
  const shade = 0.88 + rnd() * 0.24;
  const taper = c.taper ?? ((t: number) => Math.pow(1 - t, 0.8) * (1 - 0.15 * t) + 0.02);
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const prev = c.pts[Math.max(0, i - 1)];
    const next = c.pts[Math.min(n - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const side = c.side[i].clone().addScaledVector(dir, -c.side[i].dot(dir)).normalize();
    const through = new THREE.Vector3().crossVectors(dir, side).normalize();
    const w = c.width * taper(t);
    const col = (t < 0.35 ? pal.root.clone().lerp(pal.mid, t / 0.35) : pal.mid.clone().lerp(pal.tip, (t - 0.35) / 0.65)).multiplyScalar(shade);
    const ring: number[] = [];
    if (c.card) {
      for (const k of [-0.5, 0.5]) ring.push(acc.vertex(c.pts[i].clone().addScaledVector(side, w * k), through, k + 0.5, t, col, c.w(t)));
    } else {
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const p = c.pts[i].clone().addScaledVector(side, (ca * w) / 2).addScaledVector(through, (sa * w * c.flat) / 2);
        const nr = side.clone().multiplyScalar(ca * c.flat).addScaledVector(through, sa).normalize();
        ring.push(acc.vertex(p, nr, k / seg, t, col, c.w(t)));
      }
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < rings[i].length - 1; k++) {
      const a = rings[i][k];
      const b = rings[i][k + 1];
      const d = rings[i + 1][k];
      const e = rings[i + 1][k + 1];
      acc.idx.push(a, d, b, b, d, e);
    }
}

// ——— textures & materials ——————————————————————————————————————————————————————————————

let strandTex: THREE.CanvasTexture | null = null;
/** Strands along v (0 root → 1 tip); alpha frays toward the tips. */
function strands(): THREE.CanvasTexture {
  if (strandTex) return strandTex;
  const W = 128;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Dense core first, then fine strands with ragged ends.
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(255,255,255,0.0)");
  g.fillStyle = grad;
  g.fillRect(W * 0.12, 0, W * 0.76, H);
  for (let k = 0; k < 260; k++) {
    const x = rnd() * W;
    const len = H * (0.55 + rnd() * 0.45);
    const l = 150 + rnd() * 105;
    g.strokeStyle = `rgba(${l},${l},${l},${0.5 + rnd() * 0.5})`;
    g.lineWidth = 0.6 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, H);
    const wob = (rnd() - 0.5) * 6;
    g.quadraticCurveTo(x + wob, H - len * 0.5, x + wob * 0.5 + (rnd() - 0.5) * 4, H - len);
    g.stroke();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.wrapS = THREE.RepeatWrapping;
  strandTex.wrapT = THREE.ClampToEdgeWrapping;
  strandTex.anisotropy = 4;
  return strandTex;
}

const hairMats = new Map<string, THREE.MeshPhysicalMaterial>();
export function hairMaterial(opts: { rough?: number; sheen?: string } = {}) {
  const key = JSON.stringify(opts);
  let m = hairMats.get(key);
  if (m) return m;
  m = new THREE.MeshPhysicalMaterial({
    map: strands(),
    vertexColors: true,
    roughness: opts.rough ?? 0.42,
    metalness: 0,
    alphaTest: 0.42,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    anisotropy: 0.75,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.35,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(opts.sheen ?? "#6a5a50"),
    specularIntensity: 0.7,
  });
  hairMats.set(key, m);
  return m;
}

// ——— the head ————————————————————————————————————————————————————————————————————————————

class Head {
  readonly c: THREE.Vector3;
  readonly r: THREE.Vector3;
  readonly s: number;
  constructor(
    readonly a: Anatomy,
    readonly look: Look,
  ) {
    this.c = a.headCentre.clone();
    this.r = a.headRadii.clone();
    this.s = a.headRadii.x / 0.075;
  }
  /** Point on the skull (ellipsoid) in the head-local direction (x, y, z), pushed out by `out`. */
  at(dx: number, dy: number, dz: number, out = 0): THREE.Vector3 {
    const d = new THREE.Vector3(dx, dy, dz).normalize();
    // Scale the unit direction onto the ellipsoid.
    const k = 1 / Math.sqrt((d.x / this.r.x) ** 2 + (d.y / this.r.y) ** 2 + (d.z / this.r.z) ** 2);
    const p = d.clone().multiplyScalar(k);
    const n = new THREE.Vector3(p.x / this.r.x ** 2, p.y / this.r.y ** 2, p.z / this.r.z ** 2).normalize();
    return this.c.clone().add(p).addScaledVector(n, out);
  }
  normalAt(p: THREE.Vector3): THREE.Vector3 {
    const q = p.clone().sub(this.c);
    return new THREE.Vector3(q.x / this.r.x ** 2, q.y / this.r.y ** 2, q.z / this.r.z ** 2).normalize();
  }
  /** Keep a point outside the skull (+ margin): hair lies on the head. */
  push(p: THREE.Vector3, margin: number) {
    const q = p.clone().sub(this.c);
    const e = Math.sqrt((q.x / (this.r.x + margin)) ** 2 + (q.y / (this.r.y + margin)) ** 2 + (q.z / (this.r.z + margin)) ** 2);
    if (e < 1) p.copy(this.c).addScaledVector(q, 1 / e);
    return p;
  }
}

interface GrowOpts {
  len: number;
  steps?: number;
  /** Pull toward −y per unit length (0 stiff spikes … 1 hanging hair). */
  gravity?: number;
  /** Bend toward this direction along the length. */
  bend?: THREE.Vector3;
  bendK?: number;
  /** Stay this far outside the skull. */
  collide?: number;
  /** Curl: rotation about the growth axis per unit length (S-twist). */
  wave?: number;
}

function grow(h: Head, root: THREE.Vector3, dir0: THREE.Vector3, o: GrowOpts, rnd: () => number): THREE.Vector3[] {
  const n = o.steps ?? 8;
  const step = o.len / n;
  const pts = [root.clone()];
  let d = dir0.clone().normalize();
  const phase = rnd() * 6.28;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (o.gravity) d.y -= o.gravity * step * 9;
    if (o.bend) d.lerp(o.bend.clone().normalize(), (o.bendK ?? 0.2) * (step / 0.02) * 0.2);
    if (o.wave) {
      const side = new THREE.Vector3(0, 1, 0).cross(d).normalize();
      d.addScaledVector(side, Math.sin(phase + t * 6) * o.wave * 0.15);
    }
    d.normalize();
    const p = pts[i - 1].clone().addScaledVector(d, step);
    if (o.collide !== undefined) h.push(p, o.collide + t * 0.002);
    pts.push(p);
    d = p.clone().sub(pts[i - 1]).normalize();
  }
  return pts;
}

// ——— styles ——————————————————————————————————————————————————————————————————————————————————

export interface HairResult {
  meshes: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  scalp: "hair" | "shaved" | "none";
}

export function buildHair(a: Anatomy, look: Look): HairResult {
  const style = look.hair.style;
  if (style === "none" || style === "bald") return { meshes: [], scalp: style === "bald" ? "shaved" : "none" };
  const h = new Head(a, look);
  const acc = new HairAcc();
  const pal = palette(look.hair.color, look);
  let seed = [...(look.costume ?? style)].reduce((s, ch) => s + ch.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const head = a.kit.boneIndex.head;
  const W1: W = { i: [head, 0, 0, 0], w: [1, 0, 0, 0] };
  const kit = a.kit;
  const hw = () => W1;
  const toChest = (from: number) => (t: number): W => {
    const k = THREE.MathUtils.smoothstep(t, from, from + 0.35);
    return { i: [head, kit.boneIndex.chest, 0, 0], w: [1 - k, k, 0, 0] };
  };
  const toTail = (from: number) => (t: number): W => {
    const k = THREE.MathUtils.smoothstep(t, from, from + 0.3);
    return { i: [head, kit.boneIndex.tail, 0, 0], w: [1 - k, k, 0, 0] };
  };
  const clump = (c: Clump) => writeClump(acc, c, pal, rnd);
  const sideOf = (pts: THREE.Vector3[]) => pts.map((p) => h.normalAt(p).cross(new THREE.Vector3(0, 1, 0)).normalize());
  const S = h.s;
  const hatted = look.headgear === "straw_hat" || look.headgear === "kasa" || look.headgear === "jingasa";

  /** A cap of short hair over the scalp: many small flat clumps lying along a flow field. */
  const cap = (opts: { front: number; back: number; side: number; flow: (d: THREE.Vector3) => THREE.Vector3; len: number; width: number; count: number; lift?: number; exclude?: (d: THREE.Vector3) => boolean }) => {
    for (let k = 0; k < opts.count; k++) {
      // Fibonacci sphere directions, filtered by the hairline.
      const y = 1 - ((k + 0.5) / opts.count) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = k * 2.39996;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      if (!inHair(d, opts.front, opts.side, opts.back)) continue;
      if (opts.exclude?.(d)) continue;
      const root = h.at(d.x, d.y, d.z, 0.002 * S);
      const f = opts.flow(d);
      const pts = grow(h, root, f, { len: opts.len * S * (0.8 + rnd() * 0.4), steps: 5, collide: (opts.lift ?? 0.004) * S, gravity: 0.1 }, rnd);
      clump({ pts, side: sideOf(pts), width: opts.width * S * (0.8 + rnd() * 0.4), flat: 0.35, w: hw });
    }
  };

  switch (style as HairStyle) {
    case "topknot": {
      // Chonmage: shaved pate (painted on the skin), smooth sides and back, and the
      // oiled queue folded forward along the centre of the pate.
      const pate = (d: THREE.Vector3) => d.y > 0.45 && d.z > -0.55 && Math.abs(d.x) < 0.5;
      cap({ front: 0.6, side: 0.2, back: -0.35, len: 0.05, width: 0.022, count: 700, flow: (d) => new THREE.Vector3(-d.x * 0.3, 0.9, -0.8).normalize(), exclude: pate, lift: 0.003 });
      const gather = h.at(0, 0.62, -0.78, 0.012 * S);
      // Paper cord band (motoyui) at the gather.
      const cordA = gather.clone().add(new THREE.Vector3(0, 0.004 * S, 0.005 * S));
      const queue: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const p = h.at(0, THREE.MathUtils.lerp(0.62, 0.88, Math.sin(t * Math.PI * 0.6)), THREE.MathUtils.lerp(-0.78, 0.35, t), THREE.MathUtils.lerp(0.012, 0.009, t) * S);
        queue.push(p);
      }
      clump({ pts: queue, side: queue.map(() => new THREE.Vector3(1, 0, 0)), width: 0.02 * S, flat: 0.75, taper: (t) => 1 - 0.3 * t + 0.25 * Math.max(0, t - 0.8) * 4, w: hw });
      const cord: THREE.Vector3[] = [cordA.clone().add(new THREE.Vector3(0, 0, -0.008 * S)), cordA, cordA.clone().add(new THREE.Vector3(0, 0.001, 0.008 * S))];
      writeClump(cordAcc(), { pts: cord, side: cord.map(() => new THREE.Vector3(1, 0, 0)), width: 0.024 * S, flat: 0.9, taper: () => 1, w: hw }, { root: new THREE.Color("#ece7da"), mid: new THREE.Color("#ece7da"), tip: new THREE.Color("#f2eee4") }, rnd);
      return result(acc, "shaved", look);
    }
    case "ronin": {
      cap({ front: 0.72, side: 0.2, back: -0.5, len: 0.06, width: 0.024, count: 900, flow: (d) => new THREE.Vector3(-d.x * 0.2, 0.2, -1).normalize() });
      // Tied at the back of the head, a tail to the upper back.
      const tie = h.at(0, 0.25, -1, 0.015 * S);
      for (let k = 0; k < 7; k++) {
        const off = new THREE.Vector3((rnd() - 0.5) * 0.02 * S, (rnd() - 0.5) * 0.015 * S, 0);
        const pts = grow(h, tie.clone().add(off), new THREE.Vector3((rnd() - 0.5) * 0.3, -0.4, -0.6), { len: 0.2 * S, steps: 9, gravity: 0.8, collide: 0.006 * S, wave: 0.3 }, rnd);
        clump({ pts, side: pts.map(() => new THREE.Vector3(1, 0, 0)), width: 0.022 * S, flat: 0.6, w: toTail(0.15) });
      }
      return result(acc, "hair", look);
    }
    case "spiky": {
      const naruto = look.costume === "naruto" || look.headgear === "leaf_headband";
      if (naruto) narutoHair(h, clump, sideOf, rnd, hw, S);
      else ichigoHair(h, clump, sideOf, rnd, hw, S);
      cap({ front: naruto ? 0.55 : 0.62, side: 0.15, back: -0.45, len: 0.035, width: 0.02, count: 700, flow: (d) => new THREE.Vector3(d.x, 0.8, d.z * 0.3 - 0.4).normalize(), lift: 0.004 });
      return result(acc, "hair", look);
    }
    case "messy": {
      luffyHair(h, clump, sideOf, rnd, hw, S, hatted);
      cap({ front: 0.58, side: 0.05, back: -0.5, len: 0.05, width: 0.024, count: 800, flow: (d) => new THREE.Vector3(d.x * 0.6, -0.3, d.z * 0.8).normalize(), lift: 0.004 });
      return result(acc, "hair", look);
    }
    case "buzz": {
      // Short tufts pushed up and back (Zoro): many small spikes, shorter on the sides.
      for (let k = 0; k < 520; k++) {
        const y = 1 - ((k + 0.5) / 520) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = k * 2.39996;
        const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
        if (!inHair(d, 0.62, 0.22, -0.45)) continue;
        const top = THREE.MathUtils.smoothstep(d.y, 0.2, 0.8);
        const root = h.at(d.x, d.y, d.z, 0.001 * S);
        const dir = h.normalAt(root).multiplyScalar(0.7).add(new THREE.Vector3(0, 0.5, -0.55));
        const len = THREE.MathUtils.lerp(0.012, 0.045, top) * S * (0.75 + rnd() * 0.5);
        const pts = grow(h, root, dir, { len, steps: 3, collide: 0.002 * S }, rnd);
        clump({ pts, side: sideOf(pts), width: THREE.MathUtils.lerp(0.01, 0.016, top) * S, flat: 0.6, w: hw });
      }
      cap({ front: 0.62, side: 0.22, back: -0.45, len: 0.02, width: 0.018, count: 500, flow: (d) => new THREE.Vector3(d.x * 0.3, 1, -0.6).normalize(), lift: 0.002 });
      return result(acc, "hair", look);
    }
    case "swept": {
      sasukeHair(h, clump, sideOf, rnd, hw, S);
      cap({ front: 0.6, side: 0.1, back: -0.55, len: 0.05, width: 0.022, count: 800, flow: (d) => new THREE.Vector3(d.x * 0.5, -0.2, d.z > 0 ? 0.6 : -0.9).normalize(), lift: 0.004 });
      return result(acc, "hair", look);
    }
    case "long_straight": {
      byakuyaHair(h, clump, sideOf, rnd, hw, toChest, S);
      cap({ front: 0.62, side: 0.1, back: -0.6, len: 0.06, width: 0.024, count: 900, flow: (d) => new THREE.Vector3(d.x * 0.5, -0.4, -0.7).normalize(), lift: 0.004 });
      return result(acc, "hair", look);
    }
    case "wavy_ponytail": {
      shellyHair(h, clump, sideOf, rnd, hw, toTail, S);
      return result(acc, "hair", look);
    }
    case "bun":
    case "gray_bun": {
      cap({ front: 0.64, side: 0.18, back: -0.5, len: 0.07, width: 0.024, count: 900, flow: (d) => new THREE.Vector3(-d.x * 0.3, 0.7, -0.7).normalize() });
      // Shimada-style bun on the upper back of the head.
      const at = h.at(0, 0.62, -0.72, 0.02 * S);
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2;
        const ring: THREE.Vector3[] = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const a2 = ang + t * 1.6;
          ring.push(at.clone().add(new THREE.Vector3(Math.cos(a2) * 0.032 * S, Math.sin(a2) * 0.022 * S + 0.012 * S, -0.012 * S * Math.sin(t * Math.PI))));
        }
        clump({ pts: ring, side: ring.map(() => new THREE.Vector3(0, 0, 1)), width: 0.026 * S, flat: 0.7, taper: () => 0.9, w: hw });
      }
      return result(acc, "hair", look);
    }
    case "bob": {
      cap({ front: 0.6, side: 0.0, back: -0.6, len: 0.06, width: 0.024, count: 800, flow: (d) => new THREE.Vector3(d.x, -0.6, d.z).normalize() });
      for (let k = 0; k < 70; k++) {
        const ang = (k / 70) * Math.PI * 2;
        const d = new THREE.Vector3(Math.sin(ang), 0.35, Math.cos(ang));
        if (d.z > 0.55 && Math.abs(d.x) < 0.55) {
          // Bangs straight down to the brows.
          const root = h.at(d.x, 0.62, 0.7, 0.004 * S);
          const pts = grow(h, root, new THREE.Vector3(0, -0.3, 1), { len: 0.075 * S, steps: 6, gravity: 0.9, collide: 0.004 * S }, rnd);
          clump({ pts, side: sideOf(pts), width: 0.03 * S, flat: 0.3, w: hw, card: true });
          continue;
        }
        const root = h.at(d.x, d.y, d.z, 0.004 * S);
        const pts = grow(h, root, new THREE.Vector3(d.x, -0.5, d.z), { len: 0.12 * S, steps: 8, gravity: 1, collide: 0.006 * S }, rnd);
        clump({ pts, side: sideOf(pts), width: 0.034 * S, flat: 0.4, w: hw });
      }
      return result(acc, "hair", look);
    }
  }
  return result(acc, "hair", look);

  function cordAcc() {
    return acc;
  }
}

function result(acc: HairAcc, scalp: HairResult["scalp"], look: Look): HairResult {
  if (!acc.idx.length) return { meshes: [], scalp };
  const glossy = look.hair.style === "topknot" || look.hair.style === "long_straight" || look.hair.style === "swept";
  return { meshes: [{ geometry: acc.geometry(), material: hairMaterial({ rough: glossy ? 0.34 : 0.45, sheen: look.hair.color }) }], scalp };
}

/** Is a head-local direction inside the hairline? front/side/back are min d.y there. */
function inHair(d: THREE.Vector3, front: number, side: number, back: number) {
  const fz = THREE.MathUtils.smoothstep(d.z, 0.2, 0.75);
  const bz = THREE.MathUtils.smoothstep(-d.z, 0.2, 0.8);
  const limit = side * (1 - fz) * (1 - bz) + front * fz + back * bz;
  // Keep the ears and face clear.
  if (d.y < 0.25 && Math.abs(d.x) > 0.75 && d.z > -0.35) return false;
  return d.y > limit;
}

type ClumpFn = (c: Clump) => void;
type SideFn = (pts: THREE.Vector3[]) => THREE.Vector3[];
type WFn = (t: number) => W;

// Naruto: 11–13 main spikes in a sunburst above the headband, short fringe spikes over
// its top edge at left and right, two pointed sideburn locks per side, nape spikes.
function narutoHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, S: number) {
  const spike = (dx: number, dy: number, dz: number, dir: THREE.Vector3, len: number, width: number) => {
    const root = h.at(dx, dy, dz, 0.003 * S);
    const pts = grow(h, root, dir, { len: len * S, steps: 7, collide: 0.006 * S, wave: 0.25, bend: new THREE.Vector3(dir.x * 1.2, dir.y * 0.7, dir.z), bendK: 0.05 }, rnd);
    clump({ pts, side: sideOf(pts), width: width * S, flat: 0.4, taper: (t) => Math.pow(1 - t, 1.2) + 0.01, w: hw });
  };
  // Crown: 5 near-vertical, the middle tallest.
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.16;
    spike(x, 0.9, 0.05 - Math.abs(k - 2) * 0.08, new THREE.Vector3(x * 0.9, 1, -0.15 + rnd() * 0.1), 0.1 - Math.abs(k - 2) * 0.012, 0.036);
  }
  // Sides: 3 each, 35–60° outward.
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const ang = THREE.MathUtils.degToRad(35 + k * 12);
      spike(s * (0.55 + k * 0.12), 0.72 - k * 0.14, 0.15 - k * 0.2, new THREE.Vector3(s * Math.sin(ang), Math.cos(ang), -0.1), 0.085 - k * 0.008, 0.034);
    }
  // Back: 3–4 pointing back and down over the knot.
  for (let k = 0; k < 4; k++) spike((k - 1.5) * 0.22, 0.45, -0.85, new THREE.Vector3((k - 1.5) * 0.3, -0.35, -1), 0.075, 0.034);
  // Filler spikes so the sunburst is solid.
  for (let k = 0; k < 16; k++) {
    const th = rnd() * Math.PI * 2;
    const d = new THREE.Vector3(Math.sin(th) * 0.6, 0.72 + rnd() * 0.2, Math.cos(th) * 0.6 - 0.1);
    spike(d.x, d.y, d.z, new THREE.Vector3(d.x * 1.3, 1, d.z * 1.1), 0.06 + rnd() * 0.02, 0.028);
  }
  // Fringe over the band's top edge, left and right of the plate.
  for (const s of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const root = h.at(s * (0.32 + k * 0.17), 0.66, 0.75, 0.01 * S);
      const pts = grow(h, root, new THREE.Vector3(s * 0.3, -0.6, 1), { len: (0.04 + k * 0.008) * S, steps: 5, collide: 0.018 * S, gravity: 0.2 }, rnd);
      clump({ pts, side: sideOf(pts), width: 0.028 * S, flat: 0.35, taper: (t) => Math.pow(1 - t, 1.1) + 0.01, w: hw });
    }
  // Sideburns: front one to the jaw line, back one to the earlobe.
  for (const s of [-1, 1]) {
    for (const [dz, len] of [
      [0.38, 0.085],
      [0.1, 0.055],
    ]) {
      const root = h.at(s * 0.92, 0.1, dz, 0.004 * S);
      const pts = grow(h, root, new THREE.Vector3(0, -1, 0.15), { len: len * S, steps: 6, collide: 0.004 * S }, rnd);
      clump({ pts, side: sideOf(pts), width: 0.022 * S, flat: 0.35, w: hw });
    }
  }
  // Nape.
  for (let k = 0; k < 4; k++) {
    const root = h.at((k - 1.5) * 0.25, -0.1, -0.95, 0.004 * S);
    const pts = grow(h, root, new THREE.Vector3((k - 1.5) * 0.2, -1, -0.3), { len: 0.045 * S, steps: 4, collide: 0.004 * S }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.026 * S, flat: 0.4, w: hw });
  }
}

// Ichigo: 25–35 pointed clumps radiating from a crown point at the back-top, rising and
// sweeping back; sides sweep back over the ears; fringe of 6–8 pointed clumps to the brows.
function ichigoHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, S: number) {
  const crown = new THREE.Vector3(0, 0.75, -0.45).normalize();
  for (let k = 0; k < 34; k++) {
    const y = 1 - ((k + 0.5) / 34) * 1.3;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = k * 2.39996;
    const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (!inHair(d, 0.55, 0.3, -0.35)) continue;
    const root = h.at(d.x, d.y, d.z, 0.004 * S);
    const away = d.clone().sub(crown).setY(0);
    const dir = h.normalAt(root).multiplyScalar(0.8).add(away.multiplyScalar(0.9)).add(new THREE.Vector3(0, 0.45, -0.35));
    const pts = grow(h, root, dir, { len: (0.065 + rnd() * 0.03) * S, steps: 6, collide: 0.006 * S, wave: 0.3, gravity: 0.08 }, rnd);
    clump({ pts, side: sideOf(pts), width: (0.024 + rnd() * 0.012) * S, flat: 0.45, taper: (t) => Math.pow(1 - t, 1.15) + 0.01, w: hw });
  }
  // Fringe to the brow line, irregular.
  for (let k = 0; k < 7; k++) {
    const x = (k - 3) * 0.17 + (rnd() - 0.5) * 0.05;
    const root = h.at(x, 0.7, 0.72, 0.006 * S);
    const pts = grow(h, root, new THREE.Vector3(x * 0.4, -0.8, 0.9), { len: (0.07 + rnd() * 0.02) * S, steps: 6, collide: 0.01 * S, gravity: 0.3, wave: 0.3 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.028 * S, flat: 0.35, taper: (t) => Math.pow(1 - t, 1.1) + 0.01, w: hw });
  }
  // Sides sweep back over the top of the ears; nape tufts.
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const root = h.at(s * 0.9, 0.35 - k * 0.08, 0.35 - k * 0.3, 0.004 * S);
      const pts = grow(h, root, new THREE.Vector3(s * 0.2, -0.2, -1), { len: 0.07 * S, steps: 6, collide: 0.006 * S }, rnd);
      clump({ pts, side: sideOf(pts), width: 0.026 * S, flat: 0.4, w: hw });
    }
  for (let k = 0; k < 5; k++) {
    const root = h.at((k - 2) * 0.22, -0.05, -0.97, 0.004 * S);
    const pts = grow(h, root, new THREE.Vector3((k - 2) * 0.15, -1, -0.4), { len: 0.05 * S, steps: 4, collide: 0.004 * S }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.026 * S, flat: 0.45, w: hw });
  }
}

// Luffy: shaggy uncombed clumps — fringe to the brows with a centre widow's peak, sides
// flaring over the ears toward the cheekbones, short choppy nape, crown flat under the hat.
function luffyHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, S: number, hatted: boolean) {
  for (let k = 0; k < 7; k++) {
    const x = (k - 3) * 0.16;
    const root = h.at(x, 0.68, 0.72, 0.008 * S);
    const pts = grow(h, root, new THREE.Vector3(x * 0.5, -0.9, 0.7), { len: (k === 3 ? 0.085 : 0.075 + rnd() * 0.015) * S, steps: 6, collide: 0.01 * S, gravity: 0.3, wave: 0.5 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.03 * S, flat: 0.38, taper: (t) => Math.pow(1 - t, 1.05) + 0.01, w: hw });
  }
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const root = h.at(s * 0.92, 0.42 - k * 0.1, 0.45 - k * 0.3, 0.006 * S);
      const pts = grow(h, root, new THREE.Vector3(s * 0.55, -0.9, 0.35), { len: (0.075 + rnd() * 0.02) * S, steps: 6, collide: 0.008 * S, gravity: 0.3, wave: 0.6 }, rnd);
      clump({ pts, side: sideOf(pts), width: 0.03 * S, flat: 0.4, w: hw });
    }
  for (let k = 0; k < 6; k++) {
    const root = h.at((k - 2.5) * 0.2, 0.05, -0.95, 0.006 * S);
    const pts = grow(h, root, new THREE.Vector3((k - 2.5) * 0.2, -1, -0.5), { len: 0.06 * S, steps: 5, collide: 0.006 * S, wave: 0.5 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.032 * S, flat: 0.45, w: hw });
  }
  // Top: flat clumps (under the hat they barely show; without it, tousled).
  for (let k = 0; k < 26; k++) {
    const th = rnd() * Math.PI * 2;
    const r = 0.25 + rnd() * 0.5;
    const d = new THREE.Vector3(Math.sin(th) * r, 0.85, Math.cos(th) * r);
    const root = h.at(d.x, d.y, d.z, 0.006 * S);
    const pts = grow(h, root, new THREE.Vector3(d.x, hatted ? -0.2 : 0.3, d.z), { len: 0.06 * S, steps: 5, collide: 0.01 * S, gravity: 0.2, wave: 0.5 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.034 * S, flat: 0.4, w: hw });
  }
}

// Sasuke: long pointed bangs (centre one between the eyes to the nose bridge), straight
// side locks over the ears to the jaw, and 6–8 stiff spikes fanning back from the crown.
function sasukeHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, S: number) {
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.2;
    const root = h.at(x * 0.5, 0.85, 0.35, 0.006 * S);
    const len = (k === 2 ? 0.14 : 0.12 + Math.abs(k - 2) * 0.01) * S;
    const pts = grow(h, root, new THREE.Vector3(x * 0.6, -0.2, 1), { len, steps: 9, collide: 0.012 * S, gravity: 0.55 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.03 * S, flat: 0.32, taper: (t) => Math.pow(1 - t, 1.1) + 0.01, w: hw });
  }
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const root = h.at(s * 0.8, 0.55 - k * 0.1, 0.45 - k * 0.2, 0.006 * S);
      const pts = grow(h, root, new THREE.Vector3(s * 0.3, -1, 0.25), { len: (0.15 + rnd() * 0.02) * S, steps: 9, collide: 0.008 * S, gravity: 0.6 }, rnd);
      clump({ pts, side: sideOf(pts), width: 0.03 * S, flat: 0.35, w: hw });
    }
  // Back spikes: upper row up-and-back, lower row straight back, outer ones splay.
  for (let k = 0; k < 8; k++) {
    const upper = k < 4;
    const x = ((k % 4) - 1.5) * 0.3;
    const root = h.at(x, upper ? 0.62 : 0.35, -0.8, 0.006 * S);
    const ang = THREE.MathUtils.degToRad(upper ? 50 : 8);
    const dir = new THREE.Vector3(x * 1.1, Math.sin(ang), -Math.cos(ang));
    const pts = grow(h, root, dir, { len: (0.075 + rnd() * 0.02) * S, steps: 6, collide: 0.008 * S }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.036 * S, flat: 0.4, taper: (t) => Math.pow(1 - t, 1.2) + 0.01, w: hw });
  }
}

// Byakuya: long straight blue-black hair to mid-back, side sections in front of the
// shoulders to mid-chest, and one lock down the centre of the face.
function byakuyaHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, toChest: (f: number) => WFn, S: number) {
  for (let k = 0; k < 26; k++) {
    const ang = Math.PI * (0.25 + (k / 25) * 1.5);
    const d = new THREE.Vector3(Math.sin(ang), 0.45, Math.cos(ang));
    const root = h.at(d.x, d.y, d.z, 0.006 * S);
    const pts = grow(h, root, new THREE.Vector3(d.x * 0.3, -0.3, d.z * 0.6 - 0.4), { len: (0.5 + rnd() * 0.05) * S, steps: 16, collide: 0.012 * S, gravity: 1 }, rnd);
    // Keep the long hair off the back (it lies on the coat).
    for (const p of pts) if (p.y < h.c.y - 0.12) p.z = Math.min(p.z, h.c.z - 0.13 - (h.c.y - 0.12 - p.y) * 0.05);
    clump({ pts, side: sideOf(pts), width: 0.045 * S, flat: 0.28, taper: (t) => 1 - 0.55 * t, w: toChest(0.25) });
  }
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const root = h.at(s * 0.85, 0.35, 0.55 - k * 0.12, 0.006 * S);
      const pts = grow(h, root, new THREE.Vector3(s * 0.15, -1, 0.35), { len: 0.28 * S, steps: 12, collide: 0.01 * S, gravity: 1 }, rnd);
      for (const p of pts) if (p.y < h.c.y - 0.1) p.x = s * Math.max(Math.abs(p.x), 0.1 * S);
      clump({ pts, side: sideOf(pts), width: 0.034 * S, flat: 0.3, taper: (t) => 1 - 0.5 * t, w: toChest(0.35) });
    }
  const root = h.at(0.04, 0.72, 0.72, 0.012 * S);
  const pts = grow(h, root, new THREE.Vector3(0.05, -1, 0.35), { len: 0.13 * S, steps: 9, collide: 0.018 * S, gravity: 0.9 }, rnd);
  clump({ pts, side: sideOf(pts), width: 0.012 * S, flat: 0.5, taper: (t) => 1 - 0.7 * t, w: hw });
}

// Shelly: front swept straight up into a big rounded crest, crown broken into thick
// petal locks, side locks to the jaw, and a short, very full high ponytail with a band.
function shellyHair(h: Head, clump: ClumpFn, sideOf: SideFn, rnd: () => number, hw: () => W, toTail: (f: number) => WFn, S: number) {
  for (let k = 0; k < 18; k++) {
    const x = (k / 17 - 0.5) * 1.3;
    const root = h.at(x, 0.62 - Math.abs(x) * 0.2, 0.75, 0.004 * S);
    const pts = grow(h, root, new THREE.Vector3(x * 0.2, 1, -0.3), { len: 0.13 * S, steps: 8, collide: 0.012 * S, bend: new THREE.Vector3(0, -0.2, -1), bendK: 0.25 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.04 * S, flat: 0.45, taper: (t) => 1 - 0.6 * t, w: hw });
  }
  // Petal locks over the crown.
  for (let k = 0; k < 6; k++) {
    const ang = -1.2 + (k / 5) * 2.4;
    const root = h.at(Math.sin(ang) * 0.5, 0.85, -0.2 + Math.cos(ang) * 0.2, 0.01 * S);
    const pts = grow(h, root, new THREE.Vector3(Math.sin(ang) * 0.9, 0.7, -0.6), { len: 0.1 * S, steps: 7, collide: 0.016 * S, gravity: 0.25 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.06 * S, flat: 0.5, taper: (t) => Math.pow(1 - t, 0.7), w: hw });
  }
  for (const s of [-1, 1]) {
    const root = h.at(s * 0.85, 0.4, 0.5, 0.006 * S);
    const pts = grow(h, root, new THREE.Vector3(s * 0.2, -1, 0.3), { len: 0.13 * S, steps: 8, collide: 0.006 * S, gravity: 0.5, bend: new THREE.Vector3(-s, 0, 0.5), bendK: 0.15 }, rnd);
    clump({ pts, side: sideOf(pts), width: 0.04 * S, flat: 0.4, w: hw });
  }
  // The back and sides swept up to the tie.
  const tie = h.at(0, 0.62, -0.78, 0.02 * S);
  for (let k = 0; k < 40; k++) {
    const ang = Math.PI * (0.3 + (k / 39) * 1.4);
    const root = h.at(Math.sin(ang), -0.15 + rnd() * 0.2, Math.cos(ang), 0.004 * S);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) pts.push(h.push(root.clone().lerp(tie, i / 6), 0.008 * S));
    clump({ pts, side: sideOf(pts), width: 0.04 * S, flat: 0.3, taper: () => 0.9, w: hw });
  }
  // The ponytail: a fan of thick locks from the tie.
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(ang) * 0.6, 0.35 + Math.sin(ang) * 0.4, -1);
    const pts = grow(h, tie.clone(), dir, { len: (0.16 + rnd() * 0.06) * S, steps: 8, gravity: 0.45, collide: 0.01 * S, wave: 0.6 }, rnd);
    clump({ pts, side: pts.map(() => new THREE.Vector3(Math.sin(ang), Math.cos(ang), 0)), width: 0.045 * S, flat: 0.5, taper: (t) => Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * (1 - t) * 1.4 + 0.02, w: toTail(0.05) });
  }
}
