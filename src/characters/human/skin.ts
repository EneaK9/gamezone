// Skin: a physical material with a cheap subsurface term (per-channel wrap lighting, so
// red light bleeds past the terminator), pore detail, and a canvas compositor that
// prepares each character's skin texture — cleaning the photo eyes out of the eyelids,
// shifting tone, and painting scars, whiskers, stubble and shaved scalps in UV space.

import * as THREE from "three";

const DIFFUSE_LINE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";

let skinChunk: string | null = null;
function patchedLights(): string {
  if (skinChunk) return skinChunk;
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!src.includes(DIFFUSE_LINE)) {
    console.warn("[skin] three.js lighting chunk changed; subsurface term disabled");
    return (skinChunk = src);
  }
  skinChunk = src.replace(
    DIFFUSE_LINE,
    `#ifdef SKIN_SSS
      float ndlRaw = dot( geometryNormal, directLight.direction );
      vec3 wrapped = clamp( ( vec3( ndlRaw ) + skinWrap ) / ( 1.0 + skinWrap ), 0.0, 1.0 );
      // Wrapped light arrives through the skin: tint it, and keep the lit side unchanged.
      vec3 scatter = ( wrapped - vec3( saturate( ndlRaw ) ) ) * skinScatter;
      reflectedLight.directDiffuse += ( vec3( saturate( ndlRaw ) ) + scatter ) * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
    #else
      ${DIFFUSE_LINE}
    #endif`,
  );
  return skinChunk;
}

let poreNormal: THREE.Texture | null = null;
/** Tileable pore/wrinkle normal map, generated once. */
function pores(): THREE.Texture {
  if (poreNormal) return poreNormal;
  const n = 256;
  const h = new Float32Array(n * n);
  // Height field: sparse pits (pores) plus fine crossing lines.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2600; k++) {
    const cx = rnd() * n;
    const cy = rnd() * n;
    const r = 0.8 + rnd() * 1.6;
    const depth = 0.5 + rnd() * 0.5;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = (Math.floor(cx) + dx + n) % n;
        const y = (Math.floor(cy) + dy + n) % n;
        const d = Math.hypot(dx + (Math.floor(cx) - cx), dy + (Math.floor(cy) - cy)) / r;
        if (d < 1) h[y * n + x] -= depth * (1 - d * d);
      }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] += 0.12 * Math.sin((x + y * 0.3) * 0.9) * Math.sin(y * 0.21 + x * 0.05);
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const hx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
      const hy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
      const v = new THREE.Vector3(-hx * 1.2, -hy * 1.2, 1).normalize();
      const o = (y * n + x) * 4;
      img.data[o] = (v.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (v.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (v.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  poreNormal = new THREE.CanvasTexture(c);
  poreNormal.wrapS = poreNormal.wrapT = THREE.RepeatWrapping;
  poreNormal.repeat.set(22, 22);
  poreNormal.anisotropy = 4;
  return poreNormal;
}

export interface SkinMaterialOpts {
  map: THREE.Texture;
  /** Multiplier on the texture (shifts the skin tone). */
  tone?: THREE.Color;
  roughness?: number;
  /** Extra tint (e.g. Gear Second pink); multiplies with tone. */
  tint?: THREE.Color;
}

export function skinMaterial(o: SkinMaterialOpts): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    map: o.map,
    color: o.tone ?? new THREE.Color(1, 1, 1),
    roughness: o.roughness ?? 0.5,
    metalness: 0,
    normalMap: pores(),
    normalScale: new THREE.Vector2(0.32, 0.32),
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#e8b8a4"),
    specularIntensity: 0.55,
  });
  if (o.tint) m.color.multiply(o.tint);
  m.defines = { ...m.defines, SKIN_SSS: "" };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.skinWrap = { value: new THREE.Vector3(0.55, 0.26, 0.16) };
    shader.uniforms.skinScatter = { value: new THREE.Vector3(0.62, 0.3, 0.2) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 skinWrap;\nuniform vec3 skinScatter;")
      .replace("#include <lights_physical_pars_fragment>", patchedLights());
  };
  m.customProgramCacheKey = () => "skin-sss";
  return m;
}

// ——— compositor —————————————————————————————————————————————————————————————————

/** A UV-space stroke painted onto the skin. Points are UV (0..1, v up). */
export interface SkinStroke {
  kind: "line" | "fill" | "dots" | "shade";
  points: [number, number][];
  color: string;
  /** Line width / dot radius in UV units. */
  width?: number;
  alpha?: number;
  /** Softness (blur) in UV units. */
  soft?: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`image ${url}`));
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

export async function preloadImages(urls: string[]) {
  await Promise.all(urls.map(loadImage));
}

const avgCache = new Map<string, THREE.Color>();
/** Average colour of a skin texture's face area (for tone matching). */
export function skinAverage(img: HTMLImageElement, key: string): THREE.Color {
  let c = avgCache.get(key);
  if (c) return c;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 64, 64);
  // Cheek/forehead band of the head island (right third of the atlas).
  const d = g.getImageData(46, 18, 14, 26).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] + d[i + 1] + d[i + 2];
    if (l < 120) continue; // skip eyes / nostrils
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
    n++;
  }
  c = new THREE.Color(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear();
  avgCache.set(key, c);
  return c;
}

/** Linear-space multiplier that moves a texture's average skin colour to `target`. */
export function toneFor(avg: THREE.Color, target: THREE.Color): THREE.Color {
  const t = target.clone(); // Color.set() from hex is already linear in three r152+
  return new THREE.Color(t.r / Math.max(avg.r, 1e-3), t.g / Math.max(avg.g, 1e-3), t.b / Math.max(avg.b, 1e-3));
}

const textureCache = new Map<string, THREE.Texture>();

/**
 * Compose a skin texture. `key` identifies the result (characters with equal keys share
 * the texture); `eyeHoles` are UV triangles inside the eyelids to paint over.
 */
export function composeSkin(img: HTMLImageElement, key: string, size: number, eyeHoles: [number, number][][], strokes: SkinStroke[]): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  g.drawImage(img, 0, 0, size, size);
  const P = (p: [number, number]) => [p[0] * size, (1 - p[1]) * size] as const;
  // Eyelid interiors carry the photo's eyes; fill them with the surrounding lid colour.
  for (const tri of eyeHoles) {
    const [cx, cy] = P([(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3]);
    void cx;
    void cy;
  }
  if (eyeHoles.length) {
    const lid = sampleAround(g, eyeHoles, size);
    g.fillStyle = lid;
    g.strokeStyle = lid;
    g.lineWidth = size / 512;
    for (const tri of eyeHoles) {
      g.beginPath();
      tri.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  for (const s of strokes) paintStroke(g, s, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  textureCache.set(key, t);
  return t;
}

function sampleAround(g: CanvasRenderingContext2D, tris: [number, number][][], size: number): string {
  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;
  for (const t of tris)
    for (const [u, v] of t) {
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  // A thin frame just outside the holes' bounds.
  const pad = 6 / 1024;
  const x0 = Math.max(0, Math.floor((minU - pad) * size));
  const x1 = Math.min(size - 1, Math.ceil((maxU + pad) * size));
  const y0 = Math.max(0, Math.floor((1 - maxV - pad) * size));
  const y1 = Math.min(size - 1, Math.ceil((1 - minV + pad) * size));
  const d = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] + d[i + 1] + d[i + 2];
    if (l < 260) continue; // skip dark iris/lash pixels
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
    n++;
  }
  if (!n) return "rgb(200,160,140)";
  return `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
}

function paintStroke(g: CanvasRenderingContext2D, s: SkinStroke, size: number) {
  const P = (p: [number, number]) => [p[0] * size, (1 - p[1]) * size] as const;
  g.save();
  g.globalAlpha = s.alpha ?? 1;
  g.strokeStyle = s.color;
  g.fillStyle = s.color;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (s.soft) {
    g.shadowColor = s.color;
    g.shadowBlur = s.soft * size;
  }
  const w = (s.width ?? 0.002) * size;
  if (s.kind === "line") {
    g.lineWidth = w;
    g.beginPath();
    s.points.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.stroke();
  } else if (s.kind === "fill" || s.kind === "shade") {
    g.beginPath();
    s.points.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.closePath();
    if (s.kind === "shade") g.globalCompositeOperation = "multiply";
    g.fill();
  } else {
    for (const p of s.points) {
      g.beginPath();
      g.arc(...P(p), w, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}
