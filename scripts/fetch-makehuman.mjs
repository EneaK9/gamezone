// Downloads the MakeHuman sources the human builder needs into .cache/makehuman (gitignored).
// Everything fetched here is CC0: the hm08 base mesh, targets, rig and weights from the
// MakeHuman repository, and skins/eyes/eyebrows/eyelashes/teeth from the system asset pack.
//   node scripts/fetch-makehuman.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CACHE = path.resolve(".cache/makehuman");
const RAW = "https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data";
const TREE = "https://api.github.com/repos/makehumancommunity/makehuman/git/trees/master?recursive=1";
const PACK = "https://mirror1.makehuman.net/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip";
const PACK_MIRROR = "https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip";

/** Target groups used for bodies and faces (macro targets are filtered below). */
const GROUPS = ["head", "forehead", "eyebrows", "neck", "eyes", "nose", "mouth", "ears", "chin", "cheek", "torso", "hip", "stomach", "buttocks", "pelvis", "armslegs", "measure", "expression"];
const CORE = ["3dobjs/base.obj", "rigs/default.mhskel", "rigs/default_weights.mhw", "modifiers/modeling_modifiers.json", "modifiers/measurement_modifiers.json"];
/** Folders pulled out of the system asset pack. */
const PACK_DIRS = ["skins/", "eyes/", "eyebrows/", "eyelashes/", "teeth/", "tongue/"];

async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    }
    if (res.status === 404) throw new Error(`404 ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`failed ${url}`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

fs.mkdirSync(CACHE, { recursive: true });
for (const f of CORE) await get(`${RAW}/${f}`, path.join(CACHE, f));

// Targets: list the repository once, keep the groups we use plus the macro targets
// for ethnicity × gender × age and gender × age × muscle × weight.
const treeFile = path.join(CACHE, "tree.json");
if (!fs.existsSync(treeFile)) {
  const res = await fetch(TREE, { headers: { "User-Agent": "kazemura-build" } });
  if (!res.ok) throw new Error(`tree listing failed: ${res.status}`);
  fs.writeFileSync(treeFile, await res.text());
}
const tree = JSON.parse(fs.readFileSync(treeFile, "utf8")).tree;
const prefix = "makehuman/data/targets/";
const targets = tree
  .filter((x) => x.type === "blob" && x.path.startsWith(prefix) && x.path.endsWith(".target"))
  .map((x) => x.path.slice(prefix.length))
  .filter((p) => {
    const [group, ...rest] = p.split("/");
    if (group === "macrodetails") return rest.length === 1; // ethnic + universal, not height/proportions
    return GROUPS.includes(group);
  });
let fetched = 0;
await pool(targets, 16, async (t) => {
  if (await get(`${RAW}/targets/${t}`, path.join(CACHE, "targets", t))) fetched++;
});
console.log(`[makehuman] ${targets.length} targets (${fetched} new)`);

// System assets (skins, eyes, brows, lashes, teeth).
if (!fs.existsSync(path.join(CACHE, "assets", "skins"))) {
  const zip = path.join(CACHE, "system_assets.zip");
  if (!fs.existsSync(zip)) {
    console.log("[makehuman] downloading the system asset pack (~280 MB)…");
    await get(PACK, zip).catch(() => get(PACK_MIRROR, zip));
  }
  execFileSync("unzip", ["-q", "-o", zip, ...PACK_DIRS.map((d) => `${d}*`), "-d", path.join(CACHE, "assets")]);
  console.log("[makehuman] extracted", PACK_DIRS.join(" "));
}
console.log(`[makehuman] cache ready at ${path.relative(process.cwd(), CACHE)}`);
