// Bakes the MakeHuman (CC0) base mesh into the game's human kit: public/assets/humans/.
//
//   node scripts/fetch-makehuman.mjs   # once: downloads sources into .cache/makehuman
//   node scripts/build-humans.mjs
//
// Output: human.json (layout, bones, archetypes, targets) + human.bin (typed arrays) +
// textures. At runtime (src/characters/human) a body is a bilinear blend of archetypes
// (sex × age × muscle × weight, exactly MakeHuman's macro interpolation), plus sparse
// detail targets for faces and builds. Every archetype is re-posed here from
// MakeHuman's A-pose into the game's rest pose (arms hanging, palms in, legs straight),
// and MakeHuman's 163-bone weights are folded onto the game skeleton.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

const CACHE = path.resolve(".cache/makehuman");
const OUT = path.resolve("public/assets/humans");
const DM = 0.1; // MakeHuman units are decimetres

// ——— parsing ———————————————————————————————————————————————————————————————

function parseObj(file) {
  const v = [];
  const vt = [];
  const faces = [];
  let g = "";
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const p = line.split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith("vt ")) {
      const p = line.split(/\s+/);
      vt.push(+p[1], +p[2]);
    } else if (line.startsWith("g ")) g = line.slice(2).trim();
    else if (line.startsWith("f ")) {
      const p = line.split(/\s+/).slice(1).map((s) => s.split("/").map((x) => (x ? +x - 1 : -1)));
      faces.push({ g, v: p.map((q) => q[0]), t: p.map((q) => q[1]) });
    }
  }
  return { v, vt, faces };
}

const targetCache = new Map();
function loadTarget(rel) {
  let t = targetCache.get(rel);
  if (t) return t;
  const file = path.join(CACHE, "targets", `${rel}.target`);
  if (!fs.existsSync(file)) throw new Error(`missing target ${rel}`);
  const idx = [];
  const d = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line[0] === "#") continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]);
    d.push(+p[1], +p[2], +p[3]);
  }
  t = { idx, d };
  targetCache.set(rel, t);
  return t;
}

function parseMhclo(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const scale = {};
  const refs = [];
  let inVerts = false;
  let obj = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = line.split(/\s+/);
    if (!inVerts) {
      if (p[0] === "x_scale" || p[0] === "y_scale" || p[0] === "z_scale") scale[p[0][0]] = [+p[1], +p[2], +p[3]];
      else if (p[0] === "obj_file") obj = p[1];
      else if (p[0] === "verts") inVerts = true;
      continue;
    }
    if (!/^-?\d/.test(p[0])) {
      inVerts = false;
      continue;
    }
    if (p.length === 1) refs.push([+p[0], +p[0], +p[0], 1, 0, 0, 0, 0, 0]);
    else refs.push(p.slice(0, 9).map(Number));
  }
  return { scale, refs, obj };
}

// ——— MakeHuman macro interpolation ————————————————————————————————————————————

function tri(x, lo, mid, hi) {
  if (x < 0.5) {
    const l = Math.max(0, 1 - x * 2);
    return { [lo]: l, [mid]: 1 - l, [hi]: 0 };
  }
  const h = Math.max(0, x * 2 - 1);
  return { [lo]: 0, [mid]: 1 - h, [hi]: h };
}

function macroTargets(m) {
  const gv = { female: 1 - m.gender, male: m.gender };
  let av;
  if (m.age < 0.5) {
    const young = Math.max(0, (m.age - 0.1875) * 3.2);
    av = { baby: Math.max(0, 1 - m.age * 5.333), child: Math.max(0, Math.min(1, 5.333 * m.age) - young), young, old: 0 };
  } else {
    const old = Math.max(0, m.age * 2 - 1);
    av = { baby: 0, child: 0, young: 1 - old, old };
  }
  const mv = tri(m.muscle, "minmuscle", "averagemuscle", "maxmuscle");
  const wv = tri(m.weight, "minweight", "averageweight", "maxweight");
  const es = m.african + m.asian + m.caucasian;
  const ev = { african: m.african / es, asian: m.asian / es, caucasian: m.caucasian / es };
  const out = [];
  for (const [race, rw] of Object.entries(ev))
    for (const [g, gw] of Object.entries(gv))
      for (const [a, aw] of Object.entries(av)) if (rw * gw * aw > 1e-6) out.push([`macrodetails/${race}-${g}-${a}`, rw * gw * aw]);
  for (const [g, gw] of Object.entries(gv))
    for (const [a, aw] of Object.entries(av))
      for (const [mu, muw] of Object.entries(mv))
        for (const [we, wew] of Object.entries(wv)) {
          const w = gw * aw * muw * wew;
          if (w > 1e-6) out.push([`macrodetails/universal-${g}-${a}-${mu}-${we}`, w]);
        }
  return out;
}

function morph(base, list) {
  const pos = Float64Array.from(base);
  for (const [rel, w] of list) {
    const t = loadTarget(rel);
    for (let i = 0; i < t.idx.length; i++) {
      const o = t.idx[i] * 3;
      pos[o] += t.d[i * 3] * w;
      pos[o + 1] += t.d[i * 3 + 1] * w;
      pos[o + 2] += t.d[i * 3 + 2] * w;
    }
  }
  return pos;
}

// ——— skeleton ——————————————————————————————————————————————————————————————————

const base = parseObj(path.join(CACHE, "3dobjs/base.obj"));
const NV = base.v.length / 3;
const skel = JSON.parse(fs.readFileSync(path.join(CACHE, "rigs/default.mhskel"), "utf8"));
const mhWeights = JSON.parse(fs.readFileSync(path.join(CACHE, "rigs/default_weights.mhw"), "utf8")).weights;
const MB = skel.bones;
const mhNames = Object.keys(MB);
const depth = (b) => (MB[b].parent ? depth(MB[b].parent) + 1 : 0);
const mhOrder = [...mhNames].sort((a, b) => depth(a) - depth(b));

function jointPos(pos, name) {
  const idx = skel.joints[name];
  const p = new THREE.Vector3();
  for (const i of idx) p.add(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  return p.divideScalar(idx.length);
}

/** Game skeleton. `from` names the MakeHuman joint (or a function of the posed joints). */
const SIDES = ["L", "R"];
const FINGERS = [
  ["thumb", 1],
  ["index", 2],
  ["middle", 3],
  ["ring", 4],
  ["pinky", 5],
];
const BONES = [
  { name: "root", parent: null, at: () => new THREE.Vector3(0, 0, 0) },
  { name: "hips", parent: "root", at: (h) => h("spine05") },
  { name: "spine", parent: "hips", at: (h) => h("spine04") },
  { name: "chest", parent: "spine", at: (h) => h("spine02") },
  { name: "neck", parent: "chest", at: (h) => h("neck01") },
  { name: "head", parent: "neck", at: (h) => h("head") },
  { name: "jaw", parent: "head", at: (h) => h("jaw") },
];
for (const s of SIDES) {
  BONES.push({ name: `eye${s}`, parent: "head", at: (h) => h(`eye.${s}`) });
  BONES.push({ name: `lidUp${s}`, parent: "head", at: (h) => h(`orbicularis03.${s}`) });
  BONES.push({ name: `lidLow${s}`, parent: "head", at: (h) => h(`orbicularis04.${s}`) });
}
BONES.push({ name: "tail", parent: "head", at: (h, t) => h("head").clone().lerp(t("head"), 0.55).add(new THREE.Vector3(0, 0, -0.95)) });
for (const s of SIDES) {
  BONES.push({ name: `shoulder${s}`, parent: "chest", at: (h) => h(`clavicle.${s}`) });
  BONES.push({ name: `upperArm${s}`, parent: `shoulder${s}`, at: (h) => h(`upperarm01.${s}`) });
  BONES.push({ name: `foreArm${s}`, parent: `upperArm${s}`, at: (h) => h(`lowerarm01.${s}`) });
  BONES.push({ name: `hand${s}`, parent: `foreArm${s}`, at: (h) => h(`wrist.${s}`) });
  BONES.push({ name: `fingers${s}`, parent: `hand${s}`, at: (h) => h(`finger3-1.${s}`) });
  for (const [f, k] of FINGERS) {
    BONES.push({ name: `${f}1${s}`, parent: `hand${s}`, at: (h) => h(`finger${k}-1.${s}`) });
    BONES.push({ name: `${f}2${s}`, parent: `${f}1${s}`, at: (h) => h(`finger${k}-2.${s}`) });
    BONES.push({ name: `${f}3${s}`, parent: `${f}2${s}`, at: (h) => h(`finger${k}-3.${s}`) });
  }
}
for (const s of SIDES) {
  BONES.push({ name: `thigh${s}`, parent: "hips", at: (h) => h(`upperleg01.${s}`) });
  BONES.push({ name: `shin${s}`, parent: `thigh${s}`, at: (h) => h(`lowerleg01.${s}`) });
  BONES.push({ name: `foot${s}`, parent: `shin${s}`, at: (h) => h(`foot.${s}`) });
  BONES.push({
    name: `toes${s}`,
    parent: `foot${s}`,
    at: (h) => {
      const p = new THREE.Vector3();
      for (let k = 1; k <= 5; k++) p.add(h(`toe${k}-1.${s}`));
      return p.divideScalar(5);
    },
  });
}
const BI = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

/** MakeHuman bone → [[game bone, share], ...]. */
function mapBone(b) {
  const side = b.endsWith(".L") ? "L" : b.endsWith(".R") ? "R" : "";
  const stem = side ? b.slice(0, -2) : b;
  if (["root", "pelvis", "spine05"].includes(stem)) return [["hips", 1]];
  if (["spine04", "spine03"].includes(stem)) return [["spine", 1]];
  if (["spine02", "spine01", "breast"].includes(stem)) return [["chest", 1]];
  if (["neck01", "neck02"].includes(stem)) return [["neck", 1]];
  if (stem === "neck03") return [["neck", 0.5], ["head", 0.5]];
  if (stem === "eye") return [[`eye${side}`, 1]];
  if (stem === "orbicularis03") return [[`lidUp${side}`, 1]];
  if (stem === "orbicularis04") return [[`lidLow${side}`, 1]];
  if (stem === "clavicle") return [[`shoulder${side}`, 1]];
  if (stem === "shoulder01") return [[`shoulder${side}`, 0.5], [`upperArm${side}`, 0.5]];
  if (stem.startsWith("upperarm")) return [[`upperArm${side}`, 1]];
  if (stem.startsWith("lowerarm")) return [[`foreArm${side}`, 1]];
  if (stem === "wrist" || stem.startsWith("metacarpal")) return [[`hand${side}`, 1]];
  const fm = /^finger(\d)-(\d)$/.exec(stem);
  if (fm) return [[`${FINGERS[+fm[1] - 1][0]}${fm[2]}${side}`, 1]];
  if (stem.startsWith("upperleg")) return [[`thigh${side}`, 1]];
  if (stem.startsWith("lowerleg")) return [[`shin${side}`, 1]];
  if (stem === "foot") return [[`foot${side}`, 1]];
  if (stem.startsWith("toe")) return [[`toes${side}`, 1]];
  // Face: bones hanging off the jaw move with it; the rest ride the skull.
  for (let p = b; p; p = MB[p].parent) if (p === "jaw") return [["jaw", 1]];
  return [["head", 1]];
}

// Per-vertex game weights (top 4).
const vw = Array.from({ length: NV }, () => new Map());
for (const [b, list] of Object.entries(mhWeights)) {
  const m = mapBone(b);
  for (const [vi, w] of list) for (const [gb, share] of m) vw[vi].set(BI[gb], (vw[vi].get(BI[gb]) ?? 0) + w * share);
}
function top4(map) {
  const e = [...map.entries()].filter((x) => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = e.reduce((a, x) => a + x[1], 0) || 1;
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  e.forEach((x, i) => {
    idx[i] = x[0];
    w[i] = x[1] / sum;
  });
  return { idx, w };
}
const baseW = vw.map(top4);

// ——— re-posing ————————————————————————————————————————————————————————————————

const fromTo = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());

/**
 * Pose MakeHuman's A-pose into the game's rest pose. Returns posed positions for every
 * base vertex, posed head/tail per MakeHuman bone, and each bone's world rotation.
 */
function repose(pos) {
  const head = (b) => jointPos(pos, MB[b].head);
  const tail = (b) => jointPos(pos, MB[b].tail);
  const override = new Map();
  const report = {};
  for (const s of SIDES) {
    const sx = s === "L" ? 1 : -1;
    // Arms: hang just clear of the hips, elbows a touch soft, palms facing the thighs.
    const S = head(`upperarm01.${s}`);
    const E = head(`lowerarm01.${s}`);
    const W = head(`wrist.${s}`);
    const armLen = S.distanceTo(E) + E.distanceTo(W);
    // Widest point of the hips/thighs around wrist height, among torso and leg vertices.
    const wristY = S.y - armLen * 0.97;
    let hipX = 0;
    for (let i = 0; i < 13380; i++) {
      const y = pos[i * 3 + 1];
      if (Math.abs(y - wristY) > 1.2) continue;
      const w = baseW[i];
      const bone = BONES[w.idx[0]].name;
      if (!/^(hips|spine|thigh)/.test(bone)) continue;
      hipX = Math.max(hipX, pos[i * 3] * sx);
    }
    const clear = 0.42; // dm of air + half a hand
    const abduct = Math.asin(THREE.MathUtils.clamp((hipX + clear - S.x * sx) / armLen, 0.03, 0.4));
    const dUA = new THREE.Vector3(Math.sin(abduct) * sx, -Math.cos(abduct), -0.03).normalize();
    const Rua = fromTo(E.clone().sub(S), dUA);
    const flex = THREE.MathUtils.degToRad(9);
    const dFA = dUA.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), -flex);
    const f1 = W.clone().sub(E).applyQuaternion(Rua);
    const Rfa = fromTo(f1, dFA).multiply(Rua);
    // Palm direction from the knuckle plane; the curl of the fingers says which side is palm.
    const I = head(`finger2-1.${s}`);
    const P = head(`finger5-1.${s}`);
    const M3 = head(`finger3-1.${s}`);
    const tip = tail(`finger3-3.${s}`);
    const axis = M3.clone().sub(W).normalize();
    let palm = new THREE.Vector3().crossVectors(I.clone().sub(W), P.clone().sub(W)).normalize();
    const curl = tip.clone().sub(M3);
    curl.sub(axis.clone().multiplyScalar(curl.dot(axis)));
    if (palm.dot(curl) < 0) palm.negate();
    const palm1 = palm.clone().applyQuaternion(Rfa);
    const want = new THREE.Vector3(-sx, 0, -0.3).normalize();
    const proj = (v) => v.clone().sub(dFA.clone().multiplyScalar(v.dot(dFA))).normalize();
    const a = proj(palm1);
    const b = proj(want);
    const twist = Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(dFA), a.dot(b));
    override.set(`upperarm01.${s}`, Rua);
    override.set(`lowerarm01.${s}`, new THREE.Quaternion().setFromAxisAngle(dFA, twist * 0.5).multiply(Rfa));
    override.set(`lowerarm02.${s}`, new THREE.Quaternion().setFromAxisAngle(dFA, twist).multiply(Rfa));
    report[`arm${s}`] = { abductDeg: +THREE.MathUtils.radToDeg(abduct).toFixed(1), twistDeg: +THREE.MathUtils.radToDeg(twist).toFixed(1) };

    // Legs: straight, knees and ankles under the hip sockets, feet keep their angle.
    const Hj = head(`upperleg01.${s}`);
    const K = head(`lowerleg01.${s}`);
    const A = head(`foot.${s}`);
    const kneeX = Hj.x * 0.9;
    const dTH = new THREE.Vector3(kneeX - Hj.x, -Hj.distanceTo(K), 0).normalize();
    const Rth = fromTo(K.clone().sub(Hj), dTH);
    const Rsh = fromTo(A.clone().sub(K).applyQuaternion(Rth), new THREE.Vector3(0, -1, 0)).multiply(Rth);
    override.set(`upperleg01.${s}`, Rth);
    override.set(`lowerleg01.${s}`, Rsh);
    override.set(`foot.${s}`, new THREE.Quaternion());
  }

  // Forward kinematics over the MakeHuman hierarchy.
  const R = new Map();
  const H0 = new Map();
  const H1 = new Map();
  for (const b of mhOrder) {
    const parent = MB[b].parent;
    const h = head(b);
    H0.set(b, h);
    const rp = parent ? R.get(parent) : new THREE.Quaternion();
    R.set(b, override.get(b) ?? rp.clone());
    if (!parent) H1.set(b, h.clone());
    else H1.set(b, h.clone().sub(H0.get(parent)).applyQuaternion(R.get(parent)).add(H1.get(parent)));
  }
  const xf = (b, p) => p.clone().sub(H0.get(b)).applyQuaternion(R.get(b)).add(H1.get(b));

  // Linear blend skinning with MakeHuman's own weights.
  const acc = new Float64Array(NV * 3);
  const wsum = new Float64Array(NV);
  const v = new THREE.Vector3();
  for (const [b, list] of Object.entries(mhWeights)) {
    for (const [vi, w] of list) {
      v.set(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      const p = xf(b, v);
      acc[vi * 3] += p.x * w;
      acc[vi * 3 + 1] += p.y * w;
      acc[vi * 3 + 2] += p.z * w;
      wsum[vi] += w;
    }
  }
  const out = Float64Array.from(pos);
  for (let i = 0; i < NV; i++) {
    if (wsum[i] < 1e-6) continue;
    out[i * 3] = acc[i * 3] / wsum[i];
    out[i * 3 + 1] = acc[i * 3 + 1] / wsum[i];
    out[i * 3 + 2] = acc[i * 3 + 2] / wsum[i];
  }
  const posedHead = (b) => H1.get(b).clone();
  const posedTail = (b) => xf(b, tail(b));
  return { pos: out, R, posedHead, posedTail, report };
}

// ——— archetypes ————————————————————————————————————————————————————————————————

const ETHNIC = { asian: 1, caucasian: 0, african: 0 };
const ARCHETYPES = [];
for (const [sex, gender] of [
  ["m", 1],
  ["f", 0],
]) {
  for (const muscle of [0, 0.5, 1]) for (const weight of [0, 0.5, 1]) ARCHETYPES.push({ id: `${sex}-adult-${muscle}-${weight}`, sex, age: "adult", muscle, weight, m: { gender, age: 0.5, muscle, weight, ...ETHNIC } });
  for (const weight of [0, 0.5, 1]) ARCHETYPES.push({ id: `${sex}-elder-0.5-${weight}`, sex, age: "elder", muscle: 0.5, weight, m: { gender, age: 0.875, muscle: 0.5, weight, ...ETHNIC } });
  ARCHETYPES.push({ id: `${sex}-child-0.5-0.5`, sex, age: "child", muscle: 0.5, weight: 0.5, m: { gender, age: 0.13, muscle: 0.5, weight: 0.5, ...ETHNIC } });
}
/** Ethnic offsets from the asian adult (applied as deltas at runtime). */
const ETHNIC_DELTAS = [];
for (const [sex, gender] of [
  ["m", 1],
  ["f", 0],
])
  for (const race of ["caucasian", "african"]) ETHNIC_DELTAS.push({ id: `${sex}-${race}`, sex, race, m: { gender, age: 0.5, muscle: 0.5, weight: 0.5, asian: 0, caucasian: race === "caucasian" ? 1 : 0, african: race === "african" ? 1 : 0 } });

// Which base vertices the kit stores: the body, plus helpers used by proxies and as
// garment/hair guides. (Joint cubes and the genital helper are dropped.)
const groupVerts = new Map();
for (const f of base.faces) {
  let s = groupVerts.get(f.g);
  if (!s) groupVerts.set(f.g, (s = new Set()));
  for (const vi of f.v) s.add(vi);
}
const keepGroups = ["body", "helper-tongue", "helper-l-eye", "helper-r-eye", "helper-upper-teeth", "helper-lower-teeth", "helper-tights", "helper-skirt", "helper-hair"];
for (const g of groupVerts.keys()) if (g.includes("eyelashes")) keepGroups.push(g);
const keep = new Set();
for (const g of keepGroups) for (const vi of groupVerts.get(g) ?? []) keep.add(vi);

// ——— proxies ——————————————————————————————————————————————————————————————————

const PROXIES = [
  { id: "eyes", dir: "eyes/high-poly", file: "high-poly" },
  { id: "lashes", dir: "eyelashes/eyelashes01", file: "eyelashes01" },
  { id: "lashes_long", dir: "eyelashes/eyelashes03", file: "eyelashes03" },
  { id: "teeth", dir: "teeth/teeth_base", file: "teeth_base" },
  { id: "tongue", dir: "tongue/tongue01", file: "tongue01" },
];
for (const n of ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012"]) PROXIES.push({ id: `brow${n}`, dir: `eyebrows/eyebrow${n}`, file: `eyebrow${n}` });
for (const p of PROXIES) {
  p.clo = parseMhclo(path.join(CACHE, "assets", p.dir, `${p.file}.mhclo`));
  p.mesh = parseObj(path.join(CACHE, "assets", p.dir, p.clo.obj || `${p.file}.obj`));
  for (const r of p.clo.refs) for (const k of [0, 1, 2]) keep.add(r[k]);
  for (const k of ["x", "y", "z"]) {
    keep.add(p.clo.scale[k][0]);
    keep.add(p.clo.scale[k][1]);
  }
}
const kept = [...keep].sort((a, b) => a - b);
const slot = new Int32Array(NV).fill(-1);
kept.forEach((vi, i) => (slot[vi] = i));
const NS = kept.length;

// ——— build ———————————————————————————————————————————————————————————————————————

const t0 = Date.now();
const built = [];
const reports = {};
for (const a of [...ARCHETYPES, ...ETHNIC_DELTAS]) {
  const native = morph(base.v, macroTargets(a.m));
  const r = repose(native);
  // Soles on the ground, metres.
  let minY = Infinity;
  for (const vi of groupVerts.get("body")) minY = Math.min(minY, r.pos[vi * 3 + 1]);
  const pos = new Float32Array(NS * 3);
  kept.forEach((vi, i) => {
    pos[i * 3] = r.pos[vi * 3] * DM;
    pos[i * 3 + 1] = (r.pos[vi * 3 + 1] - minY) * DM;
    pos[i * 3 + 2] = r.pos[vi * 3 + 2] * DM;
  });
  const h = (b) => r.posedHead(b).setY(r.posedHead(b).y - minY).multiplyScalar(DM);
  const t = (b) => r.posedTail(b).setY(r.posedTail(b).y - minY).multiplyScalar(DM);
  const joints = new Float32Array(BONES.length * 3);
  BONES.forEach((b, i) => {
    const p = b.at(h, t);
    if (b.name === "tail") p.set(h("head").x, (h("head").y + t("head").y) * 0.5, h("head").z - 0.095);
    joints[i * 3] = p.x;
    joints[i * 3 + 1] = p.y;
    joints[i * 3 + 2] = p.z;
  });
  let maxY = 0;
  for (const vi of groupVerts.get("body")) maxY = Math.max(maxY, (r.pos[vi * 3 + 1] - minY) * DM);
  built.push({ a, pos, joints, height: maxY, R: r.R });
  reports[a.id] = { height: +maxY.toFixed(3), ...r.report };
}
console.log(`[humans] ${built.length} bodies in ${Date.now() - t0} ms`);
console.table(reports);

// Ethnic offsets relative to the matching asian adult.
const adultAvg = (sex) => built.find((b) => b.a.id === `${sex}-adult-0.5-0.5`);
for (const b of built.filter((x) => ETHNIC_DELTAS.includes(x.a))) {
  const ref = adultAvg(b.a.sex);
  for (let i = 0; i < b.pos.length; i++) b.pos[i] -= ref.pos[i];
  for (let i = 0; i < b.joints.length; i++) b.joints[i] -= ref.joints[i];
}

// ——— detail targets ————————————————————————————————————————————————————————————

/** Symmetric pairs are merged ("eye-scale-incr" = l- and r- together). */
const TARGETS = [];
const T = (id, files) => TARGETS.push({ id, files });
const both = (group, stem, ends) => {
  for (const e of ends) T(`${stem}-${e}`, [`${group}/l-${stem}-${e}`, `${group}/r-${stem}-${e}`]);
};
const one = (group, stem, ends) => {
  for (const e of ends) T(`${stem}-${e}`, [`${group}/${stem}-${e}`]);
};
one("head", "head-age", ["decr", "incr"]);
one("head", "head-angle", ["in", "out"]);
one("head", "head-fat", ["decr", "incr"]);
for (const s of ["oval", "round", "rectangular", "square", "triangular", "invertedtriangular", "diamond"]) T(`head-${s}`, [`head/head-${s}`]);
one("head", "head-scale-depth", ["decr", "incr"]);
one("head", "head-scale-horiz", ["decr", "incr"]);
one("head", "head-scale-vert", ["decr", "incr"]);
one("head", "head-back-scale-depth", ["decr", "incr"]);
one("forehead", "forehead-scale-vert", ["decr", "incr"]);
one("forehead", "forehead-temple", ["decr", "incr"]);
one("forehead", "forehead-trans", ["backward", "forward"]);
one("eyebrows", "eyebrows-angle", ["down", "up"]);
one("eyebrows", "eyebrows-trans", ["down", "up", "backward", "forward"]);
one("neck", "neck-scale-horiz", ["decr", "incr"]);
one("neck", "neck-scale-depth", ["decr", "incr"]);
one("neck", "neck-scale-vert", ["decr", "incr"]);
both("eyes", "eye-scale", ["decr", "incr"]);
both("eyes", "eye-trans", ["in", "out", "down", "up"]);
both("eyes", "eye-height2", ["decr", "incr"]);
both("eyes", "eye-corner1", ["down", "up"]);
both("eyes", "eye-corner2", ["down", "up"]);
both("eyes", "eye-epicanthus", ["in", "out"]);
both("eyes", "eye-bag", ["decr", "incr"]);
both("eyes", "eye-eyefold", ["down", "up", "concave", "convex"]);
both("eyes", "eye-push1", ["in", "out"]);
for (const s of ["trans-down", "trans-up", "trans-backward", "trans-forward", "scale-vert-decr", "scale-vert-incr", "scale-horiz-decr", "scale-horiz-incr", "scale-depth-decr", "scale-depth-incr", "nostrils-width-decr", "nostrils-width-incr", "point-width-decr", "point-width-incr", "base-down", "base-up", "width1-decr", "width1-incr", "width2-decr", "width2-incr", "compression-compress", "curve-concave", "curve-convex", "greek-decr", "greek-incr", "hump-decr", "hump-incr", "volume-decr", "volume-incr", "point-down", "point-up", "flaring-decr", "flaring-incr"])
  T(`nose-${s}`, [`nose/nose-${s}`]);
for (const s of ["scale-horiz-decr", "scale-horiz-incr", "scale-vert-decr", "scale-vert-incr", "trans-down", "trans-up", "trans-backward", "trans-forward", "lowerlip-volume-decr", "lowerlip-volume-incr", "upperlip-volume-decr", "upperlip-volume-incr", "angles-down", "angles-up", "cupidsbow-decr", "cupidsbow-incr", "lowerlip-height-decr", "lowerlip-height-incr", "upperlip-height-decr", "upperlip-height-incr", "laugh-lines-in", "laugh-lines-out"])
  T(`mouth-${s}`, [`mouth/mouth-${s}`]);
both("ears", "ear-scale", ["decr", "incr"]);
both("ears", "ear-flap", ["decr", "incr"]);
both("ears", "ear-lobe", ["decr", "incr"]);
both("ears", "ear-shape", ["pointed", "triangle"]);
both("ears", "ear-rot", ["backward", "forward"]);
for (const s of ["jaw-drop-decr", "jaw-drop-incr", "prominent-decr", "prominent-incr", "width-decr", "width-incr", "height-decr", "height-incr", "bones-decr", "bones-incr", "prognathism-decr", "prognathism-incr", "cleft-incr"]) T(`chin-${s}`, [`chin/chin-${s}`]);
both("cheek", "cheek-bones", ["decr", "incr"]);
both("cheek", "cheek-volume", ["decr", "incr"]);
both("cheek", "cheek-inner", ["decr", "incr"]);
for (const s of ["vshape-decr", "vshape-incr", "scale-horiz-decr", "scale-horiz-incr", "scale-depth-decr", "scale-depth-incr", "muscle-pectoral-decr", "muscle-pectoral-incr", "muscle-dorsi-decr", "muscle-dorsi-incr"]) T(`torso-${s}`, [`torso/torso-${s}`]);
for (const s of ["pregnant-decr", "pregnant-incr", "tone-decr", "tone-incr"]) T(`stomach-${s}`, [`stomach/stomach-${s}`]);
for (const s of ["scale-horiz-decr", "scale-horiz-incr", "scale-depth-decr", "scale-depth-incr", "waist-down", "waist-up"]) T(`hip-${s}`, [`hip/hip-${s}`]);
T("buttocks-volume-decr", ["buttocks/buttocks-volume-decr"]);
T("buttocks-volume-incr", ["buttocks/buttocks-volume-incr"]);
for (const part of ["upperarm", "lowerarm"]) for (const k of ["muscle", "fat"]) for (const e of ["decr", "incr"]) T(`${part}-${k}-${e}`, [`armslegs/l-${part}-${k}-${e}`, `armslegs/r-${part}-${k}-${e}`]);
for (const e of ["decr", "incr"]) T(`upperarm-shoulder-muscle-${e}`, [`armslegs/l-upperarm-shoulder-muscle-${e}`, `armslegs/r-upperarm-shoulder-muscle-${e}`]);
for (const part of ["upperleg", "lowerleg"]) for (const k of ["muscle", "fat"]) for (const e of ["decr", "incr"]) T(`${part}-${k}-${e}`, [`armslegs/l-${part}-${k}-${e}`, `armslegs/r-${part}-${k}-${e}`]);
for (const e of ["decr", "incr"]) T(`hand-scale-${e}`, [`armslegs/l-hand-scale-${e}`, `armslegs/r-hand-scale-${e}`]);

// Targets are authored in the A-pose; rotate each delta by its vertex's re-pose rotation
// (using the average male as reference) so they apply to the posed kit.
const refR = built.find((b) => b.a.id === "m-adult-0.5-0.5").R;
const rotOf = new Map(); // mh bone → Matrix3
for (const [b, q] of refR) rotOf.set(b, new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)));
const vertBones = Array.from({ length: NV }, () => []);
for (const [b, list] of Object.entries(mhWeights)) for (const [vi, w] of list) vertBones[vi].push([b, w]);
function rotateDelta(vi, d) {
  const out = new THREE.Vector3();
  let tw = 0;
  for (const [b, w] of vertBones[vi]) {
    out.add(d.clone().applyMatrix3(rotOf.get(b)).multiplyScalar(w));
    tw += w;
  }
  return tw > 1e-6 ? out.divideScalar(tw) : d.clone();
}

const exported = [];
for (const t of TARGETS) {
  const acc = new Map();
  for (const f of t.files) {
    const tg = loadTarget(f);
    for (let i = 0; i < tg.idx.length; i++) {
      const vi = tg.idx[i];
      const d = new THREE.Vector3(tg.d[i * 3], tg.d[i * 3 + 1], tg.d[i * 3 + 2]);
      const cur = acc.get(vi) ?? new THREE.Vector3();
      acc.set(vi, cur.add(d));
    }
  }
  const idx = [];
  const d = [];
  for (const [vi, delta] of acc) {
    if (slot[vi] < 0 || delta.lengthSq() < 1e-10) continue;
    const r = rotateDelta(vi, delta).multiplyScalar(DM);
    idx.push(slot[vi]);
    d.push(r.x, r.y, r.z);
  }
  // Joint offsets: our joints come from MakeHuman joint cubes; move them by the mean delta.
  const jd = new Float32Array(BONES.length * 3);
  const jointCube = (mhJoint) => skel.joints[mhJoint];
  BONES.forEach((b, bi) => {
    const src = { jaw: "jaw____head", head: "head____head", neck: "neck01____head" }[b.name] ?? (b.name.startsWith("eye") ? `eye.${b.name.slice(3)}____head` : b.name.startsWith("lid") ? `eye.${b.name.slice(-1)}____head` : null);
    if (!src) return;
    const cube = jointCube(src);
    const m = new THREE.Vector3();
    for (const vi of cube) m.add(acc.get(vi) ?? new THREE.Vector3());
    m.divideScalar(cube.length).multiplyScalar(DM);
    jd[bi * 3] = m.x;
    jd[bi * 3 + 1] = m.y;
    jd[bi * 3 + 2] = m.z;
  });
  exported.push({ id: t.id, idx, d, jd });
}

// ——— topology ————————————————————————————————————————————————————————————————————

/** Unique (vertex, uv) corners → render vertices; quads split into triangles. */
function topology(faces, uvs, mapVertex) {
  const key = new Map();
  const vtx = [];
  const uv = [];
  const tris = [];
  const corner = (v, t) => {
    const k = v * 65536 + (t < 0 ? 65535 : t);
    let i = key.get(k);
    if (i === undefined) {
      i = vtx.length;
      key.set(k, i);
      vtx.push(mapVertex(v));
      uv.push(t >= 0 ? uvs[t * 2] : 0, t >= 0 ? uvs[t * 2 + 1] : 0);
    }
    return i;
  };
  const quads = [];
  for (const f of faces) {
    const c = f.v.map((v, k) => corner(v, f.t[k]));
    if (c.length === 4) {
      tris.push(c[0], c[1], c[2], c[0], c[2], c[3]);
      quads.push(f.v.map(mapVertex));
    } else if (c.length === 3) tris.push(c[0], c[1], c[2]);
    else for (let k = 1; k < c.length - 1; k++) tris.push(c[0], c[k], c[k + 1]);
  }
  return { vtx, uv, tris, quads };
}

const bodyFaces = base.faces.filter((f) => f.g === "body");
const body = topology(bodyFaces, base.vt, (v) => slot[v]);
const guides = {};
for (const g of ["helper-tights", "helper-skirt", "helper-hair"]) guides[g.slice(7)] = topology(base.faces.filter((f) => f.g === g), base.vt, (v) => slot[v]);

// Weights per stored vertex.
const sIdx = new Uint8Array(NS * 4);
const sW = new Uint8Array(NS * 4);
kept.forEach((vi, i) => {
  const w = baseW[vi];
  let total = 0;
  for (let k = 0; k < 4; k++) {
    sIdx[i * 4 + k] = w.idx[k];
    const q = k < 3 ? Math.round(w.w[k] * 255) : 255 - total;
    sW[i * 4 + k] = Math.max(0, q);
    total += Math.max(0, q);
  }
});

// Proxies: topology + fitting references + weights blended from the references.
const proxyOut = PROXIES.map((p) => {
  const topo = topology(p.mesh.faces, p.mesh.vt, (v) => v);
  const refs = p.clo.refs;
  const n = refs.length;
  const ref = new Uint16Array(n * 3);
  const rw = new Float32Array(n * 3);
  const off = new Float32Array(n * 3);
  const pIdx = new Uint8Array(n * 4);
  const pW = new Uint8Array(n * 4);
  refs.forEach((r, i) => {
    for (let k = 0; k < 3; k++) {
      ref[i * 3 + k] = slot[r[k]];
      rw[i * 3 + k] = r[3 + k];
      off[i * 3 + k] = r[6 + k] * DM;
    }
    const m = new Map();
    for (let k = 0; k < 3; k++) for (const [b, w] of vw[r[k]]) m.set(b, (m.get(b) ?? 0) + w * r[3 + k]);
    const w = top4(m);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      pIdx[i * 4 + k] = w.idx[k];
      const q = k < 3 ? Math.round(w.w[k] * 255) : 255 - total;
      pW[i * 4 + k] = Math.max(0, q);
      total += Math.max(0, q);
    }
  });
  const sc = ["x", "y", "z"].map((k) => [slot[p.clo.scale[k][0]], slot[p.clo.scale[k][1]], p.clo.scale[k][2] * DM]);
  return { id: p.id, topo, ref, rw, off, pIdx, pW, scale: sc, n };
});

// ——— write ———————————————————————————————————————————————————————————————————————

const chunks = [];
let offset = 0;
const layout = {};
function put(name, arr) {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  layout[name] = { type: arr.constructor.name, offset, length: arr.length };
  chunks.push(buf);
  offset += buf.byteLength;
}
const Q = 32767;
const POS_RANGE = 2.5; // metres; int16 positions cover ±2.5 m
const qpos = (f32) => Int16Array.from(f32, (x) => Math.round((x / POS_RANGE) * Q));

for (const b of built) put(`pos:${b.a.id}`, qpos(b.pos));
for (const b of built) put(`joints:${b.a.id}`, b.joints);
put("weights:idx", sIdx);
put("weights:w", sW);
put("body:vtx", Uint16Array.from(body.vtx));
put("body:uv", Float32Array.from(body.uv));
put("body:tris", Uint16Array.from(body.tris));
for (const [g, topo] of Object.entries(guides)) {
  put(`${g}:vtx`, Uint16Array.from(topo.vtx));
  put(`${g}:uv`, Float32Array.from(topo.uv));
  put(`${g}:tris`, Uint16Array.from(topo.tris));
}
for (const p of proxyOut) {
  put(`${p.id}:vtx`, Uint16Array.from(p.topo.vtx));
  put(`${p.id}:uv`, Float32Array.from(p.topo.uv));
  put(`${p.id}:tris`, Uint16Array.from(p.topo.tris));
  put(`${p.id}:ref`, p.ref);
  put(`${p.id}:rw`, p.rw);
  put(`${p.id}:off`, p.off);
  put(`${p.id}:widx`, p.pIdx);
  put(`${p.id}:w`, p.pW);
}
const targetMeta = [];
for (const t of exported) {
  const maxAbs = t.d.reduce((m, x) => Math.max(m, Math.abs(x)), 1e-6);
  put(`t:${t.id}:idx`, Uint16Array.from(t.idx));
  put(`t:${t.id}:d`, Int16Array.from(t.d, (x) => Math.round((x / maxAbs) * Q)));
  const hasJ = t.jd.some((x) => Math.abs(x) > 1e-7);
  if (hasJ) put(`t:${t.id}:j`, t.jd);
  targetMeta.push({ id: t.id, n: t.idx.length, scale: maxAbs, joints: hasJ });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "human.bin"), Buffer.concat(chunks));
const meta = {
  version: 1,
  source: "MakeHuman hm08 (CC0) — base mesh, targets, rig weights, proxies",
  posRange: POS_RANGE,
  vertexCount: NS,
  bones: BONES.map((b) => ({ name: b.name, parent: b.parent })),
  archetypes: ARCHETYPES.map((a) => ({ id: a.id, sex: a.sex, age: a.age, muscle: a.muscle, weight: a.weight, height: +reports[a.id].height.toFixed(4) })),
  ethnic: ETHNIC_DELTAS.map((e) => ({ id: e.id, sex: e.sex, race: e.race })),
  targets: targetMeta,
  proxies: proxyOut.map((p) => ({ id: p.id, n: p.n, scale: p.scale })),
  guides: Object.keys(guides),
  layout,
};
fs.writeFileSync(path.join(OUT, "human.json"), JSON.stringify(meta));
console.log(`[humans] human.bin ${(offset / 1e6).toFixed(2)} MB · ${NS} stored vertices · body ${body.vtx.length} render verts / ${body.tris.length / 3} tris · ${exported.length} targets`);

// ——— textures ————————————————————————————————————————————————————————————————————

const TEX = path.join(OUT, "tex");
fs.mkdirSync(TEX, { recursive: true });
const sips = (src, dest, size, fmt = "jpeg", q = 82) => {
  if (fs.existsSync(dest)) return;
  const args = ["-s", "format", fmt, "-Z", String(size), src, "--out", dest];
  if (fmt === "jpeg") args.unshift("-s", "formatOptions", String(q));
  execFileSync("sips", args, { stdio: "ignore" });
};
const SKINS = {
  "young-asian-m": "skins/young_asian_male/young_lightskinned_male_diffuse3.png",
  "young-asian-f": "skins/young_asian_female/young_lightskinned_female_diffuse3.png",
  "young-caucasian-m": "skins/young_caucasian_male/young_lightskinned_male_diffuse.png",
  "young-caucasian-f": "skins/young_caucasian_female/young_lightskinned_female_diffuse.png",
  "young-african-m": "skins/young_african_male/young_darkskinned_male_diffuse.png",
  "young-african-f": "skins/young_african_female/young_darkskinned_female_diffuse.png",
  "old-asian-m": "skins/old_asian_male/old_lightskinned_male_diffuse2.png",
  "old-asian-f": "skins/old_asian_female/old_lightskinned_female_diffuse2.png",
};
for (const [id, rel] of Object.entries(SKINS)) {
  const src = path.join(CACHE, "assets", rel);
  if (!fs.existsSync(src)) {
    const dir = path.dirname(src);
    const alt = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith(".png") && f.includes("diffuse")) : null;
    if (!alt) {
      console.warn(`[humans] skin ${id}: no texture in ${dir}`);
      continue;
    }
    sips(path.join(dir, alt), path.join(TEX, `skin-${id}.jpg`), 2048);
  } else sips(src, path.join(TEX, `skin-${id}.jpg`), 2048);
}
for (const eye of ["brown", "blue", "green", "grey", "lightblue", "brownlight"]) sips(path.join(CACHE, "assets/eyes/materials", `${eye}_eye.png`), path.join(TEX, `eye-${eye}.png`), 512, "png");
for (const n of ["001", "002", "003", "004", "005", "006", "007", "008", "009", "010", "011", "012"]) sips(path.join(CACHE, "assets/eyebrows", `eyebrow${n}`, `eyebrow${n}.png`), path.join(TEX, `brow${n}.png`), 256, "png");
sips(path.join(CACHE, "assets/eyelashes/eyelashes01/eyelashes01.png"), path.join(TEX, "lashes01.png"), 256, "png");
sips(path.join(CACHE, "assets/eyelashes/eyelashes03/eyelashes03.png"), path.join(TEX, "lashes03.png"), 256, "png");
sips(path.join(CACHE, "assets/teeth/teeth_base/teeth.png"), path.join(TEX, "teeth.jpg"), 512, "jpeg", 85);
const tongueTex = fs.readdirSync(path.join(CACHE, "assets/tongue/tongue01")).find((f) => /\.(png|jpg)$/.test(f) && !f.includes("thumb"));
if (tongueTex) sips(path.join(CACHE, "assets/tongue/tongue01", tongueTex), path.join(TEX, "tongue.jpg"), 256, "jpeg", 85);
const size = fs.readdirSync(TEX).reduce((a, f) => a + fs.statSync(path.join(TEX, f)).size, 0);
console.log(`[humans] textures ${(size / 1e6).toFixed(2)} MB`);
