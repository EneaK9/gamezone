// Procedural Edo-period buildings. Each generator works in a local frame where the
// front faces +z, width runs along x and depth along z, and y = 0 is the ground.

import * as THREE from "three";
import { makeRng, type Rng } from "../core/math";
import type { MatKey } from "../render/materials";
import { addRoof, Batch, box, boxBase, cylinder, decal, trs, type RoofSpec } from "./geo";
import type { Plot } from "./layout";

export interface BuildingOut {
  /** World-space points where a warm light could hang (lanterns, doorways). */
  lights: THREE.Vector3[];
  /** Named world-space anchors (counter, door...) for NPCs and props. */
  anchors: Record<string, THREE.Vector3>;
}

export interface KatanaPlacer {
  (m: THREE.Matrix4): void;
}

class Ctx {
  readonly rng: Rng;
  readonly M: THREE.Matrix4;
  readonly out: BuildingOut = { lights: [], anchors: {} };
  constructor(
    readonly batch: Batch,
    readonly plot: Plot,
    readonly place: { katana?: KatanaPlacer; prop?: (id: string, m: THREE.Matrix4) => void },
  ) {
    this.rng = makeRng(plot.seed * 9973 + 17);
    this.M = trs(plot.x, plot.y ?? 0, plot.z, plot.face * (Math.PI / 2));
  }
  /** Box with its base centred at local (x, y, z). */
  box(mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, uv = 1.5) {
    this.batch.add(mat, boxBase(w, h, d, uv), trs(x, y, z, ry), this.M);
  }
  geo(mat: MatKey, g: THREE.BufferGeometry, m: THREE.Matrix4) {
    this.batch.add(mat, g, m, this.M);
  }
  roof(spec: RoofSpec, x: number, y: number, z: number, mats: Parameters<typeof addRoof>[3], ry = 0) {
    const m = trs(x, y, z, ry).premultiply(this.M);
    addRoof(this.batch, spec, m, mats);
  }
  world(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.M);
  }
  light(x: number, y: number, z: number) {
    this.out.lights.push(this.world(x, y, z));
  }
  anchor(name: string, x: number, y: number, z: number) {
    this.out.anchors[name] = this.world(x, y, z);
  }
  localMatrix(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
    return trs(x, y, z, ry, rx, rz, s, s, s).premultiply(this.M);
  }
  /** Ask the prop layer for a prop (umbrella, rice bale...) at a world matrix. */
  prop(id: string, m: THREE.Matrix4) {
    this.place.prop?.(id, m);
  }
}

// ——— wall pieces ————————————————————————————————————————————————————

const POST = 0.17;
const WALL_T = 0.14;

/** A wall running along local x at z = z0 (facing ±z), from x0 to x1, height h. */
function wallX(c: Ctx, x0: number, x1: number, z0: number, y0: number, h: number, infill: MatKey, opts: { base?: MatKey; baseH?: number; posts?: boolean } = {}) {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const baseH = opts.base ? opts.baseH ?? 0.9 : 0;
  if (baseH > 0) c.box(opts.base!, len, baseH, WALL_T + 0.02, cx, y0, z0);
  c.box(infill, len, h - baseH, WALL_T, cx, y0 + baseH, z0);
  if (opts.posts !== false) {
    const n = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) c.box("darkWood", POST, h, POST, x0 + (len * i) / n, y0, z0);
    c.box("darkWood", len + POST, 0.16, POST + 0.02, cx, y0 + h - 0.16, z0); // head beam
    c.box("darkWood", len + POST, 0.12, POST + 0.02, cx, y0, z0); // sill
    if (h > 2.4) c.box("darkWood", len, 0.09, POST + 0.03, cx, y0 + 1.9, z0); // nuki rail
  }
}

/** Same along local z at x = x0. */
function wallZ(c: Ctx, z0: number, z1: number, x0: number, y0: number, h: number, infill: MatKey, opts: { base?: MatKey; baseH?: number; posts?: boolean } = {}) {
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const baseH = opts.base ? opts.baseH ?? 0.9 : 0;
  if (baseH > 0) c.box(opts.base!, WALL_T + 0.02, baseH, len, x0, y0, cz);
  c.box(infill, WALL_T, h - baseH, len, x0, y0 + baseH, cz);
  if (opts.posts !== false) {
    const n = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) c.box("darkWood", POST, h, POST, x0, y0, z0 + (len * i) / n);
    c.box("darkWood", POST + 0.02, 0.16, len + POST, x0, y0 + h - 0.16, cz);
    c.box("darkWood", POST + 0.02, 0.12, len + POST, x0, y0, cz);
    if (h > 2.4) c.box("darkWood", POST + 0.03, 0.09, len, x0, y0 + 1.9, cz);
  }
}

/** Vertical koshi lattice across local x at z = z0, backed by a dark panel. */
function lattice(c: Ctx, x0: number, x1: number, z0: number, y0: number, h: number) {
  const len = x1 - x0;
  c.box("interior", len, h, 0.05, (x0 + x1) / 2, y0, z0 - 0.12);
  const n = Math.floor(len / 0.11);
  for (let i = 0; i <= n; i++) c.box("darkWood", 0.035, h, 0.06, x0 + (len * i) / n, y0, z0);
  c.box("darkWood", len, 0.07, 0.08, (x0 + x1) / 2, y0 + h * 0.33, z0);
}

/** Slatted mushiko window: dark recess with vertical plaster bars. */
function mushiko(c: Ctx, x: number, y: number, z: number, w: number, h: number) {
  c.box("interior", w, h, 0.05, x, y, z - 0.02);
  const n = Math.floor(w / 0.16);
  for (let i = 0; i <= n; i++) c.box("plaster", 0.07, h, 0.1, x - w / 2 + (w * i) / n, y, z + 0.02);
  c.box("darkWood", w + 0.12, 0.08, 0.12, x, y - 0.08, z + 0.02);
  c.box("darkWood", w + 0.12, 0.08, 0.12, x, y + h, z + 0.02);
}

function shojiPanel(c: Ctx, x: number, y: number, z: number, w: number, h: number, ry = 0) {
  c.geo("shoji", decal(w, h), c.localMatrix(x, y + h / 2, z, ry));
  c.box("darkWood", w + 0.06, 0.06, 0.06, x, y, z, ry);
  c.box("darkWood", w + 0.06, 0.06, 0.06, x, y + h - 0.06, z, ry);
}

function hangingLantern(c: Ctx, x: number, y: number, z: number, mat: MatKey = "lanternRed", scale = 1) {
  const g = new THREE.SphereGeometry(0.2 * scale, 12, 8);
  g.scale(1, 1.25, 1);
  c.geo(mat, g, c.localMatrix(x, y, z));
  c.box("black", 0.24 * scale, 0.05, 0.24 * scale, x, y + 0.22 * scale, z);
  c.box("black", 0.24 * scale, 0.05, 0.24 * scale, x, y - 0.27 * scale, z);
  c.box("black", 0.02, 0.3, 0.02, x, y + 0.26 * scale, z);
  c.light(x, y, z);
}

function noren(c: Ctx, sign: string, x: number, y: number, z: number, w: number, h = 1.05) {
  c.box("darkWood", w + 0.2, 0.05, 0.05, x, y + 0.02, z);
  const g = decal(w, h);
  c.geo(`noren_${sign}`, g, c.localMatrix(x, y - h / 2, z + 0.02));
}

function signboard(c: Ctx, sign: string, x: number, y: number, z: number, w = 2.2) {
  const h = w * (160 / 512);
  c.box("darkWood", w + 0.14, h + 0.14, 0.08, x, y - 0.07, z - 0.02);
  c.geo(`sign_${sign}`, decal(w, h), c.localMatrix(x, y + h / 2 - 0.07, z + 0.035));
}

// ——— building types ————————————————————————————————————————————————

function foundation(c: Ctx, w: number, d: number, h = 0.32) {
  c.box("stone", w + 0.3, h, d + 0.3, 0, -0.25, 0, 0, 1.2);
  return h - 0.25;
}

function machiya(c: Ctx, shopSign?: string) {
  const { w, d } = c.plot;
  const stories = c.plot.stories ?? 2;
  const y0 = foundation(c, w, d);
  const h1 = 2.9;
  const h2 = stories > 1 ? 2.25 : 0;
  const hw = w / 2;
  const hd = d / 2;
  const tileRoof = c.rng.chance(0.85);

  // Sides and back.
  wallZ(c, -hd, hd, -hw, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.1 });
  wallZ(c, -hd, hd, hw, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.1 });
  wallX(c, -hw, hw, -hd, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.1 });

  // Ground-floor front.
  const doorW = 1.8;
  const doorX = (c.rng.chance(0.5) ? -1 : 1) * (hw - doorW / 2 - 0.6);
  if (shopSign) {
    // Open storefront: dark interior, counter, goods.
    c.box("interior", w - 0.3, h1, 0.1, 0, y0, hd - 2.2);
    c.box("wood", w - 0.3, 0.12, 2.2, 0, y0, hd - 1.1, 0, 2); // floor
    c.box("interior", 0.1, h1, 2.2, -hw + 0.15, y0, hd - 1.1);
    c.box("interior", 0.1, h1, 2.2, hw - 0.15, y0, hd - 1.1);
    c.box("wood", w * 0.55, 0.95, 0.45, 0, y0, hd - 0.9, 0, 2); // counter
    c.anchor("counter", 0, y0 + 0.95, hd - 0.9);
    for (const x of [-hw, -hw / 3, hw / 3, hw]) c.box("darkWood", POST, h1, POST, x, y0, hd);
    c.box("darkWood", w + 0.2, 0.22, POST + 0.04, 0, y0 + h1 - 0.22, hd);
    noren(c, shopSign, 0, y0 + h1 - 0.25, hd + 0.08, Math.min(w * 0.6, 4.2));
  } else {
    lattice(c, -hw + 0.1, doorX - doorW / 2, hd, y0 + 0.3, 2.0);
    lattice(c, doorX + doorW / 2, hw - 0.1, hd, y0 + 0.3, 2.0);
    c.box("darkWood", w, 0.3, WALL_T + 0.04, 0, y0, hd); // plinth under lattice
    // Sliding door.
    c.box("darkWood", doorW, 2.25, 0.06, doorX, y0, hd - 0.02);
    lattice(c, doorX - doorW / 2 + 0.1, doorX + doorW / 2 - 0.1, hd + 0.03, y0 + 0.9, 1.25);
    if (c.rng.chance(0.4)) noren(c, "goods", doorX, y0 + 2.2, hd + 0.1, doorW * 0.9, 0.7);
    c.box("plaster", w, h1 - 2.3, WALL_T, 0, y0 + 2.3, hd);
    c.box("darkWood", w + 0.1, 0.16, POST + 0.04, 0, y0 + 2.3, hd);
    for (const x of [-hw, hw]) c.box("darkWood", POST, h1, POST, x, y0, hd);
  }

  // Lower roof (hisashi) over the ground floor.
  if (stories > 1) {
    c.roof(
      { w: w + 0.3, d: 2.4, overhang: 0, rise: 0.5, style: "shed", sag: 0.2, upturn: 0.05, thickness: 0.14 },
      0, y0 + h1 - 0.05, hd,
      { top: tileRoof ? "tile" : "weathered", under: "darkWood", trim: "darkWood" },
    );
    // Upper floor front: mushiko windows or shoji with a small railing.
    c.box("plaster", w, h2, WALL_T, 0, y0 + h1, hd);
    for (const x of [-hw, hw]) c.box("darkWood", POST, h2, POST, x, y0 + h1, hd);
    if (c.rng.chance(0.6)) {
      mushiko(c, -w * 0.22, y0 + h1 + 0.75, hd + 0.08, w * 0.3, 0.8);
      mushiko(c, w * 0.22, y0 + h1 + 0.75, hd + 0.08, w * 0.3, 0.8);
    } else {
      shojiPanel(c, 0, y0 + h1 + 0.6, hd + 0.08, w * 0.6, 1.2);
      c.box("darkWood", w * 0.66, 0.06, 0.4, 0, y0 + h1 + 0.55, hd + 0.25);
      c.box("darkWood", w * 0.66, 0.05, 0.05, 0, y0 + h1 + 1.05, hd + 0.42);
    }
    if (shopSign) signboard(c, shopSign, 0, y0 + h1 + 0.55, hd + 0.6, Math.min(2.6, w * 0.34));
  } else if (shopSign) {
    signboard(c, shopSign, 0, y0 + h1 + 0.1, hd + 0.12);
  }

  // Main roof, ridge parallel to the street.
  c.roof(
    { w, d, overhang: 0.75, rise: d * 0.27, style: "gable", sag: 0.28, upturn: 0.14, thickness: 0.2, ridgeCap: 0.32, gableAt: hw },
    0, y0 + h1 + h2, 0,
    { top: tileRoof ? "tile" : "weathered", gable: "plaster", ridge: tileRoof ? "tile" : "darkWood" },
  );

  // Lanterns at the door.
  if (shopSign || c.rng.chance(0.45)) {
    const lx = shopSign ? hw - 0.5 : doorX + doorW / 2 + 0.3;
    hangingLantern(c, lx, y0 + h1 - 0.7, hd + 0.55, shopSign || c.rng.chance(0.5) ? "lanternRed" : "lanternWhite");
  }
  c.anchor("door", shopSign ? 0 : doorX, y0, hd + 1);
}

function kura(c: Ctx) {
  const { w, d } = c.plot;
  const y0 = foundation(c, w, d, 0.5);
  const h = 5.2;
  const hw = w / 2;
  const hd = d / 2;
  c.box("plaster", w, h, d, 0, y0, 0, 0, 2);
  // Namako tiles on the lower walls.
  c.box("namako", w + 0.06, 1.5, d + 0.06, 0, y0, 0, 0, 1.2);
  c.box("black", w + 0.12, 0.12, d + 0.12, 0, y0 + 1.5, 0);
  // Heavy door and a small window.
  c.box("black", 1.5, 2.1, 0.2, -hw * 0.3, y0, hd);
  c.box("plaster", 1.7, 0.25, 0.3, -hw * 0.3, y0 + 2.1, hd);
  c.box("black", 0.9, 0.8, 0.14, hw * 0.35, y0 + 3.4, hd);
  c.roof(
    { w, d, overhang: 0.55, rise: d * 0.3, style: "gable", sag: 0.2, upturn: 0.1, thickness: 0.35, ridgeCap: 0.45, gableAt: hw },
    0, y0 + h, 0,
    { top: "tile", gable: "plaster", trim: "plaster" },
  );
}

function house(c: Ctx) {
  const { w, d } = c.plot;
  const y0 = foundation(c, w, d);
  const h = 2.9;
  const hw = w / 2;
  const hd = d / 2;
  const thatch = c.rng.chance(0.3);
  wallZ(c, -hd, hd, -hw, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  wallZ(c, -hd, hd, hw, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  wallX(c, -hw, hw, -hd, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  // Front: sliding shoji behind a veranda.
  c.box("darkWood", w, 0.35, WALL_T, 0, y0, hd);
  const panels = Math.floor(w / 1.8);
  for (let i = 0; i < panels; i++) {
    const x = -hw + (w / panels) * (i + 0.5);
    shojiPanel(c, x, y0 + 0.35, hd, w / panels - 0.08, 1.9);
  }
  c.box("plaster", w, h - 2.3, WALL_T, 0, y0 + 2.3, hd);
  for (let i = 0; i <= panels; i++) c.box("darkWood", POST, h, POST, -hw + (w / panels) * i, y0, hd);
  c.box("darkWood", w + 0.2, 0.16, POST + 0.04, 0, y0 + 2.28, hd);
  // Engawa veranda.
  c.box("wood", w + 0.2, 0.08, 0.9, 0, y0 + 0.25, hd + 0.5, 0, 2);
  for (const x of [-hw, 0, hw]) c.box("darkWood", 0.12, 0.3, 0.12, x, y0 - 0.05, hd + 0.9);
  c.roof(
    { w, d, overhang: thatch ? 0.9 : 0.8, rise: d * (thatch ? 0.45 : 0.3), style: thatch ? "hip" : c.rng.chance(0.5) ? "gable" : "irimoya", sag: thatch ? 0.05 : 0.3, upturn: thatch ? 0 : 0.18, thickness: thatch ? 0.45 : 0.2, ridgeCap: thatch ? 0.4 : 0.3, gableAt: hw },
    0, y0 + h, 0,
    { top: thatch ? "thatch" : "tile", gable: "plaster", ridge: thatch ? "cedar" : "tile", trim: thatch ? "thatch" : "darkWood" },
  );
  if (c.rng.chance(0.35)) hangingLantern(c, hw - 0.4, y0 + 2.1, hd + 0.75, "lanternWhite", 0.8);
  c.anchor("door", 0, y0, hd + 1.2);
}

function minka(c: Ctx) {
  const { w, d } = c.plot;
  const y0 = foundation(c, w, d, 0.4);
  const h = 2.6;
  const hw = w / 2;
  const hd = d / 2;
  wallZ(c, -hd, hd, -hw, y0, h, "weathered");
  wallZ(c, -hd, hd, hw, y0, h, "weathered");
  wallX(c, -hw, hw, -hd, y0, h, "weathered");
  wallX(c, -hw, -1.2, hd, y0, h, "weathered");
  wallX(c, 1.4, hw, hd, y0, h, "plaster", { base: "weathered", baseH: 1.1 });
  c.box("interior", 2.6, 2.2, 0.08, 0.1, y0, hd - 0.3); // open doorway
  c.box("darkWood", 2.9, 0.18, 0.2, 0.1, y0 + 2.2, hd);
  c.roof(
    { w, d, overhang: 1.1, rise: 4.4, style: "irimoya", sag: 0.06, upturn: 0.05, thickness: 0.55, ridgeCap: 0.5, tileScale: 2.5 },
    0, y0 + h, 0,
    { top: "thatch", trim: "thatch", gable: "weathered", ridge: "cedar" },
  );
  // Firewood and rice bales.
  for (let i = 0; i < 5; i++) c.box("weathered", 0.9, 0.12, 0.12, -hw - 0.45, y0 + i * 0.13, -hd + 1 + (i % 2) * 0.05, 0);
  c.prop("bale", c.localMatrix(hw + 0.8, y0, hd - 1, Math.PI / 2));
  c.prop("bale", c.localMatrix(hw + 0.8, y0 + 0.5, hd - 1.3, Math.PI / 2 + 0.2));
  c.anchor("door", 0, y0, hd + 1.4);
}

function dojo(c: Ctx) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  const floorH = 0.85;
  c.box("stone", w + 3, floorH - 0.12, d + 3, 0, -0.1, 0, 0, 1.2);
  c.box("wood", w + 2.6, 0.12, d + 2.6, 0, floorH - 0.2, 0, 0, 2); // engawa deck
  const y0 = floorH - 0.08;
  const h = 3.6;
  wallZ(c, -hd, hd, -hw, y0, h, "plaster", { base: "darkWood", baseH: 1.3 });
  wallZ(c, -hd, hd, hw, y0, h, "plaster", { base: "darkWood", baseH: 1.3 });
  wallX(c, -hw, hw, -hd, y0, h, "plaster", { base: "darkWood", baseH: 1.3 });
  // Front: sliding doors pulled open over a polished floor.
  c.box("interior", w - 0.4, h, 0.1, 0, y0, -hd + 0.2);
  c.box("cedar", w - 0.3, 0.05, d - 0.3, 0, y0, 0, 0, 2);
  // Kamidana shelf and hanging scroll at the back.
  c.box("cedar", 2.2, 0.08, 0.4, 0, y0 + 2.4, -hd + 0.35);
  c.box("clothWhite", 0.9, 1.6, 0.02, -3, y0 + 0.9, -hd + 0.32);
  const bays = 5;
  for (let i = 0; i <= bays; i++) c.box("darkWood", 0.24, h, 0.24, -hw + (w / bays) * i, y0, hd);
  for (let i = 0; i < bays; i++) {
    if (i === 2) continue;
    shojiPanel(c, -hw + (w / bays) * (i + 0.5) + (i < 2 ? 0.4 : -0.4), y0 + 0.1, hd - 0.1, (w / bays) * 0.5, 2.3);
  }
  c.box("darkWood", w + 0.3, 0.3, 0.28, 0, y0 + 2.5, hd);
  c.box("plaster", w, h - 2.8, WALL_T, 0, y0 + 2.8, hd);
  // Steps.
  for (let i = 0; i < 3; i++) c.box("stone", 3.2, 0.25, 0.45, 0, -0.1 + i * 0.25, hd + 2.3 - i * 0.4, 0, 1);
  signboard(c, "dojo", 0, y0 + h - 0.35, hd + 0.2, 2.8);
  c.roof(
    { w, d, overhang: 1.5, rise: 4.2, style: "irimoya", sag: 0.42, upturn: 0.45, thickness: 0.28, ridgeCap: 0.45 },
    0, y0 + h, 0,
    { top: "tile", gable: "darkWood" },
  );
  hangingLantern(c, -hw + 1, y0 + 2.2, hd + 1.1, "lanternWhite");
  hangingLantern(c, hw - 1, y0 + 2.2, hd + 1.1, "lanternWhite");
  c.anchor("door", 0, 0, hd + 3.4);
}

function inn(c: Ctx) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  const y0 = foundation(c, w, d, 0.4);
  const h1 = 3.1;
  const h2 = 2.7;
  wallZ(c, -hd, hd, -hw, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.2 });
  wallZ(c, -hd, hd, hw, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.2 });
  wallX(c, -hw, hw, -hd, y0, h1 + h2, "plaster", { base: "darkWood", baseH: 1.2 });
  // Ground floor: wide entrance and shoji.
  c.box("interior", 4.2, 2.5, 0.1, 0, y0, hd - 0.6);
  c.box("wood", 4.2, 0.1, 0.6, 0, y0, hd - 0.3, 0, 2);
  noren(c, "inn", 0, y0 + 2.45, hd + 0.08, 3.6, 1.1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) shojiPanel(c, side * (2.8 + i * 2.35), y0 + 0.4, hd, 2.2, 1.9);
  }
  c.box("darkWood", w, 0.4, WALL_T, 0, y0, hd);
  c.box("plaster", w, h1 - 2.4, WALL_T, 0, y0 + 2.4, hd);
  for (let i = 0; i <= 6; i++) c.box("darkWood", POST, h1 + h2, POST, -hw + (w / 6) * i, y0, hd);
  c.roof(
    { w: w + 0.3, d: 2.6, overhang: 0, rise: 0.55, style: "shed", sag: 0.3, upturn: 0.12, thickness: 0.15 },
    0, y0 + h1 - 0.05, hd,
    { top: "tile" },
  );
  // Balcony and upper shoji.
  c.box("wood", w - 0.4, 0.1, 1.0, 0, y0 + h1 + 0.35, hd + 0.5, 0, 2);
  c.box("darkWood", w - 0.4, 0.07, 0.07, 0, y0 + h1 + 1.2, hd + 0.98);
  for (let i = 0; i <= 18; i++) c.box("darkWood", 0.04, 0.8, 0.04, -hw + 0.2 + ((w - 0.4) / 18) * i, y0 + h1 + 0.42, hd + 0.98);
  for (let i = 0; i < 6; i++) shojiPanel(c, -hw + (w / 6) * (i + 0.5), y0 + h1 + 0.45, hd, w / 6 - 0.1, 1.8);
  c.box("plaster", w, h2 - 2.3, WALL_T, 0, y0 + h1 + 2.3, hd);
  signboard(c, "inn", 0, y0 + h1 + 2.0, hd + 0.3, 2.4);
  c.roof(
    { w, d, overhang: 1.0, rise: 3.6, style: "irimoya", sag: 0.35, upturn: 0.3, thickness: 0.24, ridgeCap: 0.4 },
    0, y0 + h1 + h2, 0,
    { top: "tile", gable: "darkWood" },
  );
  for (let i = 0; i < 5; i++) hangingLantern(c, -hw + 1.5 + i * ((w - 3) / 4), y0 + h1 - 0.75, hd + 1.9, "lanternRed");
  c.anchor("door", 0, y0, hd + 1.5);
}

function teahouse(c: Ctx) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  const y0 = foundation(c, w, d);
  const h = 2.9;
  wallZ(c, -hd, hd, -hw, y0, h, "plasterWarm", { base: "cedar", baseH: 1 });
  wallZ(c, -hd, hd, hw, y0, h, "plasterWarm", { base: "cedar", baseH: 1 });
  wallX(c, -hw, hw, -hd, y0, h, "plasterWarm", { base: "cedar", baseH: 1 });
  c.box("interior", w - 0.4, h, 0.1, 0, y0, hd - 2);
  c.box("cedar", w - 0.3, 0.3, 2, 0, y0, hd - 1, 0, 2); // tatami platform
  c.box("mosen", w * 0.5, 0.04, 1.2, -w * 0.2, y0 + 0.3, hd - 1.1);
  for (const x of [-hw, -hw / 2, 0, hw / 2, hw]) c.box("cedar", POST, h, POST, x, y0, hd);
  noren(c, "tea", 0, y0 + 2.35, hd + 0.08, 3.4);
  c.roof(
    { w, d, overhang: 1.1, rise: 2.8, style: "irimoya", sag: 0.4, upturn: 0.32, thickness: 0.22, ridgeCap: 0.32 },
    0, y0 + h, 0,
    { top: "tile", gable: "cedar" },
  );
  hangingLantern(c, -hw + 0.6, y0 + 2.2, hd + 0.8, "lanternRed");
  hangingLantern(c, hw - 0.6, y0 + 2.2, hd + 0.8, "lanternRed");
  // Benches with red mōsen out front and the big red umbrella.
  for (const x of [-4.2, 4.6]) {
    c.box("cedar", 2.2, 0.42, 0.7, x, 0, hd + 3.3);
    c.box("mosen", 2.25, 0.03, 0.74, x, 0.42, hd + 3.3);
  }
  c.prop("umbrella", c.localMatrix(3.2, 0, hd + 4.4));
  c.prop("umbrella", c.localMatrix(-5.5, 0, hd + 4.2));
  c.anchor("door", 0, y0, hd + 1.5);
  c.anchor("bench", 4.6, 0.42, hd + 3.3);
}

function guardpost(c: Ctx) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  const y0 = foundation(c, w, d);
  const h = 2.9;
  wallZ(c, -hd, hd, -hw, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  wallZ(c, -hd, hd, hw, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  wallX(c, -hw, hw, -hd, y0, h, "plaster", { base: "darkWood", baseH: 1.2 });
  c.box("interior", w - 0.3, h, 0.1, 0, y0, hd - 1.4);
  for (const x of [-hw, -hw / 3, hw / 3, hw]) c.box("darkWood", POST, h, POST, x, y0, hd);
  c.box("darkWood", w + 0.2, 0.22, POST + 0.04, 0, y0 + h - 0.22, hd);
  // Spear rack.
  c.box("darkWood", 2.4, 0.08, 0.1, -hw + 1.8, y0 + 1.6, hd - 0.4);
  for (let i = 0; i < 4; i++) {
    c.box("darkWood", 0.04, 2.6, 0.04, -hw + 0.9 + i * 0.6, y0, hd - 0.35);
    c.box("iron", 0.06, 0.28, 0.03, -hw + 0.9 + i * 0.6, y0 + 2.6, hd - 0.35);
  }
  c.roof(
    { w, d, overhang: 0.9, rise: 2.4, style: "irimoya", sag: 0.3, upturn: 0.22, thickness: 0.22 },
    0, y0 + h, 0,
    { top: "tile", gable: "darkWood" },
  );
  hangingLantern(c, hw - 0.5, y0 + 2.2, hd + 0.7, "lanternWhite");
}

function yatai(c: Ctx, sign: string) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  c.box("weathered", w, 0.9, d, 0, 0.12, 0, 0, 1.2);
  c.box("wood", w + 0.2, 0.06, d + 0.3, 0, 1.02, 0.05, 0, 1.2);
  for (const sx of [-1, 1]) {
    const wheel = cylinder(0.45, 0.45, 0.08, 16);
    wheel.rotateZ(Math.PI / 2);
    c.geo("darkWood", wheel, c.localMatrix(sx * (hw + 0.06), 0.45, -hd * 0.3));
  }
  for (const [px, pz] of [[-hw + 0.08, -hd + 0.08], [hw - 0.08, -hd + 0.08], [-hw + 0.08, hd - 0.08], [hw - 0.08, hd - 0.08]]) {
    c.box("weathered", 0.08, 1.35, 0.08, px, 1.05, pz);
  }
  c.roof(
    { w: w + 0.2, d: d + 0.2, overhang: 0.2, rise: 0.6, style: "gable", sag: 0.1, upturn: 0.05, thickness: 0.08, ridgeCap: 0.1 },
    0, 2.4, 0,
    { top: "weathered", gable: "weathered" },
  );
  noren(c, sign, 0, 2.38, hd + 0.18, w - 0.1, 0.55);
  hangingLantern(c, hw - 0.1, 1.95, hd + 0.3, "lanternRed", 1.1);
  // Pots and bowls on the counter.
  const pot = cylinder(0.22, 0.2, 0.32, 14);
  c.geo("iron", pot, c.localMatrix(-hw * 0.4, 1.24, -0.1));
  for (let i = 0; i < 3; i++) {
    const bowl = cylinder(0.09, 0.06, 0.07, 10);
    c.geo("black", bowl, c.localMatrix(hw * 0.2 + i * 0.22, 1.1, 0.25));
  }
  // Stools for customers.
  for (const x of [-0.7, 0.7]) c.box("weathered", 0.35, 0.5, 0.35, x, 0, hd + 0.8);
}

function shrine(c: Ctx) {
  const { w, d } = c.plot;
  const hw = w / 2;
  const hd = d / 2;
  const floorH = 1.1;
  c.box("stone", w + 1.6, floorH - 0.2, d + 1.6, 0, -0.1, 0, 0, 1.2);
  c.box("cedar", w + 1.2, 0.12, d + 1.2, 0, floorH - 0.3, 0, 0, 2);
  const y0 = floorH - 0.18;
  const h = 3.4;
  // Vermilion pillars, white walls.
  wallZ(c, -hd, hd, -hw, y0, h, "plaster", { posts: false });
  wallZ(c, -hd, hd, hw, y0, h, "plaster", { posts: false });
  wallX(c, -hw, hw, -hd, y0, h, "plaster", { posts: false });
  for (let i = 0; i <= 4; i++) {
    for (const z of [-hd, hd]) {
      const p = cylinder(0.16, 0.16, h, 10);
      c.geo("vermilion", p, c.localMatrix(-hw + (w / 4) * i, y0 + h / 2, z));
    }
  }
  for (const x of [-hw, hw]) for (const z of [-hd / 3, hd / 3]) c.geo("vermilion", cylinder(0.16, 0.16, h, 10), c.localMatrix(x, y0 + h / 2, z));
  c.box("vermilion", w + 0.3, 0.26, 0.26, 0, y0 + h - 0.3, hd);
  c.box("vermilion", w + 0.3, 0.2, 0.22, 0, y0 + 2.4, hd);
  c.box("interior", w - 0.6, h - 0.4, 0.1, 0, y0, -hd + 0.5);
  c.box("gold", 1.1, 1.2, 0.5, 0, y0, -hd + 0.9); // mirror altar
  // Shimenawa rope with shide.
  const rope = new THREE.TorusGeometry(hw * 0.95, 0.16, 8, 32, Math.PI);
  rope.rotateZ(Math.PI);
  rope.scale(1, 0.12, 1);
  c.geo("rope", rope, c.localMatrix(0, y0 + h - 0.45, hd + 0.3));
  for (let i = -3; i <= 3; i++) c.box("clothWhite", 0.12, 0.45, 0.02, i * 1.1, y0 + h - 1.05 + Math.abs(i) * 0.03, hd + 0.32);
  // Offering box and bell.
  c.box("cedar", 1.6, 0.8, 0.8, 0, 0, hd + 1.6);
  for (let i = 0; i < 8; i++) c.box("darkWood", 0.05, 0.03, 0.76, -0.7 + i * 0.2, 0.8, hd + 1.6);
  c.geo("gold", new THREE.SphereGeometry(0.2, 12, 10), c.localMatrix(0, y0 + h - 0.6, hd + 0.8));
  c.box("clothRed", 0.06, 2.0, 0.06, 0, y0 + h - 2.8, hd + 0.8);
  for (let i = 0; i < 4; i++) c.box("stone", 3.6, 0.28, 0.5, 0, -0.1 + i * 0.27, hd + 1.9 + 0.8 - i * 0.45, 0, 1);
  c.roof(
    { w, d: d + 1.4, overhang: 1.3, rise: 3.2, style: "gable", sag: 0.45, upturn: 0.3, thickness: 0.3, ridgeCap: 0.35, gableAt: hw + 0.02 },
    0, y0 + h, 0.7,
    { top: "copper", under: "cedar", trim: "cedar", gable: "plaster", ridge: "copper" },
  );
  // Chigi and katsuogi on the ridge.
  const ridgeY = y0 + h + 3.2 + 0.2;
  for (let i = -2; i <= 2; i++) c.geo("gold", cylinder(0.1, 0.1, 0.9, 8).rotateX(Math.PI / 2), c.localMatrix(i * 1.1, ridgeY + 0.15, 0.7));
  for (const sx of [-1, 1]) {
    c.box("cedar", 0.1, 1.4, 0.18, sx * (hw + 1.4), ridgeY - 0.4, 0.7, 0);
  }
  hangingLantern(c, -hw + 0.3, y0 + h - 1.1, hd + 0.5, "lanternWhite");
  hangingLantern(c, hw - 0.3, y0 + h - 1.1, hd + 0.5, "lanternWhite");
  c.anchor("door", 0, 0, hd + 3.4);
}

function pagoda(c: Ctx) {
  const tiers = 5;
  let size = c.plot.w;
  let y = 0;
  c.box("stone", size + 2.5, 1.0, size + 2.5, 0, -0.3, 0, 0, 1.2);
  for (let i = 0; i < 3; i++) c.box("stone", 3, 0.25, 0.5, 0, -0.3 + i * 0.25, (size + 2.5) / 2 + 0.9 - i * 0.4, 0, 1);
  y = 0.7;
  for (let t = 0; t < tiers; t++) {
    const h = t === 0 ? 3.2 : 2.35;
    const hs = size / 2;
    // Body: white walls between vermilion posts, with a railing on upper tiers.
    c.box("plaster", size - 0.3, h, size - 0.3, 0, y, 0, 0, 2);
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 1]) {
        c.box("vermilion", 0.22, h, 0.22, sx * (hs - 0.15), y, sz * (hs - 0.15));
        c.box("vermilion", 0.22, h, 0.22, sz * (hs - 0.15), y, sx * (hs - 0.15));
      }
    }
    c.box("vermilion", size, 0.22, size, 0, y + h - 0.35, 0);
    // Doors on the first tier.
    if (t === 0) for (const r of [0, 1, 2, 3]) c.geo("vermilion", boxBase(1.4, 2.2, 0.08), c.localMatrix(Math.sin((r * Math.PI) / 2) * (hs - 0.1), y, Math.cos((r * Math.PI) / 2) * (hs - 0.1), (r * Math.PI) / 2));
    if (t > 0) {
      c.box("darkWood", size + 0.6, 0.08, size + 0.6, 0, y + 0.1, 0);
      c.box("vermilion", size + 0.6, 0.05, 0.05, 0, y + 0.8, (size + 0.6) / 2);
      c.box("vermilion", size + 0.6, 0.05, 0.05, 0, y + 0.8, -(size + 0.6) / 2);
      c.box("vermilion", 0.05, 0.05, size + 0.6, (size + 0.6) / 2, y + 0.8, 0);
      c.box("vermilion", 0.05, 0.05, size + 0.6, -(size + 0.6) / 2, y + 0.8, 0);
    }
    // Bracket layer.
    c.box("vermilion", size + 0.35, 0.4, size + 0.35, 0, y + h - 0.1, 0);
    const overhang = 2.0 - t * 0.12;
    c.roof(
      { w: size, d: size, overhang, rise: 1.5, style: "pyramid", sag: 0.5, upturn: 0.55, thickness: 0.35, ridgeCap: 0 },
      0, y + h + 0.3, 0,
      { top: "tile", under: "vermilion", trim: "darkWood" },
    );
    y += h + 0.3 + 0.55;
    size *= 0.9;
  }
  // Sōrin spire with nine rings.
  c.geo("copper", cylinder(0.12, 0.14, 6.5, 10), c.localMatrix(0, y + 3.0, 0));
  c.geo("copper", cylinder(0.5, 0.6, 0.5, 12), c.localMatrix(0, y + 0.1, 0));
  for (let i = 0; i < 9; i++) {
    const ring = new THREE.TorusGeometry(0.42 - i * 0.015, 0.06, 6, 18);
    ring.rotateX(Math.PI / 2);
    c.geo("copper", ring, c.localMatrix(0, y + 1.0 + i * 0.42, 0));
  }
  c.geo("gold", new THREE.SphereGeometry(0.22, 12, 10), c.localMatrix(0, y + 6.4, 0));
  c.light(0, 3.2, c.plot.w / 2 + 1);
}

// ——— entry point ————————————————————————————————————————————————————

export function buildPlot(batch: Batch, plot: Plot, place: Ctx["place"]): BuildingOut {
  const c = new Ctx(batch, plot, place);
  switch (plot.kind) {
    case "machiya":
      machiya(c);
      break;
    case "shop":
      machiya(c, plot.sign);
      break;
    case "house":
      house(c);
      break;
    case "kura":
      kura(c);
      break;
    case "minka":
      minka(c);
      break;
    case "dojo":
      dojo(c);
      break;
    case "inn":
      inn(c);
      break;
    case "teahouse":
      teahouse(c);
      break;
    case "guardpost":
      guardpost(c);
      break;
    case "yatai":
      yatai(c, plot.sign ?? "noodles");
      break;
    case "shrine":
      shrine(c);
      break;
    case "pagoda":
      pagoda(c);
      break;
  }
  return c.out;
}
