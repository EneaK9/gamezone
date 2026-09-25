// River surface: a ribbon along the river spline with a flowing turquoise water shader,
// the waterfall sheet, and flat still water for the rice paddies.

import * as THREE from "three";
import type { DayNight } from "../systems/time";
import { riverWaterY } from "./heightfield";
import type { HeightGrid } from "./heightfield";
import { PADDIES, RIVER, WATERFALL } from "./layout";

const waterVertex = /* glsl */ `
  attribute float depth;
  attribute vec2 flow;
  varying float vDepth;
  varying vec2 vFlow;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vDepth = depth;
    vFlow = flow;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uHorizon;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uLight;
  uniform float uFlowSpeed;
  uniform float uStill;
  varying float vDepth;
  varying vec2 vFlow;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float waves(vec2 p) {
    float t = uTime;
    float h = 0.0;
    h += vnoise(p * 0.9 + vec2(0.0, -t * uFlowSpeed * 0.9)) * 0.5;
    h += vnoise(p * 2.1 + vec2(t * 0.1, -t * uFlowSpeed * 1.6)) * 0.3;
    h += vnoise(p * 4.7 + vec2(-t * 0.2, -t * uFlowSpeed * 2.4)) * 0.2;
    return h;
  }

  void main() {
    // Flow space: x across the river, y along it (in metres).
    vec2 p = vec2(vFlow.x, vFlow.y);
    if (uStill > 0.5) p = vWorld.xz * 0.8;
    float e = 0.08;
    float h0 = waves(p);
    float hx = waves(p + vec2(e, 0.0));
    float hy = waves(p + vec2(0.0, e));
    float strength = mix(0.22, 0.12, uStill);
    vec3 n = normalize(vec3((h0 - hx) / e * strength, 1.0, (h0 - hy) / e * strength));

    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0) * 0.6 + 0.04;
    vec3 R = reflect(-V, n);
    vec3 skyCol = mix(uHorizon, uSky, clamp(R.y * 1.6, 0.0, 1.0));

    float d = clamp(vDepth / 1.5, 0.0, 1.0);
    vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d)) * uLight;
    vec3 col = mix(body, skyCol, fres);
    float spec = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 90.0);
    col += uSunColor * spec * 0.9 * step(0.0, uSunDir.y);

    // Foam where the river meets its banks.
    float edge = 1.0 - smoothstep(0.02, 0.22, vDepth);
    float foamN = vnoise(p * 3.2 + vec2(0.0, -uTime * uFlowSpeed * 1.8));
    float foam = edge * smoothstep(0.4, 0.8, foamN) * (1.0 - uStill);
    col = mix(col, vec3(0.92, 0.96, 0.95) * uLight, foam * 0.7);

    float alpha = mix(0.3, 0.88, smoothstep(0.0, 0.8, d)) + fres * 0.2 + foam * 0.3;
    alpha *= smoothstep(0.0, 0.05, vDepth + 0.03);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function makeWaterMaterial(still: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uSky: { value: new THREE.Color("#6ea8d8") },
        uHorizon: { value: new THREE.Color("#d8e8ec") },
        uShallow: { value: new THREE.Color(still ? "#7c9a8a" : "#7ccdc0") },
        uDeep: { value: new THREE.Color(still ? "#4d6b60" : "#2c9aa0") },
        uLight: { value: 1 },
        uFlowSpeed: { value: still ? 0.05 : 0.55 },
        uStill: { value: still ? 1 : 0 },
      },
    ]),
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

export class Water {
  readonly group = new THREE.Group();
  private materials: THREE.ShaderMaterial[] = [];
  private fallMaterial: THREE.ShaderMaterial;

  constructor(grid: HeightGrid) {
    const river = makeWaterMaterial(false);
    const still = makeWaterMaterial(true);
    this.materials.push(river, still);

    this.group.add(this.buildRiver(grid, river));
    this.group.add(this.buildPaddies(still));

    this.fallMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLight; varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
        void main() {
          float streak = vnoise(vec2(vUv.x * 40.0, vUv.y * 3.0 + uTime * 3.5));
          float streak2 = vnoise(vec2(vUv.x * 90.0, vUv.y * 6.0 + uTime * 5.0));
          vec3 col = mix(vec3(0.55, 0.8, 0.82), vec3(0.95, 0.98, 1.0), smoothstep(0.35, 0.9, streak * 0.6 + streak2 * 0.4));
          float a = 0.78 + 0.2 * streak;
          a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          gl_FragColor = vec4(col * uLight, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.group.add(this.buildWaterfall(this.fallMaterial));
  }

  private buildRiver(grid: HeightGrid, mat: THREE.ShaderMaterial): THREE.Mesh {
    const across = 14;
    const positions: number[] = [];
    const depths: number[] = [];
    const flows: number[] = [];
    const indices: number[] = [];
    let rows = 0;
    for (let i = 0; i < RIVER.length; i++) {
      const s = RIVER[i];
      const waterY = riverWaterY(s.z);
      // Skip the drop at the falls; the waterfall sheet covers it.
      if (Math.abs(s.z - (WATERFALL.z - 1.5)) < 1.6) continue;
      const nx = -s.dz;
      const nz = s.dx;
      const half = s.hw + 3.2;
      for (let k = 0; k <= across; k++) {
        const u = (k / across) * 2 - 1;
        const x = s.x + nx * u * half;
        const z = s.z + nz * u * half;
        positions.push(x, waterY, z);
        depths.push(waterY - grid.height(x, z));
        flows.push(u * half, s.s);
      }
      if (rows > 0) {
        const a = (rows - 1) * (across + 1);
        const b = rows * (across + 1);
        const prev = RIVER[Math.max(0, i - 1)];
        // Don't bridge the gap across the falls.
        if (Math.abs(riverWaterY(prev.z) - waterY) < 0.1) {
          for (let k = 0; k < across; k++) {
            indices.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
          }
        }
      }
      rows++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
    geo.setAttribute("flow", new THREE.Float32BufferAttribute(flows, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.name = "river";
    return mesh;
  }

  private buildPaddies(mat: THREE.ShaderMaterial): THREE.Mesh {
    const positions: number[] = [];
    const depths: number[] = [];
    const flows: number[] = [];
    const cw = 12.6;
    const cd = 10.4;
    for (let x = PADDIES.x0; x < PADDIES.x1 - 1; x += cw) {
      const col = Math.floor((x - PADDIES.x0) / cw);
      const y = 1.25 + col * 0.35 + 0.02;
      for (let z = PADDIES.z0; z < PADDIES.z1 - 1; z += cd) {
        const x0 = x + 0.55;
        const x1 = x + cw - 0.55;
        const z0 = z + 0.55;
        const z1 = z + cd - 0.55;
        const base = positions.length / 3;
        positions.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
        depths.push(0.25, 0.25, 0.25, 0.25);
        flows.push(0, 0, 0, 0, 0, 0, 0, 0);
        void base;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
    geo.setAttribute("flow", new THREE.Float32BufferAttribute(flows, 2));
    const idx: number[] = [];
    for (let q = 0; q < positions.length / 12; q++) {
      const b = q * 4;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.name = "paddies";
    return mesh;
  }

  private buildWaterfall(mat: THREE.ShaderMaterial): THREE.Mesh {
    // Find the river width at the falls.
    let best = RIVER[0];
    for (const s of RIVER) if (Math.abs(s.z - WATERFALL.z) < Math.abs(best.z - WATERFALL.z)) best = s;
    const width = best.hw * 2 + 1;
    const geo = new THREE.PlaneGeometry(width, WATERFALL.top + 0.6, 1, 8);
    // Bow the sheet outward slightly as it falls.
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = 1 - (p.getY(i) + (WATERFALL.top + 0.6) / 2) / (WATERFALL.top + 0.6);
      p.setZ(i, Math.sin(t * Math.PI * 0.5) * 1.6);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(best.x, WATERFALL.top / 2 - 0.1, WATERFALL.z - 1.8);
    mesh.rotation.y = Math.atan2(best.dx, best.dz) + Math.PI;
    mesh.renderOrder = 3;
    mesh.name = "waterfall";
    return mesh;
  }

  update(time: DayNight, seconds: number) {
    const p = time.palette;
    const light = Math.max(0.18, Math.min(1, p.sunIntensity / 2.6 + p.hemiIntensity * 0.25));
    for (const m of this.materials) {
      const u = m.uniforms;
      u.uTime.value = seconds;
      u.uSunDir.value.copy(time.sunDir);
      u.uSunColor.value.copy(p.sun);
      u.uSky.value.copy(p.zenith);
      u.uHorizon.value.copy(p.horizon);
      u.uLight.value = light;
    }
    this.fallMaterial.uniforms.uTime.value = seconds;
    this.fallMaterial.uniforms.uLight.value = light;
  }
}
