// Visual effects: GPU particles (sparks, dust, smoke, petals), weapon slash trails,
// lightning, shockwave rings and the moving energy crescent (Getsuga Tenshō).

import * as THREE from "three";
import { makeRng } from "../core/math";

const MAX = 6000;

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  attribute float aRot;
  attribute vec3 aColor;
  varying float vAlpha;
  varying float vKind;
  varying float vRot;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vKind = aKind;
    vRot = aRot;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (300.0 / -mv.z);
  }
`;

const particleFragment = /* glsl */ `
  varying float vAlpha;
  varying float vKind;
  varying float vRot;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float a;
    if (vKind < 0.5) {
      // soft round
      a = smoothstep(0.5, 0.0, length(p));
    } else if (vKind < 1.5) {
      // spark: bright core
      float d = length(p * vec2(1.0, 2.6));
      a = smoothstep(0.5, 0.05, d);
    } else if (vKind < 2.5) {
      // petal
      vec2 q = p * vec2(2.2, 1.3);
      float d = length(q - vec2(0.0, 0.08)) - 0.36 + 0.18 * smoothstep(0.0, 0.5, q.y) * abs(q.x) * 4.0;
      a = smoothstep(0.02, -0.04, d);
    } else {
      // smoke puff
      float d = length(p);
      a = smoothstep(0.5, 0.1, d) * 0.7;
    }
    if (a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  r: number; g: number; b: number;
  kind: number;
  gravity: number;
  drag: number;
  rot: number; spin: number;
  flutter: number;
  alpha: number;
}

class Pool {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private kind = new Float32Array(MAX);
  private rot = new Float32Array(MAX);
  private color = new Float32Array(MAX * 3);

  constructor(additive: boolean) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aKind", new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aRot", new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
  }

  add(p: P) {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push(p);
  }

  update(dt: number, t: number) {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      if (p.flutter) {
        p.vx += Math.sin(t * 2.3 + p.rot * 7) * p.flutter * dt;
        p.vz += Math.cos(t * 1.9 + p.rot * 5) * p.flutter * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
      ps[w++] = p;
    }
    ps.length = w;
    for (let i = 0; i < w; i++) {
      const p = ps[i];
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size;
      const k = p.life / p.max;
      this.alpha[i] = p.alpha * Math.min(1, k * 3) * Math.min(1, (1 - k) * 8 + 0.3);
      this.kind[i] = p.kind;
      this.rot[i] = p.rot;
      this.color[i * 3] = p.r;
      this.color[i * 3 + 1] = p.g;
      this.color[i * 3 + 2] = p.b;
    }
    this.geo.setDrawRange(0, w);
    for (const name of ["position", "aSize", "aAlpha", "aKind", "aRot", "aColor"]) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ——— slash trails ——————————————————————————————————————————————————————

class Trail {
  readonly mesh: THREE.Mesh;
  private pts: { a: THREE.Vector3; b: THREE.Vector3; t: number }[] = [];
  private geo = new THREE.BufferGeometry();
  private posArr = new Float32Array(64 * 2 * 3);
  private alphaArr = new Float32Array(64 * 2);
  active = false;
  constructor(color: THREE.Color) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("alpha", new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < 63; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uColor;
        varying float vA;
        void main() {
          gl_FragColor = vec4(uColor, vA);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
  }
  push(a: THREE.Vector3, b: THREE.Vector3, t: number) {
    this.pts.push({ a: a.clone(), b: b.clone(), t });
    if (this.pts.length > 64) this.pts.shift();
  }
  update(t: number) {
    this.pts = this.pts.filter((p) => t - p.t < 0.16);
    const n = this.pts.length;
    for (let i = 0; i < 64; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) {
        this.alphaArr[i * 2] = this.alphaArr[i * 2 + 1] = 0;
        continue;
      }
      const age = (t - p.t) / 0.16;
      this.posArr.set([p.a.x, p.a.y, p.a.z], i * 6);
      this.posArr.set([p.b.x, p.b.y, p.b.z], i * 6 + 3);
      const al = i < n ? (1 - age) * 0.55 : 0;
      this.alphaArr[i * 2] = al * 0.2;
      this.alphaArr[i * 2 + 1] = al;
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = n > 1;
  }
}

// ——— the manager ——————————————————————————————————————————————————————

interface Timed {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update: (k: number, dt: number) => void;
}

export class Effects {
  readonly group = new THREE.Group();
  private add = new Pool(true);
  private soft = new Pool(false);
  private trails = new Map<object, Trail>();
  private timed: Timed[] = [];
  private rng = makeRng(77);
  private t = 0;

  constructor() {
    this.group.add(this.add.points, this.soft.points);
  }

  private base(x: number, y: number, z: number): P {
    return { x, y, z, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 0.1, grow: 0, r: 1, g: 1, b: 1, kind: 0, gravity: 0, drag: 0, rot: 0, spin: 0, flutter: 0, alpha: 1 };
  }

  sparks(at: THREE.Vector3, count = 14, color = new THREE.Color("#ffd89a"), speed = 5) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const p = this.base(at.x, at.y, at.z);
      const a = r.range(0, Math.PI * 2);
      const e = r.range(-0.4, 1);
      const s = r.range(0.4, 1) * speed;
      p.vx = Math.cos(a) * Math.cos(e) * s;
      p.vz = Math.sin(a) * Math.cos(e) * s;
      p.vy = Math.sin(e) * s + 1;
      p.life = p.max = r.range(0.2, 0.5);
      p.size = r.range(0.05, 0.11);
      p.kind = 1;
      p.gravity = 9;
      p.drag = 2;
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
      this.add.add(p);
    }
    const flash = this.base(at.x, at.y, at.z);
    flash.life = flash.max = 0.12;
    flash.size = 0.9;
    flash.grow = -3;
    flash.r = color.r;
    flash.g = color.g;
    flash.b = color.b;
    this.add.add(flash);
  }

  dust(at: THREE.Vector3, count = 6, spread = 0.4, color = new THREE.Color("#b8a88a")) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const p = this.base(at.x + r.range(-spread, spread), at.y + 0.05, at.z + r.range(-spread, spread));
      p.vx = r.range(-0.5, 0.5);
      p.vz = r.range(-0.5, 0.5);
      p.vy = r.range(0.2, 0.8);
      p.life = p.max = r.range(0.6, 1.1);
      p.size = r.range(0.25, 0.45);
      p.grow = 0.6;
      p.kind = 3;
      p.drag = 1.5;
      p.alpha = 0.35;
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
      this.soft.add(p);
    }
  }

  smoke(at: THREE.Vector3, count = 18, color = new THREE.Color("#e8e6e0"), size = 0.7) {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const p = this.base(at.x + r.range(-0.4, 0.4), at.y + r.range(0, 1.6), at.z + r.range(-0.4, 0.4));
      const a = r.range(0, Math.PI * 2);
      p.vx = Math.cos(a) * r.range(0.5, 2);
      p.vz = Math.sin(a) * r.range(0.5, 2);
      p.vy = r.range(0.2, 1.4);
      p.life = p.max = r.range(0.7, 1.3);
      p.size = r.range(0.6, 1.1) * size;
      p.grow = 1.2;
      p.kind = 3;
      p.drag = 2.5;
      p.alpha = 0.75;
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
      this.soft.add(p);
    }
  }

  petals(at: THREE.Vector3, count: number, radius: number, opts: { swirl?: number; up?: number; life?: number; glow?: boolean } = {}) {
    const r = this.rng;
    const cols = ["#f9cdd6", "#f5b9c7", "#fde6ea", "#f2a8bb"];
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = Math.sqrt(r.next()) * radius;
      const p = this.base(at.x + Math.cos(a) * d, at.y + r.range(0.2, 2.2), at.z + Math.sin(a) * d);
      const sw = opts.swirl ?? 0;
      p.vx = -Math.sin(a) * sw + r.range(-0.3, 0.3);
      p.vz = Math.cos(a) * sw + r.range(-0.3, 0.3);
      p.vy = (opts.up ?? 0) + r.range(-0.3, 0.2);
      p.life = p.max = opts.life ?? r.range(2.5, 5);
      p.size = r.range(0.07, 0.12);
      p.kind = 2;
      p.gravity = opts.up ? 0 : 0.35;
      p.drag = 0.6;
      p.spin = r.range(-4, 4);
      p.rot = r.range(0, 6.28);
      p.flutter = 1.2;
      const c = new THREE.Color(r.pick(cols));
      p.r = c.r;
      p.g = c.g;
      p.b = c.b;
      (opts.glow ? this.add : this.soft).add(p);
    }
  }

  /** Blue-white lightning crackling around a point (Chidori). */
  lightning(at: THREE.Vector3, count = 5, radius = 0.5) {
    const r = this.rng;
    for (let k = 0; k < count; k++) {
      const pts: THREE.Vector3[] = [at.clone()];
      let p = at.clone();
      const dir = new THREE.Vector3(r.range(-1, 1), r.range(-0.6, 1), r.range(-1, 1)).normalize();
      for (let i = 0; i < 6; i++) {
        p = p.clone().addScaledVector(dir, radius / 6).add(new THREE.Vector3(r.range(-0.08, 0.08), r.range(-0.08, 0.08), r.range(-0.08, 0.08)));
        pts.push(p);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color("#bcd8ff").multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(line);
      this.timed.push({ obj: line, life: 0.08, max: 0.08, update: (kk) => ((line.material as THREE.LineBasicMaterial).opacity = kk) });
    }
    const c = new THREE.Color("#9cc4ff");
    this.sparks(at, 3, c, 2);
  }

  shockwave(at: THREE.Vector3, radius = 5, color = new THREE.Color("#fff2d8")) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at).add(new THREE.Vector3(0, 0.08, 0));
    this.group.add(m);
    this.timed.push({
      obj: m,
      life: 0.5,
      max: 0.5,
      update: (k) => {
        const s = (1 - k) * radius + 0.3;
        m.scale.set(s, 1, s);
        mat.opacity = k * 0.8;
      },
    });
    this.dust(at, 24, radius * 0.4);
  }

  /** Crescent of energy flying forward. Returns a handle so gameplay can track it. */
  crescent(from: THREE.Vector3, dir: THREE.Vector3, speed: number, range: number, color = new THREE.Color("#cfe4ff"), onStep?: (pos: THREE.Vector3) => boolean) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.6, Math.PI * 0.15, Math.PI * 0.85, false);
    shape.absarc(0, -0.45, 1.3, Math.PI * 0.82, Math.PI * 0.18, true);
    const geo = new THREE.ShapeGeometry(shape, 24);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI);
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color("#1a1030"), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    inner.scale.setScalar(0.8);
    inner.position.y = 0.01;
    m.add(inner);
    m.position.copy(from);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.rotation.z = 0.35;
    this.group.add(m);
    const life = range / speed;
    this.timed.push({
      obj: m,
      life,
      max: life,
      update: (k, dt) => {
        m.position.addScaledVector(dir, speed * dt);
        mat.opacity = Math.min(1, k * 3) * 0.9;
        m.scale.setScalar(1 + (1 - k) * 0.6);
        if (Math.random() < 0.5) this.sparks(m.position, 1, color, 1.5);
        if (onStep && onStep(m.position)) {
          /* keep flying through targets */
        }
      },
    });
  }

  /** A quick glowing arc for special cuts. */
  arcFlash(at: THREE.Vector3, yaw: number, radius = 2.5, color = new THREE.Color("#ffffff")) {
    const geo = new THREE.RingGeometry(radius * 0.86, radius, 40, 1, -Math.PI * 0.35, Math.PI * 0.7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at);
    m.rotation.y = yaw + Math.PI / 2;
    this.group.add(m);
    this.timed.push({ obj: m, life: 0.22, max: 0.22, update: (k) => (mat.opacity = k * 0.9) });
  }

  /** Blade tip ribbon. Call every frame while swinging, keyed by the weapon/actor. */
  trail(key: object, a: THREE.Vector3, b: THREE.Vector3, color = new THREE.Color("#e8f0ff")) {
    let t = this.trails.get(key);
    if (!t) {
      t = new Trail(color);
      this.trails.set(key, t);
      this.group.add(t.mesh);
    }
    t.push(a, b, this.t);
  }

  update(dt: number) {
    this.t += dt;
    this.add.update(dt, this.t);
    this.soft.update(dt, this.t);
    for (const tr of this.trails.values()) tr.update(this.t);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const e = this.timed[i];
      e.life -= dt;
      e.update(Math.max(0, e.life / e.max), dt);
      if (e.life <= 0) {
        e.obj.removeFromParent();
        (e.obj as THREE.Mesh).geometry?.dispose();
        this.timed.splice(i, 1);
      }
    }
  }

  get time() {
    return this.t;
  }
}
