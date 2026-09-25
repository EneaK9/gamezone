// A living character: skinned mesh + animator + weapon visuals, with root motion.

import * as THREE from "three";
import type { Look } from "../../shared/look";
import { Animator } from "./animation";
import { buildCharacterMesh, type BuiltCharacter } from "./builder";
import { stanceFor, WeaponVisual } from "./weapons";

export class Character {
  /** Place this in the world: position = feet, rotation.y = facing. */
  readonly root = new THREE.Group();
  /** Carries root-motion offsets from clips (crouch, lunge, fall). */
  private pivot = new THREE.Group();
  built: BuiltCharacter;
  anim: Animator;
  weapon: WeaponVisual;
  weaponId: string;
  look: Look;
  private material?: THREE.Material;

  constructor(look: Look, weaponId: string, material?: THREE.Material) {
    this.look = look;
    this.weaponId = weaponId;
    this.material = material;
    this.built = buildCharacterMesh(look, material);
    this.anim = new Animator(this.built.bones);
    this.anim.bind();
    this.anim.demure = look.garments.some((g) => g.kind === "long_kimono");
    this.anim.strideScale = look.height / 1.75;
    this.weapon = new WeaponVisual(this.built, weaponId);
    this.root.add(this.pivot);
    this.pivot.add(this.built.mesh);
  }

  /** Swap outfit/body (e.g. equipping armor or a hat). Keeps animation state. */
  rebuild(look: Look) {
    const drawn = this.weapon.drawn;
    this.weapon.dispose();
    this.pivot.remove(this.built.mesh);
    this.built.mesh.geometry.dispose();
    this.look = look;
    this.built = buildCharacterMesh(look, this.material);
    const old = this.anim;
    this.anim = new Animator(this.built.bones);
    this.anim.bind();
    this.anim.setStance(old.stance);
    this.anim.demure = look.garments.some((g) => g.kind === "long_kimono");
    this.anim.strideScale = look.height / 1.75;
    this.weapon = new WeaponVisual(this.built, this.weaponId);
    this.weapon.setDrawn(drawn);
    this.pivot.add(this.built.mesh);
  }

  setWeapon(id: string) {
    const drawn = this.weapon.drawn;
    this.weapon.dispose();
    this.weaponId = id;
    this.weapon = new WeaponVisual(this.built, id);
    this.weapon.setDrawn(drawn);
    this.anim.setStance(stanceFor(id, drawn));
  }

  get drawn() {
    return this.weapon.drawn;
  }

  setDrawn(d: boolean) {
    this.weapon.setDrawn(d && this.weaponId !== "fists" ? true : false);
    this.anim.setStance(stanceFor(this.weaponId, d));
  }

  update(dt: number) {
    this.anim.update(dt);
    const r = this.anim.root;
    this.pivot.position.set(0, r.y, r.z);
    this.pivot.rotation.set((r.pitch * Math.PI) / 180, 0, (r.roll * Math.PI) / 180);
  }

  worldPoint(bone: keyof BuiltCharacter["bones"], out = new THREE.Vector3()): THREE.Vector3 {
    return this.built.bones[bone].getWorldPosition(out);
  }

  /** Height of the top of the head, for name labels. */
  get height() {
    return this.look.height;
  }

  dispose() {
    this.weapon.dispose();
    this.built.mesh.geometry.dispose();
    this.root.removeFromParent();
  }
}
