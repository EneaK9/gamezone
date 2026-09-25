// Low-level builder for skinned character meshes. Every vertex carries a colour, a
// surface descriptor (roughness, fabric-detail, skin), and up to four bone weights.
// Parts are built from lofts (rings along a path) and arbitrary transformed geometry.

import * as THREE from "three";

/** [boneIndex, weight] pairs; normalised when written. */
export type Weights = [number, number][];

/** roughness, fabric normal-map strength, skin (0/1) */
export type Surf = [number, number, number];

export const SKIN_SURF: Surf = [0.52, 0, 1];
export const CLOTH_SURF: Surf = [0.9, 1, 0];
export const SILK_SURF: Surf = [0.55, 0.35, 0];
export const LEATHER_SURF: Surf = [0.55, 0.25, 0];
export const HAIR_SURF: Surf = [0.45, 0.15, 0];
export const METAL_SURF: Surf = [0.35, 0, 0];
export const EYE_SURF: Surf = [0.12, 0, 0];
export const STRAW_SURF: Surf = [0.95, 0.8, 0];

export interface RingSpec {
  points: THREE.Vector3[];
  normals: THREE.Vector3[];
  weights: Weights;
  /** Optional per-point weights (overrides `weights`), e.g. skirts spanning both legs. */
  pointWeights?: Weights[];
  /** Optional per-point pattern index (overrides the builder's paint.pat). */
  pats?: number[];
  /** Colour per point (same length as points) or one colour. */
  colors: THREE.Color | THREE.Color[];
  /** Distance along the loft (metres), for UVs. */
  v: number;
}

export interface Paint {
  /** Pattern index into the pattern atlas (0 = plain). */
  pat: number;
  accent: THREE.Color;
}

export class MeshBuilder {
  /** Pattern/accent applied to vertices written while set. */
  paint: Paint = { pat: 0, accent: new THREE.Color(1, 1, 1) };
  acc: number[] = [];
  pat: number[] = [];
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  surf: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  get count() {
    return this.pos.length / 3;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color, s: Surf, w: Weights): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.surf.push(s[0], s[1], s[2]);
    this.acc.push(this.paint.accent.r, this.paint.accent.g, this.paint.accent.b);
    this.pat.push(this.paint.pat);
    const sorted = [...w].filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = sorted.reduce((a, e) => a + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      this.si.push(sorted[i] ? sorted[i][0] : 0);
      this.sw.push(sorted[i] ? sorted[i][1] / total : 0);
    }
    return this.count - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  /** Join consecutive rings into a tube. Rings must have equal point counts (closed loops). */
  loft(rings: RingSpec[], s: Surf, opts: { capStart?: boolean; capEnd?: boolean; uvScale?: number; flip?: boolean; open?: boolean } = {}) {
    const n = rings[0].points.length;
    if (opts.open) return this.loftOpen(rings, s, opts.uvScale ?? 0.14, opts.flip);
    const uvScale = opts.uvScale ?? 0.14;
    const start = this.count;
    for (const r of rings) {
      // Duplicate the first point to close the UV seam.
      let circ = 0;
      for (let i = 0; i < n; i++) circ += r.points[i].distanceTo(r.points[(i + 1) % n]);
      let acc = 0;
      for (let i = 0; i <= n; i++) {
        const k = i % n;
        if (i > 0) acc += r.points[i - 1].distanceTo(r.points[k]);
        const c = Array.isArray(r.colors) ? r.colors[k] : r.colors;
        const saved = this.paint.pat;
        if (r.pats) this.paint.pat = r.pats[k];
        this.vertex(r.points[k], r.normals[k], acc / uvScale, r.v / uvScale, c, s, r.pointWeights ? r.pointWeights[k] : r.weights);
        this.paint.pat = saved;
      }
      void circ;
    }
    const stride = n + 1;
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = start + j * stride + i;
        const b = a + stride;
        if (opts.flip) {
          this.tri(a, a + 1, b);
          this.tri(a + 1, b + 1, b);
        } else {
          this.tri(a, b, a + 1);
          this.tri(a + 1, b, b + 1);
        }
      }
    }
    const cap = (ri: number, invert: boolean) => {
      const r = rings[ri];
      const centre = new THREE.Vector3();
      for (const p of r.points) centre.add(p);
      centre.divideScalar(n);
      const axis = new THREE.Vector3().subVectors(rings[Math.min(rings.length - 1, ri + (invert ? -1 : 1))].points[0], r.points[0]);
      const nrm = new THREE.Vector3();
      // Cap normal points away from the loft.
      const other = rings[invert ? Math.max(0, ri - 1) : Math.min(rings.length - 1, ri + 1)];
      const oc = new THREE.Vector3();
      for (const p of other.points) oc.add(p);
      oc.divideScalar(n);
      nrm.subVectors(centre, oc).normalize();
      if (nrm.lengthSq() < 0.5) nrm.copy(axis).normalize().negate();
      const c = Array.isArray(r.colors) ? r.colors[0] : r.colors;
      const ci = this.vertex(centre, nrm, 0, 0, c, s, r.weights);
      const base = this.count;
      for (let i = 0; i < n; i++) {
        const cc = Array.isArray(r.colors) ? r.colors[i] : r.colors;
        this.vertex(r.points[i], nrm, 0, 0, cc, s, r.weights);
      }
      for (let i = 0; i < n; i++) {
        const a = base + i;
        const b = base + ((i + 1) % n);
        // Winding chosen so the cap faces along nrm.
        const pa = r.points[i];
        const pb = r.points[(i + 1) % n];
        const cross = new THREE.Vector3().subVectors(pa, centre).cross(new THREE.Vector3().subVectors(pb, centre));
        if (cross.dot(nrm) > 0) this.tri(ci, a, b);
        else this.tri(ci, b, a);
      }
    };
    if (opts.capStart) cap(0, false);
    if (opts.capEnd) cap(rings.length - 1, true);
  }

  /** Loft of open arcs (no wrap-around), e.g. an open-front jacket. Double-sided. */
  private loftOpen(rings: RingSpec[], s: Surf, uvScale: number, flip = false) {
    const n = rings[0].points.length;
    for (const side of [0, 1]) {
      const start = this.count;
      for (const r of rings) {
        let acc = 0;
        for (let i = 0; i < n; i++) {
          if (i > 0) acc += r.points[i - 1].distanceTo(r.points[i]);
          const c = Array.isArray(r.colors) ? r.colors[i] : r.colors;
          const saved = this.paint.pat;
          if (r.pats) this.paint.pat = side === 0 ? r.pats[i] : 0;
          const nrm = side === 0 ? r.normals[i] : r.normals[i].clone().negate();
          const p = side === 0 ? r.points[i] : r.points[i].clone().addScaledVector(r.normals[i], -0.0025);
          this.vertex(p, nrm, acc / uvScale, r.v / uvScale, side === 0 ? c : c.clone().multiplyScalar(0.7), s, r.pointWeights ? r.pointWeights[i] : r.weights);
          this.paint.pat = saved;
        }
      }
      for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < n - 1; i++) {
          const a = start + j * n + i;
          const b = a + n;
          const f = (side === 1) !== flip;
          if (f) {
            this.tri(a, a + 1, b);
            this.tri(a + 1, b + 1, b);
          } else {
            this.tri(a, b, a + 1);
            this.tri(a + 1, b, b + 1);
          }
        }
      }
    }
  }

  /** Append a regular geometry transformed by m, all vertices sharing colour, surface and weights. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color | ((p: THREE.Vector3) => THREE.Color), s: Surf, w: Weights | ((p: THREE.Vector3) => Weights)) {
    const geo = g.index ? g : g;
    const p = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute | undefined;
    const uvA = geo.attributes.uv as THREE.BufferAttribute | undefined;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.count;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (nrm) n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      else n.set(0, 1, 0);
      const c = typeof color === "function" ? color(v) : color;
      const ww = typeof w === "function" ? w(v) : w;
      this.vertex(v, n, uvA ? uvA.getX(i) * 3 : 0, uvA ? uvA.getY(i) * 3 : 0, c, s, ww);
    }
    if (geo.index) {
      const ia = geo.index.array;
      const flip = m.determinant() < 0;
      for (let i = 0; i < ia.length; i += 3) {
        if (flip) this.tri(base + ia[i], base + ia[i + 2], base + ia[i + 1]);
        else this.tri(base + ia[i], base + ia[i + 1], base + ia[i + 2]);
      }
    } else {
      for (let i = 0; i < p.count; i += 3) this.tri(base + i, base + i + 1, base + i + 2);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("surf", new THREE.Float32BufferAttribute(this.surf, 3));
    g.setAttribute("accent", new THREE.Float32BufferAttribute(this.acc, 3));
    g.setAttribute("pat", new THREE.Float32BufferAttribute(this.pat, 1));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ——— ring helpers ————————————————————————————————————————————————————

export interface EllipseOpts {
  /** Half-width along the ring's right axis. */
  rx: number;
  /** Half-depth toward the ring's forward axis (front) and backward (back). */
  rf: number;
  rb: number;
  /** Superellipse exponent: 2 = ellipse, >2 = boxier. */
  pow?: number;
  segments: number;
  /** Optional per-angle radius multiplier (angle 0 = forward). */
  mod?: (theta: number) => number;
  /** Offset per angle (e.g. chest bulge). */
  bulge?: (theta: number) => number;
  /** Only this range of angles (radians, 0 = forward), producing an open arc of segments+1 points. */
  arc?: [number, number];
}

/**
 * Points of an elliptical ring centred at c, lying in the plane spanned by `right` and
 * `fwd` (which should be perpendicular to the loft direction). Angle 0 points forward,
 * increasing toward `right`.
 */
export function ellipseRing(c: THREE.Vector3, right: THREE.Vector3, fwd: THREE.Vector3, o: EllipseOpts): { points: THREE.Vector3[]; normals: THREE.Vector3[] } {
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const pw = o.pow ?? 2;
  const count = o.arc ? o.segments + 1 : o.segments;
  for (let i = 0; i < count; i++) {
    const th = o.arc ? o.arc[0] + ((o.arc[1] - o.arc[0]) * i) / o.segments : (i / o.segments) * Math.PI * 2;
    const s = Math.sin(th);
    const co = Math.cos(th);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), 2 / pw);
    const sz = Math.sign(co) * Math.pow(Math.abs(co), 2 / pw);
    const m = o.mod ? o.mod(th) : 1;
    const rz = co >= 0 ? o.rf : o.rb;
    const b = o.bulge ? o.bulge(th) : 0;
    const px = sx * o.rx * m;
    const pz = sz * rz * m + b;
    points.push(c.clone().addScaledVector(right, px).addScaledVector(fwd, pz));
    // Gradient-ish normal for the ellipse.
    const nx = s / Math.max(o.rx, 1e-4);
    const nz = co / Math.max(rz, 1e-4);
    normals.push(right.clone().multiplyScalar(nx).addScaledVector(fwd, nz).normalize());
  }
  return { points, normals };
}

/** Frame for a ring perpendicular to direction `dir`, with `fwdHint` as the preferred front. */
export function ringFrame(dir: THREE.Vector3, fwdHint: THREE.Vector3): { right: THREE.Vector3; fwd: THREE.Vector3 } {
  const d = dir.clone().normalize();
  const fwd = fwdHint.clone().addScaledVector(d, -fwdHint.dot(d));
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1).addScaledVector(d, -d.z);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(d, fwd).normalize();
  // Angle increases toward +right; keep right = +x-ish for a +y loft facing +z.
  return { right: right.negate(), fwd };
}

/** Smooth 0..1 step for weight blending. */
export function sstep(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
