// WebGL renderer with a small post stack: MSAA scene pass, bloom (lanterns, sparks),
// tone mapping, then a gentle painterly grade and vignette.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export type Quality = "low" | "medium" | "high";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.06 },
    uWarmth: { value: 0.02 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.2, 0.15) },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uWarmth, uTime, uFlash, uAspect;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      // Warm highlights, faintly cool shadows.
      c.rgb += vec3(uWarmth, uWarmth * 0.4, -uWarmth) * smoothstep(0.35, 1.0, l);
      c.rgb += vec3(-0.006, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.95, 0.25, length(q) * 1.05);
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      // Damage flash around the edges.
      c.rgb = mix(c.rgb, uFlashColor, uFlash * (1.0 - v) * 0.8);
      c.rgb += (hash(vUv * 1000.0) - 0.5) * 0.012;
      gl_FragColor = c;
    }
  `,
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private renderPass: RenderPass;
  quality: Quality = "high";

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.gl, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 1.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    window.addEventListener("resize", () => this.resize(camera));
    this.resize(camera);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio;
    this.gl.setPixelRatio(q === "high" ? Math.min(dpr, 1.5) : q === "medium" ? Math.min(dpr, 1.1) : 0.8);
    this.bloom.enabled = q !== "low";
        window.dispatchEvent(new Event("resize"));
  }

  resize(camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(this.gl.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  setCamera(camera: THREE.Camera) {
    this.renderPass.camera = camera;
  }

  render(dt: number) {
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
