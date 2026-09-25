// Geometry toolkit for garments and props on a human body.
//
// Garments start from a kit surface (the body, or MakeHuman's "tights"/"skirt" guides),
// cut by a scalar field (inside where f ≥ 0, with clean interpolated edges), pushed out
// along the normals, and given hems. UVs come from per-limb cylindrical charts so fabric
// textures tile at real-world scale. Everything is skinned with the body's own weights.

import * as THREE from "three";
import type { Anatomy } from "./anatomy";

/** Four bone indices and weights. */
export interface W {
  i: [number, number, number, number];
  w: [number, number, number, number];
}

export function wOne(bone: number): W {
  return { i: [bone, 0, 0, 0], w: [1, 0, 0, 0] };
}

export function wMix(parts: [W, number][]): W {
  const m = new Map<number, number>();
  for (const [x, k] of parts) for (let j = 0; j < 4; j++) if (x.w[j] > 0) m.set(x.i[j], (m.get(x.i[j]) ?? 0) + x.w[j] * k);
  const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = e.reduce((a, x) => a + x[1], 0) || 1;
  const out: W = { i: [0, 0, 0, 0], w: [0, 0, 0, 0] };
  e.forEach(([b, v], j) => {
    out.i[j] = b;
    out.w[j] = v / sum;
  });
  return out;
}

/** Per-material vertex accumulator. */
export class Acc {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  get count() {
    return this.pos.length / 3;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, w: W): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.si.push(...w.i);
    this.sw.push(...w.w);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

/** A cloth vertex before emission: world position, normal, weights, and its chart. */
export interface CV {
  p: THREE.Vector3;
  n: THREE.Vector3;
  w: W;
  /** Region code (see Anatomy.region) used to choose the UV chart. */
  region: number;
}

export interface Shell {
  verts: CV[];
  tris: number[];
}

// ——— kit surfaces in stored-vertex space ————————————————————————————————————————

const triCache = new WeakMap<object, Map<string, Uint32Array>>();
export function storedTris(a: Anatomy, part: string): Uint32Array {
  let m = triCache.get(a.kit);
  if (!m) triCache.set(a.kit, (m = new Map()));
  let t = m.get(part);
  if (!t) {
    const vtx = a.kit.view<Uint16Array>(`${part}:vtx`);
    const tris = a.kit.view<Uint16Array>(`${part}:tris`);
    t = new Uint32Array(tris.length);
    for (let i = 0; i < tris.length; i++) t[i] = vtx[tris[i]];
    m.set(part, t);
  }
  return t;
}

export function storedWeights(a: Anatomy, s: number): W {
  const wi = a.kit.view<Uint8Array>("weights:idx");
  const ww = a.kit.view<Uint8Array>("weights:w");
  return {
    i: [wi[s * 4], wi[s * 4 + 1], wi[s * 4 + 2], wi[s * 4 + 3]],
    w: [ww[s * 4] / 255, ww[s * 4 + 1] / 255, ww[s * 4 + 2] / 255, ww[s * 4 + 3] / 255],
  };
}

/**
 * Cut a kit surface to the region where f(s) ≥ 0. Edges crossing f = 0 are split at the
 * crossing, so garment edges are clean lines rather than stair-stepped triangles.
 */
export function cut(a: Anatomy, part: string, f: (s: number) => number): Shell {
  const tris = storedTris(a, part);
  const fv = new Map<number, number>();
  const F = (s: number) => {
    let v = fv.get(s);
    if (v === undefined) fv.set(s, (v = f(s)));
    return v;
  };
  const verts: CV[] = [];
  const key = new Map<string, number>();
  const orig = (s: number) => {
    const k = `v${s}`;
    let i = key.get(k);
    if (i === undefined) {
      i = verts.length;
      key.set(k, i);
      verts.push({ p: a.pos(s), n: a.nrm(s), w: storedWeights(a, s), region: a.region[s] });
    }
    return i;
  };
  const edge = (s0: number, s1: number) => {
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    const k = `e${lo}_${hi}`;
    let i = key.get(k);
    if (i === undefined) {
      const f0 = F(lo);
      const f1 = F(hi);
      const t = THREE.MathUtils.clamp(f0 / (f0 - f1), 0, 1);
      const p = a.pos(lo).lerp(a.pos(hi), t);
      const n = a.nrm(lo).lerp(a.nrm(hi), t).normalize();
      i = verts.length;
      key.set(k, i);
      verts.push({ p, n, w: wMix([[storedWeights(a, lo), 1 - t], [storedWeights(a, hi), t]]), region: t < 0.5 ? a.region[lo] : a.region[hi] });
    }
    return i;
  };
  const out: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const s = [tris[t], tris[t + 1], tris[t + 2]];
    const inside = s.map((x) => F(x) >= 0);
    if (!inside[0] && !inside[1] && !inside[2]) continue;
    if (inside[0] && inside[1] && inside[2]) {
      out.push(orig(s[0]), orig(s[1]), orig(s[2]));
      continue;
    }
    const poly: number[] = [];
    for (let k = 0; k < 3; k++) {
      const c = s[k];
      const nx = s[(k + 1) % 3];
      if (inside[k]) poly.push(orig(c));
      if (inside[k] !== inside[(k + 1) % 3]) poly.push(edge(c, nx));
    }
    for (let k = 1; k < poly.length - 1; k++) out.push(poly[0], poly[k], poly[k + 1]);
  }
  return { verts, tris: out };
}

/** Push every vertex out along its normal by `d(v)` metres. */
export function inflate(sh: Shell, d: number | ((v: CV) => number)) {
  for (const v of sh.verts) v.p.addScaledVector(v.n, typeof d === "number" ? d : d(v));
  return sh;
}

/** Recompute smooth normals from the shell's own triangles (after deforming it). */
export function renormal(sh: Shell) {
  const acc = sh.verts.map(() => new THREE.Vector3());
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let t = 0; t < sh.tris.length; t += 3) {
    const [a, b, c] = [sh.verts[sh.tris[t]].p, sh.verts[sh.tris[t + 1]].p, sh.verts[sh.tris[t + 2]].p];
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    const n = e1.cross(e2);
    for (let k = 0; k < 3; k++) acc[sh.tris[t + k]].add(n);
  }
  sh.verts.forEach((v, i) => {
    if (acc[i].lengthSq() > 1e-12) v.n.copy(acc[i].normalize());
  });
  return sh;
}

/** Laplacian smoothing of positions (removes anatomy showing through cloth). */
export function smooth(sh: Shell, iterations = 2, k = 0.5, pin?: (v: CV) => boolean) {
  const nbr: Set<number>[] = sh.verts.map(() => new Set());
  for (let t = 0; t < sh.tris.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = sh.tris[t + j];
      const b = sh.tris[t + ((j + 1) % 3)];
      nbr[a].add(b);
      nbr[b].add(a);
    }
  const boundary = boundaryVerts(sh);
  for (let it = 0; it < iterations; it++) {
    const next = sh.verts.map((v, i) => {
      if (boundary.has(i) || pin?.(v) || !nbr[i].size) return v.p.clone();
      const c = new THREE.Vector3();
      for (const j of nbr[i]) c.add(sh.verts[j].p);
      c.divideScalar(nbr[i].size);
      return v.p.clone().lerp(c, k);
    });
    sh.verts.forEach((v, i) => v.p.copy(next[i]));
  }
  return sh;
}

function boundaryVerts(sh: Shell): Set<number> {
  const s = new Set<number>();
  for (const [a, b] of boundaryEdges(sh)) {
    s.add(a);
    s.add(b);
  }
  return s;
}

/** Edges used by exactly one triangle, oriented as in that triangle. */
export function boundaryEdges(sh: Shell): [number, number][] {
  const count = new Map<string, [number, number, number]>();
  for (let t = 0; t < sh.tris.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = sh.tris[t + j];
      const b = sh.tris[t + ((j + 1) % 3)];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const c = count.get(k);
      if (c) c[2]++;
      else count.set(k, [a, b, 1]);
    }
  const out: [number, number][] = [];
  for (const [a, b, n] of count.values()) if (n === 1) out.push([a, b]);
  return out;
}

// ——— UV charts ————————————————————————————————————————————————————————————————————

export type Chart = "torso" | "armL" | "armR" | "legL" | "legR" | "head" | "planar";

export function chartFor(region: number): Chart {
  switch (region) {
    case 1:
      return "head";
    case 2:
    case 4:
      return "armL";
    case 3:
    case 5:
      return "armR";
    case 6:
    case 8:
      return "legL";
    case 7:
    case 9:
      return "legR";
  }
  return "torso";
}

/** Cylindrical UV in metres (u around, v along) and the chart's circumference period. */
export function chartUV(a: Anatomy, chart: Chart, p: THREE.Vector3): [number, number, number] {
  if (chart === "torso" || chart === "head" || chart === "planar") {
    const r = chart === "head" ? a.headRadii.x : 0.16;
    const ang = Math.atan2(p.x, p.z);
    return [ang * r, p.y, Math.PI * 2 * r];
  }
  const side = chart.endsWith("L") ? "L" : "R";
  const c = chart.startsWith("arm") ? a.arm[side] : a.leg[side];
  const pr = projectOnChainFast(c, p);
  // Angle around the limb axis, zero facing forward, seam on the inner side.
  const radial = p.clone().sub(pr.at);
  radial.addScaledVector(pr.dir, -radial.dot(pr.dir));
  const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(pr.dir, -pr.dir.z).normalize();
  const out = new THREE.Vector3().crossVectors(pr.dir, fwd).multiplyScalar(side === "L" ? -1 : 1);
  const ang = Math.atan2(radial.dot(out), radial.dot(fwd));
  const r = chart.startsWith("arm") ? 0.05 : 0.08;
  return [ang * r, -pr.t * c.total, Math.PI * 2 * r];
}

function projectOnChainFast(c: { pts: THREE.Vector3[]; len: number[]; total: number }, p: THREE.Vector3) {
  let best = { t: 0, d: Infinity, at: c.pts[0].clone(), dir: new THREE.Vector3(0, -1, 0) };
  for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i];
    const ab = c.pts[i + 1].clone().sub(a);
    const l2 = ab.lengthSq();
    const k = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / l2, i === 0 ? -0.6 : 0, i === c.pts.length - 2 ? 1.6 : 1);
    const q = a.clone().addScaledVector(ab, k);
    const d = q.distanceTo(p);
    if (d < best.d) best = { t: (c.len[i] + k * Math.sqrt(l2)) / c.total, d, at: q, dir: ab.normalize() };
  }
  return best;
}

/**
 * Write a shell into an accumulator. Each triangle takes one chart; corners are split
 * where charts meet or where the cylindrical seam wraps.
 */
export function emit(acc: Acc, a: Anatomy, sh: Shell, opts: { tile?: number; chart?: Chart; flip?: boolean } = {}) {
  const tile = opts.tile ?? 0.35;
  const cache = new Map<string, number>();
  const uvOf = new Map<string, [number, number, number]>();
  const uvFor = (vi: number, chart: Chart) => {
    const k = `${vi}:${chart}`;
    let r = uvOf.get(k);
    if (!r) uvOf.set(k, (r = chartUV(a, chart, sh.verts[vi].p)));
    return r;
  };
  for (let t = 0; t < sh.tris.length; t += 3) {
    const ids = [sh.tris[t], sh.tris[t + 1], sh.tris[t + 2]];
    const chart = opts.chart ?? majorityChart(ids.map((i) => sh.verts[i].region));
    const uvs = ids.map((i) => uvFor(i, chart));
    const period = uvs[0][2];
    // Unwrap across the seam relative to the first corner.
    const shift = uvs.map((u) => (u[0] - uvs[0][0] > period / 2 ? -1 : u[0] - uvs[0][0] < -period / 2 ? 1 : 0));
    const out = ids.map((vi, k) => {
      const key = `${vi}:${chart}:${shift[k]}`;
      let o = cache.get(key);
      if (o === undefined) {
        const v = sh.verts[vi];
        o = acc.vertex(v.p, v.n, (uvs[k][0] + shift[k] * period) / tile, uvs[k][1] / tile, v.w);
        cache.set(key, o);
      }
      return o;
    });
    if (opts.flip) acc.tri(out[0], out[2], out[1]);
    else acc.tri(out[0], out[1], out[2]);
  }
}

function majorityChart(regions: number[]): Chart {
  const c = regions.map(chartFor);
  if (c[1] === c[2]) return c[1];
  return c[0];
}

/**
 * Give a shell's open edges some thickness: a strip folded back under the edge
 * (depth metres), so hems, cuffs and collars don't look paper-thin.
 */
export function hem(acc: Acc, a: Anatomy, sh: Shell, depth = 0.006, opts: { tile?: number; keep?: (v: CV) => boolean } = {}) {
  const edges = boundaryEdges(sh);
  const inner = new Map<number, number>();
  const outer = new Map<number, number>();
  const tile = opts.tile ?? 0.35;
  const ring = (vi: number) => {
    let o = outer.get(vi);
    if (o === undefined) {
      const v = sh.verts[vi];
      const [u, vv] = chartUV(a, chartFor(v.region), v.p);
      o = acc.vertex(v.p, v.n, u / tile, vv / tile, v.w);
      outer.set(vi, o);
      const ip = v.p.clone().addScaledVector(v.n, -depth);
      inner.set(vi, acc.vertex(ip, v.n.clone().negate(), u / tile, (vv - depth) / tile, v.w));
    }
    return [o, inner.get(vi)!] as const;
  };
  for (const [a0, b0] of edges) {
    if (opts.keep && !(opts.keep(sh.verts[a0]) && opts.keep(sh.verts[b0]))) continue;
    const [oa, ia] = ring(a0);
    const [ob, ib] = ring(b0);
    acc.tri(oa, ib, ob);
    acc.tri(oa, ia, ib);
  }
}

// ——— primitives ——————————————————————————————————————————————————————————————————————

/**
 * A strip along a path: `side` is the across direction at each point (unit), width in
 * metres; normals face `nrm`. UV u across (0..1 of width), v along in metres.
 */
export function strip(acc: Acc, path: THREE.Vector3[], side: THREE.Vector3[], nrm: THREE.Vector3[], width: (t: number) => number, weights: (t: number) => W, opts: { tile?: number; doubleSided?: boolean; centred?: boolean } = {}) {
  const tile = opts.tile ?? 0.35;
  let along = 0;
  const base = acc.count;
  for (let i = 0; i < path.length; i++) {
    if (i) along += path[i].distanceTo(path[i - 1]);
    const t = i / Math.max(1, path.length - 1);
    const w = width(t);
    const off = opts.centred === false ? 0 : 0.5;
    const pA = path[i].clone().addScaledVector(side[i], -w * off);
    const pB = path[i].clone().addScaledVector(side[i], w * (1 - off));
    const wt = weights(t);
    acc.vertex(pA, nrm[i], 0, along / tile, wt);
    acc.vertex(pB, nrm[i], w / tile, along / tile, wt);
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a0 = base + i * 2;
    acc.tri(a0, a0 + 1, a0 + 2);
    acc.tri(a0 + 1, a0 + 3, a0 + 2);
  }
}

/**
 * A tube along a path with an elliptical (or custom) cross-section. `frame(t)` gives the
 * section axes; `radius(t, angle)` the radius. Closed around, open at the ends unless capped.
 */
export function tube(
  acc: Acc,
  path: THREE.Vector3[],
  frame: (i: number) => { x: THREE.Vector3; y: THREE.Vector3 },
  radius: (t: number, ang: number) => number,
  weights: (t: number, ang: number) => W,
  opts: { segments?: number; tile?: number; capEnd?: boolean; capStart?: boolean } = {},
) {
  const seg = opts.segments ?? 12;
  const tile = opts.tile ?? 0.35;
  let along = 0;
  const rings: number[][] = [];
  for (let i = 0; i < path.length; i++) {
    if (i) along += path[i].distanceTo(path[i - 1]);
    const t = i / Math.max(1, path.length - 1);
    const { x, y } = frame(i);
    const ring: number[] = [];
    let circ = 0;
    for (let k = 0; k <= seg; k++) {
      const ang = (k / seg) * Math.PI * 2;
      const r = radius(t, ang);
      const d = x.clone().multiplyScalar(Math.cos(ang)).addScaledVector(y, Math.sin(ang));
      const p = path[i].clone().addScaledVector(d, r);
      if (k) circ += r * ((Math.PI * 2) / seg);
      ring.push(acc.vertex(p, d.normalize(), circ / tile, along / tile, weights(t, ang)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a0 = rings[i][k];
      const b0 = rings[i][k + 1];
      const c0 = rings[i + 1][k];
      const d0 = rings[i + 1][k + 1];
      acc.tri(a0, c0, b0);
      acc.tri(b0, c0, d0);
    }
  const cap = (i: number, atEnd: boolean) => {
    const toward = path[atEnd ? i - 1 : i + 1];
    const outward = path[i].clone().sub(toward).normalize();
    const c = acc.vertex(path[i], outward, 0.5, 0.5, weights(i / Math.max(1, path.length - 1), 0));
    for (let k = 0; k < seg; k++) atEnd ? acc.tri(c, rings[i][k], rings[i][k + 1]) : acc.tri(c, rings[i][k + 1], rings[i][k]);
  };
  if (opts.capStart && path.length > 1) cap(0, false);
  if (opts.capEnd && path.length > 1) cap(path.length - 1, true);
  return rings;
}

/** Transform-and-append an arbitrary (non-skinned) geometry, rigid to one bone. */
export function rigid(acc: Acc, geo: THREE.BufferGeometry, m: THREE.Matrix4, w: W, uvScale = 1) {
  const g = geo;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const base = acc.count;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    acc.vertex(p, n, uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0, w);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) acc.idx.push(base + g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) acc.idx.push(base + i);
}
