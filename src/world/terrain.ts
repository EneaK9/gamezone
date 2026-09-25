// Terrain mesh with a splat shader blending grass, forest floor, dirt paths, stone paths,
// slope rock and riverbed pebbles from the Poly Haven textures.

import * as THREE from "three";
import type { Assets } from "../core/assets";
import { fbm, makeNoise2, smoothstep } from "../core/math";
import { makeNoiseTexture } from "../render/noiseTexture";
import { HeightGrid, roadMask } from "./heightfield";
import {
  BANDIT_CAMP,
  DOJO_YARD,
  FARM_SW,
  PADDIES,
  VILLAGE_RECT,
  WORLD_HALF,
  rectContains,
  rectDist,
} from "./layout";

const forestNoise = makeNoise2(404);

function splatAt(x: number, z: number, h: number): [number, number, number, number] {
  const roads = roadMask(x, z);
  const dv = rectDist(VILLAGE_RECT, x, z);
  // Forest floor: patches outside the walls, thicker on hills and toward the mountains.
  let forest = smoothstep(0.05, 0.45, fbm(forestNoise, x * 0.012, z * 0.012, 3) + 0.2) * smoothstep(8, 40, dv);
  forest = Math.max(forest, smoothstep(9, 22, h) * 0.8);
  let dirt = roads.dirt;
  if (rectContains(DOJO_YARD, x, z, -1)) dirt = Math.max(dirt, 0.85);
  const dc = Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z);
  dirt = Math.max(dirt, 1 - smoothstep(BANDIT_CAMP.r * 0.5, BANDIT_CAMP.r, dc));
  if (rectContains(FARM_SW, x, z, -2)) {
    // Furrowed vegetable rows.
    const row = Math.abs(Math.sin((x - FARM_SW.x0) * 1.9));
    dirt = Math.max(dirt, 0.55 + row * 0.45);
  }
  // Worn earth inside the village between buildings.
  if (dv <= 0) dirt = Math.max(dirt, smoothstep(0.55, 0.8, fbm(forestNoise, x * 0.05 + 30, z * 0.05, 2) + 0.35) * 0.55);
  const mud = rectContains(PADDIES, x, z, 0) ? 0.85 : 0;
  return [forest, dirt, roads.stone, mud];
}

export function buildTerrain(grid: HeightGrid, assets: Assets): THREE.Mesh {
  const segments = 400;
  const size = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const splat = new Float32Array(count * 4);
  const normals = new Float32Array(count * 3);
  const e = 1.2;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = grid.height(x, z);
    pos.setY(i, h);
    const nx = grid.height(x - e, z) - grid.height(x + e, z);
    const nz = grid.height(x, z - e) - grid.height(x, z + e);
    const len = Math.hypot(nx, 2 * e, nz);
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = (2 * e) / len;
    normals[i * 3 + 2] = nz / len;
    const s = splatAt(x, z, h);
    splat.set(s, i * 4);
  }
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const grass = assets.tex("leafy_grass");
  const forest = assets.tex("forrest_ground_01");
  const dirt = assets.tex("park_dirt");
  const rock = assets.tex("lichen_rock");
  const river = assets.tex("river_small_rocks");
  const stone = assets.tex("grey_stone_path");
  const uniforms = {
    tGrass: { value: grass.map },
    tGrassN: { value: grass.normalMap },
    tForest: { value: forest.map },
    tDirt: { value: dirt.map },
    tDirtN: { value: dirt.normalMap },
    tRock: { value: rock.map },
    tRiver: { value: river.map },
    tStone: { value: stone.map },
    tStoneN: { value: stone.normalMap },
    tNoise: { value: makeNoiseTexture() },
    uGrassTint: { value: new THREE.Color(0.8, 1.02, 0.58) },
    uWaterY: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec4 splat;
        varying vec4 vSplat;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`,
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vSplat = splat;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D tGrass, tGrassN, tForest, tDirt, tDirtN, tRock, tRiver, tStone, tStoneN, tNoise;
        uniform vec3 uGrassTint;
        uniform float uWaterY;
        varying vec4 vSplat;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        float gWet, gDirt, gStone, gRock, gRiver;
        vec3 triplanar(sampler2D t, vec3 p, vec3 n, float s) {
          vec3 w = pow(abs(n), vec3(4.0));
          w /= (w.x + w.y + w.z);
          return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec2 wuv = vWorldPos.xz;
        vec3 Ng = normalize(vWorldNormal);
        vec4 nz = texture2D(tNoise, wuv * 0.011);
        vec4 nf = texture2D(tNoise, wuv * 0.09);
        vec3 grassA = texture2D(tGrass, wuv / 3.1).rgb;
        vec3 grassB = texture2D(tGrass, wuv / 8.3 + 0.37).rgb;
        vec3 grass = mix(grassA, grassB, smoothstep(0.35, 0.65, nz.b)) * uGrassTint;
        vec3 forestC = texture2D(tForest, wuv / 3.6).rgb;
        vec3 dirtC = texture2D(tDirt, wuv / 3.3).rgb;
        vec3 stoneC = texture2D(tStone, wuv / 2.4).rgb;
        vec3 riverC = texture2D(tRiver, wuv / 2.2).rgb;
        vec3 rockC = triplanar(tRock, vWorldPos, Ng, 1.0 / 6.5);
        float wForest = smoothstep(0.3, 0.7, vSplat.x + (nf.g - 0.5) * 0.55);
        gDirt = smoothstep(0.32, 0.68, vSplat.y + (nf.g - 0.5) * 0.5);
        gStone = smoothstep(0.42, 0.58, vSplat.z + (nf.g - 0.5) * 0.18);
        float wMud = vSplat.w;
        gRock = smoothstep(0.86, 0.66, Ng.y + (nf.r - 0.5) * 0.1);
        gRiver = 1.0 - smoothstep(0.15, 0.85, vWorldPos.y - uWaterY + (nf.g - 0.5) * 0.5);
        vec3 albedo = mix(grass, forestC, wForest);
        albedo = mix(albedo, dirtC, gDirt);
        albedo = mix(albedo, stoneC, gStone);
        albedo = mix(albedo, dirtC * vec3(0.5, 0.46, 0.4), wMud);
        albedo = mix(albedo, rockC, gRock);
        albedo = mix(albedo, riverC, gRiver);
        albedo *= mix(0.84, 1.12, nz.r);
        gWet = 1.0 - smoothstep(0.0, 0.8, vWorldPos.y - uWaterY);
        albedo *= 1.0 - gWet * 0.38;
        diffuseColor.rgb *= albedo;
        `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = mix(0.97, 0.82, gStone);
        roughnessFactor = mix(roughnessFactor, 0.4, gWet * 0.85);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `{
          vec3 nG = texture2D(tGrassN, wuv / 3.1).xyz * 2.0 - 1.0;
          vec3 nD = texture2D(tDirtN, wuv / 3.3).xyz * 2.0 - 1.0;
          vec3 nS = texture2D(tStoneN, wuv / 2.4).xyz * 2.0 - 1.0;
          vec3 nts = mix(mix(nG, nD, gDirt), nS, gStone);
          nts.xy *= mix(0.9, 0.35, gRock);
          vec3 T = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
          vec3 B = normalize(cross(T, Ng));
          vec3 Nw = normalize(T * nts.x + B * nts.y + Ng * max(nts.z, 0.2));
          normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
        }`,
      );
  };
  mat.customProgramCacheKey = () => "kazemura-terrain";

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = "terrain";
  return mesh;
}
