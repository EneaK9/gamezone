// Turns a Look into a single skinned mesh plus named attachment sockets.

import * as THREE from "three";
import type { Look } from "../../shared/look";
import { buildBody } from "./body";
import { buildFootwear, buildGarments, coverageOf, footIsCovered } from "./clothes";
import { buildHair, buildHeadgear } from "./hair";
import { buildHead, faceSurfaceZ, headFrame } from "./head";
import { characterMaterial } from "./material";
import { MeshBuilder } from "./meshkit";
import { buildSkeleton, proportions, type BoneName, type Proportions } from "./skeleton";

export type SocketName = "gripR" | "gripL" | "hipL" | "hipL2" | "hipL3" | "back" | "backWaist" | "thighR" | "mouth" | "headTop";

export interface BuiltCharacter {
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  skeleton: THREE.Skeleton;
  p: Proportions;
  sockets: Record<SocketName, THREE.Object3D>;
}

function socket(parent: THREE.Bone, world: THREE.Vector3, restParentWorld: THREE.Vector3, euler: THREE.Euler, name: string): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.copy(world).sub(restParentWorld);
  o.rotation.copy(euler);
  parent.add(o);
  return o;
}

/** Socket whose +z axis points along `dir` (weapons extend along +z), with `up` as its +y. */
function aimedSocket(parent: THREE.Bone, world: THREE.Vector3, restParentWorld: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, name: string): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.copy(world).sub(restParentWorld);
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  parent.add(o);
  return o;
}

export function buildCharacterMesh(look: Look, material?: THREE.Material): BuiltCharacter {
  const p = proportions(look);
  const mb = new MeshBuilder();
  const cov = coverageOf(look);
  const skin = new THREE.Color(look.skin);
  const gloves = look.garments.find((g) => g.kind === "gloves") as { color: string } | undefined;
  buildBody(mb, p, {
    skin,
    hideTorso: cov.torso,
    hideLegsAbove: cov.legsFrom,
    hideArmsAbove: cov.armsFrom,
    gloves: gloves ? new THREE.Color(gloves.color) : undefined,
    definition: (look.muscle ?? 0) > 0.7 ? look.muscle : 0,
    skipFeet: footIsCovered(look),
  });
  buildHead(mb, p, look, skin);
  if (look.headgear !== "luchador_mask" || look.hair.style !== "none") buildHair(mb, p, look);
  buildHeadgear(mb, p, look, look.headgear);
  if (look.hair.style === "long_straight" && look.headgear !== "kenseikan") {
    // Nobles in the roster wear kenseikan with long hair; others just the hair.
  }
  buildGarments(mb, p, look);
  buildFootwear(mb, p, look);

  const geo = mb.build();
  const { bones, byName } = buildSkeleton(p);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geo, material ?? characterMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(byName.root);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;

  // Sockets (in each parent bone's rest frame; bones have identity rest rotation).
  const H = p.H;
  const f = headFrame(p);
  const hipSide = new THREE.Vector3(0.1 * H * p.width, 0.575 * H, 0.05 * H);
  const sockets: Record<SocketName, THREE.Object3D> = {
    gripR: socket(byName.handR, p.pos.handR.clone().add(new THREE.Vector3(0.002 * H, -0.045 * H, 0.004 * H)), p.pos.handR, new THREE.Euler(0, 0, 0), "gripR"),
    gripL: socket(byName.handL, p.pos.handL.clone().add(new THREE.Vector3(-0.002 * H, -0.045 * H, 0.004 * H)), p.pos.handL, new THREE.Euler(0, 0, 0), "gripL"),
    // Katana worn through the sash on the left hip: handle forward and up, saya back and down.
    hipL: aimedSocket(byName.hips, hipSide, p.pos.hips, new THREE.Vector3(0.12, -0.42, -1), new THREE.Vector3(0, 1, 0), "hipL"),
    hipL2: aimedSocket(byName.hips, hipSide.clone().add(new THREE.Vector3(0.012 * H, -0.012 * H, 0.004 * H)), p.pos.hips, new THREE.Vector3(0.16, -0.5, -1), new THREE.Vector3(0, 1, 0), "hipL2"),
    hipL3: aimedSocket(byName.hips, hipSide.clone().add(new THREE.Vector3(0.022 * H, -0.024 * H, 0.008 * H)), p.pos.hips, new THREE.Vector3(0.2, -0.58, -1), new THREE.Vector3(0, 1, 0), "hipL3"),
    // Across the back: grip above the right shoulder, blade down toward the left hip.
    back: aimedSocket(byName.chest, new THREE.Vector3(-0.075 * H, 0.76 * H, -0.12 * H * p.depth), p.pos.chest, new THREE.Vector3(0.55, -0.83, -0.02), new THREE.Vector3(0, 0, -1), "back"),
    // Horizontal at the small of the back, grip on the right.
    backWaist: aimedSocket(byName.hips, new THREE.Vector3(-0.1 * H, 0.575 * H, -0.105 * H * p.depth), p.pos.hips, new THREE.Vector3(1, -0.12, 0), new THREE.Vector3(0, 1, 0), "backWaist"),
    thighR: aimedSocket(byName.thighR, p.pos.thighR.clone().add(new THREE.Vector3(-0.058 * H, -0.12 * H, 0.012 * H)), p.pos.thighR, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), "thighR"),
    mouth: socket(byName.head, f.centre.clone().add(new THREE.Vector3(0, -f.hh / 2 + 0.158 * f.hh, faceSurfaceZ(f, 0, -f.hh / 2 + 0.158 * f.hh) + 0.004)), p.pos.head, new THREE.Euler(0, -Math.PI / 2, 0), "mouth"),
    headTop: socket(byName.head, f.centre.clone().add(new THREE.Vector3(0, f.ry * 0.9, 0)), p.pos.head, new THREE.Euler(), "headTop"),
  };
  return { mesh, bones: byName, skeleton, p, sockets };
}
