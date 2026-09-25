// The human kit baked by scripts/build-humans.mjs from MakeHuman (CC0): one topology,
// 26 body archetypes (sex × age × muscle × weight), ethnic offsets, sparse detail targets
// for faces and builds, and proxies (eyes, brows, lashes, teeth, tongue). A body is a
// blend of archetypes — the same piecewise-linear interpolation MakeHuman uses — plus
// targets, scaled to the requested height. Everything is in the game's rest pose.

import * as THREE from "three";

export interface HumanSpec {
  sex: "m" | "f";
  age: "child" | "adult" | "elder";
  /** MakeHuman muscle 0..1 (0.5 average). */
  muscle: number;
  /** MakeHuman weight 0..1 (0.5 average). */
  weight: number;
  /** Standing height in metres. */
  height: number;
  /** Offsets from the (asian) base: 0..1 each. */
  ethnic?: { caucasian?: number; african?: number };
  /** Detail targets by id (see human.json), usually 0..1. */
  targets?: Record<string, number>;
}

interface Chunk {
  type: "Int16Array" | "Uint16Array" | "Float32Array" | "Uint8Array";
  offset: number;
  length: number;
}

interface Meta {
  posRange: number;
  vertexCount: number;
  bones: { name: string; parent: string | null }[];
  archetypes: { id: string; sex: string; age: string; muscle: number; weight: number; height: number }[];
  ethnic: { id: string; sex: string; race: string }[];
  targets: { id: string; n: number; scale: number; joints: boolean }[];
  proxies: { id: string; n: number; scale: [number, number, number][] }[];
  guides: string[];
  layout: Record<string, Chunk>;
}

/** A body in the rest pose: positions for every stored kit vertex, and joint positions. */
export interface HumanBody {
  spec: HumanSpec;
  /** Stored-vertex positions (kit.vertexCount × 3), metres, feet at y = 0. */
  pos: Float32Array;
  /** Rest-pose joint positions per bone (world), metres. */
  joints: Float32Array;
  /** Stored-vertex normals (computed from the body surface). */
  normals: Float32Array;
}

const TYPES = { Int16Array, Uint16Array, Float32Array, Uint8Array };

export class HumanKit {
  readonly boneNames: string[];
  readonly boneParent: number[];
  readonly boneIndex: Record<string, number>;
  readonly vertexCount: number;
  readonly targetIds: Set<string>;
  private arrays = new Map<string, ArrayLike<number>>();
  private posCache = new Map<string, Float32Array>();

  private constructor(
    readonly meta: Meta,
    private buf: ArrayBuffer,
    readonly baseUrl: string,
  ) {
    this.boneNames = meta.bones.map((b) => b.name);
    this.boneIndex = Object.fromEntries(this.boneNames.map((n, i) => [n, i]));
    this.boneParent = meta.bones.map((b) => (b.parent ? this.boneIndex[b.parent] : -1));
    this.vertexCount = meta.vertexCount;
    this.targetIds = new Set(meta.targets.map((t) => t.id));
  }

  static async load(baseUrl = "/assets/humans/"): Promise<HumanKit> {
    const [meta, buf] = await Promise.all([
      fetch(`${baseUrl}human.json`).then((r) => {
        if (!r.ok) throw new Error(`human.json: ${r.status}`);
        return r.json() as Promise<Meta>;
      }),
      fetch(`${baseUrl}human.bin`).then((r) => {
        if (!r.ok) throw new Error(`human.bin: ${r.status}`);
        return r.arrayBuffer();
      }),
    ]);
    return new HumanKit(meta, buf, baseUrl);
  }

  /** Typed view of a chunk in human.bin. */
  view<T extends ArrayLike<number>>(name: string): T {
    let a = this.arrays.get(name);
    if (!a) {
      const c = this.meta.layout[name];
      if (!c) throw new Error(`human kit: no chunk ${name}`);
      a = new TYPES[c.type](this.buf, c.offset, c.length);
      this.arrays.set(name, a);
    }
    return a as T;
  }

  has(name: string) {
    return name in this.meta.layout;
  }

  private archetypePos(id: string): Float32Array {
    let p = this.posCache.get(id);
    if (!p) {
      const q = this.view<Int16Array>(`pos:${id}`);
      const s = this.meta.posRange / 32767;
      p = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) p[i] = q[i] * s;
      this.posCache.set(id, p);
    }
    return p;
  }

  /** Archetype blend weights for a spec (MakeHuman's piecewise-linear macro scheme). */
  private blend(spec: HumanSpec): [string, number][] {
    const c = (x: number) => THREE.MathUtils.clamp(x, 0, 1);
    const cell = (x: number): [number, number, number] => (x <= 0.5 ? [0, 0.5, x / 0.5] : [0.5, 1, (x - 0.5) / 0.5]);
    const id = (age: string, m: number, w: number) => `${spec.sex}-${age}-${m}-${w}`;
    if (spec.age === "child") return [[id("child", 0.5, 0.5), 1]];
    const [w0, w1, tw] = cell(c(spec.weight));
    if (spec.age === "elder")
      return [
        [id("elder", 0.5, w0), 1 - tw],
        [id("elder", 0.5, w1), tw],
      ];
    const [m0, m1, tm] = cell(c(spec.muscle));
    return [
      [id("adult", m0, w0), (1 - tm) * (1 - tw)],
      [id("adult", m1, w0), tm * (1 - tw)],
      [id("adult", m0, w1), (1 - tm) * tw],
      [id("adult", m1, w1), tm * tw],
    ];
  }

  /** Assemble a body for a spec. */
  body(spec: HumanSpec): HumanBody {
    const n = this.vertexCount * 3;
    const nb = this.boneNames.length * 3;
    const pos = new Float32Array(n);
    const joints = new Float32Array(nb);
    for (const [id, w] of this.blend(spec)) {
      if (w < 1e-6) continue;
      const p = this.archetypePos(id);
      const j = this.view<Float32Array>(`joints:${id}`);
      for (let i = 0; i < n; i++) pos[i] += p[i] * w;
      for (let i = 0; i < nb; i++) joints[i] += j[i] * w;
    }
    // Ethnic offsets (defined on adults; children get half).
    const k = spec.age === "child" ? 0.5 : 1;
    for (const race of ["caucasian", "african"] as const) {
      const w = (spec.ethnic?.[race] ?? 0) * k;
      if (!w) continue;
      const id = `${spec.sex}-${race}`;
      const p = this.archetypePos(id);
      const j = this.view<Float32Array>(`joints:${id}`);
      for (let i = 0; i < n; i++) pos[i] += p[i] * w;
      for (let i = 0; i < nb; i++) joints[i] += j[i] * w;
    }
    // Detail targets.
    for (const [tid, v] of Object.entries(spec.targets ?? {})) {
      if (!v) continue;
      const meta = this.meta.targets.find((t) => t.id === tid);
      if (!meta) {
        console.warn(`[human] unknown target ${tid}`);
        continue;
      }
      const idx = this.view<Uint16Array>(`t:${tid}:idx`);
      const d = this.view<Int16Array>(`t:${tid}:d`);
      const s = (meta.scale / 32767) * v;
      for (let i = 0; i < idx.length; i++) {
        const o = idx[i] * 3;
        pos[o] += d[i * 3] * s;
        pos[o + 1] += d[i * 3 + 1] * s;
        pos[o + 2] += d[i * 3 + 2] * s;
      }
      if (meta.joints) {
        const jd = this.view<Float32Array>(`t:${tid}:j`);
        for (let i = 0; i < nb; i++) joints[i] += jd[i] * v;
      }
    }
    // Scale to the requested height (feet stay on the ground).
    const vtx = this.view<Uint16Array>("body:vtx");
    let top = 0;
    for (let i = 0; i < vtx.length; i++) top = Math.max(top, pos[vtx[i] * 3 + 1]);
    const s = spec.height / top;
    for (let i = 0; i < n; i++) pos[i] *= s;
    for (let i = 0; i < nb; i++) joints[i] *= s;
    return { spec, pos, joints, normals: this.surfaceNormals(pos) };
  }

  /** Smooth normals over the body surface (shared across UV seams). */
  private surfaceNormals(pos: Float32Array): Float32Array {
    const nrm = new Float32Array(pos.length);
    const accumulate = (vtxName: string, trisName: string) => {
      const vtx = this.view<Uint16Array>(vtxName);
      const tris = this.view<Uint16Array>(trisName);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let t = 0; t < tris.length; t += 3) {
        const ia = vtx[tris[t]];
        const ib = vtx[tris[t + 1]];
        const ic = vtx[tris[t + 2]];
        a.fromArray(pos, ia * 3);
        b.fromArray(pos, ib * 3).sub(a);
        c.fromArray(pos, ic * 3).sub(a);
        b.cross(c); // area-weighted
        for (const i of [ia, ib, ic]) {
          nrm[i * 3] += b.x;
          nrm[i * 3 + 1] += b.y;
          nrm[i * 3 + 2] += b.z;
        }
      }
    };
    accumulate("body:vtx", "body:tris");
    for (const g of this.meta.guides) accumulate(`${g}:vtx`, `${g}:tris`);
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
      nrm[i] /= l;
      nrm[i + 1] /= l;
      nrm[i + 2] /= l;
    }
    return nrm;
  }

  joint(b: HumanBody, bone: string, out = new THREE.Vector3()) {
    return out.fromArray(b.joints, this.boneIndex[bone] * 3);
  }

  /**
   * Skinned geometry for the body surface (or a guide surface). `keepTri` can drop
   * triangles (by stored-vertex ids), e.g. skin hidden under clothing.
   */
  surfaceGeometry(b: HumanBody, part = "body", keepTri?: (a: number, bb: number, c: number) => boolean): THREE.BufferGeometry {
    const vtx = this.view<Uint16Array>(`${part}:vtx`);
    const uv = this.view<Float32Array>(`${part}:uv`);
    const tris = this.view<Uint16Array>(`${part}:tris`);
    const wi = this.view<Uint8Array>("weights:idx");
    const ww = this.view<Uint8Array>("weights:w");
    const n = vtx.length;
    const position = new Float32Array(n * 3);
    const normal = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const stored = new Uint16Array(n);
    for (let r = 0; r < n; r++) {
      const s = vtx[r];
      stored[r] = s;
      for (let k = 0; k < 3; k++) {
        position[r * 3 + k] = b.pos[s * 3 + k];
        normal[r * 3 + k] = b.normals[s * 3 + k];
      }
      for (let k = 0; k < 4; k++) {
        skinIndex[r * 4 + k] = wi[s * 4 + k];
        skinWeight[r * 4 + k] = ww[s * 4 + k] / 255;
      }
    }
    let index: number[] | Uint16Array = tris;
    if (keepTri) {
      const kept: number[] = [];
      for (let t = 0; t < tris.length; t += 3) if (keepTri(vtx[tris[t]], vtx[tris[t + 1]], vtx[tris[t + 2]])) kept.push(tris[t], tris[t + 1], tris[t + 2]);
      index = kept;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
    g.setIndex(new THREE.BufferAttribute(index instanceof Uint16Array ? new Uint16Array(index) : Uint16Array.from(index), 1));
    g.userData.stored = stored;
    return g;
  }

  /** Fit a proxy (eyes, brows, lashes, teeth, tongue) to a body, as skinned geometry. */
  proxyGeometry(b: HumanBody, id: string): THREE.BufferGeometry {
    const meta = this.meta.proxies.find((p) => p.id === id);
    if (!meta) throw new Error(`human kit: no proxy ${id}`);
    const ref = this.view<Uint16Array>(`${id}:ref`);
    const rw = this.view<Float32Array>(`${id}:rw`);
    const off = this.view<Float32Array>(`${id}:off`);
    const scale = meta.scale.map(([a, c, d0], axis) => Math.abs(b.pos[a * 3 + axis] - b.pos[c * 3 + axis]) / d0);
    const fitted = new Float32Array(meta.n * 3);
    for (let i = 0; i < meta.n; i++) {
      for (let axis = 0; axis < 3; axis++) {
        let v = 0;
        for (let k = 0; k < 3; k++) v += b.pos[ref[i * 3 + k] * 3 + axis] * rw[i * 3 + k];
        fitted[i * 3 + axis] = v + off[i * 3 + axis] * scale[axis];
      }
    }
    const vtx = this.view<Uint16Array>(`${id}:vtx`);
    const uv = this.view<Float32Array>(`${id}:uv`);
    const tris = this.view<Uint16Array>(`${id}:tris`);
    const wi = this.view<Uint8Array>(`${id}:widx`);
    const ww = this.view<Uint8Array>(`${id}:w`);
    const n = vtx.length;
    const position = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let r = 0; r < n; r++) {
      const s = vtx[r];
      for (let k = 0; k < 3; k++) position[r * 3 + k] = fitted[s * 3 + k];
      for (let k = 0; k < 4; k++) {
        skinIndex[r * 4 + k] = wi[s * 4 + k];
        skinWeight[r * 4 + k] = ww[s * 4 + k] / 255;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(position, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
    if (id === "eyes") {
      // Two shells per eye: the eyeball, and a cornea mapped to the texture's corner
      // disc. Group 0 = eyeballs (opaque), group 1 = corneas (drawn as a specular glaze).
      const ball: number[] = [];
      const cornea: number[] = [];
      for (let t = 0; t < tris.length; t += 3) {
        const u = uv[tris[t] * 2];
        const v = uv[tris[t] * 2 + 1];
        (u > 0.85 && v < 0.15 ? cornea : ball).push(tris[t], tris[t + 1], tris[t + 2]);
      }
      g.setIndex(new THREE.BufferAttribute(Uint16Array.from([...ball, ...cornea]), 1));
      g.addGroup(0, ball.length, 0);
      g.addGroup(ball.length, cornea.length, 1);
    } else g.setIndex(new THREE.BufferAttribute(new Uint16Array(tris), 1));
    g.computeVertexNormals();
    return g;
  }

  /** Bones in the rest pose (identity rotations), positioned from the body's joints. */
  skeleton(b: HumanBody): { bones: THREE.Bone[]; byName: Record<string, THREE.Bone> } {
    const bones: THREE.Bone[] = [];
    const byName: Record<string, THREE.Bone> = {};
    this.boneNames.forEach((name, i) => {
      const bone = new THREE.Bone();
      bone.name = name;
      const p = this.boneParent[i];
      const wp = new THREE.Vector3().fromArray(b.joints, i * 3);
      if (p >= 0) {
        bones[p].add(bone);
        bone.position.copy(wp).sub(new THREE.Vector3().fromArray(b.joints, p * 3));
      } else bone.position.copy(wp);
      bones.push(bone);
      byName[name] = bone;
    });
    return { bones, byName };
  }

  texture(name: string): string {
    return `${this.baseUrl}tex/${name}`;
  }
}

let kitPromise: Promise<HumanKit> | null = null;
let kitReady: HumanKit | null = null;

/** Load (once) the shared kit. */
export function loadHumanKit(): Promise<HumanKit> {
  if (!kitPromise) kitPromise = HumanKit.load().then((k) => (kitReady = k));
  return kitPromise;
}

/** The kit, once loaded (characters are built after the loading screen). */
export function humanKit(): HumanKit {
  if (!kitReady) throw new Error("human kit not loaded yet");
  return kitReady;
}
