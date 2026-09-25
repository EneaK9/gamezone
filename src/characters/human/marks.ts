// Painting on the skin in UV space: 3D strokes on the face or chest are ray-cast onto the
// body mesh and converted to texture coordinates, so scars, whiskers, stubble and scalp
// shading live in the skin itself and deform with it.

import * as THREE from "three";
import type { Look } from "../../../shared/look";
import type { Anatomy } from "./anatomy";
import { hairF, type Hairline } from "./hair";
import type { SkinStroke } from "./skin";

interface Tri {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  ua: THREE.Vector2;
  ub: THREE.Vector2;
  uc: THREE.Vector2;
  sa: number;
  sb: number;
  sc: number;
}

/** Body triangles (render topology, with UVs) near a region of interest. */
export class SkinSurface {
  readonly tris: Tri[] = [];

  constructor(
    readonly a: Anatomy,
    keep: (p: THREE.Vector3) => boolean,
  ) {
    const kit = a.kit;
    const vtx = kit.view<Uint16Array>("body:vtx");
    const uv = kit.view<Float32Array>("body:uv");
    const tris = kit.view<Uint16Array>("body:tris");
    for (let t = 0; t < tris.length; t += 3) {
      const r = [tris[t], tris[t + 1], tris[t + 2]];
      const s = r.map((i) => vtx[i]);
      const p = s.map((i) => a.pos(i));
      if (!keep(p[0]) && !keep(p[1]) && !keep(p[2])) continue;
      this.tris.push({
        a: p[0],
        b: p[1],
        c: p[2],
        ua: new THREE.Vector2(uv[r[0] * 2], uv[r[0] * 2 + 1]),
        ub: new THREE.Vector2(uv[r[1] * 2], uv[r[1] * 2 + 1]),
        uc: new THREE.Vector2(uv[r[2] * 2], uv[r[2] * 2 + 1]),
        sa: s[0],
        sb: s[1],
        sc: s[2],
      });
    }
  }

  /** UV where a ray from `origin` along `dir` first meets the skin (null if it misses). */
  cast(origin: THREE.Vector3, dir: THREE.Vector3): [number, number] | null {
    const ray = new THREE.Ray(origin, dir.clone().normalize());
    const hit = new THREE.Vector3();
    let best = Infinity;
    let uv: [number, number] | null = null;
    const bary = new THREE.Vector3();
    for (const t of this.tris) {
      if (!ray.intersectTriangle(t.a, t.b, t.c, false, hit)) continue;
      const d = hit.distanceTo(origin);
      if (d >= best) continue;
      best = d;
      THREE.Triangle.getBarycoord(hit, t.a, t.b, t.c, bary);
      uv = [t.ua.x * bary.x + t.ub.x * bary.y + t.uc.x * bary.z, t.ua.y * bary.x + t.ub.y * bary.y + t.uc.y * bary.z];
    }
    return uv;
  }

  /** Project points given in front of the face/chest straight back onto the skin. */
  path(points: THREE.Vector3[], dir = new THREE.Vector3(0, 0, -1)): [number, number][] {
    const out: [number, number][] = [];
    for (const p of points) {
      const uv = this.cast(p.clone().addScaledVector(dir, -0.12), dir);
      if (uv) out.push(uv);
    }
    return out;
  }

  /** UV triangles whose vertices all satisfy `inside` (for region fills). */
  fills(inside: (p: THREE.Vector3) => boolean): [number, number][][] {
    const out: [number, number][][] = [];
    for (const t of this.tris) {
      if (!inside(t.a) || !inside(t.b) || !inside(t.c)) continue;
      out.push([
        [t.ua.x, t.ua.y],
        [t.ub.x, t.ub.y],
        [t.uc.x, t.uc.y],
      ]);
    }
    return out;
  }
}

/** Eyelid interiors (where the source photo still shows eyes). */
export function eyeHoles(a: Anatomy, eyeRadius: number): [number, number][][] {
  const near = (p: THREE.Vector3) => p.distanceTo(a.eye.L) < eyeRadius * 1.6 || p.distanceTo(a.eye.R) < eyeRadius * 1.6;
  const s = new SkinSurface(a, near);
  const r = eyeRadius * 1.22;
  return s.fills((p) => p.distanceTo(a.eye.L) < r || p.distanceTo(a.eye.R) < r);
}

const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
function arc(a: THREE.Vector3, b: THREE.Vector3, bulge: THREE.Vector3, n = 10) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(lerp3(a, b, t).addScaledVector(bulge, 4 * t * (1 - t)));
  }
  return out;
}

/** Scars, whiskers, stubble, scalp shading for a look, as UV strokes. */
export function markStrokes(a: Anatomy, look: Look, opts: { scalp?: "hair" | "shaved" | "none"; hairColor?: string; hairline?: Hairline }): SkinStroke[] {
  const out: SkinStroke[] = [];
  const s = a.H / 1.75;
  const face = new SkinSurface(a, (p) => p.y > a.chinY - 0.03 && p.z > a.headCentre.z - 0.01);
  const eL = a.eye.L;
  const scar = shadeHex(look.skin, 0.72, "#8a4a44");
  const u = s * 0.001; // stroke widths are given in mm below, converted per UV at the call site
  void u;
  const lineW = (mm: number) => mm * 0.00022; // UV units per mm on the face island (≈ 4.5 px/mm at 2k)
  for (const m of look.marks ?? []) {
    if (m === "scar_under_left_eye") {
      // Luffy: curved scar ~1 cm under the lower lid, under the pupil, two stitches.
      const y = eL.y - 0.019 * s;
      const p0 = new THREE.Vector3(eL.x - 0.009 * s, y + 0.001 * s, eL.z + 0.03);
      const p1 = new THREE.Vector3(eL.x + 0.014 * s, y - 0.002 * s, eL.z + 0.03);
      out.push({ kind: "line", points: face.path(arc(p0, p1, new THREE.Vector3(0, -0.003 * s, 0))), color: scar, width: lineW(2.2), alpha: 0.85, soft: 0.0008 });
      for (const t of [0.35, 0.65]) {
        const c = lerp3(p0, p1, t).add(new THREE.Vector3(0, -0.003 * s * 4 * t * (1 - t), 0));
        out.push({ kind: "line", points: face.path([c.clone().add(new THREE.Vector3(-0.0012 * s, 0.003 * s, 0)), c.clone().add(new THREE.Vector3(0.0012 * s, -0.003 * s, 0))]), color: shadeHex(look.skin, 0.62, "#7a3e36"), width: lineW(1.2), alpha: 0.9 });
      }
    } else if (m === "scar_left_eye") {
      // Zoro: a straight vertical scar through the left brow, lid and cheek.
      const top = new THREE.Vector3(eL.x + 0.002 * s, eL.y + 0.04 * s, eL.z + 0.03);
      const bot = new THREE.Vector3(eL.x - 0.001 * s, eL.y - 0.028 * s, eL.z + 0.03);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) pts.push(lerp3(top, bot, i / 14));
      out.push({ kind: "line", points: face.path(pts), color: scar, width: lineW(3.2), alpha: 0.8, soft: 0.0012 });
    } else if (m === "whiskers") {
      // Naruto: three soft scar-like lines per cheek, fanning toward the ears.
      const nose = a.faceZ;
      const noseY = THREE.MathUtils.lerp(a.mouth.y, eL.y, 0.42);
      const rows = [
        { y: THREE.MathUtils.lerp(eL.y - 0.012 * s, noseY, 0.5), len: 0.025, slope: 12 },
        { y: noseY - 0.004 * s, len: 0.025, slope: 20 },
        { y: a.mouth.y + 0.003 * s, len: 0.02, slope: 30 },
      ];
      for (const side of [1, -1])
        rows.forEach((r, k) => {
          const x0 = side * (0.031 + k * 0.002) * s;
          const ang = THREE.MathUtils.degToRad(r.slope);
          const p0 = new THREE.Vector3(x0, r.y, nose);
          const p1 = new THREE.Vector3(x0 + side * Math.cos(ang) * r.len * s, r.y - Math.sin(ang) * r.len * s, nose);
          out.push({ kind: "line", points: face.path(arc(p0, p1, new THREE.Vector3(0, 0.001 * s, 0), 6)), color: "#6e4536", width: lineW(1.9), alpha: 0.78, soft: 0.0006 });
        });
    } else if (m === "tired_eyes") {
      for (const e of [a.eye.L, a.eye.R]) {
        const pts = [-0.012, -0.004, 0.004, 0.012].map((dx) => new THREE.Vector3(e.x + dx * s, e.y - 0.014 * s - Math.abs(dx) * 0.2, e.z + 0.03));
        out.push({ kind: "line", points: face.path(pts), color: "#7a5a55", width: lineW(5), alpha: 0.28, soft: 0.003 });
      }
    } else if (m === "bandaid") {
      const c = new THREE.Vector3(-0.042 * s, a.eye.R.y - 0.03 * s, a.faceZ);
      const pts = [new THREE.Vector3(-0.009, -0.004, 0), new THREE.Vector3(0.009, 0.002, 0), new THREE.Vector3(0.008, 0.009, 0), new THREE.Vector3(-0.01, 0.003, 0)].map((d) => c.clone().add(d.multiplyScalar(s)));
      out.push({ kind: "fill", points: face.path(pts), color: "#e9cfae", alpha: 0.95 });
    } else if (m === "chest_x_scar") {
      // Luffy: a broad X-shaped burn scar across the pecs, crossing mid-sternum.
      const chest = new SkinSurface(a, (p) => a.region.length > 0 && p.y > a.navelY && p.y < a.neckY && p.z > 0);
      const zc = a.faceZ + 0.1;
      const cy = a.chestY - 0.005;
      const bands: [THREE.Vector3, THREE.Vector3][] = [
        [new THREE.Vector3(0.115 * s, cy + 0.085 * s, zc), new THREE.Vector3(-0.1 * s, cy - 0.1 * s, zc)],
        [new THREE.Vector3(-0.115 * s, cy + 0.085 * s, zc), new THREE.Vector3(0.1 * s, cy - 0.1 * s, zc)],
      ];
      for (const [p0, p1] of bands) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 16; i++) pts.push(lerp3(p0, p1, i / 16).add(new THREE.Vector3(0, Math.sin(i * 2.3) * 0.002 * s, 0)));
        const path = chest.path(pts);
        out.push({ kind: "line", points: path, color: "#b8736a", width: 0.0075, alpha: 0.55, soft: 0.004 });
        out.push({ kind: "line", points: path, color: "#c98a82", width: 0.0045, alpha: 0.75, soft: 0.0015 });
      }
    }
  }
  // Facial hair shadow (the hair itself is geometry for beards and moustaches).
  const facial = look.facial ?? "none";
  if (facial !== "none") {
    const lowFace = (p: THREE.Vector3) => {
      const d = a.headDir(p);
      const belowNose = p.y < THREE.MathUtils.lerp(a.mouth.y, a.eye.L.y, 0.33);
      const onLips = Math.abs(p.x) < 0.024 * s && Math.abs(p.y - a.mouth.y) < 0.009 * s && p.z > a.faceZ - 0.03;
      return belowNose && !onLips && d.z > -0.2 && p.y > a.chinY - 0.03;
    };
    const tris = face.fills(lowFace);
    const col = look.facialColor ?? look.hair.color;
    const alpha = facial === "stubble" ? 0.28 : 0.42;
    for (const t of tris) out.push({ kind: "shade", points: t, color: mixHex(col, "#ffffff", 0.35), alpha });
  }
  // Scalp: under hair, tint toward the hair colour so gaps between strands don't show
  // bare skin (feathered just past the hairline); shaved pates read blue-grey.
  if (opts.scalp && opts.scalp !== "none" && opts.hairline) {
    const hl = opts.hairline;
    const head = new SkinSurface(a, (p) => p.y > a.eye.L.y - 0.03);
    const d = new THREE.Vector3();
    const f = (p: THREE.Vector3) => hairF(a.headDir(p, d).normalize(), hl.front, hl.side, hl.back);
    const hairCol = mixHex(opts.hairColor ?? "#1a1716", "#ffffff", 0.12);
    for (const [lo, alpha] of [
      [-0.05, 0.25],
      [-0.02, 0.45],
      [0.02, 0.85],
    ] as const)
      for (const t of head.fills((p) => f(p) > lo && !hl.exclude?.(a.headDir(p, d).normalize()))) out.push({ kind: "shade", points: t, color: hairCol, alpha });
    if (opts.scalp === "shaved" && hl.exclude)
      for (const t of head.fills((p) => hl.exclude!(a.headDir(p, d).normalize()))) out.push({ kind: "shade", points: t, color: "#9aa3a8", alpha: 0.3 });
  }
  return out;
}

export function shadeHex(hex: string, k: number, toward?: string) {
  const c = new THREE.Color(hex);
  if (toward) c.lerp(new THREE.Color(toward), 0.5);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

export function mixHex(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}
