// Accessories that aren't cut from the body: rope belts, scarves, bandanas, chest straps,
// capes, the monk's kesa, earrings. Paths are laid on the torso profile and skinned to
// the nearest bones.

import * as THREE from "three";
import type { Garment, Look } from "../../../shared/look";
import type { Anatomy } from "./anatomy";
import { strip, tube, type W, wMix, wOne } from "./cloth";
import { fabricTile } from "./fabric";
import { appendGeometry, band, Outfit, shade } from "./garments";

export function buildAccessories(o: Outfit, look: Look) {
  for (const g of look.garments) {
    switch (g.kind) {
      case "rope_belt":
        ropeBelt(o, g.color);
        break;
      case "scarf":
        scarf(o, g.color, !!g.long);
        break;
      case "neck_bandana":
        neckBandana(o, g.color);
        break;
      case "chest_strap":
        chestStrap(o, g.color);
        break;
      case "cape":
        cape(o, g.color, g.lining ?? shade(g.color, 0.7));
        break;
      case "kesa":
        kesa(o, g.color);
        break;
    }
  }
  if (look.earrings) earrings(o, look.earrings);
}

/** Weights for a point on the torso by height (hips → spine → chest → neck). */
export function torsoW(o: Outfit, y: number): W {
  const a = o.a;
  const hips = a.joint("hips").y;
  const spine = a.joint("spine").y;
  const chest = a.joint("chest").y;
  const neck = a.joint("neck").y;
  const b = (n: string) => wOne(o.bone(n));
  if (y < spine) return wMix([[b("hips"), 1 - THREE.MathUtils.smoothstep(y, hips, spine)], [b("spine"), THREE.MathUtils.smoothstep(y, hips, spine)]]);
  if (y < chest) return wMix([[b("spine"), 1 - THREE.MathUtils.smoothstep(y, spine, chest)], [b("chest"), THREE.MathUtils.smoothstep(y, spine, chest)]]);
  return wMix([[b("chest"), 1 - THREE.MathUtils.smoothstep(y, chest + 0.05, neck)], [b("neck"), THREE.MathUtils.smoothstep(y, chest + 0.05, neck)]]);
}

/** A closed ring round the torso at height y (n points), `out` metres off the surface. */
export function ring(o: Outfit, y: number, out: number, n = 40): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) pts.push(o.ringPoint(y, (i / n) * Math.PI * 2, out));
  return pts;
}

/** Twisted rope tube along a path. */
function rope(o: Outfit, path: THREE.Vector3[], radius: number, color: string, w: (t: number) => W) {
  const acc = o.acc({ color, fabric: "rope" });
  const frames = path.map((p, i) => {
    const d = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
    const x = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    if (x.lengthSq() < 0.1) x.set(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(d, x).normalize();
    return { x, y };
  });
  tube(acc, path, (i) => frames[i], (t, ang) => radius * (1 + 0.16 * Math.cos(ang * 3 + t * 60)), (t) => w(t), { segments: 9, tile: fabricTile("rope"), capStart: true, capEnd: true });
}

function ropeBelt(o: Outfit, color: string) {
  // Sasuke: two stacked coils round the waist, a big knot with a loop on the left hip,
  // and two tails (to mid-thigh and knee) ending in frayed tassels.
  const a = o.a;
  for (const dy of [0.012, -0.022]) {
    const y = a.waistY - 0.035 + dy;
    const path = ring(o, y, 0.035, 48);
    rope(o, path, 0.019, color, () => torsoW(o, y));
  }
  const knotAng = 0.55;
  const knot = o.ringPoint(a.waistY - 0.04, knotAng, 0.06);
  const hipW = wOne(o.bone("hips"));
  const acc = o.acc({ color, fabric: "rope" });
  appendGeometry(acc, new THREE.SphereGeometry(0.032, 10, 8), new THREE.Matrix4().makeTranslation(knot.x, knot.y, knot.z), hipW);
  const loop: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = (i / 14) * Math.PI * 2;
    loop.push(knot.clone().add(new THREE.Vector3(Math.cos(t) * 0.035 + 0.02, Math.sin(t) * 0.05 + 0.02, 0.012)));
  }
  rope(o, loop, 0.014, color, () => hipW);
  const thigh = wOne(o.bone("thighL"));
  for (const [len, dx] of [
    [0.45, 0.015],
    [0.6, -0.02],
  ]) {
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      path.push(knot.clone().add(new THREE.Vector3(dx + t * 0.03, -len * t, 0.04 * Math.sin(t * Math.PI) + 0.01)));
    }
    rope(o, path, 0.015, color, (t) => wMix([[hipW, 1 - t], [thigh, t]]));
    const end = path[path.length - 1];
    appendGeometry(o.acc({ color: shade(color, 1.12), fabric: "rope" }), new THREE.ConeGeometry(0.02, 0.07, 8, 1, true), new THREE.Matrix4().makeTranslation(end.x, end.y - 0.03, end.z), thigh);
  }
}

function scarf(o: Outfit, color: string, long: boolean) {
  // Worn high round the neck (Byakuya's cowl), ends thrown back over the shoulders.
  const a = o.a;
  const neck = a.joint("neck");
  const cl = { color, fabric: "silk" as const };
  const acc = o.acc(cl);
  const neckW = (t: number) => wMix([[wOne(o.bone("neck")), 0.6 - t * 0.2], [wOne(o.bone("chest")), 0.4 + t * 0.2]]);
  for (let k = 0; k < 3; k++) {
    const y = neck.y - 0.02 + k * 0.025;
    const r = 0.085 + k * 0.006 - (long ? 0 : 0.01);
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      path.push(new THREE.Vector3(Math.sin(ang) * r, y - Math.cos(ang) * 0.015, neck.z + 0.005 + Math.cos(ang) * r * 0.95));
    }
    tube(acc, path, (i) => ({ x: new THREE.Vector3(0, 1, 0), y: path[i].clone().sub(new THREE.Vector3(0, path[i].y, neck.z)).setY(0).normalize() }), () => 0.024, () => neckW(k / 2), { segments: 8, tile: fabricTile("silk") });
  }
  if (!long) return;
  // Two long ends hanging down the back to the knees.
  for (const s of [-1, 1]) {
    const path: THREE.Vector3[] = [];
    const side: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const top = new THREE.Vector3(s * 0.07, neck.y - 0.01, neck.z - 0.06);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const y = THREE.MathUtils.lerp(top.y, a.kneeY + 0.05, t);
      const back = o.ringPoint(Math.max(y, a.hipY - 0.1), Math.PI + s * 0.35, 0.05 + t * 0.03);
      path.push(new THREE.Vector3(THREE.MathUtils.lerp(top.x, s * 0.1, t), y, Math.min(back.z, top.z) - 0.01 - t * 0.04));
      side.push(new THREE.Vector3(1, 0, 0));
      nrm.push(new THREE.Vector3(0, 0, -1));
    }
    strip(acc, path, side, nrm, (t) => 0.2 - t * 0.04, (t) => wMix([[wOne(o.bone("chest")), 1 - t * 0.6], [wOne(o.bone("spine")), t * 0.6]]), { tile: fabricTile("silk") });
  }
}

function neckBandana(o: Outfit, color: string) {
  // Cowboy-style: a triangle hanging over the chest, knotted at the back of the neck.
  const a = o.a;
  const neck = a.joint("neck");
  const cl = { color, fabric: "cotton" as const };
  band(o, cl, neck.y - 0.045, neck.y - 0.005, 0.016);
  const acc = o.acc(cl);
  const top = o.ringPoint(neck.y - 0.03, 0, 0.018);
  const L = top.clone().add(new THREE.Vector3(0.08, 0.01, -0.02));
  const R = top.clone().add(new THREE.Vector3(-0.08, 0.01, -0.02));
  const tip = o.ringPoint(a.chestY + 0.03, 0, 0.022);
  const w = wOne(o.bone("chest"));
  const n = new THREE.Vector3(0, 0.3, 1).normalize();
  const i0 = acc.vertex(L, n, 0, 1, w);
  const i1 = acc.vertex(R, n, 1, 1, w);
  const i2 = acc.vertex(tip, n, 0.5, 0, w);
  const i3 = acc.vertex(top.clone().add(new THREE.Vector3(0, -0.02, 0.012)), n, 0.5, 0.8, w);
  acc.tri(i0, i3, i2);
  acc.tri(i3, i1, i2);
  // Knot behind, with two short tails.
  const back = o.ringPoint(neck.y - 0.02, Math.PI - 0.5, 0.02);
  appendGeometry(acc, new THREE.SphereGeometry(0.014, 8, 6), new THREE.Matrix4().makeTranslation(back.x, back.y, back.z), wOne(o.bone("neck")));
}

function chestStrap(o: Outfit, color: string) {
  // Ichigo's strap: flat kite-shaped links over the RIGHT shoulder, across the chest to
  // the LEFT hip, and diagonally across the back.
  const a = o.a;
  const acc = o.acc({ color, fabric: "leather" });
  const link = new THREE.OctahedronGeometry(1, 0);
  const shoulder = new THREE.Vector3(-0.1, a.shoulderY + 0.04, 0);
  const hipF = o.ringPoint(a.waistY - 0.03, 1.15, 0.03);
  const hipB = o.ringPoint(a.waistY - 0.03, Math.PI - 1.15, 0.03);
  for (const [end, front] of [
    [hipF, true],
    [hipB, false],
  ] as const) {
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = THREE.MathUtils.lerp(shoulder.y, end.y, t);
      const x = THREE.MathUtils.lerp(shoulder.x, end.x, t);
      const ang = Math.atan2(x, front ? 0.12 : -0.12);
      const p = y < a.neckY - 0.02 ? o.ringPoint(y, ang, 0.03) : new THREE.Vector3(x, y, front ? 0.03 : -0.03);
      const dir = new THREE.Vector3(end.x - shoulder.x, end.y - shoulder.y, 0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.012, 0.016, 0.004));
      appendGeometry(acc, link, m, torsoW(o, y));
    }
  }
}

function cape(o: Outfit, color: string, lining: string) {
  const a = o.a;
  const acc = o.acc({ color, fabric: "wool" });
  const lin = o.acc({ color: lining, fabric: "silk" });
  const cols = 14;
  const rows = 14;
  const grid: THREE.Vector3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = THREE.MathUtils.lerp(a.shoulderY + 0.02, a.kneeY - 0.1, t);
    const row: THREE.Vector3[] = [];
    for (let c = 0; c <= cols; c++) {
      const ang = Math.PI - 1.4 + (c / cols) * 2.8;
      row.push(o.ringPoint(Math.max(y, a.hipY - 0.15), ang, 0.03 + t * 0.08).setY(y));
    }
    grid.push(row);
  }
  for (const [target, flip] of [
    [acc, false],
    [lin, true],
  ] as const) {
    const base = target.count;
    grid.forEach((row, r) =>
      row.forEach((p, c) => {
        const n = p.clone().setY(0).normalize().multiplyScalar(flip ? -1 : 1);
        target.vertex(flip ? p.clone().addScaledVector(n, 0.002) : p, n, c / cols, r / rows, torsoW(o, Math.max(p.y, a.waistY)));
      }),
    );
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = base + r * (cols + 1) + c;
        if (flip) target.idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
        else target.idx.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2);
      }
  }
}

function kesa(o: Outfit, color: string) {
  // Monk's robe draped over the left shoulder, crossing to the right hip.
  const a = o.a;
  const acc = o.acc({ color, fabric: "linen" });
  for (const front of [true, false]) {
    const path: THREE.Vector3[] = [];
    const side: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const y = THREE.MathUtils.lerp(a.shoulderY + 0.03, a.hipY - 0.05, t);
      const ang = front ? THREE.MathUtils.lerp(0.9, -0.9, t) : THREE.MathUtils.lerp(Math.PI - 0.9, Math.PI + 0.9, t);
      const p = o.ringPoint(Math.max(y, a.hipY - 0.1), ang, 0.03);
      path.push(p.setY(y));
      const out = p.clone().setY(0).normalize();
      nrm.push(out);
      side.push(new THREE.Vector3(0, 1, 0).cross(out).normalize().multiplyScalar(-1));
    }
    strip(acc, path, side, nrm, () => 0.16, (t) => torsoW(o, THREE.MathUtils.lerp(a.shoulderY, a.hipY, t)), { tile: fabricTile("linen") });
  }
}

function earrings(o: Outfit, n: number) {
  // Zoro: small hoops on the LEFT lobe, each holding a long thin gold bar.
  const a = o.a;
  const ear = earlobe(a, "L");
  const acc = o.acc({ color: "#d4a843", fabric: "metal" });
  const w = wOne(o.bone("head"));
  for (let k = 0; k < n; k++) {
    const p = ear.clone().add(new THREE.Vector3(0.001, 0.004 - k * 0.005, -0.003 + k * 0.0035));
    appendGeometry(acc, new THREE.TorusGeometry(0.0038, 0.0008, 6, 12), new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)), w);
    appendGeometry(acc, new THREE.CapsuleGeometry(0.0014, 0.024, 3, 6), new THREE.Matrix4().makeTranslation(p.x + 0.0015, p.y - 0.016, p.z), w);
  }
}

function earlobe(a: Anatomy, side: "L" | "R"): THREE.Vector3 {
  // Lowest outer point of the ear: head vertices far out to the side, near eye depth.
  const s = side === "L" ? 1 : -1;
  let best: THREE.Vector3 | null = null;
  const p = new THREE.Vector3();
  const vtx = a.kit.view<Uint16Array>("body:vtx");
  for (let i = 0; i < vtx.length; i++) {
    const v = vtx[i];
    if (a.region[v] !== 1) continue;
    a.pos(v, p);
    if (p.x * s < a.headRadii.x * 0.85) continue;
    if (p.y > a.eye.L.y || p.y < a.mouth.y - 0.01) continue;
    if (p.z < a.headCentre.z - 0.05 || p.z > a.headCentre.z + 0.03) continue;
    if (!best || p.y < best.y) best = p.clone();
  }
  return best ?? new THREE.Vector3(s * a.headRadii.x, a.mouth.y, a.headCentre.z);
}

export type { Garment };
