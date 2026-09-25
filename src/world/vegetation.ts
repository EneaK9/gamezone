// Trees, bamboo, bushes, grass and rice. Hand-shaped trees (sakura, pine, maple, willow)
// are merged per species; mass vegetation uses instancing. Foliage sways in the wind.

import * as THREE from "three";
import { fbm, makeNoise2, makeRng, smoothstep, type Rng } from "../core/math";
import type { Materials } from "../render/materials";
import type { CollisionWorld } from "./collision";
import {
  bambooLeafTexture,
  flowerTexture,
  grassTexture,
  leafTexture,
  mapleTexture,
  pineTexture,
  sakuraTexture,
  willowTexture,
} from "./foliageTextures";
import type { HeightGrid } from "./heightfield";
import { BAMBOO, PADDIES, RIVER, VILLAGE_RECT, WORLD_HALF, rectDist, riverQuery } from "./layout";

export type FreeFn = (x: number, z: number, clearance: number) => boolean;

const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uCam: { value: new THREE.Vector3() } };

function withWind(mat: THREE.MeshStandardMaterial, key: string, instanced = false): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uCam = windUniforms.uCam;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uCam;
        attribute float sway;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          vec4 wp0 = modelMatrix * ${instanced ? "instanceMatrix * " : ""}vec4(transformed, 1.0);
          float w = sway * uWind * (sin(uTime * 1.25 + wp0.x * 0.31 + wp0.z * 0.17) * 0.09 + sin(uTime * 2.9 + wp0.z * 0.83 + wp0.x * 0.2) * 0.035);
          transformed.x += w;
          transformed.z += w * 0.6;
          transformed.y -= abs(w) * 0.2;
          ${instanced ? "transformed.y *= smoothstep(0.8, 3.2, distance(wp0.xz, uCam.xz));" : ""}
        }`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${key}`;
  return mat;
}

function foliageMaterial(map: THREE.Texture, key: string, instanced = false, color = "#ffffff"): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = withWind(
    new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, color: new THREE.Color(color) }),
    key,
    instanced,
  );
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 });
  return { mat, depth };
}

// ——— geometry builders ————————————————————————————————————————————

class CardBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  sway: number[] = [];
  private tmpN = new THREE.Vector3();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  /** One quad of size s at p, facing roughly `dir`, lit as if part of a sphere around `centre`. */
  card(p: THREE.Vector3, s: number, dir: THREE.Vector3, centre: THREE.Vector3, sway: number, rng: Rng, stretchY = 1) {
    const n = this.tmpN.copy(dir).normalize();
    const a = this.tmpA.set(-n.z, 0, n.x);
    if (a.lengthSq() < 1e-4) a.set(1, 0, 0);
    a.normalize();
    const b = this.tmpB.crossVectors(n, a).normalize();
    const rot = rng.range(0, Math.PI * 2);
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    const ax = a.x * ca + b.x * sa, ay = a.y * ca + b.y * sa, az = a.z * ca + b.z * sa;
    const bx = -a.x * sa + b.x * ca, by = (-a.y * sa + b.y * ca) * stretchY, bz = -a.z * sa + b.z * ca;
    const h = s / 2;
    const corners = [
      [-h, -h, 0, 0], [h, -h, 1, 0], [-h, h, 0, 1], [h, h, 1, 1],
    ];
    const vi: number[][] = [];
    for (const [u, v, tu, tv] of corners) {
      const x = p.x + ax * u + bx * v;
      const y = p.y + ay * u + by * v;
      const z = p.z + az * u + bz * v;
      const nx = x - centre.x, ny = y - centre.y + 0.6, nz = z - centre.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      vi.push([x, y, z, nx / l, ny / l, nz / l, tu, tv]);
    }
    for (const idx of [0, 1, 2, 1, 3, 2]) {
      const v = vi[idx];
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(v[3], v[4], v[5]);
      this.uv.push(v[6], v[7]);
      this.sway.push(sway);
    }
  }

  /** A roughly spherical clump of cards. */
  blob(c: THREE.Vector3, r: number, count: number, size: number, sway: number, rng: Rng, flatten = 1, upBias = 0) {
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      d.set(rng.range(-1, 1), rng.range(-1, 1) * flatten, rng.range(-1, 1));
      if (d.lengthSq() > 1) {
        i--;
        continue;
      }
      p.copy(d).multiplyScalar(r).add(c);
      const out = d.clone().normalize();
      out.y += upBias;
      this.card(p, size * rng.range(0.8, 1.2), out, c, sway, rng);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("sway", new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeBoundingSphere();
    return g;
  }
}

class TubeBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** Tapered tube through `pts` with per-point radius. */
  tube(pts: THREE.Vector3[], radii: number[], radial = 7) {
    const base = this.pos.length / 3;
    const up = new THREE.Vector3(0, 1, 0);
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(next, prev).normalize();
      const ref = Math.abs(t.dot(up)) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
      const n1 = new THREE.Vector3().crossVectors(t, ref).normalize();
      const n2 = new THREE.Vector3().crossVectors(t, n1).normalize();
      if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const nx = n1.x * Math.cos(a) + n2.x * Math.sin(a);
        const ny = n1.y * Math.cos(a) + n2.y * Math.sin(a);
        const nz = n1.z * Math.cos(a) + n2.z * Math.sin(a);
        const r = radii[i];
        this.pos.push(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r);
        this.nor.push(nx, ny, nz);
        this.uv.push((k / radial) * 1.5, len / 1.4);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < radial; k++) {
        const a = base + i * (radial + 1) + k;
        const b = a + radial + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Branch from `a` toward `dir` with a gentle curve; returns the points. */
function limb(a: THREE.Vector3, dir: THREE.Vector3, len: number, bend: THREE.Vector3, steps = 5): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [a.clone()];
  const d = dir.clone().normalize();
  const p = a.clone();
  for (let i = 1; i <= steps; i++) {
    d.addScaledVector(bend, 1 / steps).normalize();
    p.addScaledVector(d, len / steps);
    pts.push(p.clone());
  }
  return pts;
}

function taper(n: number, r0: number, r1: number) {
  return Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * (i / (n - 1)));
}

// ——— species ————————————————————————————————————————————————————————

function sakura(x: number, y: number, z: number, s: number, rng: Rng, bark: TubeBuilder, leaves: CardBuilder) {
  const base = new THREE.Vector3(x, y - 0.2, z);
  const lean = new THREE.Vector3(rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3));
  const trunk = limb(base, lean, 2.3 * s, new THREE.Vector3(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)), 5);
  bark.tube(trunk, taper(trunk.length, 0.3 * s, 0.2 * s), 9);
  const top = trunk[trunk.length - 1];
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const dir = new THREE.Vector3(Math.cos(a), rng.range(0.55, 0.95), Math.sin(a));
    const br = limb(top, dir, rng.range(2.2, 3.2) * s, new THREE.Vector3(Math.cos(a) * 0.3, -0.35, Math.sin(a) * 0.3), 5);
    bark.tube(br, taper(br.length, 0.17 * s, 0.05 * s), 6);
    const end = br[br.length - 1];
    leaves.blob(end.clone().add(new THREE.Vector3(0, 0.3 * s, 0)), 1.9 * s, 26, 1.55 * s, 1, rng, 0.62, 0.3);
    const mid = br[2];
    leaves.blob(mid.clone().add(new THREE.Vector3(0, 0.5 * s, 0)), 1.2 * s, 10, 1.3 * s, 0.7, rng, 0.7, 0.3);
  }
  leaves.blob(top.clone().add(new THREE.Vector3(0, 1.6 * s, 0)), 1.8 * s, 22, 1.5 * s, 0.9, rng, 0.6, 0.4);
}

function maple(x: number, y: number, z: number, s: number, rng: Rng, bark: TubeBuilder, leaves: CardBuilder) {
  const base = new THREE.Vector3(x, y - 0.2, z);
  const trunk = limb(base, new THREE.Vector3(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)), 2.2 * s, new THREE.Vector3(0, 0, 0), 4);
  bark.tube(trunk, taper(trunk.length, 0.2 * s, 0.13 * s), 7);
  const top = trunk[trunk.length - 1];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng.range(-0.5, 0.5);
    const br = limb(top, new THREE.Vector3(Math.cos(a), 1.1, Math.sin(a)), 1.8 * s, new THREE.Vector3(Math.cos(a) * 0.4, -0.2, Math.sin(a) * 0.4), 4);
    bark.tube(br, taper(br.length, 0.1 * s, 0.03 * s), 5);
    leaves.blob(br[br.length - 1], 1.5 * s, 22, 1.3 * s, 1, rng, 0.75, 0.2);
  }
  leaves.blob(top.clone().add(new THREE.Vector3(0, 1.7 * s, 0)), 1.7 * s, 24, 1.3 * s, 0.9, rng, 0.8, 0.2);
}

function pine(x: number, y: number, z: number, s: number, rng: Rng, bark: TubeBuilder, leaves: CardBuilder) {
  const base = new THREE.Vector3(x, y - 0.2, z);
  const leanA = rng.range(0, Math.PI * 2);
  const trunk = limb(base, new THREE.Vector3(Math.cos(leanA) * 0.35, 1, Math.sin(leanA) * 0.35), 6 * s, new THREE.Vector3(-Math.cos(leanA) * 0.5, 0, -Math.sin(leanA) * 0.5), 7);
  bark.tube(trunk, taper(trunk.length, 0.28 * s, 0.1 * s), 8);
  const pads = rng.int(4, 6);
  for (let i = 0; i < pads; i++) {
    const t = 0.35 + (i / pads) * 0.65;
    const idx = Math.min(trunk.length - 1, Math.round(t * (trunk.length - 1)));
    const from = trunk[idx];
    const a = rng.range(0, Math.PI * 2);
    const reach = rng.range(1.4, 2.6) * s * (1.1 - t * 0.5);
    const br = limb(from, new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)), reach, new THREE.Vector3(0, 0.2, 0), 3);
    bark.tube(br, taper(br.length, 0.08 * s, 0.03 * s), 5);
    const end = br[br.length - 1];
    leaves.blob(end.clone().add(new THREE.Vector3(0, 0.2, 0)), 1.35 * s, 16, 1.25 * s, 0.5, rng, 0.35, 1.2);
  }
  leaves.blob(trunk[trunk.length - 1].clone().add(new THREE.Vector3(0, 0.3, 0)), 1.3 * s, 16, 1.2 * s, 0.5, rng, 0.4, 1.2);
}

function willow(x: number, y: number, z: number, s: number, rng: Rng, bark: TubeBuilder, strands: CardBuilder) {
  const base = new THREE.Vector3(x, y - 0.2, z);
  const trunk = limb(base, new THREE.Vector3(rng.range(-0.25, 0.25), 1, rng.range(-0.25, 0.25)), 3.2 * s, new THREE.Vector3(0, 0, 0), 4);
  bark.tube(trunk, taper(trunk.length, 0.32 * s, 0.2 * s), 8);
  const top = trunk[trunk.length - 1];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const br = limb(top, new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)), 2.4 * s, new THREE.Vector3(Math.cos(a) * 0.4, -0.9, Math.sin(a) * 0.4), 5);
    bark.tube(br, taper(br.length, 0.1 * s, 0.03 * s), 5);
  }
  // Hanging curtains of leaves.
  const centre = top.clone().add(new THREE.Vector3(0, 0.8 * s, 0));
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.6, 2.9) * s;
    const hangTop = centre.y + 0.5 - (r / (2.9 * s)) * 1.2 * s;
    const len = rng.range(2.4, 3.6) * s;
    const p = new THREE.Vector3(x + Math.cos(a) * r, hangTop - len / 2, z + Math.sin(a) * r);
    const face = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    strands.card(p, len, face.applyAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(-0.6, 0.6)), centre, 1.6, rng, 1);
  }
}

// ——— the vegetation layer ————————————————————————————————————————————

export interface TreeSpot {
  kind: "sakura" | "pine" | "maple" | "willow";
  x: number;
  z: number;
  s: number;
}

export class Vegetation {
  readonly group = new THREE.Group();
  private grassChunks: { mesh: THREE.InstancedMesh; x: number; z: number }[] = [];

  constructor(
    private grid: HeightGrid,
    private materials: Materials,
    private collision: CollisionWorld,
    private free: FreeFn,
    spots: TreeSpot[],
  ) {
    this.buildTrees(spots);
    this.buildForest();
    this.buildBamboo();
    this.buildGrass();
    this.buildRice();
  }

  private buildTrees(spots: TreeSpot[]) {
    const rng = makeRng(808);
    const barkS = new TubeBuilder();
    const barkP = new TubeBuilder();
    const cards = { sakura: new CardBuilder(), pine: new CardBuilder(), maple: new CardBuilder(), willow: new CardBuilder() };
    for (const t of spots) {
      const y = this.grid.height(t.x, t.z);
      if (t.kind === "sakura") sakura(t.x, y, t.z, t.s, rng, barkS, cards.sakura);
      else if (t.kind === "maple") maple(t.x, y, t.z, t.s, rng, barkS, cards.maple);
      else if (t.kind === "willow") willow(t.x, y, t.z, t.s, rng, barkS, cards.willow);
      else pine(t.x, y, t.z, t.s, rng, barkP, cards.pine);
      this.collision.addCircle({ x: t.x, z: t.z, r: 0.35 * t.s, top: y + 4 });
    }
    const addBark = (b: TubeBuilder, key: "sakuraBark" | "pineBark") => {
      if (!b.pos.length) return;
      const m = new THREE.Mesh(b.build(), this.materials.get(key));
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    addBark(barkS, "sakuraBark");
    addBark(barkP, "pineBark");
    const tex = {
      sakura: sakuraTexture(),
      pine: pineTexture(),
      maple: mapleTexture(),
      willow: willowTexture(),
    };
    for (const k of Object.keys(cards) as (keyof typeof cards)[]) {
      if (!cards[k].pos.length) continue;
      const { mat, depth } = foliageMaterial(tex[k], k);
      if (k === "sakura") mat.emissive = new THREE.Color("#4a2a30");
      const m = new THREE.Mesh(cards[k].build(), mat);
      m.customDepthMaterial = depth;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `foliage:${k}`;
      this.group.add(m);
    }
  }

  /** Conifers across the hills and mountains, and broadleaf clumps in the countryside. */
  private buildForest() {
    const rng = makeRng(99);
    const noise = makeNoise2(5);
    // Conifer geometry: trunk + drooping, ragged tiers, vertex-coloured dark inside.
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.22, 3, 7);
    trunk.translate(0, 1.5, 0);
    parts.push(colorize(trunk, "#4a3526", "#3a2a1e"));
    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      const r = 2.3 * (1 - k * 0.82);
      const h = 1.9 - k * 0.6;
      const y = 1.6 + k * 6.4;
      const c = new THREE.ConeGeometry(r, h, 14, 2, true);
      const p = c.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i);
        const pz = p.getZ(i);
        const py = p.getY(i);
        const ang = Math.atan2(pz, px);
        // Ragged rim: alternate long and short boughs, drooping at the tips.
        const rim = py < -h * 0.4 ? 1 : 0;
        const rag = 1 + rim * (0.22 * Math.sin(ang * 7 + t * 1.7) + 0.12 * Math.sin(ang * 13 + t));
        p.setX(i, px * rag);
        p.setZ(i, pz * rag);
        p.setY(i, py - rim * (rag - 0.9) * 0.6);
      }
      c.translate(0, y, 0);
      parts.push(colorize(c, t % 2 ? "#3b5e3a" : "#34563a", "#1c3222"));
    }
    const geo = mergeSimple(parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const spotsOut: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (let i = 0; i < 9000 && spotsOut.length < 2600; i++) {
      const x = rng.range(-WORLD_HALF + 6, WORLD_HALF - 6);
      const z = rng.range(-WORLD_HALF + 6, WORLD_HALF - 6);
      const dv = rectDist(VILLAGE_RECT, x, z);
      if (dv < 45) continue;
      if (x > 60 && x < 180 && z > -80 && z < 170 && rng.next() < 0.8) continue;
      const h = this.grid.height(x, z);
      const density = smoothstep(-0.1, 0.35, fbm(noise, x * 0.01, z * 0.01, 3)) + smoothstep(8, 30, h) * 0.8;
      if (rng.next() > density * 0.75) continue;
      if (this.grid.slope(x, z) > 1.3) continue;
      if (!this.free(x, z, 2.2)) continue;
      const s = rng.range(0.8, 1.45) * (h > 30 ? 1.15 : 1);
      spotsOut.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.3, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(s, s * rng.range(0.85, 1.25), s)));
      colors.push(new THREE.Color().setHSL(0.3 + rng.range(-0.04, 0.03), 0.3 + rng.range(0, 0.15), 0.8 + rng.range(-0.15, 0.2)));
      if (dv < 80) this.collision.addCircle({ x, z, r: 0.3 * s, top: h + 5 });
    }
    const inst = new THREE.InstancedMesh(geo, mat, spotsOut.length);
    spotsOut.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, colors[i]);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    inst.name = "forest";
    this.group.add(inst);

    // Bushes around the countryside and village edges.
    const bushTex = leafTexture(["#4f7a36", "#5f8a3e", "#3f6a2e", "#6e9a48"], 81, 12);
    const bushCards = new CardBuilder();
    let placed = 0;
    for (let i = 0; i < 4000 && placed < 520; i++) {
      const x = rng.range(-200, 200);
      const z = rng.range(-200, 200);
      if (!this.free(x, z, 1.2)) continue;
      const dv = rectDist(VILLAGE_RECT, x, z);
      const h = this.grid.height(x, z);
      if (h < 0.8 || this.grid.slope(x, z) > 0.6) continue;
      if (dv < -3 && rng.next() > 0.25) continue;
      const r = rng.range(0.5, 1.1);
      bushCards.blob(new THREE.Vector3(x, h + r * 0.6, z), r, 9, r * 1.2, 0.35, rng, 0.75, 0.5);
      placed++;
    }
    const { mat: bm, depth: bd } = foliageMaterial(bushTex, "bush");
    const bushes = new THREE.Mesh(bushCards.build(), bm);
    bushes.customDepthMaterial = bd;
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    this.group.add(bushes);
  }

  private buildBamboo() {
    const rng = makeRng(7);
    const stalk = new THREE.CylinderGeometry(0.05, 0.06, 1, 6, 1);
    stalk.translate(0, 0.5, 0);
    const stalkMat = this.materials.get("bamboo") as THREE.MeshStandardMaterial;
    const leafCards = new CardBuilder();
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < 1800 && mats.length < 820; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * BAMBOO.r;
      const x = BAMBOO.x + Math.cos(a) * r;
      const z = BAMBOO.z + Math.sin(a) * r;
      if (!this.free(x, z, 0.5)) continue;
      const y = this.grid.height(x, z);
      const h = rng.range(7, 12);
      const lean = new THREE.Euler(rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.1, z), new THREE.Quaternion().setFromEuler(lean), new THREE.Vector3(1 + rng.range(-0.2, 0.3), h, 1 + rng.range(-0.2, 0.3)));
      mats.push(m);
      const top = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
      for (let k = 0; k < 3; k++) {
        const c = top.clone().add(new THREE.Vector3(rng.range(-0.6, 0.6), -k * 1.3 - 0.4, rng.range(-0.6, 0.6)));
        leafCards.blob(c, 0.9, 4, 1.3, 1.1, rng, 0.6, 0.2);
      }
      if (r < BAMBOO.r * 0.9 && i % 3 === 0) this.collision.addCircle({ x, z, r: 0.12, top: y + 8 });
    }
    const inst = new THREE.InstancedMesh(stalk, stalkMat, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
    const { mat, depth } = foliageMaterial(bambooLeafTexture(), "bamboo");
    const leaves = new THREE.Mesh(leafCards.build(), mat);
    leaves.customDepthMaterial = depth;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    this.group.add(leaves);
  }

  private tuftGeometry(w: number, h: number): THREE.BufferGeometry {
    const cb = new CardBuilder();
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const uv: number[] = [];
    const nor: number[] = [];
    const sway: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * w * 0.5;
      const cz = Math.sin(a) * w * 0.5;
      const quad = [
        [-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [-cx, h, -cz, 0, 1], [cx, h, cz, 1, 1],
      ];
      for (const i of [0, 1, 2, 1, 3, 2]) {
        const q = quad[i];
        pos.push(q[0], q[1], q[2]);
        uv.push(q[3], q[4]);
        nor.push(0, 1, 0);
        sway.push(q[1] > 0 ? 1 : 0);
      }
    }
    void cb;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("sway", new THREE.Float32BufferAttribute(sway, 1));
    return g;
  }

  private buildGrass() {
    const rng = makeRng(3);
    const geo = this.tuftGeometry(0.62, 0.5);
    const { mat } = foliageMaterial(grassTexture(), "grass", true, "#e4ecc4");
    const flowerGeo = this.tuftGeometry(0.4, 0.42);
    const { mat: fmat } = foliageMaterial(flowerTexture(), "flowers", true);
    const CH = 40;
    const flowerTints = ["#ffffff", "#f7e27a", "#c9a2e6", "#f4a9b8", "#ffffff"];
    for (let cx = -200; cx < 200; cx += CH) {
      for (let cz = -200; cz < 200; cz += CH) {
        const mats: THREE.Matrix4[] = [];
        const fmats: THREE.Matrix4[] = [];
        const tints: THREE.Color[] = [];
        const inVillage = rectDist(VILLAGE_RECT, cx + CH / 2, cz + CH / 2) <= 0;
        const target = inVillage ? 600 : rectDist(VILLAGE_RECT, cx + CH / 2, cz + CH / 2) < 30 ? 1000 : 650;
        for (let i = 0; i < target * 1.6 && mats.length < target; i++) {
          const x = cx + rng.range(0, CH);
          const z = cz + rng.range(0, CH);
          const h = this.grid.height(x, z);
          if (h < 0.7 || this.grid.slope(x, z) > 0.5) continue;
          if (!this.free(x, z, 0.3)) continue;
          const s = rng.range(0.7, 1.35) * (inVillage ? 0.6 : 1);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(s, s * rng.range(0.8, 1.3), s));
          if (rng.chance(0.05)) {
            fmats.push(m);
            tints.push(new THREE.Color(rng.pick(flowerTints)));
          } else mats.push(m);
        }
        if (mats.length) {
          const inst = new THREE.InstancedMesh(geo, mat, mats.length);
          mats.forEach((m, i) => inst.setMatrixAt(i, m));
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          this.group.add(inst);
          this.grassChunks.push({ mesh: inst, x: cx + CH / 2, z: cz + CH / 2 });
        }
        if (fmats.length) {
          const inst = new THREE.InstancedMesh(flowerGeo, fmat, fmats.length);
          fmats.forEach((m, i) => {
            inst.setMatrixAt(i, m);
            inst.setColorAt(i, tints[i]);
          });
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          this.group.add(inst);
          this.grassChunks.push({ mesh: inst, x: cx + CH / 2, z: cz + CH / 2 });
        }
      }
    }
  }

  private buildRice() {
    const rng = makeRng(12);
    const geo = this.tuftGeometry(0.34, 0.62);
    const { mat } = foliageMaterial(grassTexture(), "rice", true, "#b8d678");
    const mats: THREE.Matrix4[] = [];
    for (let x = PADDIES.x0 + 1; x < PADDIES.x1 - 1; x += 0.7) {
      for (let z = PADDIES.z0 + 1; z < PADDIES.z1 - 1; z += 0.7) {
        const fx = ((x - PADDIES.x0) % 12.6 + 12.6) % 12.6;
        const fz = ((z - PADDIES.z0) % 10.4 + 10.4) % 10.4;
        if (fx < 1 || fx > 11.6 || fz < 1 || fz > 9.4) continue;
        const col = Math.floor((x - PADDIES.x0) / 12.6);
        const y = 1.25 + col * 0.35 - 0.05;
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x + rng.range(-0.08, 0.08), y, z + rng.range(-0.08, 0.08)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(1, rng.range(0.85, 1.15), 1)));
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  update(seconds: number, cam: THREE.Vector3, windStrength = 1) {
    windUniforms.uTime.value = seconds;
    windUniforms.uCam.value.copy(cam);
    windUniforms.uWind.value = windStrength;
    for (const c of this.grassChunks) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      c.mesh.visible = d < 125;
    }
  }
}

// ——— helpers ————————————————————————————————————————————————————————

function colorize(g: THREE.BufferGeometry, top: string, bottom = top): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    minY = Math.min(minY, p.getY(i));
    maxY = Math.max(maxY, p.getY(i));
  }
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - minY) / (maxY - minY || 1);
    c.copy(b).lerp(a, t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute("uv");
  ng.computeVertexNormals();
  return ng;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Curated tree positions for the village; the river bank gets willows and pines. */
export function curatedTrees(free: FreeFn): TreeSpot[] {
  const rng = makeRng(2024);
  const spots: TreeSpot[] = [
    // square
    { kind: "sakura", x: -53, z: 9.5, s: 1.15 },
    { kind: "sakura", x: -26, z: -10, s: 1.0 },
    // shrine grounds
    { kind: "sakura", x: 128, z: -50, s: 1.1 },
    { kind: "maple", x: 154, z: -44, s: 1.1 },
    { kind: "maple", x: 131, z: -62, s: 1.0 },
    { kind: "pine", x: 152, z: -62, s: 1.2 },
    { kind: "sakura", x: 156, z: -54, s: 1.0 },
    // pagoda hill
    { kind: "sakura", x: 103, z: 38, s: 1.0 },
    { kind: "sakura", x: 121, z: 50, s: 1.05 },
    { kind: "pine", x: 118, z: 34, s: 1.0 },
    // bridge heads
    { kind: "sakura", x: 80, z: 8, s: 1.2 },
    { kind: "pine", x: 78, z: -9, s: 1.1 },
    { kind: "sakura", x: 36, z: 7, s: 1.0 },
    // dojo & inn gardens
    { kind: "maple", x: -52, z: -74, s: 0.9 },
    { kind: "pine", x: -27, z: -74, s: 0.8 },
    { kind: "maple", x: -23, z: 80, s: 1.0 },
    { kind: "sakura", x: -57, z: 82, s: 1.0 },
    // west gate
    { kind: "pine", x: -163, z: -10, s: 1.2 },
    { kind: "sakura", x: -165, z: 12, s: 1.0 },
    // tea house
    { kind: "sakura", x: 12, z: 52, s: 0.95 },
  ];
  // River banks: willows and sakura on the village side, pines on the far side.
  for (const s of RIVER) {
    if (s.z < -108 || s.z > 108) continue;
    if (rng.next() > 0.12) continue;
    const west = rng.chance(0.62);
    const off = s.hw + (west ? 2.6 : 4.2);
    // Normal pointing to the west bank (the village side).
    let nx = -s.dz;
    let nz = s.dx;
    if (nx > 0) {
      nx = -nx;
      nz = -nz;
    }
    const side = west ? 1 : -1;
    const x = s.x + nx * off * side;
    const z = s.z + nz * off * side;
    const kind = west ? (rng.chance(0.55) ? "willow" : "sakura") : rng.chance(0.5) ? "pine" : "sakura";
    if (!free(x, z, 1.5)) continue;
    if (Math.abs(s.z) < 12 || Math.abs(s.z - 72) < 8 || Math.abs(s.z - 128) < 10) continue;
    spots.push({ kind, x, z, s: rng.range(0.9, 1.2) });
  }
  // Along the torii path and scattered on the east bank.
  for (let i = 0; i < 60; i++) {
    const x = rng.range(76, 175);
    const z = rng.range(-100, 100);
    if (!free(x, z, 3)) continue;
    const rv = riverQuery(x, z);
    if (rv.dist < rv.hw + 5) continue;
    spots.push({ kind: rng.pick(["sakura", "pine", "maple", "sakura"] as const), x, z, s: rng.range(0.85, 1.2) });
  }
  // A few inside the village gardens.
  for (let i = 0; i < 120 && spots.length < 150; i++) {
    const x = rng.range(VILLAGE_RECT.x0 + 5, VILLAGE_RECT.x1 - 8);
    const z = rng.range(VILLAGE_RECT.z0 + 5, VILLAGE_RECT.z1 - 5);
    if (!free(x, z, 3.2)) continue;
    spots.push({ kind: rng.pick(["sakura", "pine", "maple", "sakura", "pine"] as const), x, z, s: rng.range(0.75, 1.0) });
  }
  return spots;
}
