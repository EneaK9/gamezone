import * as THREE from "three";
import { hash2 } from "../core/math";

/** Tileable value-noise texture: r = broad blotches, g = fine grain, b = mid, a = cells. */
export function makeNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const layer = (x: number, y: number, period: number, seed: number) => {
    const fx = (x / size) * period;
    const fy = (y / size) * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const h = (i: number, j: number) => hash2(((i % period) + period) % period + seed * 131, ((j % period) + period) % period + seed * 71);
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = layer(x, y, 4, 1) * 0.55 + layer(x, y, 8, 2) * 0.3 + layer(x, y, 16, 3) * 0.15;
      const fine = layer(x, y, 32, 4) * 0.5 + layer(x, y, 64, 5) * 0.3 + layer(x, y, 128, 6) * 0.2;
      const mid = layer(x, y, 12, 7) * 0.6 + layer(x, y, 24, 8) * 0.4;
      const cell = hash2(Math.floor((x / size) * 16), Math.floor((y / size) * 16) + 999);
      const o = (y * size + x) * 4;
      data[o] = broad * 255;
      data[o + 1] = fine * 255;
      data[o + 2] = mid * 255;
      data[o + 3] = cell * 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
