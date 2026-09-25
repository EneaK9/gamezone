// Painted sky dome: gradient, sun and moon, drifting clouds and stars. The same dome is
// rendered into a PMREM environment map so PBR materials pick up the sky's colour.

import * as THREE from "three";
import type { DayNight } from "../systems/time";

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform vec3 uCloud;
  uniform float uNight;
  uniform float uTime;
  uniform float uEnv;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float up = clamp(h, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
    // Warm haze on the side of the sun near the horizon.
    float sunSide = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
    col = mix(col, uSunColor * 1.05, (1.0 - smoothstep(0.0, 0.35, up)) * pow(sunSide, 3.0) * 0.35 * (1.0 - uNight));
    col = mix(col, uGround, smoothstep(0.0, -0.2, h));

    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.45) * (1.0 - uNight * 0.8);
    if (uEnv < 0.5) {
      col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 6.0 * step(0.0, uSunDir.y);
      // Moon.
      float md = max(dot(d, uMoonDir), 0.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.9996, md) * 1.6 * uNight;
      col += vec3(0.5, 0.6, 0.85) * pow(md, 120.0) * 0.35 * uNight;
      // Stars.
      if (h > 0.0) {
        vec2 sp = d.xz / (d.y + 0.35) * 220.0;
        vec2 cell = floor(sp);
        float r = hash(cell);
        vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
        float star = smoothstep(0.08, 0.0, length(fract(sp) - 0.5 - off * 0.6)) * step(0.975, r);
        float twinkle = 0.6 + 0.4 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
        col += vec3(0.9, 0.93, 1.0) * star * twinkle * uNight * smoothstep(0.0, 0.25, h) * 1.4;
      }
    }

    // Clouds on a curved plane above the valley.
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.18) * 1.35 + vec2(uTime * 0.004, uTime * 0.0015);
      float n = fbm(uv * 1.1);
      float cover = smoothstep(0.52, 0.8, n) * smoothstep(0.0, 0.18, h);
      float light = 0.8 + 0.25 * fbm(uv * 2.3 + 4.0) + 0.35 * pow(sd, 3.0);
      vec3 cloudCol = uCloud * light;
      cloudCol = mix(cloudCol, uHorizon, 0.25 * (1.0 - up));
      col = mix(col, cloudCol, cover * 0.85);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private envScene = new THREE.Scene();
  private envMaterial: THREE.ShaderMaterial;
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private lastEnvHour = -99;

  constructor(renderer: THREE.WebGLRenderer) {
    const uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloud: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uEnv: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.scale.setScalar(1500);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;

    this.envMaterial = this.material.clone();
    this.envMaterial.uniforms = THREE.UniformsUtils.clone(uniforms);
    this.envMaterial.uniforms.uEnv.value = 1;
    const envMesh = new THREE.Mesh(geo, this.envMaterial);
    envMesh.scale.setScalar(100);
    this.envScene.add(envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  update(time: DayNight, seconds: number) {
    const p = time.palette;
    for (const m of [this.material, this.envMaterial]) {
      const u = m.uniforms;
      u.uZenith.value.copy(p.zenith);
      u.uHorizon.value.copy(p.horizon);
      u.uGround.value.copy(p.ground);
      u.uSunDir.value.copy(time.sunDir);
      u.uMoonDir.value.copy(time.moonDir);
      u.uSunColor.value.copy(p.sun);
      u.uCloud.value.copy(p.cloud);
      u.uNight.value = p.night;
      u.uTime.value = seconds;
    }
  }

  /** Re-render the environment map when the time of day has moved on enough. */
  refreshEnvironment(scene: THREE.Scene, time: DayNight, force = false) {
    const delta = Math.abs(time.hour - this.lastEnvHour);
    if (!force && delta < 0.25 && delta < 23.75) return;
    this.lastEnvHour = time.hour;
    const target = this.pmrem.fromScene(this.envScene, 0, 0.1, 300);
    this.envTarget?.dispose();
    this.envTarget = target;
    scene.environment = target.texture;
  }
}
