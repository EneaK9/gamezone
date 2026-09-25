#!/usr/bin/env node
// Downloads the CC0 textures and models the game uses from Poly Haven into public/assets.
// Safe to re-run: files that already exist are skipped.
//
//   npm run assets
//
// Everything fetched here is CC0 (public domain): https://polyhaven.com/license

import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "assets");
const API = "https://api.polyhaven.com";

/** Texture id -> max edge in px after download (1k source). */
const TEXTURES = {
  leafy_grass: 1024,
  forrest_ground_01: 1024,
  park_dirt: 1024,
  lichen_rock: 1024,
  river_small_rocks: 1024,
  grey_stone_path: 1024,
  plastered_wall_02: 1024,
  dark_wooden_planks: 1024,
  hinoki_planks: 1024,
  weathered_brown_planks: 1024,
  grey_roof_tiles_02: 1024,
  thatch_roof_angled: 1024,
  castle_wall_slates: 1024,
  bamboo_wall: 512,
  sakura_bark: 512,
  pine_bark: 512,
  denim_fabric: 512,
  terry_cloth: 512,
  brown_leather: 512,
  // Fabrics for the characters' clothes.
  rough_linen: 512,
  cotton_jersey: 512,
  crepe_satin: 512,
  knitted_fleece: 512,
  poly_wool_herringbone: 512,
  curly_teddy_natural: 512,
  hessian_230: 512,
  scuba_suede: 512,
};

/** Maps to fetch for each texture: Poly Haven key -> local file suffix. */
const MAPS = { Diffuse: "diff", nor_gl: "nor", arm: "arm" };

const MODELS = [
  "antique_katana_01",
  "katana_stand_01",
  "wooden_bucket_01",
  "wooden_crate_01",
  "barrel_03",
  "stone_fire_pit",
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "kazemura-asset-fetch" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, dest) {
  if (await exists(dest)) return false;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

/** Resize (optional) and re-encode a JPEG at a web-friendly quality. */
async function shrink(file, maxEdge) {
  // sips ships with macOS; elsewhere the 1k source is kept as-is.
  if (process.platform !== "darwin" || !file.endsWith(".jpg")) return;
  const args = ["-s", "formatOptions", "72"];
  if (maxEdge < 1024) args.push("-Z", String(maxEdge));
  await run("sips", [...args, file, "--out", file]);
}

async function fetchTexture(id, maxEdge) {
  const files = await getJson(`${API}/files/${id}`);
  for (const [key, suffix] of Object.entries(MAPS)) {
    const entry = files[key]?.["1k"]?.jpg;
    if (!entry) throw new Error(`${id} has no 1k ${key}`);
    const dest = path.join(out, "textures", id, `${suffix}.jpg`);
    if (await download(entry.url, dest)) await shrink(dest, maxEdge);
  }
}

async function fetchModel(id) {
  const files = await getJson(`${API}/files/${id}`);
  const gltf = files.gltf?.["1k"]?.gltf;
  if (!gltf) throw new Error(`${id} has no 1k glTF`);
  const dir = path.join(out, "models", id);
  await download(gltf.url, path.join(dir, `${id}.gltf`));
  for (const [rel, entry] of Object.entries(gltf.include ?? {})) {
    const dest = path.join(dir, rel);
    if (await download(entry.url, dest)) await shrink(dest, 1024);
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  const credits = [];
  for (const [id, edge] of Object.entries(TEXTURES)) {
    process.stdout.write(`texture ${id} … `);
    await fetchTexture(id, edge);
    credits.push(`- ${id} (texture) — https://polyhaven.com/a/${id}`);
    console.log("ok");
  }
  for (const id of MODELS) {
    process.stdout.write(`model ${id} … `);
    await fetchModel(id);
    credits.push(`- ${id} (model) — https://polyhaven.com/a/${id}`);
    console.log("ok");
  }
  const text = [
    "# Asset credits",
    "",
    "All textures and models below come from Poly Haven and are released under CC0 (public domain).",
    "https://polyhaven.com/license",
    "",
    ...credits,
    "",
  ].join("\n");
  const creditsPath = path.join(out, "CREDITS.md");
  const previous = (await exists(creditsPath)) ? await readFile(creditsPath, "utf8") : "";
  if (previous !== text) await writeFile(creditsPath, text);
  console.log(`\nAssets ready in ${path.relative(root, out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
