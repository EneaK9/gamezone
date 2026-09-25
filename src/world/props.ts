// Street furniture and landmarks: walls & gates, bridges, pier, stepping stones,
// embankments, the torii tunnel, stone lanterns, lantern strings, the well, the notice
// board, the dojo yard, the bandit camp, statues and boats.

import * as THREE from "three";
import type { Assets, ModelId } from "../core/assets";
import { makeRng, type Rng } from "../core/math";
import type { CollisionWorld } from "./collision";
import { Batch, box, boxBase, cylinder, trs } from "./geo";
import type { HeightGrid } from "./heightfield";
import {
  BANDIT_CAMP,
  BRIDGES,
  DOJO_YARD,
  PADDIES,
  PIER,
  RIVER,
  ROADS,
  SQUARE,
  STEPPING_STONES,
  TORII_COUNT,
  TORII_PATH_START,
  TORII_SPACING,
  VILLAGE_GROUND,
  WALLS,
  riverQuery,
} from "./layout";

export interface PropsOut {
  lights: THREE.Vector3[];
  /** Fires that flicker (forge, camp). */
  fires: THREE.Vector3[];
  noticeBoard: THREE.Vector3;
  chest: THREE.Vector3;
  well: THREE.Vector3;
  /** Where Isamu's charm glints in the shallows. */
  charmSpot: THREE.Vector3;
  /** Sitting spots for NPCs. */
  benches: THREE.Vector3[];
}

type ModelPlacer = (id: ModelId, m: THREE.Matrix4) => void;

export class PropBuilder {
  readonly out: PropsOut = {
    lights: [],
    fires: [],
    noticeBoard: new THREE.Vector3(),
    chest: new THREE.Vector3(),
    well: new THREE.Vector3(),
    charmSpot: new THREE.Vector3(),
    benches: [],
  };
  private rng: Rng = makeRng(555);

  constructor(
    private batch: Batch,
    private collision: CollisionWorld,
    private grid: HeightGrid,
    private assets: Assets,
    private placeModel: ModelPlacer,
  ) {}

  private h(x: number, z: number) {
    return this.grid.height(x, z);
  }

  private addBox(mat: Parameters<Batch["add"]>[0], w: number, h: number, d: number, m: THREE.Matrix4, uv = 1.5) {
    this.batch.add(mat, boxBase(w, h, d, uv), m);
  }

  buildAll() {
    this.walls();
    this.bridges();
    this.pier();
    this.steppingStones();
    this.embankment();
    this.toriiPath();
    this.lanterns();
    this.square();
    this.lanternStrings();
    this.dojoYard();
    this.banditCamp();
    this.shrineDetails();
    this.countryside();
    this.forge();
    this.boats();
    return this.out;
  }

  // ——— walls and gates ————————————————————————————————————————————

  private walls() {
    for (const w of WALLS) {
      const [ax, az] = w.a;
      const [bx, bz] = w.b;
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const yaw = Math.atan2(dx, dz) - Math.PI / 2;
      // Split into runs around the gates.
      const cuts: [number, number][] = [];
      let start = 0;
      for (const g of w.gates) {
        cuts.push([start, g.at - g.width / 2]);
        start = g.at + g.width / 2;
        this.gate(ax + dx * g.at, az + dz * g.at, yaw, g.width);
      }
      cuts.push([start, len]);
      for (const [s0, s1] of cuts) {
        const runLen = s1 - s0;
        const n = Math.ceil(runLen / 1.8);
        for (let i = 0; i < n; i++) {
          const t0 = s0 + (runLen * i) / n;
          const t1 = s0 + (runLen * (i + 1)) / n;
          const mx = ax + dx * (t0 + t1) / 2;
          const mz = az + dz * (t0 + t1) / 2;
          const y = this.h(mx, mz);
          const segLen = t1 - t0 + 0.02;
          this.addBox("weathered", segLen, 2.2, 0.1, trs(mx, y - 0.1, mz, yaw), 1.8);
          this.addBox("darkWood", 0.16, 2.5, 0.16, trs(ax + dx * t0, this.h(ax + dx * t0, az + dz * t0) - 0.1, az + dz * t0, yaw));
          this.addBox("darkWood", segLen, 0.1, 0.2, trs(mx, y + 1.1, mz, yaw));
          // Little tiled cap.
          const cap = box(segLen + 0.04, 0.08, 0.62, 1.5);
          this.batch.add("tile", cap, trs(mx, y + 2.45, mz, yaw, 0, 0));
          this.addBox("darkWood", segLen, 0.08, 0.3, trs(mx, y + 2.3, mz, yaw));
        }
        const c0x = ax + dx * s0;
        const c0z = az + dz * s0;
        const c1x = ax + dx * s1;
        const c1z = az + dz * s1;
        this.collision.addOrientedBox((c0x + c1x) / 2, (c0z + c1z) / 2, runLen / 2, 0.2, -yaw, this.h(c0x, c0z) + 2.4);
      }
    }
    // Watchtower beside the west gate.
    this.yagura(-152, -9);
  }

  private gate(x: number, z: number, yaw: number, width: number) {
    const y = this.h(x, z);
    const M = trs(x, y, z, yaw);
    const put = (mat: Parameters<Batch["add"]>[0], w: number, h: number, d: number, lx: number, ly: number, lz: number) =>
      this.batch.add(mat, boxBase(w, h, d), trs(lx, ly, lz), M);
    for (const s of [-1, 1]) {
      put("darkWood", 0.42, 3.9, 0.42, (s * width) / 2, -0.1, 0);
      put("darkWood", 0.26, 3.2, 0.26, (s * width) / 2, -0.1, -1.1);
      // Door leaves swung open inward.
      const leaf = boxBase(width / 2 - 0.3, 3.0, 0.12);
      leaf.translate(-(width / 2 - 0.3) / 2, 0, 0);
      this.batch.add("weathered", leaf, trs((s * width) / 2 - s * 0.2, 0, -0.3, s > 0 ? -1.2 : Math.PI + 1.2), M);
    }
    put("darkWood", width + 1.4, 0.4, 0.4, 0, 3.6, 0);
    put("darkWood", width + 0.6, 0.25, 0.3, 0, 2.9, 0);
    const r = boxBase(width + 2.4, 0.18, 2.6);
    this.batch.add("tile", r, trs(0, 4.1, -0.4, 0, 0.18, 0), M);
    const r2 = boxBase(width + 2.4, 0.18, 2.6);
    this.batch.add("tile", r2, trs(0, 4.1, 0.4, 0, -0.18, 0), M);
    put("tile", width + 2.6, 0.3, 0.4, 0, 4.45, 0);
    for (const s of [-1, 1]) {
      this.collision.addCircle({ x: x + Math.cos(yaw) * ((s * width) / 2), z: z - Math.sin(yaw) * ((s * width) / 2), r: 0.35, top: y + 4 });
    }
    this.hangLantern(new THREE.Vector3(width / 2 - 0.3, 2.5, 0.5).applyMatrix4(M), "lanternWhite");
    this.hangLantern(new THREE.Vector3(-width / 2 + 0.3, 2.5, 0.5).applyMatrix4(M), "lanternWhite");
  }

  private yagura(x: number, z: number) {
    const y = this.h(x, z);
    const legH = 7;
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      this.addBox("darkWood", 0.24, legH, 0.24, trs(x + lx, y - 0.1, z + lz));
    }
    for (const hh of [2.4, 4.8]) {
      this.addBox("darkWood", 3.1, 0.12, 0.12, trs(x, y + hh, z - 1.4));
      this.addBox("darkWood", 3.1, 0.12, 0.12, trs(x, y + hh, z + 1.4));
    }
    this.addBox("weathered", 3.6, 0.15, 3.6, trs(x, y + legH, z), 1.8);
    this.addBox("weathered", 3.6, 1.1, 0.08, trs(x, y + legH, z - 1.78));
    this.addBox("weathered", 3.6, 1.1, 0.08, trs(x, y + legH, z + 1.78));
    this.addBox("weathered", 0.08, 1.1, 3.6, trs(x - 1.78, y + legH, z));
    for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) this.addBox("darkWood", 0.12, 2.2, 0.12, trs(x + px, y + legH, z + pz));
    const roofGeo = new THREE.ConeGeometry(3.4, 1.5, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    this.batch.add("tile", roofGeo, trs(x, y + legH + 2.9, z));
    this.collision.addBox({ x0: x - 1.6, z0: z - 1.6, x1: x + 1.6, z1: z + 1.6, top: y + 8 });
    this.hangLantern(new THREE.Vector3(x + 1.7, y + legH + 1.2, z + 1.7), "lanternRed");
  }

  // ——— bridges, pier, stepping stones, embankment ————————————————

  private bridges() {
    for (const b of BRIDGES) {
      const len = Math.hypot(b.x1 - b.x0, b.z1 - b.z0);
      const dx = (b.x1 - b.x0) / len;
      const dz = (b.z1 - b.z0) / len;
      const yaw = Math.atan2(dx, dz);
      const y0 = this.h(b.x0, b.z0) + 0.05;
      const y1 = this.h(b.x1, b.z1) + 0.05;
      const deckY = (u: number) => y0 + (y1 - y0) * u + b.arch * Math.sin(Math.PI * u);
      const wood = b.red ? "vermilion" : "weathered";
      const deckMat = b.red ? "cedar" : "weathered";
      const steps = Math.ceil(len / 0.5);
      for (let i = 0; i < steps; i++) {
        const u0 = i / steps;
        const u1 = (i + 1) / steps;
        const ya = deckY(u0);
        const yb = deckY(u1);
        const mx = b.x0 + dx * len * (u0 + u1) / 2;
        const mz = b.z0 + dz * len * (u0 + u1) / 2;
        const pitch = Math.atan2(yb - ya, len / steps);
        const m = trs(mx, (ya + yb) / 2 - 0.12, mz, yaw, -pitch);
        this.batch.add(deckMat, box(b.width, 0.16, len / steps + 0.03, 1.2), m);
        // Side beams.
        for (const s of [-1, 1]) {
          const side = new THREE.Vector3(Math.cos(yaw) * (s * b.width) / 2, 0, -Math.sin(yaw) * (s * b.width) / 2);
          this.batch.add(wood, box(0.16, 0.34, len / steps + 0.03), trs(mx + side.x, (ya + yb) / 2 - 0.2, mz + side.z, yaw, -pitch));
          // Railing top.
          this.batch.add(wood, box(0.1, 0.1, len / steps + 0.03), trs(mx + side.x, (ya + yb) / 2 + 0.9, mz + side.z, yaw, -pitch));
          this.batch.add(wood, box(0.06, 0.06, len / steps + 0.03), trs(mx + side.x, (ya + yb) / 2 + 0.45, mz + side.z, yaw, -pitch));
          if (i % 4 === 0) {
            this.batch.add(wood, boxBase(0.14, 1.0, 0.14), trs(b.x0 + dx * len * u0 + side.x, ya - 0.05, b.z0 + dz * len * u0 + side.z, yaw));
            if (b.red && (i % 16 === 0)) {
              this.batch.add("gold", new THREE.SphereGeometry(0.12, 10, 8), trs(b.x0 + dx * len * u0 + side.x, ya + 1.12, b.z0 + dz * len * u0 + side.z));
            }
          }
        }
      }
      // Piers under the deck, standing in the river.
      for (const u of [0.28, 0.5, 0.72]) {
        const px = b.x0 + dx * len * u;
        const pz = b.z0 + dz * len * u;
        const top = deckY(u) - 0.25;
        const bot = this.h(px, pz) - 0.3;
        for (const s of [-1, 1]) {
          const sx = Math.cos(yaw) * (s * b.width) / 2.6;
          const sz = -Math.sin(yaw) * (s * b.width) / 2.6;
          this.batch.add("darkWood", cylinder(0.14, 0.16, top - bot, 8), trs(px + sx, (top + bot) / 2, pz + sz));
        }
        this.batch.add("darkWood", box(b.width + 0.6, 0.2, 0.3), trs(px, top - 0.2, pz, yaw));
      }
      // Walkable deck and railings.
      const hw = b.width / 2;
      this.collision.decks.push({
        height: (x, z) => {
          const lx = (x - b.x0) * dx + (z - b.z0) * dz;
          const lz = -(x - b.x0) * dz + (z - b.z0) * dx;
          if (lx < -0.5 || lx > len + 0.5 || Math.abs(lz) > hw + 0.1) return null;
          return deckY(Math.min(1, Math.max(0, lx / len)));
        },
      });
      for (const s of [-1, 1]) {
        const cx = (b.x0 + b.x1) / 2 + Math.cos(yaw) * s * (hw + 0.05);
        const cz = (b.z0 + b.z1) / 2 - Math.sin(yaw) * s * (hw + 0.05);
        this.collision.addOrientedBox(cx, cz, 0.12, len / 2 - 1.5, -yaw, Math.max(y0, y1) + b.arch + 1.2);
      }
      if (b.red) {
        for (const u of [0.02, 0.98]) {
          for (const s of [-1, 1]) {
            const x = b.x0 + dx * len * u + Math.cos(yaw) * s * (hw + 0.8);
            const z = b.z0 + dz * len * u - Math.sin(yaw) * s * (hw + 0.8);
            this.stoneLantern(x, z);
          }
        }
      }
    }
  }

  private pier() {
    const y = 0.55;
    const len = PIER.x1 - PIER.x0;
    this.batch.add("weathered", box(len, 0.14, PIER.width, 1.2), trs((PIER.x0 + PIER.x1) / 2, y - 0.07, PIER.z));
    for (let i = 0; i <= 4; i++) {
      const x = PIER.x0 + (len * i) / 4;
      for (const s of [-1, 1]) {
        const bot = this.h(x, PIER.z + s) - 0.2;
        this.batch.add("darkWood", cylinder(0.1, 0.12, y - bot + 0.3, 8), trs(x, (y + bot) / 2 + 0.1, PIER.z + (s * PIER.width) / 2));
      }
    }
    this.collision.decks.push({
      height: (x, z) => (x >= PIER.x0 - 0.3 && x <= PIER.x1 + 0.1 && Math.abs(z - PIER.z) <= PIER.width / 2 + 0.05 ? y : null),
    });
    this.placeModel("wooden_bucket_01", trs(PIER.x1 - 1.2, y, PIER.z - 0.7, 0.4));
    this.placeModel("barrel_03", trs(PIER.x0 + 1, y, PIER.z + 0.8, 0));
  }

  private steppingStones() {
    const rng = this.rng;
    for (const [x, z] of STEPPING_STONES) {
      const g = rockGeometry(rng, 0.75, 0.45);
      this.batch.add("stone", g, trs(x, 0.08, z, rng.range(0, 6.28)));
      this.collision.decks.push({ height: (px, pz) => (Math.hypot(px - x, pz - z) < 0.8 ? 0.38 : null) });
    }
    // Where Isamu's lucky charm lies in the shallows.
    this.out.charmSpot.set(61.5, 0.05, -119.4);
  }

  private embankment() {
    // Stone wall along the west bank inside the village.
    let prev: THREE.Vector3 | null = null;
    for (const s of RIVER) {
      if (s.z < -114 || s.z > 110) continue;
      let nx = -s.dz;
      let nz = s.dx;
      if (nx > 0) {
        nx = -nx;
        nz = -nz;
      }
      const p = new THREE.Vector3(s.x + nx * (s.hw + 0.35), 0, s.z + nz * (s.hw + 0.35));
      if (prev) {
        const len = p.distanceTo(prev);
        const mid = p.clone().add(prev).multiplyScalar(0.5);
        const yaw = Math.atan2(p.x - prev.x, p.z - prev.z);
        this.batch.add("stone", boxBase(0.9, VILLAGE_GROUND + 1.9, len + 0.05, 1.3), trs(mid.x, -1.9, mid.z, yaw, 0, 0.06));
        this.batch.add("stone", boxBase(1.1, 0.18, len + 0.05, 1.0), trs(mid.x - nx * 0.1, VILLAGE_GROUND - 0.02, mid.z - nz * 0.1, yaw));
      }
      prev = p;
    }
  }

  // ——— shrine path ————————————————————————————————————————————————

  private toriiPath() {
    const road = ROADS[7];
    const pts = road.pts;
    // Walk the path by distance.
    const at = (dist: number) => {
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        if (acc + l >= dist) {
          const t = (dist - acc) / l;
          return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) };
        }
        acc += l;
      }
      const [lx, lz] = pts[pts.length - 1];
      return { x: lx, z: lz, yaw: 0 };
    };
    // Grand torii where the path leaves the bridge.
    const g = at(6);
    this.torii(g.x, g.z, g.yaw, 4.6, 5.4);
    for (let i = 0; i < TORII_COUNT; i++) {
      const p = at(TORII_PATH_START + i * TORII_SPACING);
      this.torii(p.x, p.z, p.yaw, 3.3, 3.5);
    }
    for (let d = 10; d < 78; d += 14) {
      const p = at(d);
      const sx = Math.cos(p.yaw) * 3.2;
      const sz = -Math.sin(p.yaw) * 3.2;
      this.stoneLantern(p.x + sx, p.z + sz, 0.9);
      this.stoneLantern(p.x - sx, p.z - sz, 0.9);
    }
    this.jizo(g.x + 3.5, g.z + 2.2, g.yaw);
  }

  private torii(x: number, z: number, yaw: number, width: number, height: number) {
    const y = this.h(x, z);
    const M = trs(x, y, z, yaw + Math.PI / 2);
    const r = height * 0.047;
    for (const s of [-1, 1]) {
      this.batch.add("vermilion", cylinder(r * 0.9, r, height, 10), trs((s * width) / 2, height / 2 - 0.1, 0), M);
      this.batch.add("black", cylinder(r * 1.25, r * 1.3, 0.5, 10), trs((s * width) / 2, 0.15, 0), M);
      this.collision.addCircle({ x: x + Math.cos(yaw + Math.PI / 2) * ((s * width) / 2), z: z - Math.sin(yaw + Math.PI / 2) * ((s * width) / 2), r: r + 0.1, top: y + height });
    }
    // Nuki (tie beam) and kasagi (top lintel, upswept).
    this.batch.add("vermilion", box(width + 0.8, r * 1.4, r * 1.2), trs(0, height * 0.76, 0), M);
    const kasagi = box(width + 1.6, r * 1.6, r * 1.8, 1);
    const kp = kasagi.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < kp.count; i++) {
      const lx = kp.getX(i) / ((width + 1.6) / 2);
      kp.setY(i, kp.getY(i) + Math.pow(Math.abs(lx), 3) * height * 0.05);
    }
    kasagi.computeVertexNormals();
    this.batch.add("vermilion", kasagi, trs(0, height * 0.97, 0), M);
    const cap = box(width + 1.75, r * 0.7, r * 2.0, 1);
    const cp = cap.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const lx = cp.getX(i) / ((width + 1.75) / 2);
      cp.setY(i, cp.getY(i) + Math.pow(Math.abs(lx), 3) * height * 0.06);
    }
    cap.computeVertexNormals();
    this.batch.add("black", cap, trs(0, height * 0.97 + r * 1.1, 0), M);
    this.batch.add("vermilion", box(r * 1.1, height * 0.2, r), trs(0, height * 0.83, 0), M);
  }

  // ——— lanterns ————————————————————————————————————————————————————

  stoneLantern(x: number, z: number, scale = 1) {
    const y = this.h(x, z);
    const M = trs(x, y, z, 0, 0, 0, scale, scale, scale);
    const put = (mat: Parameters<Batch["add"]>[0], g: THREE.BufferGeometry, ly: number) => this.batch.add(mat, g, trs(0, ly, 0), M);
    put("stone", cylinder(0.34, 0.4, 0.22, 8, 1), 0.08);
    put("stone", cylinder(0.12, 0.14, 0.9, 8, 1), 0.6);
    put("stone", cylinder(0.3, 0.24, 0.16, 6, 1), 1.1);
    put("stone", boxBase(0.44, 0.36, 0.44, 1), 1.18);
    put("lanternWhite", boxBase(0.3, 0.26, 0.46, 1), 1.23);
    put("lanternWhite", boxBase(0.46, 0.26, 0.3, 1), 1.23);
    const roofG = new THREE.ConeGeometry(0.46, 0.34, 6, 1);
    put("stone", roofG, 1.72);
    put("stone", new THREE.SphereGeometry(0.08, 8, 6), 1.93);
    this.collision.addCircle({ x, z, r: 0.35 * scale, top: y + 2 * scale });
    this.out.lights.push(new THREE.Vector3(x, y + 1.35 * scale, z));
  }

  private hangLantern(p: THREE.Vector3, mat: "lanternRed" | "lanternWhite" = "lanternRed", s = 1) {
    const g = new THREE.SphereGeometry(0.22 * s, 12, 8);
    g.scale(1, 1.3, 1);
    this.batch.add(mat, g, trs(p.x, p.y, p.z));
    this.batch.add("black", box(0.26 * s, 0.06, 0.26 * s), trs(p.x, p.y + 0.28 * s, p.z));
    this.batch.add("black", box(0.26 * s, 0.06, 0.26 * s), trs(p.x, p.y - 0.28 * s, p.z));
    this.out.lights.push(p.clone());
  }

  private lanterns() {
    // Along the main street, alternating sides.
    let i = 0;
    for (let x = -150; x < 40; x += 17) {
      if (x > SQUARE.x0 - 2 && x < SQUARE.x1 + 2) continue;
      const side = i++ % 2 === 0 ? -1 : 1;
      this.stoneLantern(x, side * 4.7);
    }
    for (const [x, z] of [[-58, -14], [-22, -14], [-58, 14], [-22, 14], [-45, 66], [-35, 66], [-44, -69], [-36, -69], [-22, 72]]) {
      this.stoneLantern(x, z);
    }
    // Along the riverside lane.
    for (let z = -60; z <= 100; z += 20) this.stoneLantern(43.5, z + 5);
  }

  private lanternStrings() {
    const xs = [-132, -118, -104, -90, -76, -62, -14, 2, 18, 32];
    for (const x of xs) {
      const a = new THREE.Vector3(x, VILLAGE_GROUND + 5.1, -5.6);
      const b = new THREE.Vector3(x + 1.5, VILLAGE_GROUND + 5.1, 5.6);
      this.catenary(a, b, 0.9, 6);
    }
    // Around the square.
    const c = SQUARE;
    const y = VILLAGE_GROUND + 5;
    this.catenary(new THREE.Vector3(c.x0 + 2, y, c.z0), new THREE.Vector3(-40, y + 0.6, 0), 0.7, 5);
    this.catenary(new THREE.Vector3(c.x1 - 2, y, c.z0), new THREE.Vector3(-40, y + 0.6, 0), 0.7, 5);
    this.catenary(new THREE.Vector3(c.x0 + 2, y, c.z1), new THREE.Vector3(-40, y + 0.6, 0), 0.7, 5);
    this.catenary(new THREE.Vector3(c.x1 - 2, y, c.z1), new THREE.Vector3(-40, y + 0.6, 0), 0.7, 5);
    // A pole in the middle of the square to hold them.
    this.batch.add("darkWood", cylinder(0.12, 0.16, 7.2, 8), trs(-40, VILLAGE_GROUND + 3.4, 0));
  }

  private catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, count: number) {
    const pts: THREE.Vector3[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const len = p0.distanceTo(p1);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const g = cylinder(0.012, 0.012, len, 4);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
      this.batch.add("rope", g, m);
    }
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const idx = t * n;
      const p = pts[Math.floor(idx)].clone().lerp(pts[Math.min(n, Math.floor(idx) + 1)], idx % 1);
      p.y -= 0.4;
      this.hangLantern(p, k % 2 === 0 ? "lanternWhite" : "lanternRed", 0.85);
    }
  }

  // ——— the square ——————————————————————————————————————————————————

  private square() {
    const y = VILLAGE_GROUND;
    // Paving.
    const w = SQUARE.x1 - SQUARE.x0;
    const d = SQUARE.z1 - SQUARE.z0;
    this.batch.add("paving", box(w, 0.08, d, 2.4), trs(-40, y - 0.02, 0));
    // Well.
    const wx = -40;
    const wz = 5;
    this.out.well.set(wx, y, wz);
    this.batch.add("stone", cylinder(0.95, 1.0, 0.85, 16, 1.2, false), trs(wx, y + 0.42, wz));
    this.batch.add("interior", cylinder(0.78, 0.78, 0.02, 14), trs(wx, y + 0.83, wz));
    for (const s of [-1, 1]) this.batch.add("darkWood", boxBase(0.14, 2.3, 0.14), trs(wx + s * 0.95, y, wz));
    this.batch.add("darkWood", box(2.2, 0.14, 0.14), trs(wx, y + 2.25, wz));
    this.batch.add("darkWood", cylinder(0.08, 0.08, 0.2, 10).rotateZ(Math.PI / 2), trs(wx, y + 2.05, wz));
    this.batch.add("tile", box(2.6, 0.08, 1.2), trs(wx, y + 2.55, wz - 0.45, 0, 0.38));
    this.batch.add("tile", box(2.6, 0.08, 1.2), trs(wx, y + 2.55, wz + 0.45, 0, -0.38));
    this.placeModel("wooden_bucket_01", trs(wx + 0.6, y + 0.85, wz + 0.3));
    this.collision.addCircle({ x: wx, z: wz, r: 1.15, top: y + 2.6 });
    // Notice board.
    const nx = -47;
    const nz = -11.5;
    this.out.noticeBoard.set(nx, y, nz);
    for (const s of [-1, 1]) this.batch.add("darkWood", boxBase(0.14, 2.4, 0.14), trs(nx + s * 1.1, y, nz));
    this.batch.add("weathered", boxBase(2.4, 1.2, 0.08), trs(nx, y + 1.0, nz));
    for (let i = 0; i < 5; i++) {
      this.batch.add("clothWhite", boxBase(0.36, 0.5, 0.01), trs(nx - 0.9 + i * 0.45, y + 1.35 + (i % 2) * 0.1, nz + 0.05, 0, 0, (i % 3 - 1) * 0.05));
    }
    this.batch.add("tile", box(2.9, 0.07, 0.8), trs(nx, y + 2.5, nz - 0.2, 0, 0.35));
    this.batch.add("tile", box(2.9, 0.07, 0.8), trs(nx, y + 2.5, nz + 0.2, 0, -0.35));
    this.collision.addBox({ x0: nx - 1.3, z0: nz - 0.3, x1: nx + 1.3, z1: nz + 0.3, top: y + 2.6 });
    // Benches.
    for (const [bx, bz, yaw] of [[-50, 10.5, 0], [-30, -9.5, 0], [-54, -4, Math.PI / 2]] as const) {
      this.batch.add("cedar", boxBase(1.8, 0.45, 0.5), trs(bx, y, bz, yaw));
      this.collision.addOrientedBox(bx, bz, 0.9, 0.25, -yaw, y + 0.45);
      this.out.benches.push(new THREE.Vector3(bx, y + 0.45, bz));
    }
    // Fire buckets (tenbōsui-oke) stacked by the square.
    this.fireBuckets(-24.5, 12);
    this.fireBuckets(-57.5, -12);
    // Crates and barrels by the shops.
    const junk: [ModelId, number, number, number][] = [
      ["wooden_crate_01", -79, -5.3, 0.3],
      ["barrel_03", -93.5, -5.5, 0],
      ["wooden_crate_01", -65.6, 5.4, -0.2],
      ["barrel_03", -3.4, 5.4, 0],
      ["wooden_crate_01", 11, 5.6, 0.5],
      ["barrel_03", 10.2, 5.2, 0],
      ["wooden_crate_01", -17.8, -5.4, 0.1],
    ];
    for (const [id, x, z, yaw] of junk) {
      this.placeModel(id, trs(x, y, z, yaw));
      this.collision.addCircle({ x, z, r: 0.5, top: y + 0.8 });
    }
  }

  private fireBuckets(x: number, z: number) {
    const y = VILLAGE_GROUND;
    this.batch.add("darkWood", boxBase(1.1, 0.5, 0.7), trs(x, y, z));
    const rows = [3, 2, 1];
    let level = 0;
    for (const n of rows) {
      for (let i = 0; i < n; i++) {
        const bx = x + (i - (n - 1) / 2) * 0.34;
        this.batch.add("clothRed", cylinder(0.16, 0.13, 0.3, 10), trs(bx, y + 0.65 + level * 0.3, z));
      }
      level++;
    }
    this.collision.addCircle({ x, z, r: 0.6, top: y + 1.5 });
  }

  // ——— dojo yard ——————————————————————————————————————————————————————

  private dojoYard() {
    const r = DOJO_YARD;
    const y = VILLAGE_GROUND;
    const gateW = 4.4;
    const segs: [number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0],
      [r.x0, r.z0, r.x0, r.z1],
      [r.x1, r.z0, r.x1, r.z1],
      [r.x0, r.z1, -40 - gateW / 2, r.z1],
      [-40 + gateW / 2, r.z1, r.x1, r.z1],
    ];
    for (const [ax, az, bx, bz] of segs) {
      const len = Math.hypot(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const yaw = Math.atan2(bx - ax, bz - az);
      this.batch.add("plasterWarm", boxBase(0.5, 2.1, len), trs(mx, y - 0.1, mz, yaw), undefined);
      this.batch.add("darkWood", boxBase(0.56, 0.12, len), trs(mx, y + 1.95, mz, yaw));
      this.batch.add("tile", box(0.95, 0.08, len + 0.1), trs(mx, y + 2.18, mz, yaw));
      this.batch.add("tile", box(0.2, 0.18, len + 0.1), trs(mx, y + 2.28, mz, yaw));
      const hx = Math.abs(bx - ax) / 2 + 0.3;
      const hz = Math.abs(bz - az) / 2 + 0.3;
      this.collision.addBox({ x0: mx - hx, z0: mz - hz, x1: mx + hx, z1: mz + hz, top: y + 2.3 });
    }
    this.gate(-40, r.z1, 0, gateW);
    // Makiwara posts and a weapon rack.
    for (const [x, z] of [[-51, -76], [-51, -81], [-29, -76], [-29, -81]]) {
      this.batch.add("weathered", cylinder(0.09, 0.1, 1.7, 8), trs(x, y + 0.85, z));
      this.batch.add("straw", cylinder(0.14, 0.14, 0.6, 10), trs(x, y + 1.2, z));
      this.batch.add("rope", cylinder(0.145, 0.145, 0.04, 10), trs(x, y + 1.05, z));
      this.batch.add("rope", cylinder(0.145, 0.145, 0.04, 10), trs(x, y + 1.35, z));
      this.collision.addCircle({ x, z, r: 0.25, top: y + 1.7 });
    }
    this.batch.add("darkWood", boxBase(2.2, 1.4, 0.3), trs(-52.4, y, -87, Math.PI / 2));
    for (let i = 0; i < 6; i++) this.batch.add("wood", cylinder(0.025, 0.02, 1.0, 6).rotateX(0.2), trs(-52.3, y + 1.0, -87.9 + i * 0.35));
  }

  // ——— bandit camp ————————————————————————————————————————————————————

  private banditCamp() {
    const { x: cx, z: cz } = BANDIT_CAMP;
    const y = this.h(cx, cz);
    this.placeModel("stone_fire_pit", trs(cx, y - 0.05, cz, 0, 0, 0));
    this.out.fires.push(new THREE.Vector3(cx, y + 0.5, cz));
    this.collision.addCircle({ x: cx, z: cz, r: 1.1, top: y + 0.6 });
    // Logs around the fire.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.batch.add("pineBark", cylinder(0.2, 0.2, 1.8, 8).rotateZ(Math.PI / 2), trs(cx + Math.cos(a) * 2.6, y + 0.2, cz + Math.sin(a) * 2.6, -a));
    }
    // Tents.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.9;
      const tx = cx + Math.cos(a) * 9;
      const tz = cz + Math.sin(a) * 9;
      const ty = this.h(tx, tz);
      const yaw = -a + Math.PI / 2;
      const M = trs(tx, ty, tz, yaw);
      for (const s of [-1, 1]) {
        this.batch.add("clothBrown", box(0.04, 2.6, 3.4), trs(s * 0.85, 0.95, 0, 0, 0, s * 0.62), M);
      }
      this.batch.add("darkWood", cylinder(0.05, 0.05, 3.6, 6).rotateX(Math.PI / 2), trs(0, 2.05, 0), M);
      for (const s of [-1, 1]) this.batch.add("darkWood", boxBase(0.08, 2.1, 0.08), trs(0, 0, s * 1.7), M);
      this.collision.addOrientedBox(tx, tz, 1.6, 1.8, -yaw, ty + 2);
    }
    // Palisade of sharpened logs on the north side.
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * 1.05 + (i / 26) * Math.PI * 0.9;
      const px = cx + Math.cos(a) * 18;
      const pz = cz + Math.sin(a) * 18;
      const py = this.h(px, pz);
      const hgt = 2.2 + ((i * 7) % 3) * 0.3;
      this.batch.add("pineBark", cylinder(0.14, 0.16, hgt, 7), trs(px, py + hgt / 2 - 0.2, pz));
      this.batch.add("weathered", new THREE.ConeGeometry(0.15, 0.4, 7), trs(px, py + hgt, pz));
      this.collision.addCircle({ x: px, z: pz, r: 0.35, top: py + hgt });
    }
    // Loot and the moon-iron chest.
    const chestX = cx + 4.5;
    const chestZ = cz - 3.2;
    const chestY = this.h(chestX, chestZ);
    this.batch.add("darkWood", boxBase(1.2, 0.7, 0.8), trs(chestX, chestY, chestZ, 0.3));
    this.batch.add("iron", boxBase(1.24, 0.08, 0.84), trs(chestX, chestY + 0.2, chestZ, 0.3));
    this.batch.add("iron", boxBase(1.24, 0.08, 0.84), trs(chestX, chestY + 0.55, chestZ, 0.3));
    this.out.chest.set(chestX, chestY, chestZ);
    this.collision.addCircle({ x: chestX, z: chestZ, r: 0.7, top: chestY + 0.7 });
    for (const [dx, dz] of [[-5, 4], [-6, 2.5], [6, 5]]) {
      this.placeModel(dx > 0 ? "barrel_03" : "wooden_crate_01", trs(cx + dx, this.h(cx + dx, cz + dz), cz + dz, dx));
      this.collision.addCircle({ x: cx + dx, z: cz + dz, r: 0.55, top: y + 1 });
    }
    // Lookout platform.
    const lx = cx - 12;
    const lz = cz + 7;
    const ly = this.h(lx, lz);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.batch.add("pineBark", cylinder(0.12, 0.14, 4.2, 6), trs(lx + ox, ly + 2, lz + oz));
    this.batch.add("weathered", boxBase(2.6, 0.12, 2.6), trs(lx, ly + 4, lz));
    this.collision.addBox({ x0: lx - 1.2, z0: lz - 1.2, x1: lx + 1.2, z1: lz + 1.2, top: ly + 4 });
  }

  // ——— shrine hill details ————————————————————————————————————————————

  private shrineDetails() {
    // Komainu guardians at the top of the path.
    for (const s of [-1, 1]) this.komainu(142 + s * 3.3, -40, s);
    this.stoneLantern(136, -43);
    this.stoneLantern(148, -43);
    // Temizuya (purification basin).
    const bx = 150;
    const bz = -46;
    const by = this.h(bx, bz);
    this.batch.add("stone", boxBase(1.6, 0.7, 0.9), trs(bx, by, bz));
    this.batch.add("interior", boxBase(1.4, 0.02, 0.7), trs(bx, by + 0.69, bz));
    for (const [ox, oz] of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) this.batch.add("vermilion", boxBase(0.12, 2.2, 0.12), trs(bx + ox, by, bz + oz));
    this.batch.add("copper", box(2.6, 0.08, 1.0), trs(bx, by + 2.4, bz - 0.35, 0, 0.35));
    this.batch.add("copper", box(2.6, 0.08, 1.0), trs(bx, by + 2.4, bz + 0.35, 0, -0.35));
    this.collision.addBox({ x0: bx - 1.1, z0: bz - 0.7, x1: bx + 1.1, z1: bz + 0.7, top: by + 2.5 });
    // Sacred camphor tree marker rope is part of vegetation; a bell stand here.
  }

  private komainu(x: number, z: number, side: number) {
    const y = this.h(x, z);
    const M = trs(x, y, z, side * 0.25 + Math.PI);
    const put = (g: THREE.BufferGeometry, lx: number, ly: number, lz: number) => this.batch.add("stone", g, trs(lx, ly, lz), M);
    put(boxBase(0.9, 0.7, 0.9, 1), 0, 0, 0);
    put(boxBase(0.5, 0.55, 0.75), 0, 0.7, 0.05);
    put(new THREE.SphereGeometry(0.3, 10, 8), 0, 1.45, -0.18);
    put(new THREE.SphereGeometry(0.2, 8, 6), 0, 1.35, -0.42);
    put(boxBase(0.5, 0.08, 0.3), 0, 1.25, -0.4);
    this.collision.addCircle({ x, z, r: 0.6, top: y + 1.7 });
  }

  private jizo(x: number, z: number, yaw: number) {
    const y = this.h(x, z);
    const M = trs(x, y, z, yaw);
    this.batch.add("stone", boxBase(0.45, 0.2, 0.4), trs(0, 0, 0), M);
    this.batch.add("stone", cylinder(0.14, 0.18, 0.55, 10), trs(0, 0.47, 0), M);
    this.batch.add("clothRed", cylinder(0.2, 0.19, 0.16, 10, 1, true), trs(0, 0.66, 0), M);
    this.batch.add("stone", new THREE.SphereGeometry(0.13, 10, 8), trs(0, 0.85, 0), M);
  }

  // ——— countryside ——————————————————————————————————————————————————————

  private countryside() {
    // Scarecrow in the paddies.
    const sx = (PADDIES.x0 + PADDIES.x1) / 2 + 3;
    const sz = PADDIES.z0 + 17;
    const sy = this.h(sx, sz);
    this.batch.add("weathered", cylinder(0.04, 0.05, 2, 6), trs(sx, sy + 1, sz));
    this.batch.add("weathered", cylinder(0.035, 0.035, 1.6, 6).rotateZ(Math.PI / 2), trs(sx, sy + 1.5, sz));
    this.batch.add("clothBrown", boxBase(0.7, 0.8, 0.2), trs(sx, sy + 0.9, sz));
    this.batch.add("straw", new THREE.ConeGeometry(0.45, 0.25, 12), trs(sx, sy + 2.05, sz));
    this.batch.add("clothWhite", new THREE.SphereGeometry(0.16, 8, 6), trs(sx, sy + 1.85, sz));
    // Roadside jizō.
    this.jizo(-42.5, 118, 0);
    this.jizo(-62, -136, 0.8);
    this.jizo(66, -126, 2.5);
    // Rocks along the river banks outside the village and on hills.
    const rng = this.rng;
    for (let i = 0; i < 90; i++) {
      const s = RIVER[rng.int(0, RIVER.length - 1)];
      if (s.z > -112 && s.z < 110 && rng.chance(0.7)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const off = s.hw + rng.range(0.5, 4);
      const x = s.x - s.dz * off * side;
      const z = s.z + s.dx * off * side;
      const rv = riverQuery(x, z);
      const y = this.h(x, z);
      const size = rng.range(0.4, 1.3);
      this.batch.add("stone", rockGeometry(rng, size, 0.7), trs(x, y - size * 0.25, z, rng.range(0, 6.28)));
      if (rv.dist > rv.hw) this.collision.addCircle({ x, z, r: size * 0.8, top: y + size });
    }
  }

  // ——— blacksmith forge ——————————————————————————————————————————————————

  private forge() {
    const y = VILLAGE_GROUND + 0.07;
    const fx = -80.8;
    const fz = -8.8;
    this.batch.add("stone", boxBase(1.6, 0.9, 1.3), trs(fx, y, fz));
    this.batch.add("fire", boxBase(1.0, 0.1, 0.8), trs(fx, y + 0.9, fz));
    this.batch.add("stone", boxBase(0.9, 2.6, 0.7), trs(fx, y + 0.9, fz - 0.4));
    this.out.fires.push(new THREE.Vector3(fx, y + 1.1, fz));
    // Anvil.
    this.batch.add("darkWood", cylinder(0.25, 0.3, 0.55, 10), trs(fx - 1.6, y + 0.28, fz + 0.5));
    this.batch.add("iron", boxBase(0.7, 0.22, 0.26), trs(fx - 1.6, y + 0.55, fz + 0.5));
    this.batch.add("iron", new THREE.ConeGeometry(0.12, 0.3, 8).rotateZ(Math.PI / 2), trs(fx - 1.1, y + 0.66, fz + 0.5));
    // Quenching trough.
    this.batch.add("weathered", boxBase(1.3, 0.5, 0.5), trs(fx - 3.3, y, fz + 0.7));
    // Katana stands on the counter and a sword rack.
    this.placeModel("katana_stand_01", trs(-87.6, y + 1.0, -6.95, Math.PI, 0, 0));
    this.placeModel("katana_stand_01", trs(-85.2, y + 1.0, -6.95, Math.PI, 0, 0));
  }

  // ——— moored boats ——————————————————————————————————————————————————————

  private boats() {
    this.boat(51.5, 74.6, Math.PI / 2 + 0.1);
    this.boat(64.5, 30, 0.2);
    this.boat(60.5, -40, -0.15);
  }

  private boat(x: number, z: number, yaw: number) {
    const M = trs(x, 0.05, z, yaw);
    const hull = new THREE.BoxGeometry(1.4, 0.45, 5.2, 1, 1, 6);
    const p = hull.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const zz = p.getZ(i) / 2.6;
      const narrow = 1 - Math.pow(Math.abs(zz), 2.4) * 0.8;
      p.setX(i, p.getX(i) * narrow * (p.getY(i) < 0 ? 0.75 : 1));
      p.setY(i, p.getY(i) + Math.pow(Math.abs(zz), 3) * 0.35);
    }
    hull.computeVertexNormals();
    this.batch.add("darkWood", hull, trs(0, 0.1, 0), M);
    this.batch.add("weathered", box(1.1, 0.05, 4.2), trs(0, 0.27, 0), M);
    // Small reed canopy.
    const canopy = new THREE.CylinderGeometry(0.62, 0.62, 1.6, 12, 1, true, 0, Math.PI);
    canopy.rotateZ(Math.PI / 2);
    canopy.rotateY(Math.PI / 2);
    this.batch.add("straw", canopy, trs(0, 0.35, 0.3), M);
    this.batch.add("darkWood", cylinder(0.025, 0.025, 3.2, 5).rotateX(0.5), trs(0.3, 1.0, -2.2), M);
  }
}

/** A lumpy rock: displaced icosahedron, squashed. */
export function rockGeometry(rng: Rng, size: number, squash = 0.7): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seed = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + Math.sin(x * 3.1 + seed) * 0.12 + Math.cos(z * 2.7 + seed * 2) * 0.12 + Math.sin(y * 4.3 + seed) * 0.08;
    p.setXYZ(i, x * n, y * n * squash, z * n);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.2 + p.getZ(i) * 0.3, p.getY(i) / 1.2);
  return g;
}
