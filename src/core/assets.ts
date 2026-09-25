// Loads the CC0 PBR textures and glTF props fetched by scripts/fetch-assets.mjs.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export const TEXTURE_IDS = [
  "leafy_grass",
  "forrest_ground_01",
  "park_dirt",
  "lichen_rock",
  "river_small_rocks",
  "grey_stone_path",
  "plastered_wall_02",
  "dark_wooden_planks",
  "hinoki_planks",
  "weathered_brown_planks",
  "grey_roof_tiles_02",
  "thatch_roof_angled",
  "castle_wall_slates",
  "bamboo_wall",
  "sakura_bark",
  "pine_bark",
  "denim_fabric",
  "terry_cloth",
  "brown_leather",
] as const;
export type TextureId = (typeof TEXTURE_IDS)[number];

export const MODEL_IDS = [
  "antique_katana_01",
  "katana_stand_01",
  "wooden_bucket_01",
  "wooden_crate_01",
  "barrel_03",
  "stone_fire_pit",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** glTF-style packed AO (r), roughness (g), metalness (b). */
  arm: THREE.Texture;
}

export class Assets {
  readonly textures = new Map<TextureId, PbrSet>();
  readonly models = new Map<ModelId, GLTF>();
  private manager = new THREE.LoadingManager();
  private texLoader = new THREE.TextureLoader(this.manager);
  private gltfLoader = new GLTFLoader(this.manager);
  maxAnisotropy = 8;

  async load(onProgress: (fraction: number, label: string) => void): Promise<void> {
    const base = `${import.meta.env.BASE_URL}assets`;
    const total = TEXTURE_IDS.length * 3 + MODEL_IDS.length;
    let done = 0;
    const tick = (label: string) => onProgress(++done / total, label);

    const loadTex = (url: string, srgb: boolean, label: string) =>
      new Promise<THREE.Texture>((resolve) => {
        this.texLoader.load(
          url,
          (t) => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = this.maxAnisotropy;
            tick(label);
            resolve(t);
          },
          undefined,
          () => {
            // A missing texture shouldn't stop the game; fall back to a flat texel.
            console.warn(`[assets] missing ${url} — run \`npm run assets\``);
            tick(label);
            resolve(flatTexture(srgb ? [200, 200, 200, 255] : [128, 128, 255, 255]));
          },
        );
      });

    const texJobs = TEXTURE_IDS.map(async (id) => {
      const dir = `${base}/textures/${id}`;
      const [map, normalMap, arm] = await Promise.all([
        loadTex(`${dir}/diff.jpg`, true, id),
        loadTex(`${dir}/nor.jpg`, false, id),
        loadTex(`${dir}/arm.jpg`, false, id),
      ]);
      this.textures.set(id, { map, normalMap, arm });
    });

    const modelJobs = MODEL_IDS.map(
      (id) =>
        new Promise<void>((resolve) => {
          this.gltfLoader.load(
            `${base}/models/${id}/${id}.gltf`,
            (gltf) => {
              gltf.scene.traverse((o) => {
                const m = o as THREE.Mesh;
                if (m.isMesh) {
                  m.castShadow = true;
                  m.receiveShadow = true;
                }
              });
              this.models.set(id, gltf);
              tick(id);
              resolve();
            },
            undefined,
            () => {
              console.warn(`[assets] missing model ${id} — run \`npm run assets\``);
              tick(id);
              resolve();
            },
          );
        }),
    );
    await Promise.all([...texJobs, ...modelJobs]);
  }

  tex(id: TextureId): PbrSet {
    const t = this.textures.get(id);
    if (!t) throw new Error(`texture ${id} not loaded`);
    return t;
  }

  /** A clone of a loaded model, or null if it failed to load. */
  model(id: ModelId): THREE.Object3D | null {
    const g = this.models.get(id);
    return g ? g.scene.clone(true) : null;
  }
}

function flatTexture(rgba: [number, number, number, number]): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
