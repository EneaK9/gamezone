// Head and face: a sculpted skull (nose, brow, cheekbones, jaw, lips), eyes with lids,
// brows, ears, facial hair and marks. Everything is weighted to the head bone.

import * as THREE from "three";
import type { FacialHair, Look, Mark } from "../../shared/look";
import { EYE_SURF, HAIR_SURF, MeshBuilder, SKIN_SURF } from "./meshkit";
import { BI, type Proportions } from "./skeleton";

export interface HeadFrame {
  /** Head centre (mid-height, ear axis) in rest world space. */
  centre: THREE.Vector3;
  /** Approximate cranium half extents (m) for hair and headgear. */
  rx: number;
  ry: number;
  rz: number;
  /** Eye height relative to the centre. */
  eyeY: number;
  scale: number;
  /** Chin-to-crown height (m). */
  hh: number;
  female: boolean;
}

const gauss = (d2: number, s: number) => Math.exp(-d2 / (2 * s * s));
const bell = (u: number, c: number, w: number) => Math.exp(-((u - c) * (u - c)) / (2 * w * w));

/** Catmull-Rom through [u, value] pairs. */
function curve(table: [number, number][]) {
  return (u: number) => {
    if (u <= table[0][0]) return table[0][1];
    const n = table.length;
    if (u >= table[n - 1][0]) return table[n - 1][1];
    let i = 0;
    while (i < n - 2 && table[i + 1][0] < u) i++;
    const p0 = table[Math.max(0, i - 1)];
    const p1 = table[i];
    const p2 = table[i + 1];
    const p3 = table[Math.min(n - 1, i + 2)];
    const t = (u - p1[0]) / (p2[0] - p1[0]);
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  };
}

// Profiles for an adult male head, chin (u = 0) to crown (u = 1), metres.
const HALF_WIDTH = curve([[0, 0.013], [0.03, 0.027], [0.07, 0.035], [0.12, 0.044], [0.18, 0.051], [0.24, 0.057], [0.3, 0.062], [0.38, 0.068], [0.46, 0.071], [0.55, 0.073], [0.65, 0.0745], [0.75, 0.072], [0.84, 0.064], [0.91, 0.051], [0.96, 0.034], [1, 0.004]]);
const FRONT = curve([[0, 0.052], [0.03, 0.068], [0.07, 0.079], [0.11, 0.08], [0.14, 0.082], [0.18, 0.085], [0.22, 0.087], [0.3, 0.086], [0.38, 0.083], [0.44, 0.082], [0.5, 0.086], [0.55, 0.09], [0.62, 0.089], [0.7, 0.085], [0.8, 0.074], [0.88, 0.058], [0.94, 0.038], [1, 0.004]]);
const BACK = curve([[0, -0.004], [0.05, -0.008], [0.12, -0.016], [0.2, -0.034], [0.28, -0.058], [0.36, -0.082], [0.45, -0.096], [0.55, -0.104], [0.65, -0.106], [0.75, -0.1], [0.84, -0.086], [0.91, -0.066], [0.96, -0.043], [1, -0.005]]);
/** Front flatness exponent (bigger = flatter face across the cheeks). */
const FLAT = curve([[0, 2.2], [0.15, 2.5], [0.3, 2.9], [0.45, 3.0], [0.6, 2.6], [0.8, 2.2], [1, 2.0]]);
const NOSE = curve([[0.19, 0], [0.225, 0.006], [0.25, 0.018], [0.275, 0.02], [0.31, 0.016], [0.37, 0.0105], [0.42, 0.0062], [0.47, 0.0022], [0.51, 0]]);
const NOSE_W = curve([[0.2, 0.013], [0.25, 0.0105], [0.3, 0.0078], [0.4, 0.0062], [0.5, 0.007]]);

export function headFrame(p: Proportions): HeadFrame {
  const s = p.headScale;
  const pivot = p.pos.head;
  const hh = 0.226 * s * (p.female ? 0.97 : 1);
  return {
    centre: new THREE.Vector3(pivot.x, pivot.y - 0.02 * s + hh / 2, pivot.z + 0.004 * s),
    rx: 0.074 * s * (p.female ? 0.96 : 1),
    ry: hh / 2,
    rz: 0.1 * s,
    eyeY: (0.47 - 0.5) * hh,
    scale: s,
    hh,
    female: p.female,
  };
}

/** Front-of-face features added on top of the base cross-section. x, u in head units. */
function features(x: number, u: number, s: number): number {
  let z = 0;
  const ax = Math.abs(x);
  // Nose.
  const nz = NOSE(u);
  if (nz > 0) {
    z += nz * s * gauss(x * x, NOSE_W(u) * s);
    if (u > 0.22 && u < 0.29) z += 0.0045 * s * gauss((ax - 0.0125 * s) ** 2, 0.005 * s) * bell(u, 0.25, 0.018);
  }
  // Lips, mouth line, chin.
  z += 0.0034 * s * gauss(x * x, 0.016 * s) * bell(u, 0.18, 0.016);
  z += 0.004 * s * gauss(x * x, 0.015 * s) * bell(u, 0.138, 0.013);
  z -= 0.0022 * s * gauss(x * x, 0.02 * s) * bell(u, 0.159, 0.005);
  z += 0.0038 * s * gauss(x * x, 0.017 * s) * bell(u, 0.065, 0.028);
  // Eye sockets, brow ridge, cheekbones.
  z -= 0.0068 * s * gauss((ax - 0.031 * s) ** 2, 0.0115 * s) * bell(u, 0.47, 0.045);
  z += 0.0036 * s * gauss((ax - 0.03 * s) ** 2, 0.016 * s) * bell(u, 0.535, 0.02);
  z += 0.0045 * s * gauss((ax - 0.047 * s) ** 2, 0.014 * s) * bell(u, 0.395, 0.035);
  return z;
}

/** Base cross-section depth at a normalised lateral position t = x / W, front side. */
function frontDepth(u: number, t: number, s: number): number {
  const p = FLAT(u);
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(t)), p)), 1 / p);
  return FRONT(u) * s * k;
}

/** Surface depth (z, relative to the centre) of the face at local (x, y). */
export function faceSurfaceZ(f: HeadFrame, x: number, y: number): number {
  const s = f.scale;
  const u = (y + f.hh / 2) / f.hh;
  const w = HALF_WIDTH(u) * s * (f.female ? 0.96 : 1);
  return frontDepth(u, x / w, s) + features(x, u, s);
}

export function buildHead(mb: MeshBuilder, p: Proportions, look: Look, skin: THREE.Color) {
  const f = headFrame(p);
  const s = f.scale;
  const W: [number, number][] = [[BI.head, 1]];
  const lip = skin.clone().lerp(new THREE.Color("#a14f48"), look.sex === "f" ? 0.45 : 0.3);
  const cheek = skin.clone().lerp(new THREE.Color("#d9776c"), 0.13);
  const facial = new THREE.Color(look.facialColor ?? look.hair.color);
  const stubble = look.facial === "stubble" || look.facial === "beard" || look.facial === "goatee";
  const tired = look.marks?.includes("tired_eyes");
  const elder = p.elder;
  const wScale = f.female ? 0.96 : 1;

  const rings = 46;
  const seg = 44;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const pushColor = (c: THREE.Color) => colors.push(c.r, c.g, c.b);
  for (let j = 0; j <= rings; j++) {
    const u = j / rings;
    const y = -f.hh / 2 + u * f.hh;
    const w = HALF_WIDTH(u) * s * wScale;
    const zb = BACK(u) * s;
    const pw = 2.3;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const x = w * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw);
      let z: number;
      if (cs >= 0) z = frontDepth(u, x / w, s) * Math.pow(cs, 0.05) + features(x, u, s) * Math.pow(cs, 0.5);
      else z = zb * Math.pow(-cs, 2 / 2.2);
      positions.push(f.centre.x + x, f.centre.y + y, f.centre.z + z);

      // Colour.
      let c = skin.clone();
      if (cs > 0.3) {
        const ax = Math.abs(x);
        if (Math.abs(u - 0.158) < 0.026 && ax < 0.024 * s * (1 - ((u - 0.158) / 0.028) ** 2)) c.lerp(lip, 0.9);
        c.lerp(cheek, 0.85 * gauss((ax - 0.045 * s) ** 2, 0.015 * s) * bell(u, 0.35, 0.05));
        if (tired || elder) c.lerp(skin.clone().multiplyScalar(0.74), 0.55 * gauss((ax - 0.031 * s) ** 2, 0.01 * s) * bell(u, 0.43, 0.018));
        c.multiplyScalar(1 - 0.08 * gauss((ax - 0.031 * s) ** 2, 0.012 * s) * bell(u, 0.47, 0.04));
      }
      if (stubble && u < 0.33 && cs > -0.4) {
        const moustache = u > 0.165 && u < 0.215 && Math.abs(x) < 0.03 * s;
        const onLip = Math.abs(u - 0.158) < 0.02 && Math.abs(x) < 0.024 * s;
        const jaw = u < 0.13 || (Math.abs(x) > 0.035 * s && u < 0.3) || moustache;
        if (jaw && !onLip) c.lerp(facial, look.facial === "stubble" ? 0.2 : 0.42);
      }
      pushColor(c);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i;
      const b = j * seg + ((i + 1) % seg);
      const c2 = (j + 1) * seg + i;
      const d = (j + 1) * seg + ((i + 1) % seg);
      index.push(a, b, c2, b, d, c2);
    }
  }
  // Caps.
  const bottom = positions.length / 3;
  positions.push(f.centre.x, f.centre.y - f.hh / 2 - 0.002, f.centre.z + FRONT(0) * s * 0.5);
  pushColor(skin);
  const top = positions.length / 3;
  positions.push(f.centre.x, f.centre.y + f.hh / 2 + 0.001, f.centre.z - 0.004 * s);
  pushColor(skin);
  for (let i = 0; i < seg; i++) {
    index.push(bottom, (i + 1) % seg, i);
    index.push(top, rings * seg + i, rings * seg + ((i + 1) % seg));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  let ci = 0;
  mb.add(geo, new THREE.Matrix4(), () => {
    const c = new THREE.Color(colors[ci * 3], colors[ci * 3 + 1], colors[ci * 3 + 2]);
    ci++;
    return c;
  }, SKIN_SURF, W);

  // Ears.
  for (const sx of [-1, 1]) {
    const ear = new THREE.SphereGeometry(1, 10, 8);
    const em = new THREE.Matrix4().compose(
      f.centre.clone().add(new THREE.Vector3(sx * 0.071 * s, f.eyeY - 0.012 * s, -0.012 * s)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * 0.35, 0)),
      new THREE.Vector3(0.009 * s, 0.031 * s, 0.018 * s),
    );
    mb.add(ear, em, skin.clone().multiplyScalar(0.96), SKIN_SURF, W);
    if (look.earrings && sx > 0) {
      for (let k = 0; k < look.earrings; k++) {
        const ring = new THREE.TorusGeometry(0.006 * s, 0.0012 * s, 5, 10);
        const rm = new THREE.Matrix4().compose(
          f.centre.clone().add(new THREE.Vector3(sx * 0.077 * s, f.eyeY - 0.034 * s + k * 0.008 * s, -0.01 * s + k * 0.004 * s)),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
          new THREE.Vector3(1, 1, 1),
        );
        mb.add(ring, rm, new THREE.Color("#d9b04a"), [0.3, 0, 0], W);
      }
    }
  }

  buildEyes(mb, f, look, skin);
  buildBrows(mb, f, look);
  buildFacialHair(mb, f, look.facial ?? "none", facial);
  for (const mark of look.marks ?? []) buildMark(mb, f, mark, skin);
}

function buildEyes(mb: MeshBuilder, f: HeadFrame, look: Look, skin: THREE.Color) {
  const s = f.scale;
  const W: [number, number][] = [[BI.head, 1]];
  const iris = new THREE.Color(look.eyes ?? "#3a2a1f");
  const white = new THREE.Color("#efe9e2");
  const pupil = new THREE.Color("#0c0a09");
  const scarLeft = look.marks?.includes("scar_left_eye");
  for (const sx of [-1, 1]) {
    const ex = sx * 0.031 * s;
    const ey = f.eyeY;
    const r = 0.0122 * s;
    const ez = faceSurfaceZ(f, ex, ey) - r * 0.55;
    const centre = f.centre.clone().add(new THREE.Vector3(ex, ey, ez));
    const closed = scarLeft && sx > 0; // character's left eye is +x
    const eye = new THREE.SphereGeometry(r, 16, 12);
    const ep = eye.attributes.position as THREE.BufferAttribute;
    const cols: THREE.Color[] = [];
    // Look slightly inward/forward.
    const look3 = new THREE.Vector3(-sx * 0.06, -0.03, 1).normalize();
    for (let i = 0; i < ep.count; i++) {
      const d = new THREE.Vector3().fromBufferAttribute(ep, i).normalize();
      const a = Math.acos(Math.min(1, d.dot(look3)));
      cols.push(a < 0.25 ? pupil : a < 0.62 ? iris.clone().multiplyScalar(0.75 + 0.45 * (a / 0.62)) : white);
    }
    let k = 0;
    if (!closed) mb.add(eye, new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z), () => cols[k++], EYE_SURF, W);
    // Upper lid (and a closed lid over a scarred eye).
    const lid = new THREE.SphereGeometry(r * 1.1, 16, 10, 0, Math.PI * 2, 0, closed ? Math.PI * 0.62 : Math.PI * 0.26);
    const lm = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(new THREE.Euler(closed ? 0.42 : 0.3, 0, 0)), new THREE.Vector3(1, 1, 1));
    mb.add(lid, lm, skin.clone().multiplyScalar(0.92), SKIN_SURF, W);
    const lower = new THREE.SphereGeometry(r * 1.08, 16, 6, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22);
    mb.add(lower, new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1)), skin.clone().multiplyScalar(0.95), SKIN_SURF, W);
    // Lash line.
    const lash = new THREE.TorusGeometry(r * 1.06, 0.0007 * s, 4, 14, Math.PI * 0.85);
    const lashM = new THREE.Matrix4().compose(
      centre.clone().add(new THREE.Vector3(0, r * 0.22, r * 0.28)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, Math.PI * 0.05)),
      new THREE.Vector3(1, 0.62, 1),
    );
    if (!closed) mb.add(lash, lashM, new THREE.Color("#2e211b"), HAIR_SURF, W);
  }
}

function buildBrows(mb: MeshBuilder, f: HeadFrame, look: Look) {
  const s = f.scale;
  const col = new THREE.Color(look.hair.style === "bald" ? "#3a3230" : look.hair.color).multiplyScalar(0.85);
  const W: [number, number][] = [[BI.head, 1]];
  const thick = look.sex === "f" ? 0.8 : 1.15;
  const stern = look.marks?.includes("tired_eyes") ? 0 : 0.18;
  for (const sx of [-1, 1]) {
    const n = 9;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const x = sx * (0.013 + t * 0.034) * s;
      const y = f.eyeY + (0.021 + Math.sin(t * Math.PI * 0.9) * 0.0045 - (1 - t) * stern * 0.012) * s;
      const z = faceSurfaceZ(f, x, y) + 0.0015 * s;
      const seg = new THREE.BoxGeometry(0.0072 * s, (0.0052 - t * 0.0022) * s * thick, 0.003 * s);
      const m = new THREE.Matrix4().compose(
        f.centre.clone().add(new THREE.Vector3(x, y, z)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, sx * (0.25 + t * 0.4), sx * (0.05 + t * 0.35 - stern * (1 - t) * 0.6))),
        new THREE.Vector3(1, 1, 1),
      );
      mb.add(seg, m, col, HAIR_SURF, W);
    }
  }
}

function buildFacialHair(mb: MeshBuilder, f: HeadFrame, kind: FacialHair, col: THREE.Color) {
  const s = f.scale;
  const W: [number, number][] = [[BI.head, 1]];
  const mouthY = -f.hh / 2 + 0.158 * f.hh;
  if (kind === "mustache" || kind === "beard" || kind === "long_beard") {
    for (const sx of [-1, 1]) {
      const g = new THREE.CapsuleGeometry(0.004 * s, 0.018 * s, 4, 8);
      const x = sx * 0.012 * s;
      const y = mouthY + 0.011 * s;
      const m = new THREE.Matrix4().compose(
        f.centre.clone().add(new THREE.Vector3(x, y, faceSurfaceZ(f, x, y) + 0.004 * s)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * 1.2)),
        new THREE.Vector3(1, 1, 1),
      );
      mb.add(g, m, col, HAIR_SURF, W);
    }
  }
  if (kind === "goatee" || kind === "beard" || kind === "long_beard") {
    const len = kind === "long_beard" ? 0.09 : kind === "beard" ? 0.035 : 0.022;
    const g = new THREE.SphereGeometry(1, 12, 10);
    const y = mouthY - 0.028 * s - len * s * 0.4;
    const m = new THREE.Matrix4().compose(
      f.centre.clone().add(new THREE.Vector3(0, y, faceSurfaceZ(f, 0, mouthY - 0.03 * s) - 0.004 * s)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0)),
      new THREE.Vector3((kind === "goatee" ? 0.014 : 0.03) * s, (0.012 + len * 0.6) * s, 0.016 * s),
    );
    mb.add(g, m, col, HAIR_SURF, W);
  }
  if (kind === "beard") {
    // Along the jawline.
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.SphereGeometry(1, 8, 6);
        const x = sx * (0.02 + k * 0.016) * s;
        const y = mouthY - 0.03 * s + k * 0.014 * s;
        const m = new THREE.Matrix4().compose(
          f.centre.clone().add(new THREE.Vector3(x, y, faceSurfaceZ(f, x * 0.9, y) - 0.012 * s)),
          new THREE.Quaternion(),
          new THREE.Vector3(0.014 * s, 0.017 * s, 0.014 * s),
        );
        mb.add(g, m, col, HAIR_SURF, W);
      }
    }
  }
}

function buildMark(mb: MeshBuilder, f: HeadFrame, mark: Mark, skin: THREE.Color) {
  const s = f.scale;
  const W: [number, number][] = [[BI.head, 1]];
  const strip = (x0: number, y0: number, x1: number, y1: number, w: number, col: THREE.Color) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.BoxGeometry(len, w, 0.0012 * s);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const z = faceSurfaceZ(f, mx, my) + 0.0012 * s;
    const yaw = Math.atan2(mx, z) * 0.9;
    const m = new THREE.Matrix4().compose(
      f.centre.clone().add(new THREE.Vector3(mx, my, z)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(y1 - y0, x1 - x0), "YXZ")),
      new THREE.Vector3(1, 1, 1),
    );
    mb.add(g, m, col, SKIN_SURF, W);
  };
  const dark = new THREE.Color("#3a2620");
  const scar = skin.clone().lerp(new THREE.Color("#8a4a44"), 0.45);
  if (mark === "whiskers") {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const y = f.eyeY - (0.03 + k * 0.009) * s;
        strip(sx * 0.03 * s, y, sx * 0.058 * s, y - 0.002 * s + k * 0.001 * s, 0.0018 * s, dark);
      }
    }
  } else if (mark === "scar_left_eye") {
    strip(0.036 * s, f.eyeY + 0.035 * s, 0.028 * s, f.eyeY - 0.03 * s, 0.0026 * s, scar);
  } else if (mark === "scar_under_left_eye") {
    strip(0.022 * s, f.eyeY - 0.022 * s, 0.043 * s, f.eyeY - 0.028 * s, 0.0022 * s, scar);
    for (const t of [0.3, 0.5, 0.7]) {
      const x = (0.022 + 0.021 * t) * s;
      strip(x, f.eyeY - 0.02 * s, x + 0.001 * s, f.eyeY - 0.031 * s, 0.0012 * s, scar);
    }
  } else if (mark === "bandaid") {
    strip(-0.052 * s, f.eyeY - 0.034 * s, -0.036 * s, f.eyeY - 0.026 * s, 0.009 * s, new THREE.Color("#e8c9a4"));
  } else if (mark === "chest_x_scar") {
    // Drawn on the torso by clothes.ts (needs the chest position).
  }
}
