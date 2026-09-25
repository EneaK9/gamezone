// Footwear on the MakeHuman feet: straw waraji and zōri (soles with cords), wooden geta,
// boots cut from the tights guide over the foot and calf, shinobi sandals with an open
// toe, and knee-high wrestling boots.

import * as THREE from "three";
import type { Look } from "../../../shared/look";
import { SIDES, type Side } from "./anatomy";
import { cut, emit, hem, inflate, renormal, smooth, strip, type W, wOne } from "./cloth";
import { fabricTile, type Fabric } from "./fabric";
import { appendGeometry, limbBand, Outfit, shade } from "./garments";

export function buildFootwear(o: Outfit, look: Look) {
  const f = look.footwear;
  const col = look.footwearColor;
  for (const s of SIDES) {
    switch (f) {
      case "waraji":
        sole(o, s, col ?? "#c9b27c", "straw", 0.012);
        cords(o, s, "#e6dcc4", true);
        break;
      case "zori":
        sole(o, s, col ?? "#b8a070", "straw", 0.014);
        cords(o, s, "#6a4a36", false);
        break;
      case "geta":
        geta(o, s, col ?? "#8a6440");
        cords(o, s, "#7a2a22", false);
        break;
      case "boots":
        boot(o, s, col ?? "#2a2624", 0.55, "leather", false);
        break;
      case "ninja_sandals":
        boot(o, s, col ?? "#3e3a2e", 0.72, "leather", true);
        break;
      case "wrestling_boots":
        boot(o, s, col ?? "#1747a8", 0.5, "spandex", false);
        break;
    }
  }
}

function footFrame(o: Outfit, s: Side) {
  const a = o.a;
  const ankle = a.joint(`foot${s}`);
  const toes = a.joint(`toes${s}`);
  // Sole outline from the foot vertices near the ground.
  const pts: THREE.Vector3[] = [];
  const p = new THREE.Vector3();
  const reg = s === "L" ? 8 : 9;
  for (let i = 0; i < a.n; i++) {
    if (a.region[i] !== reg) continue;
    a.pos(i, p);
    if (p.y < 0.025) pts.push(p.clone());
  }
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const q of pts) {
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
  }
  return { ankle, toes, minZ, maxZ, minX, maxX, cx: (minX + maxX) / 2 };
}

function sole(o: Outfit, s: Side, color: string, fabric: Fabric, thick: number) {
  const f = footFrame(o, s);
  const len = f.maxZ - f.minZ + 0.012;
  const wid = f.maxX - f.minX + 0.008;
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1);
  // A rounded, slightly wider-at-the-toes sole.
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setX(i, pos.getX(i) * (1 + 0.18 * z));
  }
  g.computeVertexNormals();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(f.cx, thick / 2 - 0.002, (f.minZ + f.maxZ) / 2), new THREE.Quaternion(), new THREE.Vector3(wid, thick, len));
  appendGeometry(o.acc({ color, fabric }), g, m, wOne(o.bone(`foot${s}`)));
}

function cords(o: Outfit, s: Side, color: string, ankleWrap: boolean) {
  const f = footFrame(o, s);
  const acc = o.acc({ color, fabric: "cotton" });
  const w: W = wOne(o.bone(`foot${s}`));
  // Thong between the big toe and the second, splitting to both sides of the foot.
  const toe = new THREE.Vector3(f.cx + (s === "L" ? -0.012 : 0.012), 0.012, f.maxZ - 0.035);
  for (const side of [-1, 1]) {
    const end = new THREE.Vector3(side > 0 ? f.maxX + 0.002 : f.minX - 0.002, 0.012, f.maxZ - 0.09);
    const mid = toe.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.022, 0));
    const path = [toe, mid, end];
    strip(acc, path, path.map(() => new THREE.Vector3(0, 0, 1)), path.map(() => new THREE.Vector3(0, 1, 0)), () => 0.009, () => w, { tile: 0.1 });
  }
  if (ankleWrap) limbBand(o, s, "leg", 0.93, 0.97, { color, fabric: "cotton" }, 0.006);
}

function geta(o: Outfit, s: Side, color: string) {
  const f = footFrame(o, s);
  const len = f.maxZ - f.minZ + 0.01;
  const wid = f.maxX - f.minX + 0.01;
  const acc = o.acc({ color, fabric: "wood" });
  const w = wOne(o.bone(`foot${s}`));
  appendGeometry(acc, new THREE.BoxGeometry(wid, 0.018, len), new THREE.Matrix4().makeTranslation(f.cx, 0.036, (f.minZ + f.maxZ) / 2), w);
  for (const dz of [-0.3, 0.3]) appendGeometry(acc, new THREE.BoxGeometry(wid * 0.95, 0.03, 0.02), new THREE.Matrix4().makeTranslation(f.cx, 0.013, (f.minZ + f.maxZ) / 2 + dz * len), w);
}

/**
 * Boots from the tights over foot and calf. `height` is how far up the shin (0 ankle …
 * 1 knee). Shinobi sandals leave the toes open and add a strap.
 */
function boot(o: Outfit, s: Side, color: string, height: number, fabric: Fabric, openToe: boolean) {
  const a = o.a;
  const leg = s === "L" ? 6 : 7;
  const foot = s === "L" ? 8 : 9;
  const ft = footFrame(o, s);
  const knee = a.leg[s].pts[1];
  const ankle = a.leg[s].pts[2];
  const topY = THREE.MathUtils.lerp(ankle.y, knee.y, height);
  const field = (i: number) => {
    const r = a.region[i];
    const p = a.pos(i);
    if (r === foot) return openToe ? ft.maxZ - 0.045 - p.z : 1;
    if (r === leg) return topY - p.y;
    return -1;
  };
  const sh = cut(a, "tights", field);
  smooth(sh, 2, 0.5);
  inflate(sh, fabric === "spandex" ? 0.006 : 0.008);
  renormal(sh);
  const cl = { color, fabric };
  const acc = o.acc(cl);
  emit(acc, a, sh, { tile: fabricTile(fabric) });
  hem(acc, a, sh, 0.005, { tile: fabricTile(fabric) });
  o.cover((i) => {
    const r = a.region[i];
    const p = a.pos(i);
    if (r === foot) return openToe ? ft.maxZ - 0.06 - p.z : 1;
    if (r === leg) return topY - 0.02 - p.y;
    return -1;
  });
  // Thick sole with a darker edge.
  const len = ft.maxZ - ft.minZ + 0.016;
  const wid = ft.maxX - ft.minX + 0.012;
  appendGeometry(o.acc({ color: shade(color, 0.55), fabric: "leather" }), new THREE.BoxGeometry(wid, 0.018, len, 2, 1, 3), new THREE.Matrix4().makeTranslation(ft.cx, 0.006, (ft.minZ + ft.maxZ) / 2), wOne(o.bone(`foot${s}`)));
  if (openToe) {
    const w = wOne(o.bone(`toes${s}`));
    const y = 0.02;
    const path = [new THREE.Vector3(ft.minX - 0.003, y, ft.maxZ - 0.05), new THREE.Vector3(ft.cx, y + 0.02, ft.maxZ - 0.045), new THREE.Vector3(ft.maxX + 0.003, y, ft.maxZ - 0.05)];
    strip(acc, path, path.map(() => new THREE.Vector3(0, 0, 1)), path.map(() => new THREE.Vector3(0, 1, 0.3).normalize()), () => 0.02, () => w, { tile: fabricTile(fabric) });
  }
}
