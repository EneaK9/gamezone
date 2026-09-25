// Humanoid skeleton with realistic proportions. Positions are derived from standing
// height, sex, age and build. Rest rotations are identity, so animation poses are plain
// Euler offsets per bone.

import * as THREE from "three";
import type { Look } from "../../shared/look";

export const BONE_NAMES = [
  "root",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "upperArmL",
  "foreArmL",
  "handL",
  "fingersL",
  "shoulderR",
  "upperArmR",
  "foreArmR",
  "handR",
  "fingersR",
  "thighL",
  "shinL",
  "footL",
  "toesL",
  "thighR",
  "shinR",
  "footR",
  "toesR",
  "tail",
] as const;
export type BoneName = (typeof BONE_NAMES)[number];
export const BI: Record<BoneName, number> = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>;

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: "root",
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  shoulderL: "chest",
  upperArmL: "shoulderL",
  foreArmL: "upperArmL",
  handL: "foreArmL",
  fingersL: "handL",
  shoulderR: "chest",
  upperArmR: "shoulderR",
  foreArmR: "upperArmR",
  handR: "foreArmR",
  fingersR: "handR",
  thighL: "hips",
  shinL: "thighL",
  footL: "shinL",
  toesL: "footL",
  thighR: "hips",
  shinR: "thighR",
  footR: "shinR",
  toesR: "footR",
  tail: "head",
};

/** World-space rest positions and body measurements for one character. */
export interface Proportions {
  H: number;
  /** Head scale relative to an adult of this height. */
  headScale: number;
  /** Multipliers applied to body widths and depths. */
  width: number;
  depth: number;
  muscle: number;
  female: boolean;
  child: boolean;
  elder: boolean;
  pos: Record<BoneName, THREE.Vector3>;
}

export function proportions(look: Look): Proportions {
  const H = look.height;
  const female = look.sex === "f";
  const child = look.age === "child";
  const elder = look.age === "elder";
  const b = look.build;
  const m = look.muscle ?? 0;
  const P = (x: number, y: number, z = 0) => new THREE.Vector3(x * H, y * H, z * H);
  // Children have relatively shorter legs and a bigger head.
  const legK = child ? 0.93 : 1;
  const shoulderX = (female ? 0.098 : 0.108) * (1 + m * 0.06 + b * 0.04) * (child ? 0.95 : 1);
  const hipX = female ? 0.056 : 0.051;
  const pos: Record<BoneName, THREE.Vector3> = {
    root: P(0, 0),
    hips: P(0, 0.55 * legK),
    spine: P(0, 0.61 * legK + (child ? 0.02 : 0)),
    chest: P(0, 0.7 * legK + (child ? 0.03 : 0)),
    neck: P(0, 0.826 - (child ? 0.03 : 0)),
    head: P(0, 0.866 - (child ? 0.05 : 0), 0.006),
    shoulderL: P(0.028, 0.806 - (child ? 0.03 : 0)),
    upperArmL: P(shoulderX, 0.808 - (child ? 0.035 : 0), -0.004),
    foreArmL: P(shoulderX + 0.011, 0.628 - (child ? 0.03 : 0), -0.008),
    handL: P(shoulderX + 0.015, 0.484 - (child ? 0.025 : 0), 0.004),
    fingersL: P(shoulderX + 0.016, 0.446 - (child ? 0.025 : 0), 0.008),
    shoulderR: P(-0.028, 0.806 - (child ? 0.03 : 0)),
    upperArmR: P(-shoulderX, 0.808 - (child ? 0.035 : 0), -0.004),
    foreArmR: P(-shoulderX - 0.011, 0.628 - (child ? 0.03 : 0), -0.008),
    handR: P(-shoulderX - 0.015, 0.484 - (child ? 0.025 : 0), 0.004),
    fingersR: P(-shoulderX - 0.016, 0.446 - (child ? 0.025 : 0), 0.008),
    thighL: P(hipX, 0.52 * legK),
    shinL: P(hipX + 0.004, 0.285 * legK, 0.004),
    footL: P(hipX + 0.006, 0.042, -0.006),
    toesL: P(hipX + 0.008, 0.012, 0.085),
    thighR: P(-hipX, 0.52 * legK),
    shinR: P(-hipX - 0.004, 0.285 * legK, 0.004),
    footR: P(-hipX - 0.006, 0.042, -0.006),
    toesR: P(-hipX - 0.008, 0.012, 0.085),
    tail: P(0, 0.93 - (child ? 0.05 : 0), -0.06),
  };
  if (elder) {
    // A slight stoop.
    pos.neck.z += 0.012 * H;
    pos.head.z += 0.02 * H;
    pos.head.y -= 0.008 * H;
  }
  return {
    H,
    headScale: (H / 1.75) * (child ? 1.22 : 1) * (female ? 0.97 : 1) * 1.07,
    width: (0.88 + b * 0.32 + m * 0.12) * (child ? 0.92 : 1),
    depth: 0.9 + b * 0.38 + m * 0.05,
    muscle: m,
    female,
    child,
    elder,
    pos,
  };
}

export function buildSkeleton(p: Proportions): { bones: THREE.Bone[]; byName: Record<BoneName, THREE.Bone> } {
  const bones: THREE.Bone[] = [];
  const byName = {} as Record<BoneName, THREE.Bone>;
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    bones.push(b);
    byName[name] = b;
  }
  for (const name of BONE_NAMES) {
    const parent = PARENT[name];
    const b = byName[name];
    const wp = p.pos[name];
    if (parent) {
      byName[parent].add(b);
      b.position.copy(wp).sub(p.pos[parent]);
    } else {
      b.position.copy(wp);
    }
  }
  return { bones, byName };
}
