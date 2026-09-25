// One shared material for every character: vertex colours, per-vertex roughness,
// fabric normal detail on cloth only, a warm skin term, and a kimono pattern atlas.

import * as THREE from "three";

let shared: THREE.MeshStandardMaterial | null = null;
let fabricNormal: THREE.Texture | null = null;

export function setFabricNormal(t: THREE.Texture) {
  fabricNormal = t;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
}

function patternAtlas(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * 256, Math.floor(i / 4) * 256);
    g.beginPath();
    g.rect(0, 0, 256, 256);
    g.clip();
    draw();
    g.restore();
  };
  // 1 seigaiha waves
  cell(1, () => {
    g.lineWidth = 7;
    for (let row = -1; row < 5; row++) {
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + (row % 2 ? 32 : 0);
        const y = row * 32 + 32;
        for (let r = 30; r > 4; r -= 11) {
          g.beginPath();
          g.arc(x, y, r, Math.PI, 0);
          g.stroke();
        }
      }
    }
  });
  // 2 asanoha (hemp leaf)
  cell(2, () => {
    g.lineWidth = 3.5;
    const s = 64;
    for (let y = 0; y <= 256; y += s) {
      for (let x = 0; x <= 256; x += s) {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5);
          g.stroke();
        }
      }
    }
  });
  // 3 stripes
  cell(3, () => {
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 10, 256);
  });
  // 4 ichimatsu checks
  cell(4, () => {
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) if (((x + y) / 64) % 2 === 0) g.fillRect(x, y, 64, 64);
  });
  // 5 dots
  cell(5, () => {
    for (let y = 16; y < 256; y += 64) for (let x = 16; x < 256; x += 64) {
      g.beginPath();
      g.arc(x + ((y / 64) % 2) * 32, y, 11, 0, Math.PI * 2);
      g.fill();
    }
  });
  // 6 cranes
  cell(6, () => {
    g.lineWidth = 5;
    for (const [x, y] of [[64, 70], [190, 180]]) {
      g.beginPath();
      g.moveTo(x - 50, y + 10);
      g.quadraticCurveTo(x - 20, y - 40, x, y);
      g.quadraticCurveTo(x + 20, y - 40, x + 50, y + 10);
      g.stroke();
      g.beginPath();
      g.arc(x, y + 6, 9, 0, Math.PI * 2);
      g.fill();
    }
  });
  // 7 stars
  cell(7, () => {
    for (const [x, y] of [[64, 64], [192, 192], [192, 64], [64, 192]]) {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 === 0 ? 30 : 12;
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  return t;
}

export function makeCharacterMaterial(opts: { tint?: THREE.Color; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    normalMap: fabricNormal ?? undefined,
    normalScale: new THREE.Vector2(0.55, 0.55),
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
  });
  if (opts.tint) mat.color.copy(opts.tint);
  const atlas = patternAtlas();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tPattern = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 surf;
        attribute vec3 accent;
        attribute float pat;
        varying vec3 vSurf;
        varying vec3 vAccent;
        varying float vPat;
        varying vec2 vCharUv;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSurf = surf;
        vAccent = accent;
        vPat = pat;
        vCharUv = uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D tPattern;
        varying vec3 vSurf;
        varying vec3 vAccent;
        varying float vPat;
        varying vec2 vCharUv;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if (vPat > 0.5) {
          float idx = floor(vPat + 0.5);
          vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
          vec2 puv = (fract(vCharUv * 0.9) * 0.96 + 0.02 + cell) / vec2(4.0, 2.0);
          float m = texture2D(tPattern, puv).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vAccent * (diffuseColor.rgb / max(vColor.rgb, vec3(0.001))), m * 0.85);
        }`,
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vSurf.x;")
      .replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * vSurf.y;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vSurf.z * 0.045;`,
      );
  };
  mat.customProgramCacheKey = () => `kazemura-character-${opts.opacity ?? 1}`;
  return mat;
}

export function characterMaterial(): THREE.MeshStandardMaterial {
  if (!shared) shared = makeCharacterMaterial();
  return shared;
}
