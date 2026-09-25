// Geometry toolkit for the village: a static batcher that merges everything per material,
// boxes and cylinders with metre-based UVs, and a general Japanese roof generator
// (gable / hip / irimoya / pyramid, with a concave sori curve and upturned corners).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { MatKey, Materials } from "../render/materials";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/** Compose a transform matrix: position, yaw/pitch/roll (radians), optional scale. */
export function trs(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, "YXZ");
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Batch {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();
  constructor(private materials: Materials) {}

  add(key: MatKey, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, parent?: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    // Keep attributes uniform so geometries merge.
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) {
      _m.copy(matrix);
      if (parent) _m.premultiply(parent);
      g.applyMatrix4(_m);
    } else if (parent) {
      g.applyMatrix4(parent);
    }
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }

  get isEmpty() {
    return this.parts.size === 0;
  }

  build(opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [key, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, this.materials.get(key));
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.name = `batch:${key}`;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
    return group;
  }
}

// ——— primitives with metric UVs ————————————————————————————————————

/** Box centred at the origin; UVs are in metres / uvScale, projected per face. */
export function box(w: number, h: number, d: number, uvScale = 1.5): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale);
    else if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale);
    else uv.setXY(i, x / uvScale, y / uvScale);
  }
  return g;
}

/** Box whose base sits at y = 0. */
export function boxBase(w: number, h: number, d: number, uvScale = 1.5): THREE.BufferGeometry {
  const g = box(w, h, d, uvScale);
  g.translate(0, h / 2, 0);
  return g;
}

export function cylinder(rTop: number, rBot: number, h: number, seg = 10, uvScale = 1.5, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const circ = Math.PI * 2 * Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / uvScale, (uv.getY(i) * h) / uvScale);
  return g;
}

export function plane(w: number, h: number, uvScale = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  if (uvScale !== 1) for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / uvScale, (uv.getY(i) * h) / uvScale);
  return g;
}

/** A vertical quad in the XY plane whose UVs span 0..1 (for signs, noren). */
export function decal(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}

// ——— roofs ——————————————————————————————————————————————————————

export interface RoofSpec {
  /** Building footprint (the roof adds `overhang` on every side). */
  w: number;
  d: number;
  overhang: number;
  rise: number;
  /**
   * Shape: "gable" (kirizuma), "hip" (yosemune), "irimoya" (hip below, gable above),
   * "pyramid" (hōgyō, needs w === d), "shed" (single slope toward +z).
   */
  style: "gable" | "hip" | "irimoya" | "pyramid" | "shed";
  /** 0 = straight slopes, 0.5 = strongly concave. */
  sag?: number;
  /** Corner lift in metres. */
  upturn?: number;
  thickness?: number;
  /** Ridge cap height (0 for none). */
  ridgeCap?: number;
  tileScale?: number;
  /** x position (positive) of the vertical gable wall; defaults to just inside the roof edge. */
  gableAt?: number;
}

export interface RoofParts {
  top: THREE.BufferGeometry;
  under: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  gable: THREE.BufferGeometry | null;
  ridge: THREE.BufferGeometry | null;
}

interface Face {
  /** position for (s, t) in [0,1]² */
  at: (s: number, t: number) => THREE.Vector3;
  tMax: number;
  uAxis: "x" | "z";
}

export function roof(spec: RoofSpec): RoofParts {
  const W = spec.w / 2 + spec.overhang;
  const D = spec.d / 2 + spec.overhang;
  const rise = spec.rise;
  const sag = spec.sag ?? 0.35;
  const up = spec.upturn ?? 0.25;
  const T = spec.thickness ?? 0.22;
  const tile = spec.tileScale ?? 2;
  const prof = (t: number) => rise * ((1 - sag) * t + sag * t * t);
  const lift = (s: number, t: number) => up * Math.pow(Math.abs(2 * s - 1), 4) * Math.pow(Math.max(0, 1 - t / 0.5), 2);

  let tc: number;
  let xc: number;
  switch (spec.style) {
    case "gable":
    case "shed":
      tc = 0;
      xc = W;
      break;
    case "hip":
      tc = 1;
      xc = Math.max(0, W - D);
      break;
    case "pyramid":
      tc = 1;
      xc = 0;
      break;
    case "irimoya":
      tc = 0.55;
      xc = Math.max(W * 0.35, W - D * 0.75);
      break;
  }
  const hw = (t: number) => (tc <= 0 ? xc : t < tc ? W - (W - xc) * (t / tc) : xc);

  const faces: Face[] = [];
  const front = (sign: number): Face => ({
    at: (s, t) => {
      const h = hw(t);
      const x = (-h + 2 * h * s) * sign;
      const z = D * (1 - t) * sign;
      return new THREE.Vector3(x, prof(t) + lift(s, t), z);
    },
    tMax: 1,
    uAxis: "x",
  });
  faces.push(front(1));
  if (spec.style !== "shed") faces.push(front(-1));
  if (tc > 0) {
    const side = (sign: number): Face => ({
      at: (s, t) => {
        const x = (W - (W - xc) * (t / tc)) * sign;
        const zh = D * (1 - t);
        const z = (zh - 2 * zh * s) * sign;
        return new THREE.Vector3(x, prof(t) + lift(s, t), z);
      },
      tMax: tc,
      uAxis: "z",
    });
    faces.push(side(1), side(-1));
  }

  const seg = 10;
  const tSeg = 7;
  const topP: number[] = [];
  const topUV: number[] = [];
  const underP: number[] = [];
  const underUV: number[] = [];
  const trimP: number[] = [];
  const slopeLen = Math.hypot(D, rise);

  const pushQuad = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, flip = false) => {
    if (flip) arr.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    else arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  };
  const down = new THREE.Vector3(0, -T, 0);

  for (const f of faces) {
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < tSeg; j++) {
        const s0 = i / seg;
        const s1 = (i + 1) / seg;
        const t0 = (j / tSeg) * f.tMax;
        const t1 = ((j + 1) / tSeg) * f.tMax;
        const a = f.at(s0, t0);
        const b = f.at(s1, t0);
        const c = f.at(s0, t1);
        const d = f.at(s1, t1);
        // Orientation: make the top face point up.
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const flip = n.y < 0;
        pushQuad(topP, a, b, c, d, flip);
        const ua = (f.uAxis === "x" ? a.x : a.z) / tile;
        const ub = (f.uAxis === "x" ? b.x : b.z) / tile;
        const va = (t0 * slopeLen) / tile;
        const vc = (t1 * slopeLen) / tile;
        if (flip) topUV.push(ua, va, ua, vc, ub, va, ub, va, ua, vc, ub, vc);
        else topUV.push(ua, va, ub, va, ua, vc, ub, va, ub, vc, ua, vc);
        const a2 = a.clone().add(down);
        const b2 = b.clone().add(down);
        const c2 = c.clone().add(down);
        const d2 = d.clone().add(down);
        pushQuad(underP, a2, b2, c2, d2, !flip);
        if (!flip) underUV.push(ua, va, ua, vc, ub, va, ub, va, ua, vc, ub, vc);
        else underUV.push(ua, va, ub, va, ua, vc, ub, va, ub, vc, ua, vc);
      }
      // Eave fascia.
      const e0 = f.at(i / seg, 0);
      const e1 = f.at((i + 1) / seg, 0);
      pushQuad(trimP, e0, e1, e0.clone().add(down), e1.clone().add(down));
      pushQuad(trimP, e1, e0, e1.clone().add(down), e0.clone().add(down));
    }
  }

  // Barge boards along exposed gable edges of the front faces (t in [tc, 1]).
  let gable: THREE.BufferGeometry | null = null;
  if (tc < 1 && spec.style !== "shed") {
    const gp: number[] = [];
    const steps = 8;
    for (const sign of [1, -1]) {
      const x = xc * sign;
      for (let k = 0; k < steps; k++) {
        const ta = tc + ((1 - tc) * k) / steps;
        const tb = tc + ((1 - tc) * (k + 1)) / steps;
        for (const zs of [1, -1]) {
          const pa = new THREE.Vector3(x, prof(ta) + lift(sign > 0 ? 1 : 0, ta), D * (1 - ta) * zs);
          const pb = new THREE.Vector3(x, prof(tb) + lift(sign > 0 ? 1 : 0, tb), D * (1 - tb) * zs);
          pushQuad(trimP, pa, pb, pa.clone().add(down), pb.clone().add(down));
          pushQuad(trimP, pb, pa, pb.clone().add(down), pa.clone().add(down));
        }
      }
      // Vertical gable wall under the roof, from where it meets the walls up to the ridge.
      const gx = (spec.gableAt ?? xc - 0.25) * sign;
      const tStart = tc > 0 ? tc : Math.min(0.95, spec.overhang / D);
      const yWall = tc > 0 ? prof(tc) - T : 0;
      const z0 = D * (1 - tStart) - 0.04;
      if (tc <= 0) {
        // Band between the top of the side wall and the underside of the roof.
        pushQuad(
          gp,
          new THREE.Vector3(gx, yWall, z0), new THREE.Vector3(gx, yWall, -z0),
          new THREE.Vector3(gx, prof(tStart) - T, z0), new THREE.Vector3(gx, prof(tStart) - T, -z0),
          sign < 0,
        );
      }
      for (let k = 0; k < steps; k++) {
        const ta = tStart + ((1 - tStart) * k) / steps;
        const tb = tStart + ((1 - tStart) * (k + 1)) / steps;
        const za = D * (1 - ta) - 0.04;
        const zb = Math.max(0.001, D * (1 - tb) - 0.04);
        const ya = k === 0 && tc > 0 ? yWall : prof(ta) - T;
        pushQuad(
          gp,
          new THREE.Vector3(gx, ya, za), new THREE.Vector3(gx, ya, -za),
          new THREE.Vector3(gx, prof(tb) - T, zb), new THREE.Vector3(gx, prof(tb) - T, -zb),
          sign < 0,
        );
      }
    }
    gable = new THREE.BufferGeometry();
    gable.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
    gable.computeVertexNormals();
    const pos = gable.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getZ(i) / 1.5;
      uv[i * 2 + 1] = pos.getY(i) / 1.5;
    }
    gable.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  // Ridge cap and hip caps.
  let ridge: THREE.BufferGeometry | null = null;
  const cap = spec.ridgeCap ?? 0.3;
  if (cap > 0 && spec.style !== "shed") {
    const parts: THREE.BufferGeometry[] = [];
    if (xc > 0.05) {
      const r = box(xc * 2 + 0.4, cap, 0.38);
      r.translate(0, rise + cap * 0.35, 0);
      parts.push(r);
      for (const sx of [-1, 1]) {
        const oni = box(0.3, cap * 1.8, 0.5);
        oni.translate(sx * (xc + 0.2), rise + cap * 0.7, 0);
        parts.push(oni);
      }
    } else {
      const finial = box(0.4, cap * 1.5, 0.4);
      finial.translate(0, rise + cap * 0.5, 0);
      parts.push(finial);
    }
    if (tc > 0) {
      // Hip ridges from each corner up to where the hips meet the ridge.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const steps = 6;
          for (let k = 0; k < steps; k++) {
            const ta = (tc * k) / steps;
            const tb = (tc * (k + 1)) / steps;
            const pa = new THREE.Vector3((W - (W - xc) * (ta / tc)) * sx, prof(ta) + lift(1, ta), D * (1 - ta) * sz);
            const pb = new THREE.Vector3((W - (W - xc) * (tb / tc)) * sx, prof(tb) + lift(1, tb), D * (1 - tb) * sz);
            const len = pa.distanceTo(pb);
            const seg = box(0.26, cap * 0.8, len + 0.05);
            const mid = pa.clone().add(pb).multiplyScalar(0.5);
            const look = new THREE.Matrix4().lookAt(pa, pb, new THREE.Vector3(0, 1, 0));
            seg.applyMatrix4(look);
            seg.translate(mid.x, mid.y + cap * 0.3, mid.z);
            parts.push(seg);
          }
        }
      }
    }
    ridge = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
  }

  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(topP, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(topUV, 2));
  top.computeVertexNormals();
  const under = new THREE.BufferGeometry();
  under.setAttribute("position", new THREE.Float32BufferAttribute(underP, 3));
  under.setAttribute("uv", new THREE.Float32BufferAttribute(underUV, 2));
  under.computeVertexNormals();
  const trim = new THREE.BufferGeometry();
  trim.setAttribute("position", new THREE.Float32BufferAttribute(trimP, 3));
  trim.computeVertexNormals();
  const tp = trim.attributes.position as THREE.BufferAttribute;
  const tuv = new Float32Array(tp.count * 2);
  for (let i = 0; i < tp.count; i++) {
    tuv[i * 2] = (tp.getX(i) + tp.getZ(i)) / 1.5;
    tuv[i * 2 + 1] = tp.getY(i) / 1.5;
  }
  trim.setAttribute("uv", new THREE.BufferAttribute(tuv, 2));
  return { top, under, trim, gable, ridge };
}

/** Add all roof parts to a batch with a transform. */
export function addRoof(batch: Batch, spec: RoofSpec, m: THREE.Matrix4, mats: { top: MatKey; under?: MatKey; trim?: MatKey; gable?: MatKey; ridge?: MatKey }) {
  const r = roof(spec);
  batch.add(mats.top, r.top, m);
  batch.add(mats.under ?? "darkWood", r.under, m);
  batch.add(mats.trim ?? "darkWood", r.trim, m);
  if (r.gable) batch.add(mats.gable ?? "darkWood", r.gable, m);
  if (r.ridge) batch.add(mats.ridge ?? mats.top, r.ridge, m);
}
