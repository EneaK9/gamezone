// Walkability grid + A* for NPCs.

import type { World } from "./World";

export class NavGrid {
  readonly res = 1;
  readonly x0 = -200;
  readonly z0 = -225;
  readonly w = 400;
  readonly h = 430;
  readonly blocked: Uint8Array;

  constructor(world: World) {
    this.blocked = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) {
      const z = this.z0 + j + 0.5;
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + i + 0.5;
        let b = 0;
        if (!world.walkable(x, z) || world.waterDepth(x, z) > 0.25) b = 1;
        else if (world.grid.slope(x, z) > 0.9 && world.collision.deckHeight(x, z) === null) b = 1;
        else if (world.collision.blocked(x, z, 0.42)) b = 1;
        this.blocked[j * this.w + i] = b;
      }
    }
  }

  cell(x: number, z: number): [number, number] {
    return [Math.floor(x - this.x0), Math.floor(z - this.z0)];
  }

  free(x: number, z: number): boolean {
    const [i, j] = this.cell(x, z);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return false;
    return this.blocked[j * this.w + i] === 0;
  }

  /** Nearest free cell centre within `r` metres, or null. */
  nearestFree(x: number, z: number, r = 4): [number, number] | null {
    if (this.free(x, z)) return [x, z];
    for (let d = 1; d <= r; d++) {
      for (let a = 0; a < 8 * d; a++) {
        const t = (a / (8 * d)) * Math.PI * 2;
        const px = x + Math.cos(t) * d;
        const pz = z + Math.sin(t) * d;
        if (this.free(px, pz)) return [px, pz];
      }
    }
    return null;
  }

  /** Straight line walkable? (sampled every half metre) */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.5);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** A* path as world points (smoothed), or null. Limited search for performance. */
  path(ax: number, az: number, bx: number, bz: number, maxNodes = 6000): [number, number][] | null {
    const start = this.nearestFree(ax, az, 3);
    const goal = this.nearestFree(bx, bz, 5);
    if (!start || !goal) return null;
    if (this.clear(start[0], start[1], goal[0], goal[1])) return [goal];
    const [si, sj] = this.cell(start[0], start[1]);
    const [gi, gj] = this.cell(goal[0], goal[1]);
    const W = this.w;
    const key = (i: number, j: number) => j * W + i;
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const open: [number, number][] = []; // [f, key]
    const push = (f: number, k: number) => {
      open.push([f, k]);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= open[i][0]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
    const sk = key(si, sj);
    g.set(sk, 0);
    push(h(si, sj), sk);
    let expanded = 0;
    const goalK = key(gi, gj);
    while (open.length && expanded < maxNodes) {
      const [, k] = pop();
      if (k === goalK) break;
      expanded++;
      const i = k % W;
      const j = (k / W) | 0;
      const gk = g.get(k)!;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
          if (this.blocked[nj * W + ni]) continue;
          if (di && dj && (this.blocked[j * W + ni] || this.blocked[nj * W + i])) continue;
          const nk = key(ni, nj);
          const cost = gk + (di && dj ? 1.414 : 1);
          if (cost < (g.get(nk) ?? Infinity)) {
            g.set(nk, cost);
            came.set(nk, k);
            push(cost + h(ni, nj), nk);
          }
        }
      }
    }
    if (!came.has(goalK)) return null;
    const cells: [number, number][] = [];
    let c: number | undefined = goalK;
    while (c !== undefined && c !== sk) {
      cells.push([this.x0 + (c % W) + 0.5, this.z0 + ((c / W) | 0) + 0.5]);
      c = came.get(c);
    }
    cells.reverse();
    // String-pull.
    const out: [number, number][] = [];
    let from: [number, number] = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clear(from[0], from[1], cells[j][0], cells[j][1])) j--;
      out.push(cells[j]);
      from = cells[j];
      i = j + 1;
    }
    return out;
  }
}
