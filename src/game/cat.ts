// Mochi, Kenta's white cat with one black ear. Hides by the pagoda until found, then
// follows you home.

import * as THREE from "three";
import { damp, dampAngle } from "../core/math";
import type { World } from "../world/World";

export class Cat {
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private legs: THREE.Mesh[] = [];
  private tail: THREE.Mesh;
  private head: THREE.Group;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  following: { pos: THREE.Vector3 } | null = null;
  home: THREE.Vector3 | null = null;
  private phase = 0;
  private speed = 0;
  sitting = true;

  constructor() {
    const white = new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: "#1c1a19", roughness: 0.8 });
    const pink = new THREE.MeshStandardMaterial({ color: "#e8a0a8", roughness: 0.7 });
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.22, 4, 10), white);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 0.2;
    torso.castShadow = true;
    this.body.add(torso);
    this.head = new THREE.Group();
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), white);
    h.castShadow = true;
    this.head.add(h);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), sx < 0 ? black : white);
      ear.position.set(sx * 0.045, 0.075, -0.01);
      ear.rotation.z = -sx * 0.25;
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: "#8fb84a", roughness: 0.2 }));
      eye.position.set(sx * 0.032, 0.015, 0.072);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), pink);
    nose.position.set(0, -0.01, 0.085);
    this.head.add(nose);
    this.head.position.set(0, 0.3, 0.2);
    this.body.add(this.head);
    for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.16, 6), white);
      leg.position.set(x, 0.08, z);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.24, 6), white);
    this.tail.position.set(0, 0.3, -0.24);
    this.tail.rotation.x = -0.6;
    this.body.add(this.tail);
    this.root.add(this.body);
  }

  place(x: number, z: number, world: World) {
    this.pos.set(x, world.groundHeight(x, z), z);
    this.root.position.copy(this.pos);
  }

  update(dt: number, world: World, t: number) {
    let target = 0;
    if (this.following) {
      const f = this.following.pos;
      const dx = f.x - this.pos.x;
      const dz = f.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.6) {
        target = d > 5 ? 5.5 : 2.4;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
      }
      if (d > 25) this.place(f.x - dx / d, f.z - dz / d, world);
    } else if (this.home) {
      const dx = this.home.x - this.pos.x;
      const dz = this.home.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.8) {
        target = 1.6;
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt);
      }
    }
    this.speed = damp(this.speed, target, 6, dt);
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    const [rx, rz] = world.collision.resolve(nx, nz, 0.15, this.pos.y);
    if (world.walkable(rx, rz)) {
      this.pos.x = rx;
      this.pos.z = rz;
    }
    this.pos.y = damp(this.pos.y, world.groundHeight(this.pos.x, this.pos.z), 20, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.sitting = this.speed < 0.2;
    this.phase += dt * this.speed * 3.5;
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * Math.min(1, this.speed)));
    this.body.rotation.x = this.sitting ? -0.35 : 0;
    this.body.position.y = this.sitting ? -0.04 : Math.abs(Math.sin(this.phase)) * 0.015;
    this.tail.rotation.z = Math.sin(t * 2.2) * 0.4;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.3;
  }
}
