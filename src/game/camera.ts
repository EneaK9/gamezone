// Third-person orbit camera with collision, a framed shot for conversations, and shake.

import * as THREE from "three";
import { clamp, damp, dampAngle } from "../core/math";
import type { World } from "../world/World";

export class CameraRig {
  yaw = 0;
  pitch = 0.28;
  distance = 5.2;
  private curDist = 5.2;
  private target = new THREE.Vector3();
  private shake = 0;
  private shakeT = 0;
  /** When set, the camera frames a conversation instead of orbiting. */
  focus: { a: THREE.Vector3; b: THREE.Vector3 } | null = null;
  private focusBlend = 0;
  sensitivity = 1;
  invertY = false;
  private tmp = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, private world: World) {}

  addShake(amount: number) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  input(dx: number, dy: number, wheel: number) {
    this.yaw -= dx * 0.0024 * this.sensitivity;
    this.pitch += dy * 0.0021 * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.45, 1.1);
    if (wheel) this.distance = clamp(this.distance + wheel * 0.6, 2.2, 11);
  }

  /** Swing behind the player when they walk without touching the mouse. */
  follow(playerYaw: number, moving: boolean, dt: number) {
    if (moving) this.yaw = dampAngle(this.yaw, playerYaw + Math.PI, 0.6, dt);
  }

  update(dt: number, player: THREE.Vector3, playerHeight: number) {
    this.target.set(player.x, player.y + playerHeight * 0.92, player.z);
    // Orbit position.
    const cp = Math.cos(this.pitch);
    const dir = this.tmp.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // Pull in when something is between the player and the camera.
    const want = this.distance;
    const far = this.desired.copy(this.target).addScaledVector(dir, want);
    const hit = this.world.collision.raycast(this.target.x, this.target.y, this.target.z, far.x, far.y, far.z);
    const allowed = Math.max(1.2, want * hit - 0.3);
    this.curDist = allowed < this.curDist ? damp(this.curDist, allowed, 18, dt) : damp(this.curDist, allowed, 3, dt);
    const orbit = this.desired.copy(this.target).addScaledVector(dir, this.curDist);
    // Stay above the ground.
    const gy = this.world.groundHeight(orbit.x, orbit.z) + 0.35;
    if (orbit.y < gy) orbit.y = gy;

    // Conversation framing: over the player's shoulder toward the NPC.
    this.focusBlend = damp(this.focusBlend, this.focus ? 1 : 0, 4, dt);
    let camPos = orbit;
    let lookAt = this.look.copy(this.target);
    if (this.focusBlend > 0.001 && this.focus) {
      const { a, b } = this.focus;
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const ab = new THREE.Vector3().subVectors(b, a);
      ab.y = 0;
      const len = ab.length() || 1;
      ab.divideScalar(len);
      const side = new THREE.Vector3(-ab.z, 0, ab.x);
      const shot = a.clone().addScaledVector(ab, -2.1).addScaledVector(side, 1.25);
      shot.y = a.y + 1.95;
      const lookFocus = mid.clone().addScaledVector(ab, len * 0.3);
      lookFocus.y = b.y + 0.95;
      camPos = orbit.clone().lerp(shot, this.focusBlend);
      lookAt = lookAt.lerp(lookFocus, this.focusBlend);
    }

    // Shake.
    this.shakeT += dt * 38;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const s = this.shake * this.shake * 0.12;
    camPos = camPos.clone();
    camPos.x += Math.sin(this.shakeT * 1.3) * s;
    camPos.y += Math.sin(this.shakeT * 1.7 + 1) * s;
    camPos.z += Math.cos(this.shakeT * 1.1) * s;

    this.camera.position.copy(camPos);
    this.camera.lookAt(lookAt);
  }

  /** Horizontal forward direction of the camera (for movement input). */
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
}
