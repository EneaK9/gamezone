// Static collision: axis-aligned boxes and circles in a spatial hash, plus walkable
// "decks" (bridges, pier, stepping stones) that override terrain height.

import { clamp } from "../core/math";

export interface BoxCollider {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Top of the obstacle (the camera can pass over low walls). */
  top: number;
  /** Rotation about its centre (radians); 0 for axis-aligned. */
  rot?: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
  top: number;
}

export interface Deck {
  /** Returns deck height at (x, z) or null when off the deck. */
  height(x: number, z: number): number | null;
}

const CELL = 8;
const key = (i: number, j: number) => (i + 512) * 2048 + (j + 512);

export class CollisionWorld {
  boxes: BoxCollider[] = [];
  circles: CircleCollider[] = [];
  decks: Deck[] = [];
  private cells = new Map<number, { boxes: BoxCollider[]; circles: CircleCollider[] }>();

  private cell(i: number, j: number) {
    const k = key(i, j);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = { boxes: [], circles: [] }));
    return c;
  }

  addBox(b: BoxCollider) {
    this.boxes.push(b);
    const r = b.rot ? Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 : 0;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const x0 = b.rot ? cx - r : b.x0;
    const x1 = b.rot ? cx + r : b.x1;
    const z0 = b.rot ? cz - r : b.z0;
    const z1 = b.rot ? cz + r : b.z1;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) this.cell(i, j).boxes.push(b);
  }

  /** Oriented box given centre, half extents and yaw. */
  addOrientedBox(cx: number, cz: number, hx: number, hz: number, rot: number, top: number) {
    this.addBox({ x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz, top, rot });
  }

  addCircle(c: CircleCollider) {
    this.circles.push(c);
    for (let i = Math.floor((c.x - c.r) / CELL); i <= Math.floor((c.x + c.r) / CELL); i++)
      for (let j = Math.floor((c.z - c.r) / CELL); j <= Math.floor((c.z + c.r) / CELL); j++) this.cell(i, j).circles.push(c);
  }

  near(x: number, z: number, out: { boxes: Set<BoxCollider>; circles: Set<CircleCollider> }, radius = 1) {
    out.boxes.clear();
    out.circles.clear();
    for (let i = Math.floor((x - radius) / CELL); i <= Math.floor((x + radius) / CELL); i++) {
      for (let j = Math.floor((z - radius) / CELL); j <= Math.floor((z + radius) / CELL); j++) {
        const c = this.cells.get(key(i, j));
        if (!c) continue;
        for (const b of c.boxes) out.boxes.add(b);
        for (const s of c.circles) out.circles.add(s);
      }
    }
    return out;
  }

  private scratch = { boxes: new Set<BoxCollider>(), circles: new Set<CircleCollider>() };

  /** Push a circle of radius r at (x, z) out of all colliders. Returns corrected position. */
  resolve(x: number, z: number, r: number, feetY: number): [number, number] {
    const near = this.near(x, z, this.scratch, r + 1);
    for (let iter = 0; iter < 2; iter++) {
      for (const b of near.boxes) {
        if (feetY > b.top - 0.05) continue; // standing on/over it
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        let lx = x - cx;
        let lz = z - cz;
        const rot = b.rot ?? 0;
        if (rot) {
          const c = Math.cos(-rot);
          const s = Math.sin(-rot);
          const tx = lx * c - lz * s;
          lz = lx * s + lz * c;
          lx = tx;
        }
        const hx = (b.x1 - b.x0) / 2;
        const hz = (b.z1 - b.z0) / 2;
        const px = clamp(lx, -hx, hx);
        const pz = clamp(lz, -hz, hz);
        let dx = lx - px;
        let dz = lz - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let nx: number;
        let nz: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d;
          nz = dz / d;
          lx = px + nx * r;
          lz = pz + nz * r;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const ox = hx - Math.abs(lx);
          const oz = hz - Math.abs(lz);
          if (ox < oz) lx = Math.sign(lx || 1) * (hx + r);
          else lz = Math.sign(lz || 1) * (hz + r);
        }
        if (rot) {
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          dx = lx * c - lz * s;
          dz = lx * s + lz * c;
          lx = dx;
          lz = dz;
        }
        x = cx + lx;
        z = cz + lz;
      }
      for (const c of near.circles) {
        if (feetY > c.top - 0.05) continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        x = c.x + (dx / d) * rr;
        z = c.z + (dz / d) * rr;
      }
    }
    return [x, z];
  }

  /** True if a circle at (x, z) overlaps any collider. */
  blocked(x: number, z: number, r: number): boolean {
    const [nx, nz] = this.resolve(x, z, r, -999);
    return Math.abs(nx - x) > 1e-4 || Math.abs(nz - z) > 1e-4;
  }

  deckHeight(x: number, z: number): number | null {
    let best: number | null = null;
    for (const d of this.decks) {
      const h = d.height(x, z);
      if (h !== null && (best === null || h > best)) best = h;
    }
    return best;
  }

  /**
   * First hit along a segment (for the camera). Returns the fraction 0..1, 1 if clear.
   * Uses the 2D footprint and each obstacle's top height.
   */
  raycast(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    let best = 1;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.35);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (t >= best) break;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      const near = this.near(x, z, this.scratch, 0.2);
      for (const b of near.boxes) {
        if (y > b.top) continue;
        let lx = x - (b.x0 + b.x1) / 2;
        let lz = z - (b.z0 + b.z1) / 2;
        if (b.rot) {
          const c = Math.cos(-b.rot);
          const sn = Math.sin(-b.rot);
          const tx = lx * c - lz * sn;
          lz = lx * sn + lz * c;
          lx = tx;
        }
        if (Math.abs(lx) < (b.x1 - b.x0) / 2 + 0.15 && Math.abs(lz) < (b.z1 - b.z0) / 2 + 0.15) {
          best = Math.min(best, (s - 1) / steps);
        }
      }
    }
    return best;
  }
}
