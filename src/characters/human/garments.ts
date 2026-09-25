// Garments built on the MakeHuman body. Tight clothes are cut from the "tights" guide
// (a smooth body-hugging shell) and pushed out; loose ones get draped (hanging straight
// from the chest instead of following the belly), flared, and pleated; skirts, hakama
// and coat tails come from the "skirt" guide. Every piece is skinned with the body's
// own weights, so it moves exactly with the limbs underneath.

import * as THREE from "three";
import type { Garment, Look } from "../../../shared/look";
import { type Anatomy, projectChain, SIDES, type Side, sx } from "./anatomy";
import { Acc, type CV, cut, emit, hem, inflate, renormal, type Shell, smooth, strip, tube, type W, wMix, wOne } from "./cloth";
import { clothMaterial, fabricTile, type ClothLook, type Fabric } from "./fabric";

// ——— the outfit being built ———————————————————————————————————————————————————————

export class Outfit {
  private accs = new Map<string, { acc: Acc; look: ClothLook }>();
  /** Body coverage: stored vertex → covered by opaque cloth (skin can be dropped). */
  readonly covered: Uint8Array;
  /** Torso radius profile: [height step][angle step] → radius from the torso axis. */
  private prof: Float32Array | null = null;
  static readonly PROF_ANG = 48;
  private profY0 = 0;
  private profDY = 0.01;
  private profN = 0;

  constructor(readonly a: Anatomy) {
    this.covered = new Uint8Array(a.n);
  }

  acc(look: ClothLook): Acc {
    const key = JSON.stringify(look);
    let e = this.accs.get(key);
    if (!e) this.accs.set(key, (e = { acc: new Acc(), look }));
    return e.acc;
  }

  meshes(): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
    for (const { acc, look } of this.accs.values()) if (acc.idx.length) out.push({ geometry: acc.geometry(), material: clothMaterial(look) });
    return out;
  }

  bone(name: string) {
    return this.a.kit.boneIndex[name];
  }

  /** Mark body vertices covered where `f(s) ≥ margin` (margin in field units). */
  cover(f: (s: number) => number, margin = 0.02) {
    for (let s = 0; s < this.a.n; s++) if (f(s) >= margin) this.covered[s] = 1;
  }

  /** Torso radius at height y and angle θ (0 = front, +π/2 = character's left). */
  radius(y: number, ang: number): number {
    if (!this.prof) this.buildProfile();
    const N = Outfit.PROF_ANG;
    const fy = THREE.MathUtils.clamp((y - this.profY0) / this.profDY, 0, this.profN - 1.001);
    const iy = Math.floor(fy);
    const ty = fy - iy;
    let fa = ((ang / (Math.PI * 2)) * N) % N;
    if (fa < 0) fa += N;
    const ia = Math.floor(fa);
    const ta = fa - ia;
    const P = this.prof!;
    const g = (y2: number, a2: number) => P[y2 * N + (a2 % N)];
    const r0 = g(iy, ia) * (1 - ta) + g(iy, ia + 1) * ta;
    const r1 = g(iy + 1, ia) * (1 - ta) + g(iy + 1, ia + 1) * ta;
    return r0 * (1 - ty) + r1 * ty;
  }

  /** Point on the torso surface (tights) at height y, angle θ, pushed out by `out`. */
  ringPoint(y: number, ang: number, out = 0): THREE.Vector3 {
    const r = this.radius(y, ang) + out;
    const c = this.axisZ(y);
    return new THREE.Vector3(Math.sin(ang) * r, y, c + Math.cos(ang) * r);
  }

  /** Torso axis z at height y (the body leans; keep the ring centred). */
  axisZ(y: number): number {
    const a = this.a;
    const hips = a.joint("hips");
    const chest = a.joint("chest");
    const neck = a.joint("neck");
    if (y <= hips.y) return hips.z;
    if (y <= chest.y) return THREE.MathUtils.lerp(hips.z, chest.z, (y - hips.y) / (chest.y - hips.y));
    return THREE.MathUtils.lerp(chest.z, neck.z, THREE.MathUtils.clamp((y - chest.y) / (neck.y - chest.y), 0, 1));
  }

  private buildProfile() {
    const a = this.a;
    const N = Outfit.PROF_ANG;
    this.profY0 = a.hipY - 0.18;
    const top = a.neckY + 0.05;
    this.profN = Math.ceil((top - this.profY0) / this.profDY) + 1;
    const P = (this.prof = new Float32Array(this.profN * N));
    // Max radius per cell from the torso/hip vertices of the tights guide (and body).
    const vtx = a.kit.view<Uint16Array>("tights:vtx");
    const seen = new Uint8Array(a.n);
    const p = new THREE.Vector3();
    const add = (s: number) => {
      const r = a.region[s];
      if (r !== 0 && !(r >= 6 && a.limbT[s] < 0.12)) return;
      a.pos(s, p);
      const iy = Math.round((p.y - this.profY0) / this.profDY);
      if (iy < 0 || iy >= this.profN) return;
      const c = this.axisZ(p.y);
      const ang = Math.atan2(p.x, p.z - c);
      let ia = Math.round(((ang / (Math.PI * 2)) * N) % N);
      if (ia < 0) ia += N;
      const rad = Math.hypot(p.x, p.z - c);
      for (const [dy, da] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const y2 = iy + dy;
        const a2 = (ia + da + N) % N;
        if (y2 < 0 || y2 >= this.profN) continue;
        const k = y2 * N + a2;
        P[k] = Math.max(P[k], rad * (dy || da ? 0.985 : 1));
      }
    };
    for (let i = 0; i < vtx.length; i++) {
      const s = vtx[i];
      if (!seen[s]) {
        seen[s] = 1;
        add(s);
      }
    }
    // Fill holes: neighbours average, then a light smoothing pass.
    for (let pass = 0; pass < 6; pass++)
      for (let y = 0; y < this.profN; y++)
        for (let k = 0; k < N; k++) {
          const i = y * N + k;
          if (P[i] > 0) continue;
          let s = 0;
          let c = 0;
          for (const [dy, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const y2 = y + dy;
            if (y2 < 0 || y2 >= this.profN) continue;
            const v = P[y2 * N + ((k + da + N) % N)];
            if (v > 0) {
              s += v;
              c++;
            }
          }
          if (c) P[i] = s / c;
        }
    const Q = Float32Array.from(P);
    for (let y = 0; y < this.profN; y++)
      for (let k = 0; k < N; k++) {
        const i = y * N + k;
        Q[i] = (P[i] * 2 + P[y * N + ((k + 1) % N)] + P[y * N + ((k - 1 + N) % N)]) / 4;
      }
    this.prof = Q;
  }
}

// ——— fields over stored vertices ——————————————————————————————————————————————————————

/** Signed distance-ish field helpers (metres; ≥ 0 inside). */
export const F = {
  above: (a: Anatomy, y: number) => (s: number) => a.body.pos[s * 3 + 1] - y,
  below: (a: Anatomy, y: number) => (s: number) => y - a.body.pos[s * 3 + 1],
  min: (...fs: ((s: number) => number)[]) => (s: number) => {
    let m = Infinity;
    for (const f of fs) m = Math.min(m, f(s));
    return m;
  },
  max: (...fs: ((s: number) => number)[]) => (s: number) => {
    let m = -Infinity;
    for (const f of fs) m = Math.max(m, f(s));
    return m;
  },
};

/**
 * Coverage of an upper-body garment: torso between `bottom` and the neckline, sleeves to
 * `sleeve` (0 shoulder … 1 wrist; < 0 sleeveless), no head/hands/legs.
 */
function topField(a: Anatomy, bottom: number, sleeve: number, neck: (p: THREE.Vector3) => number) {
  const p = new THREE.Vector3();
  return (s: number) => {
    const r = a.region[s];
    a.pos(s, p);
    if (r === 1 || r === 4 || r === 5 || r >= 8) return -1;
    if (r >= 6) return Math.min(p.y - bottom, 0.05 - a.limbT[s]);
    if (r === 2 || r === 3) {
      if (sleeve < 0) return 0.06 - a.limbT[s] - (a.limbT[s] > 0.02 ? 0.2 : 0);
      return (sleeve - a.limbT[s]) * 0.6;
    }
    return Math.min(p.y - bottom, neck(p));
  };
}

/** Round neckline: open above a tilted ellipse around the neck base. */
function crewNeck(a: Anatomy, drop = 0.02, back = 0.0) {
  const neck = a.joint("neck");
  return (p: THREE.Vector3) => {
    const front = THREE.MathUtils.smoothstep(p.z - neck.z, -0.06, 0.06);
    const limit = neck.y - drop * front - back * (1 - front) - 0.006;
    return limit - p.y + Math.max(0, Math.abs(p.x) - 0.07) * 0.6;
  };
}

/** Kimono V: open in a V from the neck base down to `bottom` at the front. */
function vNeck(a: Anatomy, bottom: number, halfWidthTop = 0.055, offsetX = 0) {
  const neck = a.joint("neck");
  const top = neck.y - 0.005;
  return (p: THREE.Vector3) => {
    const frontness = THREE.MathUtils.smoothstep(p.z - neck.z, 0.0, 0.05);
    // Behind and at the sides the collar rides up the neck.
    const backLimit = neck.y + 0.02 - p.y;
    if (frontness <= 0) return backLimit;
    const t = THREE.MathUtils.clamp((p.y - bottom) / (top - bottom), 0, 1);
    const hw = halfWidthTop * t;
    const inV = hw - Math.abs(p.x - offsetX * (1 - t));
    const open = p.y > bottom ? inV : -1;
    return Math.min(backLimit + (1 - frontness) * 0.05, -open * frontness + (1 - frontness) * 0.05);
  };
}

// ——— operators on shells ———————————————————————————————————————————————————————————————

/** Loose cloth hangs from the chest: no following the belly or small of the back. */
function drape(o: Outfit, sh: Shell, from: number, to: number, strength = 1) {
  const a = o.a;
  for (const v of sh.verts) {
    if (v.region !== 0 && v.region < 6) continue;
    const y = v.p.y;
    if (y > from || y < to - 0.2) continue;
    const c = o.axisZ(y);
    const ang = Math.atan2(v.p.x, v.p.z - c);
    const r = Math.hypot(v.p.x, v.p.z - c);
    // The widest radius above this point, down to here: cloth can't curve back in.
    let want = 0;
    for (let yy = y; yy <= from; yy += 0.02) want = Math.max(want, o.radius(yy, ang));
    const k = THREE.MathUtils.smoothstep(from - y, 0, 0.08) * strength;
    const target = Math.max(r, THREE.MathUtils.lerp(r, want + (r - o.radius(y, ang)), k));
    if (target > r) {
      const s = target / r;
      v.p.x *= s;
      v.p.z = c + (v.p.z - c) * s;
    }
    void a;
  }
  return sh;
}

/** Widen a shell below `y0` (skirts, hakama), relative to the torso axis. */
function flare(o: Outfit, sh: Shell, y0: number, y1: number, amount: number) {
  for (const v of sh.verts) {
    if (v.p.y > y0) continue;
    const t = THREE.MathUtils.clamp((y0 - v.p.y) / (y0 - y1), 0, 1);
    const k = 1 + amount * t;
    const c = o.axisZ(v.p.y);
    v.p.x *= k;
    v.p.z = c + (v.p.z - c) * k;
  }
  return sh;
}

/** Vertical folds around the axis: `count` pleats over the arc [a0, a1]. */
function pleat(o: Outfit, sh: Shell, depth: number, count: number, a0 = -Math.PI, a1 = Math.PI, yTop = Infinity) {
  for (const v of sh.verts) {
    const c = o.axisZ(v.p.y);
    const ang = Math.atan2(v.p.x, v.p.z - c);
    if (ang < a0 || ang > a1) continue;
    const u = ((ang - a0) / (a1 - a0)) * count;
    const tri = 1 - Math.abs((u % 1) * 2 - 1);
    const fade = THREE.MathUtils.clamp((yTop - v.p.y) / 0.12, 0, 1);
    const r = Math.hypot(v.p.x, v.p.z - c);
    const s = (r + depth * (tri - 0.5) * fade) / r;
    v.p.x *= s;
    v.p.z = c + (v.p.z - c) * s;
  }
  return sh;
}

/** Soft cloth wrinkles: low-frequency bumps so large panels aren't perfectly smooth. */
function wrinkle(sh: Shell, amp = 0.003, freq = 18, seed = 1) {
  for (const v of sh.verts) {
    const n = Math.sin(v.p.x * freq + seed) * Math.sin(v.p.y * freq * 1.7 + seed * 2.1) + 0.5 * Math.sin(v.p.z * freq * 2.3 + v.p.y * 9 + seed);
    v.p.addScaledVector(v.n, n * amp);
  }
  return sh;
}

function layer(o: Outfit, look: ClothLook, sh: Shell, opts: { hem?: number; tile?: number } = {}) {
  const acc = o.acc(look);
  const tile = opts.tile ?? fabricTile(look.fabric);
  emit(acc, o.a, sh, { tile });
  if (opts.hem) hem(acc, o.a, sh, opts.hem, { tile });
  return acc;
}

// ——— garments ————————————————————————————————————————————————————————————————————————————

const TH = { skin: 0.004, shirt: 0.006, kimono: 0.011, jacket: 0.013, coat: 0.018, sash: 0.02, armor: 0.028 };

/** Fabric for a generic garment kind (the Look doesn't name fabrics). */
function fabricOf(kind: Garment["kind"]): Fabric {
  switch (kind) {
    case "kimono":
    case "long_kimono":
    case "hakama":
    case "apron":
    case "kesa":
      return "linen";
    case "haori":
    case "cape":
      return "wool";
    case "sash":
    case "scarf":
      return "silk";
    case "shirt":
    case "track_jacket":
    case "neck_bandana":
    case "arm_bandana":
    case "waist_cloth":
      return "cotton";
    case "pants":
      return "canvas";
    case "haramaki":
    case "wristbands":
      return "knit";
    case "belt":
    case "chest_strap":
    case "gloves":
    case "armguards":
      return "leather";
    case "rope_belt":
      return "rope";
    case "do_armor":
      return "lacquer";
    case "tabi":
      return "cotton";
    default:
      return "cotton";
  }
}

export function buildGarments(o: Outfit, look: Look) {
  const has = (k: Garment["kind"]) => look.garments.some((g) => g.kind === k);
  const lower = has("hakama") || has("long_kimono");
  for (const g of look.garments) {
    const fabric = (g as { fabric?: Fabric }).fabric ?? fabricOf(g.kind);
    switch (g.kind) {
      case "kimono":
        kimono(o, g, fabric, lower, look);
        break;
      case "long_kimono":
        longKimono(o, g, fabric);
        break;
      case "hakama":
        hakama(o, g, fabric);
        break;
      case "haori":
        haori(o, g, fabric);
        break;
      case "pants":
        pants(o, g, fabric);
        break;
      case "shirt":
        shirt(o, g, fabric);
        break;
      case "tabi":
        tabi(o, g.color);
        break;
      case "sash":
        sash(o, g.color, g.wide ? 0.15 : lower ? 0.075 : 0.085, g.bow ? "bow" : g.wide ? "taiko" : "knot", fabric);
        break;
      case "haramaki":
        band(o, { color: g.color, fabric: "knit" }, o.a.navelY - 0.1, o.a.navelY + 0.13, TH.shirt + 0.004);
        break;
      case "belt":
        band(o, { color: g.color, fabric: "leather" }, o.a.hipY + (g.wide ? 0.04 : 0.07), o.a.hipY + (g.wide ? 0.14 : 0.105), TH.jacket);
        if (g.buckle) buckle(o, g.buckle, g.wide ? 1.8 : 1);
        break;
      case "wristbands":
        for (const s of SIDES) limbBand(o, s, "arm", 0.83, 0.97, { color: g.color, fabric: "knit" }, 0.012);
        break;
      case "armguards":
        for (const s of SIDES) limbBand(o, s, "arm", 0.58, 1.02, { color: g.color, fabric: "leather" }, 0.007);
        break;
      case "gloves":
        for (const s of SIDES) glove(o, s, g.color);
        break;
      case "arm_bandana":
        armBandana(o, "L", g.color);
        break;
      case "apron":
        apron(o, g.color, fabric);
        break;
      case "waist_cloth":
        waistCloth(o, g.color, fabric);
        break;
      case "do_armor":
        doArmor(o, g.color, g.lacing);
        break;
      default:
        // Remaining kinds are built by accessories.ts (straps, scarves, capes, …).
        break;
    }
  }
}

// ——— tops ——————————————————————————————————————————————————————————————————————————————

function sleeveT(kind: string) {
  switch (kind) {
    case "long":
    case "narrow":
    case "wide":
      return 0.97;
    case "rolled":
      return 0.62;
    case "three_quarter":
      return 0.72;
    case "short":
      return 0.36;
    default:
      return -1;
  }
}

function kimono(o: Outfit, g: Extract<Garment, { kind: "kimono" }>, fabric: Fabric, tucked: boolean, look: Look) {
  const a = o.a;
  const color = g.color;
  const cl: ClothLook = { color, fabric, pattern: g.pattern, accent: g.accent };
  const vBottom = g.open ? a.navelY + 0.02 : a.chestY - (look.sex === "f" ? 0.02 : 0.075);
  const neck = vNeck(a, vBottom, g.open ? 0.07 : 0.05, g.open ? 0 : -0.012);
  const bottom = tucked ? a.waistY - 0.07 : a.hipY - 0.02;
  const bodyT = g.sleeves === "wide" || g.sleeves === "narrow" ? 0.1 : sleeveT(g.sleeves);
  const f = topField(a, bottom, bodyT, neck);
  let sh = cut(a, "tights", f);
  smooth(sh, 3, 0.5);
  inflate(sh, TH.kimono);
  drape(o, sh, a.chestY + 0.02, bottom, 0.9);
  renormal(sh);
  wrinkle(sh, 0.0025, 14);
  layer(o, cl, sh, { hem: 0.008 });
  o.cover(F.min(f, (s) => (a.region[s] === 0 ? 0.03 : -1)));
  if (!tucked) {
    // Below the sash the kimono falls to the knee as a wrap.
    let skirt = cut(a, "skirt", F.min(F.below(a, a.waistY + 0.02), F.above(a, a.kneeY - 0.04)));
    inflate(skirt, TH.kimono + 0.004);
    flare(o, skirt, a.hipY, a.kneeY, 0.08);
    renormal(skirt);
    wrinkle(skirt, 0.003, 12, 2);
    layer(o, cl, skirt, { hem: 0.009 });
    skirt = skirt as Shell;
  }
  collar(o, vBottom, g.open ? 0.07 : 0.05, g.collar ?? shade(color, 0.8), fabric, g.open ? 0 : -0.012, g.collar ? true : false, color);
  if (g.sleeves === "wide" || g.sleeves === "narrow") for (const s of SIDES) kimonoSleeve(o, s, cl, g.sleeves === "wide" ? 1 : 0.35);
  void sh;
}

/**
 * The kimono collar: a band standing on the V edge, round the back of the neck and down
 * both fronts to where they cross; a thin white under-collar line if `inner` is set.
 */
function collar(o: Outfit, vBottom: number, hwTop: number, color: string, fabric: Fabric, offsetX: number, showInner: boolean, kimonoColor: string) {
  const a = o.a;
  const neck = a.joint("neck");
  const pts: THREE.Vector3[] = [];
  const top = neck.y - 0.005;
  // Down the character's right front from the V bottom, around the back, down the left.
  const N = 22;
  const edge = (t: number, side: Side): THREE.Vector3 => {
    const y = THREE.MathUtils.lerp(vBottom, top, t);
    const hw = hwTop * t;
    const x = offsetX * (1 - t) + sx(side) * hw;
    const ang = Math.atan2(x, 0.12);
    return o.ringPoint(y, ang * 0.9 + (t > 0.9 ? sx(side) * (t - 0.9) * 2 : 0), TH.kimono + 0.004);
  };
  for (let i = 0; i <= N; i++) pts.push(edge(i / N, "R"));
  // Behind the neck: an arc at collar height.
  const backY = neck.y + 0.03;
  for (let i = 1; i < 12; i++) {
    const ang = -Math.PI / 2 - (i / 12) * Math.PI;
    const r = 0.075;
    pts.push(new THREE.Vector3(Math.sin(ang) * r * -1 * (i < 6 ? 1 : 1), THREE.MathUtils.lerp(top, backY, Math.sin((i / 12) * Math.PI)), neck.z + Math.cos(ang) * r));
  }
  for (let i = N; i >= 0; i--) pts.push(edge(i / N, "L"));
  // Smooth the path and build a band standing out from the body.
  const path = pts;
  const side: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const t = next.clone().sub(prev).normalize();
    const c = new THREE.Vector3(0, path[i].y, o.axisZ(path[i].y));
    const out = path[i].clone().sub(c).setY(0).normalize();
    const s = new THREE.Vector3().crossVectors(t, out).normalize();
    side.push(s);
    nrm.push(out);
  }
  const wBack = (i: number) => (i > N && i < N + 12 ? 1 : 0);
  const weights = (t: number) => {
    const i = Math.round(t * (path.length - 1));
    return wBack(i) ? wMix([[wOne(o.bone("neck")), 0.4], [wOne(o.bone("chest")), 0.6]]) : wOne(o.bone("chest"));
  };
  const acc = o.acc({ color, fabric });
  strip(acc, path, side, nrm, () => 0.042, weights, { tile: fabricTile(fabric), centred: false });
  if (showInner) {
    const inner = path.map((p, i) => p.clone().addScaledVector(side[i], -0.004).addScaledVector(nrm[i], -0.003));
    strip(o.acc({ color: "#e9e4d8", fabric: "cotton" }), inner, side, nrm, () => 0.012, weights, { tile: fabricTile("cotton"), centred: true });
  }
  void kimonoColor;
}

/**
 * Kimono sleeve with arms at rest: a tube round the arm whose section is stretched front-
 * to-back into the hanging bag (tamoto). `bag` 0 (narrow) … 1 (wide shihakushō sleeve).
 */
function kimonoSleeve(o: Outfit, side: Side, cl: ClothLook, bag: number) {
  const a = o.a;
  const c = a.arm[side];
  const shoulder = c.pts[0];
  const wrist = c.pts[2];
  const path: THREE.Vector3[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = THREE.MathUtils.lerp(0.06, 1.02, i / N);
    // Along the chain.
    const d = t * c.total;
    let k = 0;
    while (k < c.len.length - 2 && c.len[k + 1] < d) k++;
    const seg = (d - c.len[k]) / (c.len[k + 1] - c.len[k]);
    path.push(c.pts[k].clone().lerp(c.pts[k + 1], seg));
  }
  const dir = wrist.clone().sub(shoulder).normalize();
  const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
  const out = new THREE.Vector3().crossVectors(dir, fwd).multiplyScalar(side === "L" ? -1 : 1);
  const armR = 0.052;
  const depth = THREE.MathUtils.lerp(0.075, 0.2, bag);
  const width = THREE.MathUtils.lerp(0.07, 0.1, bag);
  const b = (n: string) => o.bone(n + side);
  const w = (t: number) => {
    const k = THREE.MathUtils.smoothstep(t, 0.34, 0.5);
    return wMix([[wOne(b("upperArm")), 1 - k], [wOne(b("foreArm")), k]]);
  };
  const acc = o.acc(cl);
  tube(
    acc,
    path,
    () => ({ x: out, y: fwd }),
    (t, ang) => {
      const grow = THREE.MathUtils.smoothstep(t, 0, 0.22);
      const rx = THREE.MathUtils.lerp(armR + 0.012, width, grow);
      const rz = THREE.MathUtils.lerp(armR + 0.014, depth, grow);
      const x = Math.cos(ang) * rx;
      const z = Math.sin(ang) * rz;
      // The bag hangs behind the forearm.
      return Math.hypot(x, z - (rz - armR) * 0.35 * Math.max(0, -Math.sin(ang)) * grow);
    },
    w,
    { segments: 20, tile: fabricTile(cl.fabric) },
  );
}

function shirt(o: Outfit, g: Extract<Garment, { kind: "shirt" }>, fabric: Fabric) {
  const a = o.a;
  const cl: ClothLook = { color: g.color, fabric };
  const neck = g.open ? vNeck(a, a.navelY - 0.02, 0.07) : crewNeck(a, 0.035);
  const st = sleeveT(g.sleeves);
  const bottom = a.hipY - 0.03;
  const f = topField(a, bottom, st < 0 ? -1 : st, neck);
  const sh = cut(a, "tights", f);
  smooth(sh, 3, 0.5);
  inflate(sh, TH.shirt);
  drape(o, sh, a.chestY, bottom, 0.6);
  renormal(sh);
  wrinkle(sh, 0.0018, 20);
  layer(o, cl, sh, { hem: 0.005 });
  if (g.sleeves === "rolled") for (const s of SIDES) limbBand(o, s, "arm", st - 0.07, st + 0.005, cl, TH.shirt + 0.008);
  o.cover(F.min(f, (s) => (a.region[s] === 0 && g.open ? -1 : 0.03)));
}

function haori(o: Outfit, g: Extract<Garment, { kind: "haori" }>, fabric: Fabric) {
  const a = o.a;
  const cl: ClothLook = { color: g.color, fabric };
  const neck = vNeck(a, a.hipY - 0.2, 0.075);
  // Upper part from the tights (open front), sleeves wide unless sleeveless.
  const f = topField(a, a.waistY - 0.04, g.sleeveless ? -1 : 0.12, neck);
  const sh = cut(a, "tights", f);
  smooth(sh, 4, 0.5);
  inflate(sh, TH.coat + 0.004);
  drape(o, sh, a.chestY + 0.03, a.waistY - 0.04, 1);
  renormal(sh);
  layer(o, cl, sh, { hem: 0.01 });
  // Lower part hangs from the waist as an open skirt to the hip (or knee when long).
  const hemY = g.long ? a.kneeY - 0.28 : a.hipY - 0.16;
  const front = (s: number) => {
    const p = a.pos(s);
    return p.z > o.axisZ(p.y) + 0.02 ? Math.abs(p.x) - 0.07 : 1;
  };
  const lowerF = F.min(F.below(a, a.waistY - 0.02), F.above(a, hemY), front);
  const lower = cut(a, "skirt", lowerF);
  inflate(lower, TH.coat + 0.012);
  flare(o, lower, a.hipY, hemY, 0.06);
  renormal(lower);
  wrinkle(lower, 0.004, 9, 3);
  layer(o, cl, lower, { hem: 0.012 });
  if (!g.sleeveless) for (const s of SIDES) kimonoSleeve(o, s, cl, 0.85);
  else for (const s of SIDES) capSleeve(o, s, cl);
  collar(o, a.hipY - 0.2, 0.075, shade(g.color, 0.85), fabric, 0, false, g.color);
  if (g.crest) for (const s of ["back", "L", "R"] as const) crestDecal(o, g.crest, s);
}

/** Short squared sleeve cap for sleeveless coats (captain's haori). */
function capSleeve(o: Outfit, side: Side, cl: ClothLook) {
  const a = o.a;
  const f = (s: number) => ((a.region[s] === 2 && side === "L") || (a.region[s] === 3 && side === "R") ? 0.24 - a.limbT[s] : -1);
  const sh = cut(a, "tights", f);
  inflate(sh, TH.coat + 0.02);
  renormal(sh);
  layer(o, cl, sh, { hem: 0.012 });
}

function crestDecal(o: Outfit, color: string, at: "back" | Side) {
  // A family crest (mon): a simple ring-and-flower disc on the back and both chest sides.
  const a = o.a;
  const y = at === "back" ? a.chestY + 0.07 : a.chestY + 0.04;
  const ang = at === "back" ? Math.PI : sx(at) * 0.62;
  const size = at === "back" ? 0.07 : 0.045;
  decal(o, o.ringPoint(y, ang, TH.coat + 0.008), ang, size, monTexture(color), "chest");
}

const monCache = new Map<string, THREE.CanvasTexture>();
function monTexture(color: string) {
  let t = monCache.get(color);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 3; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k * Math.PI * 2) / 3);
    g.beginPath();
    g.ellipse(0, -22, 13, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  monCache.set(color, t);
  return t;
}

/** A small textured quad lying on the torso (crests, logos). */
export function decal(o: Outfit, at: THREE.Vector3, ang: number, size: number, tex: THREE.Texture, bone: string, aspect = 1) {
  const n = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  const key = `decal:${tex.uuid}`;
  const accs = decals.get(o) ?? new Map<string, { acc: Acc; tex: THREE.Texture }>();
  decals.set(o, accs);
  let e = accs.get(key);
  if (!e) accs.set(key, (e = { acc: new Acc(), tex }));
  const w = wOne(o.bone(bone));
  const hw = (size * aspect) / 2;
  const hh = size / 2;
  const p = (x: number, y: number) => at.clone().addScaledVector(right, x).addScaledVector(up, y);
  const i0 = e.acc.vertex(p(-hw, -hh), n, 0, 0, w);
  const i1 = e.acc.vertex(p(hw, -hh), n, 1, 0, w);
  const i2 = e.acc.vertex(p(hw, hh), n, 1, 1, w);
  const i3 = e.acc.vertex(p(-hw, hh), n, 0, 1, w);
  e.acc.tri(i0, i1, i2);
  e.acc.tri(i0, i2, i3);
}
export const decals = new WeakMap<Outfit, Map<string, { acc: Acc; tex: THREE.Texture }>>();

function longKimono(o: Outfit, g: Extract<Garment, { kind: "long_kimono" }>, fabric: Fabric) {
  const a = o.a;
  const cl: ClothLook = { color: g.color, fabric, pattern: g.pattern, accent: g.accent };
  const vBottom = a.chestY - 0.03;
  const neck = vNeck(a, vBottom, 0.045, -0.01);
  const f = topField(a, a.waistY - 0.04, 0.1, neck);
  const sh = cut(a, "tights", f);
  smooth(sh, 3, 0.5);
  inflate(sh, TH.kimono);
  drape(o, sh, a.chestY + 0.01, a.waistY, 0.8);
  renormal(sh);
  layer(o, cl, sh, { hem: 0.008 });
  // Wrapped skirt to the ankles, narrow (women's kimono is tight around the legs).
  const skirt = cut(a, "skirt", F.min(F.below(a, a.waistY + 0.02), F.above(a, a.ankleY + 0.015)));
  inflate(skirt, TH.kimono + 0.003);
  flare(o, skirt, a.kneeY, a.ankleY, -0.08);
  renormal(skirt);
  wrinkle(skirt, 0.003, 11, 4);
  layer(o, cl, skirt, { hem: 0.009 });
  collar(o, vBottom, 0.045, g.collar ?? "#efe9dc", fabric, -0.01, true, g.color);
  for (const s of SIDES) kimonoSleeve(o, s, cl, 1);
  o.cover(F.min(f, (s) => (a.region[s] === 0 ? 0.03 : -1)));
}

// ——— lower body ——————————————————————————————————————————————————————————————————————————

function hakama(o: Outfit, g: Extract<Garment, { kind: "hakama" }>, fabric: Fabric) {
  const a = o.a;
  const cl: ClothLook = { color: g.color, fabric, pattern: g.stripes ? "stripes" : undefined, accent: g.stripes, patternTile: 0.12 };
  const top = a.waistY + 0.015;
  const sh = cut(a, "skirt", F.min(F.below(a, top), F.above(a, a.ankleY + 0.035)));
  inflate(sh, TH.kimono + 0.012);
  flare(o, sh, a.hipY, a.ankleY, 0.24);
  // Five front pleats, two at the back.
  pleat(o, sh, 0.022, 5, -0.9, 0.9, top - 0.05);
  pleat(o, sh, 0.018, 2, Math.PI - 0.7, Math.PI, top - 0.05);
  pleat(o, sh, 0.018, 2, -Math.PI, -Math.PI + 0.7, top - 0.05);
  renormal(sh);
  wrinkle(sh, 0.003, 10, 5);
  layer(o, cl, sh, { hem: 0.012 });
  // Hakama ties (himo) around the waist over the obi.
  band(o, { color: shade(g.color, 1.1), fabric }, top - 0.012, top + 0.018, TH.sash + 0.006);
  // Hidden legs don't need skin.
  o.cover((s) => (a.region[s] >= 6 && a.region[s] <= 7 && a.body.pos[s * 3 + 1] > a.ankleY + 0.08 ? 1 : -1));
}

function pants(o: Outfit, g: Extract<Garment, { kind: "pants" }>, fabric: Fabric) {
  const a = o.a;
  const len = g.length === "long" ? 0.965 : g.length === "knee" ? 0.56 : 0.32;
  const top = a.hipY + 0.07;
  const f = (s: number) => {
    const r = a.region[s];
    const y = a.body.pos[s * 3 + 1];
    if (r === 6 || r === 7) return Math.min((len - a.limbT[s]) * 0.6, top - y);
    if (r === 0) return top - y;
    return -1;
  };
  const cl: ClothLook = { color: g.color, fabric: g.cuffs ? "denim" : fabric };
  const sh = cut(a, "tights", f);
  smooth(sh, 2, 0.5);
  inflate(sh, g.baggy ? TH.jacket + 0.01 : TH.shirt + 0.002);
  // Straight legs: fill the concave back of the knee a little.
  for (const v of sh.verts) if ((v.region === 6 || v.region === 7) && g.baggy) v.p.addScaledVector(v.n, 0.008);
  renormal(sh);
  wrinkle(sh, 0.002, 16, 6);
  layer(o, cl, sh, { hem: 0.006 });
  o.cover(F.min(f, () => 0.03));
  if (g.stripe) for (const s of SIDES) legStripe(o, s, len, g.stripe);
  if (g.cuffs) for (const s of SIDES) limbBand(o, s, "leg", len - 0.06, len + 0.004, { color: g.cuffs, fabric: "denim" }, TH.shirt + 0.009);
}

function legStripe(o: Outfit, side: Side, len: number, color: string) {
  const a = o.a;
  const c = a.leg[side];
  const f = (s: number) => {
    if (a.region[s] !== (side === "L" ? 6 : 7)) return -1;
    const p = a.pos(s);
    const pr = projectChain(c, p);
    const outward = (p.x - pr.at.x) * sx(side);
    return Math.min(outward - 0.03, (len - a.limbT[s]) * 0.6, 0.02 - Math.abs(p.z - pr.at.z));
  };
  const sh = cut(a, "tights", f);
  inflate(sh, TH.shirt + 0.0035);
  layer(o, { color, fabric: "cotton" }, sh);
}

function tabi(o: Outfit, color: string) {
  const a = o.a;
  const f = (s: number) => (a.region[s] >= 8 ? 1 : a.region[s] >= 6 ? a.limbT[s] - 0.9 : -1);
  const sh = cut(a, "tights", f);
  inflate(sh, 0.003);
  layer(o, { color, fabric: "cotton" }, sh, { hem: 0.003 });
  o.cover(F.min(f, () => 0.02));
}

function apron(o: Outfit, color: string, fabric: Fabric) {
  const a = o.a;
  const f = (s: number) => {
    const p = a.pos(s);
    return Math.min(p.z - o.axisZ(p.y) - 0.03, 0.2 - Math.abs(p.x), a.chestY - 0.02 - p.y, p.y - (a.kneeY - 0.05));
  };
  const sh = cut(a, "skirt", F.min(f, F.below(a, a.waistY)));
  inflate(sh, TH.coat + 0.02);
  renormal(sh);
  layer(o, { color, fabric }, sh, { hem: 0.004 });
  const bib = cut(a, "tights", F.min(f, F.above(a, a.waistY - 0.02)));
  inflate(bib, TH.jacket + 0.006);
  layer(o, { color, fabric }, bib, { hem: 0.004 });
}

function waistCloth(o: Outfit, color: string, fabric: Fabric) {
  const a = o.a;
  // Knee-length wrap over the trousers (Sasuke): overlaps just left of centre at the front.
  const f = F.min(F.below(a, a.waistY - 0.01), F.above(a, a.kneeY + 0.05), (s: number) => {
    const p = a.pos(s);
    const front = p.z > o.axisZ(p.y) + 0.02;
    return front ? Math.abs(p.x + 0.03) - 0.012 : 1;
  });
  const sh = cut(a, "skirt", f);
  inflate(sh, TH.coat + 0.01);
  flare(o, sh, a.hipY, a.kneeY, 0.05);
  renormal(sh);
  wrinkle(sh, 0.0035, 9, 7);
  layer(o, { color, fabric: "canvas" }, sh, { hem: 0.01 });
  // Folded-down top edge.
  band(o, { color: shade(color, 0.9), fabric: "canvas" }, a.waistY - 0.065, a.waistY - 0.005, TH.coat + 0.014);
}

// ——— bands, sashes, belts —————————————————————————————————————————————————————————————————

/** A band of cloth round the torso between y0 and y1. */
export function band(o: Outfit, cl: ClothLook, y0: number, y1: number, thick: number) {
  const a = o.a;
  const f = (s: number) => {
    const r = a.region[s];
    if (r !== 0 && !(r >= 6 && a.limbT[s] < 0.1)) return -1;
    const y = a.body.pos[s * 3 + 1];
    return Math.min(y - y0, y1 - y);
  };
  const sh = cut(a, "tights", f);
  // Bands pull the cloth tight: smooth the surface round, then push out evenly.
  smooth(sh, 4, 0.6);
  inflate(sh, thick);
  renormal(sh);
  layer(o, cl, sh, { hem: Math.min(0.008, thick * 0.6) });
  return sh;
}

function sash(o: Outfit, color: string, height: number, tie: "knot" | "bow" | "taiko", fabric: Fabric) {
  const a = o.a;
  const yc = a.waistY - 0.005;
  const cl: ClothLook = { color, fabric };
  band(o, cl, yc - height / 2, yc + height / 2, TH.sash);
  const hips = o.bone("hips");
  const back = o.ringPoint(yc, Math.PI, TH.sash + 0.01);
  const acc = o.acc(cl);
  if (tie === "taiko") {
    // A women's taiko knot: a cushioned box at the back.
    const box = new THREE.BoxGeometry(0.28, 0.2, 0.08, 4, 3, 2);
    const m = new THREE.Matrix4().makeTranslation(back.x, yc + 0.03, back.z - 0.04);
    appendGeometry(acc, box, m, wOne(o.bone("spine")), fabricTile(fabric));
  } else if (tie === "bow") {
    for (const s of [-1, 1]) {
      const loop = new THREE.TorusGeometry(0.045, 0.018, 8, 14);
      const m = new THREE.Matrix4().compose(back.clone().add(new THREE.Vector3(s * 0.05, 0.005, -0.02)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, s * 0.4)), new THREE.Vector3(1, 0.7, 1.3));
      appendGeometry(acc, loop, m, wOne(hips), fabricTile(fabric));
    }
  } else {
    // Men's knot at the back (kai-no-kuchi): a flat wedge with two short ends.
    const knot = new THREE.BoxGeometry(0.1, height * 0.9, 0.035, 3, 2, 1);
    const m = new THREE.Matrix4().compose(back.clone().add(new THREE.Vector3(0, 0, -0.012)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.35)), new THREE.Vector3(1, 1, 1));
    appendGeometry(acc, knot, m, wOne(hips), fabricTile(fabric));
  }
}

function buckle(o: Outfit, color: string, size: number) {
  const a = o.a;
  const y = o.a.hipY + (size > 1.2 ? 0.09 : 0.088);
  const p = o.ringPoint(y, 0, TH.jacket + 0.004);
  const g = new THREE.BoxGeometry(0.05 * size, 0.035 * size, 0.008);
  appendGeometry(o.acc({ color, fabric: "metal" }), g, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), wOne(o.bone("hips")));
  void a;
}

/** Band around an arm or leg between limb parameters t0..t1. */
export function limbBand(o: Outfit, side: Side, limb: "arm" | "leg", t0: number, t1: number, cl: ClothLook, thick: number) {
  const a = o.a;
  const regions = limb === "arm" ? (side === "L" ? [2, 4] : [3, 5]) : side === "L" ? [6, 8] : [7, 9];
  const f = (s: number) => (regions.includes(a.region[s]) ? Math.min(a.limbT[s] - t0, t1 - a.limbT[s]) : -1);
  const sh = cut(a, "tights", f);
  smooth(sh, 2, 0.5);
  inflate(sh, thick);
  renormal(sh);
  layer(o, cl, sh, { hem: Math.min(0.006, thick * 0.6) });
  return sh;
}

function glove(o: Outfit, side: Side, color: string) {
  const a = o.a;
  // Back-of-hand guard (tekkō) from the knuckles to the wrist, over a wrist band.
  const hand = a.joint(`hand${side}`);
  const knuckle = a.joint(`middle1${side}`);
  const f = (s: number) => {
    if (a.region[s] !== (side === "L" ? 4 : 5)) return -1;
    const p = a.pos(s);
    const along = (hand.y - p.y) / (hand.y - knuckle.y);
    // The back of the hand faces outward (away from the body).
    const outward = (p.x - hand.x) * sx(side);
    return Math.min(1.02 - along, outward + 0.004);
  };
  const sh = cut(a, "body", f);
  inflate(sh, 0.0025);
  layer(o, { color, fabric: "cotton" }, sh, { hem: 0.002 });
  limbBand(o, side, "arm", 0.9, 1.0, { color: shade(color, 0.85), fabric: "cotton" }, 0.006);
}

function armBandana(o: Outfit, side: Side, color: string) {
  limbBand(o, side, "arm", 0.2, 0.3, { color, fabric: "cotton" }, TH.shirt + 0.008);
  // Knot and two short tails on the outside of the arm.
  const a = o.a;
  const c = a.arm[side];
  const at = c.pts[0].clone().lerp(c.pts[1], 0.5).add(new THREE.Vector3(sx(side) * 0.055, 0, 0));
  const acc = o.acc({ color, fabric: "cotton" });
  const w = wOne(o.bone(`upperArm${side}`));
  appendGeometry(acc, new THREE.SphereGeometry(0.018, 8, 6), new THREE.Matrix4().makeTranslation(at.x, at.y, at.z), w);
  for (const k of [-1, 1]) {
    const path = [at.clone(), at.clone().add(new THREE.Vector3(sx(side) * 0.03, -0.03, k * 0.03)), at.clone().add(new THREE.Vector3(sx(side) * 0.045, -0.07, k * 0.045))];
    const dirs = path.map(() => new THREE.Vector3(0, 0, 1));
    const nrm = path.map(() => new THREE.Vector3(sx(side), 0, 0));
    strip(acc, path, dirs, nrm, (t) => 0.03 * (1 - t * 0.5), () => w, { tile: 0.1 });
  }
}

function doArmor(o: Outfit, color: string, lacing: string) {
  const a = o.a;
  // Lacquered cuirass (dō): rigid plates round the torso, with laced rows (odoshi).
  const f = (s: number) => {
    const r = a.region[s];
    if (r !== 0) return -1;
    const y = a.body.pos[s * 3 + 1];
    return Math.min(y - (a.waistY - 0.06), a.chestY + 0.07 - y);
  };
  const sh = cut(a, "tights", f);
  smooth(sh, 6, 0.6);
  inflate(sh, TH.armor);
  drape(o, sh, a.chestY + 0.05, a.waistY - 0.06, 1);
  renormal(sh);
  layer(o, { color, fabric: "lacquer" }, sh, { hem: 0.012 });
  for (let k = 0; k < 4; k++) {
    const y = THREE.MathUtils.lerp(a.waistY - 0.04, a.chestY + 0.04, k / 3.5);
    band(o, { color: lacing, fabric: "silk" }, y - 0.006, y + 0.006, TH.armor + 0.004);
  }
  // Skirt of plates (kusazuri): four tassets hanging from the cuirass.
  const kf = F.min(F.below(a, a.waistY - 0.05), F.above(a, a.hipY - 0.15));
  const ks = cut(a, "skirt", kf);
  inflate(ks, TH.armor + 0.01);
  flare(o, ks, a.hipY, a.hipY - 0.15, 0.12);
  pleat(o, ks, 0.02, 8);
  renormal(ks);
  layer(o, { color, fabric: "lacquer" }, ks, { hem: 0.01 });
  // Shoulder guards (sode) as small plate stacks.
  for (const s of SIDES) {
    const c = a.arm[s];
    const at = c.pts[0].clone().add(new THREE.Vector3(sx(s) * 0.03, -0.05, 0));
    const plate = new THREE.BoxGeometry(0.03, 0.14, 0.16, 1, 3, 2);
    const m = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -sx(s) * 0.25)), new THREE.Vector3(1, 1, 1));
    appendGeometry(o.acc({ color, fabric: "lacquer" }), plate, m, wOne(o.bone(`upperArm${s}`)));
  }
}

// ——— small helpers —————————————————————————————————————————————————————————————————————————

export function appendGeometry(acc: Acc, geo: THREE.BufferGeometry, m: THREE.Matrix4, w: W, uvScale = 1) {
  const g = geo.index ? geo : geo;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const base = acc.count;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    acc.vertex(p, n, uv ? uv.getX(i) / Math.max(uvScale, 1e-3) * 0.1 : 0, uv ? uv.getY(i) / Math.max(uvScale, 1e-3) * 0.1 : 0, w);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) acc.idx.push(base + g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) acc.idx.push(base + i);
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

export type { CV };
