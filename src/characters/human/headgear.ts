// Headgear fitted to the skull: Luffy's straw hat, conical kasa and lacquered jingasa,
// the shinobi forehead protector, headbands and cloths, Byakuya's kenseikan, and masks
// (El Primo's lucha mask, oni and kitsune) painted in the face's own UV space.

import * as THREE from "three";
import type { Look } from "../../../shared/look";
import { type Anatomy } from "./anatomy";
import { strip, type W, wMix, wOne } from "./cloth";
import { appendGeometry, band, Outfit } from "./garments";
import { SkinSurface } from "./marks";

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material };

export function buildHeadgear(o: Outfit, look: Look): Part[] {
  const g = look.headgear ?? "none";
  const out: Part[] = [];
  const a = o.a;
  const head = o.bone("head");
  const W1 = wOne(head);
  switch (g) {
    case "straw_hat":
      out.push(...strawHat(a, W1, look.headgearColor));
      break;
    case "kasa":
      out.push(conicalHat(a, W1, 0.24, 0.1, strawMaterial(look.headgearColor ?? "#b99a62"), 0.85));
      break;
    case "jingasa":
      out.push(conicalHat(a, W1, 0.2, 0.06, new THREE.MeshPhysicalMaterial({ color: look.headgearColor ?? "#141210", roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 }), 0.95));
      break;
    case "leaf_headband":
      out.push(...leafHeadband(o, a, W1));
      break;
    case "hachimaki":
      headBand(o, a, look.headgearColor ?? "#f1ede4", 0.035, true);
      break;
    case "tenugui":
    case "bandana":
      headCloth(o, a, look.headgearColor ?? (g === "tenugui" ? "#3a5a7a" : "#b3261e"));
      break;
    case "kenseikan":
      out.push(...kenseikan(a, W1));
      break;
    case "luchador_mask":
      out.push(luchaMask(a));
      break;
    case "oni_mask":
      out.push(faceMask(a, "oni"));
      break;
    case "kitsune_mask":
      out.push(faceMask(a, "kitsune"));
      break;
  }
  return out;
}

// ——— hats ————————————————————————————————————————————————————————————————————————————————

function strawTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  // Plaited straw braid in rows (6–8 mm), each row a herringbone of flat strands.
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const b = document.createElement("canvas");
  b.width = b.height = 256;
  const gb = b.getContext("2d")!;
  g.fillStyle = "#c9985a";
  g.fillRect(0, 0, 256, 256);
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, 256, 256);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y0 = (r * 256) / rows;
    const h = 256 / rows;
    for (let x = -h; x < 256 + h; x += h * 0.45) {
      for (const dir of [1, -1]) {
        const l = 170 + rnd() * 60;
        g.fillStyle = `rgb(${l},${l * 0.78},${l * 0.48})`;
        g.beginPath();
        g.moveTo(x, y0 + h / 2);
        g.lineTo(x + h * 0.45 * dir, y0 + (dir > 0 ? 0 : h));
        g.lineTo(x + h * 0.45 * dir + h * 0.22, y0 + (dir > 0 ? 0 : h));
        g.lineTo(x + h * 0.22, y0 + h / 2);
        g.fill();
        gb.fillStyle = `rgb(${150 + rnd() * 60},${150 + rnd() * 60},${150 + rnd() * 60})`;
        gb.beginPath();
        gb.moveTo(x, y0 + h / 2);
        gb.lineTo(x + h * 0.45 * dir, y0 + (dir > 0 ? 0 : h));
        gb.lineTo(x + h * 0.45 * dir + h * 0.18, y0 + (dir > 0 ? 0 : h));
        gb.lineTo(x + h * 0.18, y0 + h / 2);
        gb.fill();
      }
    }
    g.fillStyle = "rgba(60,36,16,0.55)";
    g.fillRect(0, y0, 256, 1.5);
    gb.fillStyle = "#202020";
    gb.fillRect(0, y0, 256, 2);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

let straw: ReturnType<typeof strawTexture> | null = null;
function strawMaterial(tint: string) {
  straw ??= strawTexture();
  return new THREE.MeshPhysicalMaterial({ map: straw.map, bumpMap: straw.bump, bumpScale: 1.5, color: new THREE.Color(tint).multiplyScalar(1.25), roughness: 0.85, sheen: 0.3, sheenColor: new THREE.Color("#fff0c8"), side: THREE.DoubleSide });
}

function lathe(profile: [number, number][], segments = 48): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Fit a round hat: returns the crown's inner radii and base height on this head. */
function hatFit(a: Anatomy, lift = 0) {
  const c = a.headCentre;
  const r = a.headRadii;
  const y = c.y + r.y * 0.42 + lift;
  return { at: new THREE.Vector3(c.x, y, c.z + r.z * 0.02), rx: r.x * 1.06 + 0.012, rz: r.z * 1.02 + 0.012 };
}

function strawHat(a: Anatomy, w: W, tint?: string): Part[] {
  const f = hatFit(a, 0.004);
  // Dome crown (~11 cm) and a wide flat brim (~9–10 cm) that droops at the edge.
  const R = 1;
  const crown: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    crown.push([R * Math.cos(t * Math.PI * 0.5) * (1 - 0.05 * t), 0.11 * Math.sin(t * Math.PI * 0.5) + 0.004]);
  }
  crown.reverse();
  const brimOut = 1 + 0.1 / f.rx;
  const brim: [number, number][] = [
    [R * 0.99, 0.004],
    [brimOut * 0.65 + 0.35, -0.004],
    [brimOut, -0.016],
    [brimOut + 0.01, -0.02],
  ];
  const geo = lathe([...brim.reverse(), ...crown.map(([r2, y]) => [r2, y] as [number, number])], 56);
  geo.scale(f.rx, 1, f.rz);
  // Tip it back a little.
  const m = new THREE.Matrix4().compose(f.at, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0)), new THREE.Vector3(1, 1, 1));
  const hat = bake(geo, m, w, 3);
  // Red band round the crown base.
  const bandGeo = new THREE.CylinderGeometry(1, 1, 0.034, 48, 1, true);
  bandGeo.scale(f.rx + 0.003, 1, f.rz + 0.003);
  const bandM = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.022, 0));
  const band = bake(bandGeo, bandM, w, 1);
  return [
    { geometry: hat, material: strawMaterial(tint ?? "#d9a868") },
    { geometry: band, material: new THREE.MeshPhysicalMaterial({ color: "#a81e2c", roughness: 0.7, sheen: 0.5, sheenColor: new THREE.Color("#ff8080") }) },
  ];
}

function conicalHat(a: Anatomy, w: W, radius: number, height: number, mat: THREE.Material, rise: number): Part {
  const f = hatFit(a, 0.02);
  const prof: [number, number][] = [
    [radius, -0.01],
    [radius * 0.98, -0.004],
    [radius * 0.5, height * 0.62 * rise],
    [radius * 0.08, height],
    [0.001, height + 0.006],
  ];
  const geo = lathe(prof, 40);
  const m = new THREE.Matrix4().makeTranslation(f.at.x, f.at.y - 0.012, f.at.z);
  return { geometry: bake(geo, m, w, 4), material: mat };
}

// ——— headbands ——————————————————————————————————————————————————————————————————————————————

function headRing(a: Anatomy, y: number, out: number, n = 48, tilt = 0): THREE.Vector3[] {
  const c = a.headCentre;
  const r = a.headRadii;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const z = Math.cos(ang);
    // The skull is widest here; follow it with a slight forward tilt.
    const yy = y + tilt * z;
    const k = Math.sqrt(Math.max(0.05, 1 - ((yy - c.y) / (r.y * 1.05)) ** 2));
    pts.push(new THREE.Vector3(Math.sin(ang) * (r.x * k + out), yy, c.z + z * (r.z * k + out)));
  }
  return pts;
}

function headBand(o: Outfit, a: Anatomy, color: string, width: number, knot: boolean) {
  const y = a.eye.L.y + 0.045;
  const pts = headRing(a, y, 0.006, 48, -0.012);
  const acc = o.acc({ color, fabric: "cotton" });
  const w = wOne(o.bone("head"));
  strip(acc, pts, pts.map(() => new THREE.Vector3(0, 1, 0)), pts.map((p) => p.clone().sub(a.headCentre).setY(0).normalize()), () => width, () => w, { tile: 0.1 });
  if (knot) tails(o, a, color, pts[Math.round(pts.length / 2)], 0.18, width * 0.8);
}

function tails(o: Outfit, a: Anatomy, color: string, at: THREE.Vector3, len: number, width: number) {
  const acc = o.acc({ color, fabric: "cotton" });
  appendGeometry(acc, new THREE.SphereGeometry(width * 0.5, 8, 6), new THREE.Matrix4().makeTranslation(at.x, at.y, at.z - 0.008), wOne(o.bone("head")));
  for (const s of [-1, 1]) {
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      path.push(at.clone().add(new THREE.Vector3(s * (0.012 + t * 0.03), -len * t, -0.012 - t * 0.04)));
    }
    const w = (t: number) => wMix([[wOne(o.bone("head")), 1 - t], [wOne(o.bone("neck")), t * 0.5], [wOne(o.bone("chest")), t * 0.5]]);
    strip(acc, path, path.map(() => new THREE.Vector3(1, 0, 0)), path.map(() => new THREE.Vector3(0, 0, -1)), (t) => width * (1 - t * 0.25), w, { tile: 0.1 });
  }
  void a;
}

function headCloth(o: Outfit, a: Anatomy, color: string) {
  // Cloth tied over the head: a cap over the crown, knotted at the back.
  const c = a.headCentre;
  const r = a.headRadii;
  const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  g.scale(r.x + 0.012, r.y + 0.012, r.z + 0.014);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y + 0.012, c.z - 0.004), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)), new THREE.Vector3(1, 1, 1));
  appendGeometry(o.acc({ color, fabric: "cotton" }), g, m, wOne(o.bone("head")), 0.3);
  tails(o, a, color, new THREE.Vector3(c.x, c.y + 0.02, c.z - r.z - 0.01), 0.1, 0.03);
}

function leafHeadband(o: Outfit, a: Anatomy, w: W): Part[] {
  // Black twill band just above the brows, square knot at the back with long tails;
  // a curved brushed-steel plate with the engraved leaf and four rivets.
  const y = a.eye.L.y + 0.05;
  const pts = headRing(a, y, 0.007, 56, -0.01);
  const acc = o.acc({ color: "#1b1b1a", fabric: "canvas" });
  strip(acc, pts, pts.map(() => new THREE.Vector3(0, 1, 0)), pts.map((p) => p.clone().sub(a.headCentre).setY(0).normalize()), () => 0.058, () => w, { tile: 0.08 });
  tails(o, a, "#1b1b1a", pts[Math.round(pts.length / 2)], 0.4, 0.035);
  // Plate: a slice of the band ring in front, 11 × 4.5 cm.
  const plate = new THREE.CylinderGeometry(1, 1, 0.045, 24, 1, true, -0.62, 1.24);
  const c = a.headCentre;
  const r = a.headRadii;
  const k = Math.sqrt(Math.max(0.05, 1 - ((y - c.y) / (r.y * 1.05)) ** 2));
  plate.scale(r.x * k + 0.011, 1, r.z * k + 0.011);
  const m = new THREE.Matrix4().makeTranslation(c.x, y + 0.001, c.z);
  const geo = bake(plate, m, w, 1);
  const tex = leafPlateTexture();
  const mat = new THREE.MeshPhysicalMaterial({ color: "#c3c6c8", metalness: 1, roughness: 0.38, map: tex.map, bumpMap: tex.bump, bumpScale: 3, side: THREE.DoubleSide });
  return [{ geometry: geo, material: mat }];
}

function leafPlateTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const b = document.createElement("canvas");
  b.width = 512;
  b.height = 256;
  const gb = b.getContext("2d")!;
  // Brushed steel: fine horizontal streaks.
  g.fillStyle = "#d8dadc";
  g.fillRect(0, 0, 512, 256);
  gb.fillStyle = "#ffffff";
  gb.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) {
    const y = Math.random() * 256;
    g.fillStyle = `rgba(${150 + Math.random() * 80},${150 + Math.random() * 80},${155 + Math.random() * 80},0.25)`;
    g.fillRect(0, y, 512, 1);
  }
  // The leaf: a spiral of ~1¼ turns ending in a point at lower left, a stem to upper right.
  const drawLeaf = (ctx: CanvasRenderingContext2D, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    const cx = 256;
    const cy = 128;
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const ang = t * Math.PI * 2.5;
      const rr = 8 + t * 58;
      const x = cx + Math.cos(ang) * rr;
      const yy = cy + Math.sin(ang) * rr * 0.9;
      i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.lineTo(cx - 70, cy + 70);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 40, cy - 52);
    ctx.lineTo(cx + 78, cy - 92);
    ctx.stroke();
  };
  drawLeaf(g, "#5e6266", 9);
  drawLeaf(gb, "#303030", 11);
  // Rivets, two stacked at each end.
  for (const x of [34, 478])
    for (const y of [86, 170]) {
      g.fillStyle = "#9a9ea2";
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
      const grd = gb.createRadialGradient(x, y, 0, x, y, 10);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(1, "#b0b0b0");
      gb.fillStyle = grd;
      gb.beginPath();
      gb.arc(x, y, 10, 0, Math.PI * 2);
      gb.fill();
    }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump: new THREE.CanvasTexture(b) };
}

function kenseikan(a: Anatomy, w: W): Part[] {
  // Three parallel clasps front-to-back on the crown, two small ones stacked on his right.
  const mat = new THREE.MeshPhysicalMaterial({ color: "#e6eee8", roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const out = new THREE.BufferGeometry();
  const parts: THREE.BufferGeometry[] = [];
  const c = a.headCentre;
  const r = a.headRadii;
  const clasp = (len: number, wid: number, hgt: number) => {
    const g = new THREE.CylinderGeometry(wid / 2, wid / 2, len, 6, 3);
    g.rotateX(Math.PI / 2);
    g.scale(1, hgt / wid, 1);
    // Ridges.
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const bump = 1 + 0.12 * Math.cos((z / len) * Math.PI * 6);
      pos.setX(i, pos.getX(i) * bump);
      pos.setY(i, pos.getY(i) * bump);
    }
    g.computeVertexNormals();
    return g;
  };
  for (let k = 0; k < 3; k++) {
    const g = clasp(0.1, 0.022, 0.015);
    const x = (k - 1) * 0.024;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(c.x + x, c.y + r.y * 0.97 + 0.012, c.z + 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(g);
  }
  for (let k = 0; k < 2; k++) {
    const g = clasp(0.036, 0.015, 0.012);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(c.x - r.x - 0.004, c.y + 0.035 + k * 0.02, c.z + 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.2)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const merged = mergeSimple(parts);
  void out;
  return [{ geometry: bake(merged, new THREE.Matrix4(), w, 1), material: mat }];
}

// ——— masks ———————————————————————————————————————————————————————————————————————————————————

/** The head's own surface pushed out, with texture painted in the skin UV space. */
function headShell(a: Anatomy, keep: (p: THREE.Vector3) => boolean, lift: number): THREE.BufferGeometry {
  const kit = a.kit;
  const g = kit.surfaceGeometry(a.body, "body", (x, y, z) => keep(a.pos(x)) && keep(a.pos(y)) && keep(a.pos(z)));
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * lift, pos.getY(i) + nor.getY(i) * lift, pos.getZ(i) + nor.getZ(i) * lift);
  }
  // Rigid to the head (and the jaw below the mouth).
  const si = g.getAttribute("skinIndex");
  const sw = g.getAttribute("skinWeight");
  const head = kit.boneIndex.head;
  const jaw = kit.boneIndex.jaw;
  const neck = kit.boneIndex.neck;
  for (let i = 0; i < pos.count; i++) {
    const b = si.getX(i);
    const keepJaw = b === jaw;
    const keepNeck = b === neck || kit.boneNames[b] === "chest";
    si.setXYZW(i, keepJaw ? jaw : keepNeck ? neck : head, 0, 0, 0);
    sw.setXYZW(i, 1, 0, 0, 0);
  }
  return g;
}

function luchaMask(a: Anatomy): Part {
  // Full capucha: scalp, forehead, cheeks, ears, neck sides and back. Openings: two
  // large ovals round the eyes, a nose triangle, a U over the mouth and chin.
  const s = a.H / 1.75;
  const eyes = [a.eye.L, a.eye.R];
  const noseTip = new THREE.Vector3(0, THREE.MathUtils.lerp(a.mouth.y, a.eye.L.y, 0.42), a.faceZ);
  const keep = (p: THREE.Vector3) => {
    if (p.y < a.neckY - 0.015) return false;
    for (const e of eyes) {
      const dx = (p.x - e.x) / (0.03 * s);
      const dy = (p.y - e.y - 0.002) / (0.024 * s);
      if (dx * dx + dy * dy < 1 && p.z > e.z - 0.01) return false;
    }
    // Nose triangle.
    const t = (a.eye.L.y - p.y) / (a.eye.L.y - noseTip.y + 0.004);
    if (p.z > a.faceZ - 0.035 && t > 0.15 && t < 1.15 && Math.abs(p.x) < 0.016 * s * t) return false;
    // Mouth and chin U.
    if (p.z > a.headCentre.z + 0.03 && p.y < noseTip.y - 0.008 * s && Math.abs(p.x) < 0.034 * s && p.y > a.chinY - 0.03) return false;
    return true;
  };
  const geo = headShell(a, keep, 0.0026);
  const tex = paintFace(a, 1024, (g, surf, P) => {
    g.fillStyle = "#2a6fe0";
    g.fillRect(0, 0, 1024, 1024);
    // Red wings round the eyes, sweeping up and out to the temples.
    for (const [e, side] of [
      [a.eye.L, 1],
      [a.eye.R, -1],
    ] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const rx = (0.03 + 0.022 * Math.max(0, Math.sin(ang)) + 0.012 * Math.max(0, Math.cos(ang) * side)) * s;
        const ry = (0.027 + 0.018 * Math.max(0, Math.sin(ang))) * s;
        pts.push(new THREE.Vector3(e.x + Math.cos(ang) * rx * side, e.y + Math.sin(ang) * ry, a.faceZ + 0.02));
      }
      pts.push(new THREE.Vector3(e.x + side * 0.07 * s, e.y + 0.05 * s, a.faceZ));
      const uv = surf.path(pts);
      g.fillStyle = "#d9102e";
      poly(g, uv.map(P));
      // Navy piping round the hole.
      const hole: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        hole.push(new THREE.Vector3(e.x + Math.cos(ang) * 0.031 * s, e.y + 0.002 + Math.sin(ang) * 0.025 * s, a.faceZ + 0.02));
      }
      g.strokeStyle = "#1e2356";
      g.lineWidth = 9;
      line(g, surf.path(hole).map(P));
    }
    // Gold crescent on the forehead, horns up and to the viewer's left.
    const fc = new THREE.Vector3(0, a.eye.L.y + 0.05 * s, a.faceZ + 0.02);
    const moon: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const ang = 0.3 + (i / 20) * (Math.PI * 1.6);
      moon.push(fc.clone().add(new THREE.Vector3(Math.cos(ang) * 0.032 * s, Math.sin(ang) * 0.032 * s, 0)));
    }
    for (let i = 20; i >= 0; i--) {
      const ang = 0.3 + (i / 20) * (Math.PI * 1.6);
      moon.push(fc.clone().add(new THREE.Vector3(Math.cos(ang) * 0.021 * s - 0.009 * s, Math.sin(ang) * 0.024 * s + 0.004 * s, 0)));
    }
    g.fillStyle = "#f7c31c";
    poly(g, surf.path(moon).map(P));
    // Centre seam down the forehead.
    g.strokeStyle = "#174eb0";
    g.lineWidth = 5;
    line(g, surf.path([0.12, 0.09, 0.06, 0.03].map((dy) => new THREE.Vector3(0, a.eye.L.y + dy * s, a.faceZ + 0.03))).map(P));
  });
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.38, sheen: 0.6, sheenColor: new THREE.Color("#8ab8ff"), clearcoat: 0.25 });
  return { geometry: geo, material: mat };
}

function faceMask(a: Anatomy, kind: "oni" | "kitsune"): Part {
  const s = a.H / 1.75;
  const keep = (p: THREE.Vector3) => p.z > a.headCentre.z + 0.035 && p.y > a.chinY - 0.005 && p.y < a.eye.L.y + 0.07 * s && Math.abs(p.x) < a.headRadii.x * 0.86;
  const geo = headShell(a, keep, 0.012);
  const tex = paintFace(a, 512, (g, surf, P) => {
    g.fillStyle = kind === "oni" ? "#9e1a14" : "#f3efe6";
    g.fillRect(0, 0, 512, 512);
    const col = kind === "oni" ? "#1a0a08" : "#c8281e";
    for (const e of [a.eye.L, a.eye.R]) {
      const ring: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        ring.push(new THREE.Vector3(e.x + Math.cos(ang) * 0.014 * s, e.y + Math.sin(ang) * 0.009 * s, a.faceZ + 0.03));
      }
      g.fillStyle = kind === "oni" ? "#f2d24a" : "#111";
      poly(g, surf.path(ring).map(P));
      g.strokeStyle = col;
      g.lineWidth = 6;
      line(g, surf.path([e.clone().add(new THREE.Vector3(0, 0.012 * s, 0.03)), e.clone().add(new THREE.Vector3(Math.sign(e.x) * 0.03 * s, 0.03 * s, 0.03))]).map(P));
    }
    g.strokeStyle = col;
    g.lineWidth = 8;
    line(g, surf.path([-0.025, -0.012, 0, 0.012, 0.025].map((x) => new THREE.Vector3(x * s, a.mouth.y - Math.abs(x) * 0.3, a.faceZ + 0.03))).map(P));
  });
  return { geometry: geo, material: new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide }) };
}

function paintFace(a: Anatomy, size: number, draw: (g: CanvasRenderingContext2D, surf: SkinSurface, P: (uv: [number, number]) => [number, number]) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const surf = new SkinSurface(a, (p) => p.y > a.chinY - 0.04);
  draw(g, surf, (uv) => [uv[0] * size, (1 - uv[1]) * size]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][]) {
  if (pts.length < 3) return;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.fill();
}

function line(g: CanvasRenderingContext2D, pts: [number, number][]) {
  if (pts.length < 2) return;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.stroke();
}

// ——— helpers ——————————————————————————————————————————————————————————————————————————————

/** Transform a plain geometry into a skinned one, rigid to one bone. */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4, w: W, uvScale: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const n = g.getAttribute("position").count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si.set(w.i, i * 4);
    sw.set(w.w, i * 4);
  }
  g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  const uv = g.getAttribute("uv");
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
  g.computeVertexNormals();
  return g;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ps: number[] = [];
  const ns: number[] = [];
  const us: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      ps.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      ns.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      us.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(ns, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(us, 2));
  return out;
}

void band;
