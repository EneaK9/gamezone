// Hair styles and headgear, built around the skull frame from head.ts.

import * as THREE from "three";
import type { Headgear, Look } from "../../shared/look";
import { makeRng } from "../core/math";
import { headFrame, type HeadFrame } from "./head";
import { CLOTH_SURF, HAIR_SURF, METAL_SURF, MeshBuilder, SILK_SURF, SKIN_SURF, STRAW_SURF, type Weights } from "./meshkit";
import { BI, type Proportions } from "./skeleton";

const HEAD: Weights = [[BI.head, 1]];
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Keep the triangles of a scaled sphere whose vertices all pass `keep`. */
function capGeometry(f: HeadFrame, scale: THREE.Vector3, lift: number, keep: (d: THREE.Vector3) => boolean, detail = 34): THREE.BufferGeometry {
  const src = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75)).toNonIndexed();
  const p = src.attributes.position as THREE.BufferAttribute;
  const out: number[] = [];
  const nrm: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    if (!keep(a) || !keep(b) || !keep(c)) continue;
    for (const v of [a, b, c]) {
      out.push(v.x * f.rx * scale.x, v.y * f.ry * scale.y + lift, v.z * f.rz * scale.z * (v.z < 0 ? 1.1 : 1) - 0.006 * f.scale);
      const n = new THREE.Vector3(v.x / f.rx, v.y / f.ry, v.z / f.rz).normalize();
      nrm.push(n.x, n.y, n.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

/**
 * A full ellipsoid shell whose radius follows a smooth 0..1 mask: where the mask is 0 the
 * shell sinks under the scalp, so the visible hairline is a clean curve.
 */
function shellGeometry(f: HeadFrame, thickness: number, mask: (d: THREE.Vector3) => number, detail = 64): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75));
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i);
    const m = Math.min(1, Math.max(0, mask(n)));
    const k = 1 + thickness * m - 0.06 * (1 - m);
    const back = n.z < 0 ? 1.1 : 1;
    p.setXYZ(i, n.x * f.rx * k, n.y * f.ry * k, n.z * f.rz * k * back - 0.006 * f.scale);
  }
  g.computeVertexNormals();
  return g;
}

function hairlineMask(d: THREE.Vector3, front: number, side: number, back: number, soft = 0.1): number {
  const th = Math.abs(Math.atan2(d.x, d.z));
  const y = front + (side - front) * smooth(0.5, 1.35, th) + (back - side) * smooth(1.7, 2.7, th);
  return smooth(y - soft, y + soft, d.y);
}

function hairline(d: THREE.Vector3, front: number, side: number, back: number): boolean {
  const th = Math.abs(Math.atan2(d.x, d.z));
  const y = front + (side - front) * smooth(0.5, 1.35, th) + (back - side) * smooth(1.7, 2.7, th);
  return d.y > y;
}

function spike(mb: MeshBuilder, base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, col: THREE.Color, w: Weights = HEAD) {
  const g = new THREE.ConeGeometry(r, len, 6, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mb.add(g, new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1)), col, HAIR_SURF, w);
}

/** A tapered tube through points (used for tails, locks, topknots). */
function strand(mb: MeshBuilder, pts: THREE.Vector3[], r0: number, r1: number, col: THREE.Color, weights: (t: number) => Weights, flat = 1) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const segs = 12;
  const radial = 8;
  const frames = curve.computeFrenetFrames(segs, false);
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    const pts2: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a) * flat).addScaledVector(frames.binormals[i], Math.sin(a));
      pts2.push(c.clone().addScaledVector(n, r));
      nrm.push(n.normalize());
    }
    rings.push({ points: pts2, normals: nrm, weights: weights(t), colors: col, v: t * 0.3 });
  }
  mb.loft(rings, HAIR_SURF, { capStart: true, capEnd: true });
}

export function buildHair(mb: MeshBuilder, p: Proportions, look: Look) {
  const f = headFrame(p);
  const s = f.scale;
  const C = f.centre;
  const col = new THREE.Color(look.hair.color);
  const rng = makeRng(Math.round(look.height * 1000) + look.hair.style.length * 31);
  const at = (x: number, y: number, z: number) => C.clone().add(new THREE.Vector3(x * f.rx, y * f.ry, z * f.rz));
  const shade = (d: THREE.Vector3) => col.clone().multiplyScalar(0.9 + 0.2 * (0.5 + 0.5 * Math.sin(d.x * 40 + d.z * 23)));
  const addCap = (scale: number, front: number, side: number, back: number, extra?: (d: THREE.Vector3) => number) => {
    const g = shellGeometry(f, scale - 1, (d) => hairlineMask(d, front, side, back) * (extra ? extra(d) : 1));
    mb.add(g, new THREE.Matrix4().makeTranslation(C.x, C.y, C.z), shade, HAIR_SURF, HEAD);
  };
  const tailW = (t: number): Weights => [[BI.head, 1 - Math.min(1, t * 1.6)], [BI.tail, Math.min(1, t * 1.6)]];

  switch (look.hair.style) {
    case "none":
    case "bald":
      break;
    case "buzz":
      addCap(1.03, 0.42, 0.0, -0.45);
      break;
    case "topknot": {
      // Shaved pate (sakayaki) with hair on the sides and back, oiled topknot on top.
      // Hair only on the sides and back; the crown and forehead are shaved (sakayaki).
      addCap(1.05, 0.05, -0.05, -0.5, (d) => {
        // Shaved from the forehead back over the crown; hair on the sides and back.
        const th = Math.abs(Math.atan2(d.x, d.z));
        const sides = smooth(0.7, 1.2, th);
        const pate = smooth(0.3, 0.55, d.y) * smooth(-0.62, -0.35, d.z);
        return Math.max(0, sides - pate);
      });
      // Oiled topknot folded forward over the crown, tied with white cord.
      strand(mb, [at(0, 0.78, -0.82), at(0, 0.98, -0.52), at(0, 1.05, -0.18), at(0, 1.02, 0.12)], 0.011 * s, 0.008 * s, col, () => HEAD);
      strand(mb, [at(0, 0.86, -0.72), at(0, 0.93, -0.62)], 0.013 * s, 0.013 * s, new THREE.Color("#ece6da"), () => HEAD);
      break;
    }
    case "ronin":
      addCap(1.06, 0.4, -0.05, -0.55);
      strand(mb, [at(0, 0.45, -0.95), at(0, 0.1, -1.08), at(0, -0.5, -1.05), at(0, -1.2, -0.9)], 0.024 * s, 0.012 * s, col, tailW);
      strand(mb, [at(0, 0.42, -0.98), at(0, 0.34, -1.02)], 0.026 * s, 0.026 * s, new THREE.Color("#b33a2a"), () => HEAD);
      break;
    case "messy":
      addCap(1.07, 0.45, 0.02, -0.5);
      for (let i = 0; i < 26; i++) {
        const th = rng.range(-Math.PI, Math.PI);
        const ph = rng.range(0.15, 1.35);
        const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(ph), Math.cos(th) * Math.sin(ph));
        const g = new THREE.SphereGeometry(1, 7, 5);
        const base = at(d.x * 1.05, d.y * 1.03, d.z * 1.05);
        const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().add(new THREE.Vector3(rng.range(-0.5, 0.5), 0, rng.range(-0.3, 0.5))).normalize());
        mb.add(g, new THREE.Matrix4().compose(base, tilt, new THREE.Vector3(0.017 * s, 0.03 * s, 0.013 * s)), shade, HAIR_SURF, HEAD);
      }
      // Fringe over the forehead.
      for (let i = 0; i < 7; i++) {
        const x = -0.6 + i * 0.2;
        spike(mb, at(x, 0.62, 0.72), new THREE.Vector3(x * 0.3, -0.6, 0.6), 0.04 * s, 0.013 * s, col);
      }
      break;
    case "spiky": {
      addCap(1.08, 0.4, 0.05, -0.45);
      const n = 30;
      for (let i = 0; i < n; i++) {
        const th = rng.range(-Math.PI, Math.PI);
        const ph = rng.range(0.1, 1.25);
        const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(ph), Math.cos(th) * Math.sin(ph));
        const base = at(d.x, d.y, d.z);
        const dir = d.clone().add(new THREE.Vector3(rng.range(-0.25, 0.25), 0.45, -0.25)).normalize();
        spike(mb, base, dir, rng.range(0.06, 0.12) * s, rng.range(0.018, 0.028) * s, shade(d));
      }
      // Bangs.
      for (let i = 0; i < 6; i++) {
        const x = -0.62 + i * 0.25;
        spike(mb, at(x, 0.58, 0.75), new THREE.Vector3(x * 0.4, -0.55, 0.7), rng.range(0.05, 0.075) * s, 0.017 * s, col);
      }
      for (const sx of [-1, 1]) spike(mb, at(sx * 0.9, 0.2, 0.4), new THREE.Vector3(sx * 0.3, -1, 0.2), 0.07 * s, 0.014 * s, col);
      break;
    }
    case "swept": {
      addCap(1.07, 0.42, 0.0, -0.5);
      for (let i = 0; i < 8; i++) {
        const th = Math.PI + rng.range(-0.9, 0.9);
        const ph = rng.range(0.5, 1.2);
        const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(ph), Math.cos(th) * Math.sin(ph));
        spike(mb, at(d.x, d.y, d.z), d.clone().add(new THREE.Vector3(0, 0.8, -0.4)).normalize(), rng.range(0.08, 0.12) * s, 0.026 * s, col);
      }
      // Long bangs framing the face.
      for (const sx of [-1, 1]) {
        strand(mb, [at(sx * 0.35, 0.8, 0.8), at(sx * 0.72, 0.35, 0.92), at(sx * 0.82, -0.1, 0.78), at(sx * 0.8, -0.45, 0.62)], 0.012 * s, 0.004 * s, col, () => HEAD, 0.6);
      }
      for (let i = 0; i < 4; i++) {
        const x = -0.35 + i * 0.23;
        spike(mb, at(x, 0.66, 0.74), new THREE.Vector3(x * 0.6, -0.8, 0.45), 0.06 * s, 0.014 * s, col);
      }
      break;
    }
    case "long_straight": {
      addCap(1.07, 0.38, -0.05, -0.6);
      // A curtain of hair down the back, and locks framing the face.
      for (let i = 0; i < 11; i++) {
        const th = Math.PI + (i / 10 - 0.5) * 2.2;
        const x = Math.sin(th);
        const z = Math.cos(th);
        strand(mb, [at(x * 0.95, 0.35, z * 0.95), at(x * 1.02, -0.4, z * 1.05), at(x * 1.0, -1.3, z * 1.15), at(x * 0.95, -2.1, z * 1.1)], 0.02 * s, 0.012 * s, shade(new THREE.Vector3(x, 0, z)), (t) => [[BI.head, 1 - t * 0.7], [BI.tail, t * 0.7]], 0.55);
      }
      for (const sx of [-1, 1]) strand(mb, [at(sx * 0.45, 0.75, 0.82), at(sx * 0.86, 0.1, 0.72), at(sx * 0.9, -0.6, 0.55), at(sx * 0.85, -1.2, 0.5)], 0.012 * s, 0.005 * s, col, () => HEAD, 0.6);
      break;
    }
    case "wavy_ponytail": {
      addCap(1.1, 0.42, 0.02, -0.5);
      const pts = [at(0, 0.7, -0.9), at(0, 0.95, -1.25), at(0.12, 0.55, -1.55), at(-0.1, -0.1, -1.6), at(0.12, -0.8, -1.45), at(0, -1.5, -1.25)];
      strand(mb, pts, 0.045 * s, 0.02 * s, col, tailW);
      strand(mb, [at(0.08, 0.2, -1.5), at(-0.12, -0.5, -1.62), at(0.1, -1.1, -1.4)], 0.03 * s, 0.012 * s, col.clone().multiplyScalar(0.9), tailW);
      for (const sx of [-1, 1]) strand(mb, [at(sx * 0.15, 0.95, 0.6), at(sx * 0.7, 0.55, 0.9), at(sx * 0.92, 0.05, 0.62)], 0.02 * s, 0.008 * s, col, () => HEAD, 0.7);
      break;
    }
    case "bun":
    case "gray_bun": {
      addCap(1.06, 0.4, -0.05, -0.55);
      const bun = new THREE.SphereGeometry(1, 12, 10);
      mb.add(bun, new THREE.Matrix4().compose(at(0, 0.62, -0.92), new THREE.Quaternion(), new THREE.Vector3(0.045 * s, 0.038 * s, 0.04 * s)), shade, HAIR_SURF, HEAD);
      if (look.hair.style === "bun") {
        const pin = new THREE.CylinderGeometry(0.0025 * s, 0.0025 * s, 0.14 * s, 5);
        mb.add(pin, new THREE.Matrix4().compose(at(0, 0.66, -0.95), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 1.2)), new THREE.Vector3(1, 1, 1)), new THREE.Color("#c9a24a"), METAL_SURF, HEAD);
        const flower = new THREE.SphereGeometry(0.012 * s, 8, 6);
        mb.add(flower, new THREE.Matrix4().makeTranslation(...at(0.55, 0.62, -0.72).toArray()), new THREE.Color("#e36a7e"), SILK_SURF, HEAD);
      }
      break;
    }
    case "bob":
      addCap(1.08, 0.3, -0.5, -0.62);
      for (let i = 0; i < 9; i++) {
        const x = -0.72 + i * 0.18;
        spike(mb, at(x, 0.62, 0.78), new THREE.Vector3(0, -1, 0.25), 0.05 * s, 0.018 * s, col);
      }
      break;
  }
}

// ——— headgear ——————————————————————————————————————————————————————

export function buildHeadgear(mb: MeshBuilder, p: Proportions, look: Look, gear: Headgear | undefined) {
  if (!gear || gear === "none") return;
  const f = headFrame(p);
  const s = f.scale;
  const C = f.centre;
  const at = (x: number, y: number, z: number) => C.clone().add(new THREE.Vector3(x * f.rx, y * f.ry, z * f.rz));
  const color = new THREE.Color(look.headgearColor ?? "#2a2a2c");
  const M = (pos: THREE.Vector3, rot = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1)) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), sc);
  const band = (y: number, r: number, col: THREE.Color, height = 0.022, tilt = -0.12) => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 26, 1, true);
    mb.add(g, M(at(0, y, 0), new THREE.Euler(tilt, 0, 0), new THREE.Vector3(f.rx * r, height * s, f.rz * r)), col, CLOTH_SURF, HEAD);
  };
  switch (gear) {
    case "straw_hat": {
      const straw = new THREE.Color("#e2c574");
      const crown = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const tilt = new THREE.Euler(-0.18, 0, 0);
      mb.add(crown, M(at(0, 0.62, -0.05), tilt, new THREE.Vector3(f.rx * 1.18, 0.07 * s, f.rz * 1.15)), straw, STRAW_SURF, HEAD);
      const brim = new THREE.CylinderGeometry(0.2 * s, 0.205 * s, 0.006 * s, 32);
      mb.add(brim, M(at(0, 0.62, -0.05), tilt), straw, STRAW_SURF, HEAD);
      const ribbon = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
      mb.add(ribbon, M(at(0, 0.7, -0.05), tilt, new THREE.Vector3(f.rx * 1.19, 0.018 * s, f.rz * 1.16)), new THREE.Color("#c1272d"), SILK_SURF, HEAD);
      break;
    }
    case "kasa": {
      const g = new THREE.ConeGeometry(0.24 * s, 0.11 * s, 28, 1, true);
      mb.add(g, M(at(0, 1.05, 0)), new THREE.Color("#cdb27a"), STRAW_SURF, HEAD);
      const under = new THREE.ConeGeometry(0.235 * s, 0.1 * s, 28, 1, true);
      mb.add(under, M(at(0, 1.03, 0), new THREE.Euler(Math.PI, 0, 0)), new THREE.Color("#8a7448"), STRAW_SURF, HEAD);
      break;
    }
    case "jingasa": {
      const g = new THREE.ConeGeometry(0.22 * s, 0.07 * s, 28, 1);
      mb.add(g, M(at(0, 1.02, 0)), color, [0.62, 0, 0], HEAD);
      const crest = new THREE.CylinderGeometry(0.018 * s, 0.018 * s, 0.004 * s, 12);
      mb.add(crest, M(at(0, 1.04, 0.62), new THREE.Euler(1.2, 0, 0)), new THREE.Color("#d4a94c"), METAL_SURF, HEAD);
      break;
    }
    case "leaf_headband": {
      band(0.42, 1.07, new THREE.Color("#1d2440"), 0.03);
      const plate = new THREE.BoxGeometry(0.075 * s, 0.028 * s, 0.006 * s);
      mb.add(plate, M(at(0, 0.44, 1.05), new THREE.Euler(-0.2, 0, 0)), new THREE.Color("#b9bec4"), METAL_SURF, HEAD);
      // Engraved swirl.
      const swirl = new THREE.TorusGeometry(0.008 * s, 0.0012 * s, 4, 14, Math.PI * 1.6);
      mb.add(swirl, M(at(0, 0.44, 1.1), new THREE.Euler(-0.2, 0, 0)), new THREE.Color("#3a3f44"), METAL_SURF, HEAD);
      const tipG = new THREE.ConeGeometry(0.003 * s, 0.014 * s, 4);
      mb.add(tipG, M(at(0.1, 0.52, 1.1), new THREE.Euler(-0.2, 0, -0.8)), new THREE.Color("#3a3f44"), METAL_SURF, HEAD);
      for (const sx of [-1, 1]) {
        const tail = new THREE.BoxGeometry(0.02 * s, 0.14 * s, 0.003 * s);
        mb.add(tail, M(at(sx * 0.12, 0.05, -1.08), new THREE.Euler(0.3, 0, sx * 0.15)), new THREE.Color("#1d2440"), CLOTH_SURF, [[BI.head, 0.6], [BI.tail, 0.4]]);
      }
      break;
    }
    case "hachimaki": {
      band(0.46, 1.075, new THREE.Color("#f0ece2"), 0.026);
      for (const sx of [-1, 1]) {
        const tail = new THREE.BoxGeometry(0.018 * s, 0.1 * s, 0.003 * s);
        mb.add(tail, M(at(sx * 0.1, 0.25, -1.08), new THREE.Euler(0.4, 0, sx * 0.3)), new THREE.Color("#f0ece2"), CLOTH_SURF, [[BI.head, 0.6], [BI.tail, 0.4]]);
      }
      break;
    }
    case "tenugui":
    case "bandana": {
      const cloth = gear === "tenugui" ? color : new THREE.Color(look.headgearColor ?? "#6e1f1a");
      const g = capGeometry(f, new THREE.Vector3(1.11, 1.08, 1.11), 0.004 * s, (d) => d.y > 0.25);
      mb.add(g, new THREE.Matrix4().makeTranslation(C.x, C.y, C.z), cloth, CLOTH_SURF, HEAD);
      const knot = new THREE.SphereGeometry(1, 8, 6);
      mb.add(knot, M(at(0, 0.3, -1.1), new THREE.Euler(), new THREE.Vector3(0.016 * s, 0.014 * s, 0.012 * s)), cloth, CLOTH_SURF, HEAD);
      break;
    }
    case "luchador_mask": {
      const blue = new THREE.Color("#1f5cd0");
      const yellow = new THREE.Color("#f2c21c");
      const red = new THREE.Color("#d8352a");
      const skin = new THREE.Color(look.skin);
      const eyeY = f.eyeY / f.ry;
      const g = capGeometry(f, new THREE.Vector3(1.035, 1.025, 1.04), 0.001 * s, (d) => d.y > -0.72 || d.z < -0.1, 40);
      const colFn = (v: THREE.Vector3) => {
        const x = (v.x - C.x) / f.rx;
        const y = (v.y - C.y) / f.ry;
        const z = (v.z - C.z) / f.rz;
        for (const sx of [-1, 1]) {
          const d = Math.hypot((x - sx * 0.42) * 1.3, (y - eyeY) * 2.2);
          if (z > 0.3 && d < 0.2) return skin.clone().multiplyScalar(0.55);
          if (z > 0.3 && d < 0.34) return yellow;
          if (z > 0.2 && d < 0.46 && y > eyeY) return red;
        }
        if (z > 0.5 && Math.abs(x) < 0.25 && y < eyeY - 0.55 && y > eyeY - 0.82) return skin;
        if (Math.abs(x) < 0.12 && y > eyeY + 0.15) return yellow;
        return blue;
      };
      mb.add(g, new THREE.Matrix4().makeTranslation(C.x, C.y, C.z), colFn, SILK_SURF, HEAD);
      break;
    }
    case "kitsune_mask":
    case "oni_mask": {
      const oni = gear === "oni_mask";
      const base = oni ? new THREE.Color("#b3261e") : new THREE.Color("#f4f0e8");
      const g = capGeometry(f, new THREE.Vector3(1.06, 1.02, 1.1), 0, (d) => d.z > 0.35 && d.y > -0.95 && d.y < 0.6, 30);
      const eyeY = f.eyeY / f.ry;
      const colFn = (v: THREE.Vector3) => {
        const x = (v.x - C.x) / f.rx;
        const y = (v.y - C.y) / f.ry;
        for (const sx of [-1, 1]) {
          if (Math.hypot((x - sx * 0.42) * 1.2, (y - eyeY) * 2.4) < 0.2) return new THREE.Color("#140e0c");
          if (!oni && Math.hypot((x - sx * 0.45) * 1.1, (y - eyeY - 0.12) * 1.6) < 0.3) return new THREE.Color("#c8322a");
        }
        if (oni && y < eyeY - 0.5 && y > eyeY - 0.72 && Math.abs(x) < 0.4) return new THREE.Color("#f4ecd8");
        return base;
      };
      mb.add(g, new THREE.Matrix4().makeTranslation(C.x, C.y, C.z), colFn, SILK_SURF, HEAD);
      const snout = new THREE.ConeGeometry(0.02 * s, 0.05 * s, 8);
      mb.add(snout, M(at(0, -0.25, 1.12), new THREE.Euler(Math.PI / 2, 0, 0)), base, SILK_SURF, HEAD);
      if (oni) {
        for (const sx of [-1, 1]) {
          const horn = new THREE.ConeGeometry(0.012 * s, 0.06 * s, 8);
          mb.add(horn, M(at(sx * 0.45, 0.62, 0.8), new THREE.Euler(0.4, 0, -sx * 0.4)), new THREE.Color("#e8dcc0"), SILK_SURF, HEAD);
        }
      } else {
        for (const sx of [-1, 1]) {
          const ear = new THREE.ConeGeometry(0.022 * s, 0.06 * s, 4);
          mb.add(ear, M(at(sx * 0.55, 0.85, 0.5), new THREE.Euler(0.1, 0, -sx * 0.35)), base, SILK_SURF, HEAD);
        }
      }
      break;
    }
    case "kenseikan": {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.07 * s, 8);
        mb.add(g, M(at(0.62 - k * 0.1, 0.72 - k * 0.05, 0.1 + k * 0.08), new THREE.Euler(0.2, 0, 0.9)), new THREE.Color("#f2f0ea"), SILK_SURF, HEAD);
      }
      break;
    }
  }
}
