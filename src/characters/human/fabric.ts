// Cloth materials: real fabric weaves (Poly Haven CC0 normal/roughness maps) with the
// garment's colour, the weave's luminance as fine detail, woven patterns (kimono motifs),
// and a soft sheen. One material per (fabric, colour, pattern) is cached and shared.

import * as THREE from "three";
import type { Pattern } from "../../../shared/look";
import type { Assets, TextureId } from "../../core/assets";

export type Fabric = "cotton" | "linen" | "silk" | "denim" | "knit" | "wool" | "leather" | "fur" | "canvas" | "spandex" | "terry" | "lacquer" | "metal" | "straw" | "rope" | "wood" | "bone";

interface FabricDef {
  tex?: TextureId;
  /** Metres covered by one repeat of the texture. */
  tile: number;
  roughness: number;
  normal: number;
  detail: number;
  sheen: number;
  metalness?: number;
  clearcoat?: number;
}

export const FABRICS: Record<Fabric, FabricDef> = {
  cotton: { tex: "cotton_jersey", tile: 0.1, roughness: 0.92, normal: 0.7, detail: 0.35, sheen: 0.35 },
  linen: { tex: "rough_linen", tile: 0.16, roughness: 0.95, normal: 1.0, detail: 0.45, sheen: 0.3 },
  silk: { tex: "crepe_satin", tile: 0.14, roughness: 0.38, normal: 0.45, detail: 0.2, sheen: 0.7 },
  denim: { tex: "denim_fabric", tile: 0.14, roughness: 0.88, normal: 1.0, detail: 0.6, sheen: 0.25 },
  knit: { tex: "knitted_fleece", tile: 0.09, roughness: 0.96, normal: 1.3, detail: 0.5, sheen: 0.45 },
  wool: { tex: "poly_wool_herringbone", tile: 0.16, roughness: 0.92, normal: 0.9, detail: 0.45, sheen: 0.4 },
  leather: { tex: "brown_leather", tile: 0.22, roughness: 0.52, normal: 0.8, detail: 0.35, sheen: 0 },
  fur: { tex: "curly_teddy_natural", tile: 0.08, roughness: 1, normal: 1.6, detail: 0.55, sheen: 0.6 },
  canvas: { tex: "hessian_230", tile: 0.14, roughness: 0.97, normal: 1.0, detail: 0.5, sheen: 0.2 },
  spandex: { tex: "scuba_suede", tile: 0.1, roughness: 0.48, normal: 0.35, detail: 0.15, sheen: 0.35 },
  terry: { tex: "terry_cloth", tile: 0.1, roughness: 0.97, normal: 1.1, detail: 0.4, sheen: 0.4 },
  lacquer: { tile: 1, roughness: 0.22, normal: 0, detail: 0, sheen: 0, clearcoat: 0.8 },
  metal: { tile: 1, roughness: 0.32, normal: 0, detail: 0, sheen: 0, metalness: 1 },
  straw: { tex: "hessian_230", tile: 0.06, roughness: 0.9, normal: 1.2, detail: 0.5, sheen: 0.15 },
  rope: { tex: "hessian_230", tile: 0.05, roughness: 0.95, normal: 1.4, detail: 0.5, sheen: 0.2 },
  wood: { tile: 1, roughness: 0.6, normal: 0, detail: 0, sheen: 0 },
  bone: { tile: 1, roughness: 0.45, normal: 0, detail: 0, sheen: 0.1, clearcoat: 0.3 },
};

let assets: Assets | null = null;
export function setFabricAssets(a: Assets) {
  assets = a;
}

const lumaCache = new Map<string, number>();
function averageLuma(tex: THREE.Texture, key: string): number {
  let l = lumaCache.get(key);
  if (l !== undefined) return l;
  const img = tex.image as HTMLImageElement | undefined;
  l = 0.5;
  if (img && img.width) {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    l = Math.max(0.05, s / 256);
  }
  lumaCache.set(key, l);
  return l;
}

// ——— woven patterns ———————————————————————————————————————————————————————————————————

const patternCache = new Map<Pattern, THREE.Texture>();
/** A tileable white-on-black motif (kimono patterns). */
export function patternTexture(p: Pattern): THREE.Texture | null {
  if (p === "none") return null;
  let t = patternCache.get(p);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  if (p === "waves") {
    g.lineWidth = 6;
    for (let row = -1; row < 5; row++)
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + (row % 2 ? 32 : 0);
        const y = row * 32 + 32;
        for (let r = 30; r > 4; r -= 11) {
          g.beginPath();
          g.arc(x, y, r, Math.PI, 0);
          g.stroke();
        }
      }
  } else if (p === "hemp") {
    g.lineWidth = 3;
    const s = 64;
    for (let y = 0; y <= 256; y += s)
      for (let x = 0; x <= 256; x += s)
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5);
          g.stroke();
        }
  } else if (p === "stripes") {
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 9, 256);
  } else if (p === "checks") {
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) if (((x + y) / 64) % 2 === 0) g.fillRect(x, y, 64, 64);
  } else if (p === "dots") {
    for (let y = 16; y < 256; y += 64)
      for (let x = 16; x < 256; x += 64) {
        g.beginPath();
        g.arc(x + ((y / 64) % 2) * 32, y, 9, 0, Math.PI * 2);
        g.fill();
      }
  } else if (p === "cranes") {
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 128 + 64;
      const y = Math.floor(k / 2) * 128 + 64;
      g.save();
      g.translate(x, y);
      g.rotate(k * 0.7);
      g.beginPath();
      g.moveTo(-34, 0);
      g.quadraticCurveTo(-8, -26, 0, -4);
      g.quadraticCurveTo(8, -26, 34, 0);
      g.quadraticCurveTo(6, 4, 0, 16);
      g.quadraticCurveTo(-6, 4, -34, 0);
      g.fill();
      g.restore();
    }
  } else if (p === "stars") {
    for (let k = 0; k < 6; k++) {
      const x = (k * 97) % 256;
      const y = (k * 61 + 30) % 256;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 7 : 16;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.fill();
    }
  }
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  patternCache.set(p, t);
  return t;
}

// ——— materials ————————————————————————————————————————————————————————————————————————

export interface ClothLook {
  color: string;
  fabric: Fabric;
  pattern?: Pattern;
  accent?: string;
  /** Pattern repeat in metres. */
  patternTile?: number;
  emissive?: string;
  opacity?: number;
  /** Faded/sun-bleached look: lifts colour toward grey at high points. */
  worn?: number;
}

const matCache = new Map<string, THREE.MeshPhysicalMaterial>();

/** Metres per UV unit for a fabric (garment builders emit metric UVs divided by this). */
export function fabricTile(f: Fabric) {
  return FABRICS[f].tile;
}

export function clothMaterial(l: ClothLook): THREE.MeshPhysicalMaterial {
  const key = JSON.stringify(l);
  let m = matCache.get(key);
  if (m) return m;
  const def = FABRICS[l.fabric];
  const set = def.tex && assets ? assets.tex(def.tex) : null;
  m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(l.color),
    roughness: def.roughness,
    metalness: def.metalness ?? 0,
    side: THREE.DoubleSide,
    sheen: def.sheen,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(l.color).lerp(new THREE.Color("#ffffff"), 0.35),
    clearcoat: def.clearcoat ?? 0,
    clearcoatRoughness: 0.25,
    transparent: (l.opacity ?? 1) < 1,
    opacity: l.opacity ?? 1,
  });
  if (l.emissive) {
    m.emissive = new THREE.Color(l.emissive);
    m.emissiveIntensity = 1;
  }
  const pattern = l.pattern ? patternTexture(l.pattern) : null;
  const uniforms = {
    detailMap: { value: set?.map ?? null },
    detailLuma: { value: set ? averageLuma(set.map, def.tex!) : 0.5 },
    detailAmount: { value: set ? def.detail : 0 },
    patternMap: { value: pattern },
    patternScale: { value: def.tile / (l.patternTile ?? 0.22) },
    accent: { value: new THREE.Color(l.accent ?? "#ffffff") },
  };
  if (set) {
    m.normalMap = set.normalMap;
    m.normalScale = new THREE.Vector2(def.normal, def.normal);
    m.roughnessMap = set.arm;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D detailMap;
        uniform float detailLuma;
        uniform float detailAmount;
        uniform sampler2D patternMap;
        uniform float patternScale;
        uniform vec3 accent;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #if defined( USE_NORMALMAP ) || defined( USE_ROUGHNESSMAP )
        {
          vec2 fuv = vNormalMapUv;
          vec3 dt = texture2D( detailMap, fuv ).rgb;
          float l = dot( dt, vec3( 0.299, 0.587, 0.114 ) ) / detailLuma;
          diffuseColor.rgb *= mix( 1.0, clamp( l, 0.4, 1.6 ), detailAmount );
          ${pattern ? "float pm = texture2D( patternMap, fuv * patternScale ).r; diffuseColor.rgb = mix( diffuseColor.rgb, accent * mix( 1.0, clamp( l, 0.5, 1.5 ), detailAmount ), pm );" : ""}
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => `cloth-${pattern ? "p" : "n"}-${set ? "t" : "f"}`;
  matCache.set(key, m);
  return m;
}
