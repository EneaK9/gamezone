// Paints the village map once (for the minimap and the full map).

import { PLACES } from "../../shared/places";
import type { World } from "../world/World";
import { BRIDGES, PADDIES, PLOTS, RIVER, ROADS, TORII_COUNT, WORLD_HALF, plotRect } from "../world/layout";

export const MAP_PX = 1120; // 2 px per metre

export function toMap(x: number, z: number): [number, number] {
  const k = MAP_PX / (WORLD_HALF * 2);
  return [(x + WORLD_HALF) * k, (z + WORLD_HALF) * k];
}

export function paintMap(world: World, labels: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = MAP_PX;
  const g = c.getContext("2d")!;
  const k = MAP_PX / (WORLD_HALF * 2);
  // Terrain shading.
  const img = g.createImageData(MAP_PX, MAP_PX);
  for (let py = 0; py < MAP_PX; py++) {
    for (let px = 0; px < MAP_PX; px++) {
      const x = px / k - WORLD_HALF;
      const z = py / k - WORLD_HALF;
      const h = world.grid.height(x, z);
      const sl = world.grid.slope(x, z);
      let r = 214, gg = 206, b = 170;
      const t = Math.min(1, Math.max(0, h / 45));
      r = 200 - t * 70 - sl * 20;
      gg = 204 - t * 50 - sl * 18;
      b = 160 - t * 50 - sl * 12;
      if (h < 0.1) {
        r = 120;
        gg = 190;
        b = 186;
      }
      const o = (py * MAP_PX + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Paddies.
  g.fillStyle = "#a9c69088";
  const [p0x, p0y] = toMap(PADDIES.x0, PADDIES.z0);
  const [p1x, p1y] = toMap(PADDIES.x1, PADDIES.z1);
  g.fillRect(p0x, p0y, p1x - p0x, p1y - p0y);
  // River.
  g.strokeStyle = "#5fb3b0";
  g.lineCap = "round";
  g.lineJoin = "round";
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i];
    const b2 = RIVER[i + 1];
    g.lineWidth = a.hw * 2 * k;
    g.beginPath();
    g.moveTo(...toMap(a.x, a.z));
    g.lineTo(...toMap(b2.x, b2.z));
    g.stroke();
  }
  // Roads.
  for (const r of ROADS) {
    g.strokeStyle = r.stone ? "#b9b2a4" : "#d8c49c";
    g.lineWidth = r.width * k;
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(...toMap(x, z)) : g.moveTo(...toMap(x, z))));
    g.stroke();
  }
  // Bridges.
  for (const b2 of BRIDGES) {
    g.strokeStyle = b2.red ? "#d24a2e" : "#8a6a48";
    g.lineWidth = b2.width * k;
    g.beginPath();
    g.moveTo(...toMap(b2.x0, b2.z0));
    g.lineTo(...toMap(b2.x1, b2.z1));
    g.stroke();
  }
  // Buildings.
  for (const p of PLOTS) {
    const r = plotRect(p);
    const [ax, ay] = toMap(r.x0, r.z0);
    const [bx, by] = toMap(r.x1, r.z1);
    g.fillStyle = p.kind === "shrine" || p.kind === "pagoda" ? "#b8452e" : p.kind === "shop" || p.kind === "yatai" ? "#6b4a33" : "#4a4640";
    g.fillRect(ax, ay, bx - ax, by - ay);
  }
  // Torii dots along the path.
  g.fillStyle = "#d24a2e";
  void TORII_COUNT;
  if (labels) {
    g.font = "600 15px 'Cormorant Garamond', Georgia, serif";
    g.textAlign = "center";
    for (const pl of PLACES) {
      const [x, y] = toMap(pl.x, pl.z);
      g.fillStyle = "#1d1a16";
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      const name = pl.name.replace(/^the /, "");
      g.fillStyle = "#1d1a16cc";
      g.strokeStyle = "#efe6d2";
      g.lineWidth = 4;
      g.strokeText(capital(name), x, y - 8);
      g.fillText(capital(name), x, y - 8);
    }
  }
  return c;
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
