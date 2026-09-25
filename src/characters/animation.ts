// Procedural locomotion + stance layers + keyframed action clips. Poses are Euler
// offsets (degrees, XYZ order) from the identity rest pose.
//
// Axis conventions (character faces +z, its left is +x):
//   thigh/upperArm  x < 0 swings the limb forward;  x > 0 back
//   shin            x > 0 bends the knee
//   foreArm         x < 0 bends the elbow (hand comes forward/up)
//   upperArmL       z > 0 raises the arm out to the side; upperArmR uses z < 0
//   spine/chest     x > 0 leans forward; y > 0 twists toward the character's left

import * as THREE from "three";
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "../core/math";
import { BONE_NAMES, type BoneName } from "./skeleton";

export type E3 = [number, number, number];
export type Pose = Partial<Record<BoneName, E3>>;

export type Stance = "relaxed" | "sword" | "twin" | "triple" | "greatsword" | "unarmed" | "shotgun" | "kunai" | "carry" | "hold_cat";

export interface ClipKey {
  t: number;
  pose: Pose;
  /** Root offsets in metres/degrees: lift (y), forward (z) and pitch. */
  root?: { y?: number; z?: number; pitch?: number; roll?: number };
  ease?: "linear" | "out" | "inout";
}

export interface ClipDef {
  name: string;
  duration: number;
  keys: ClipKey[];
  /** Which bones the clip drives. */
  mask: "full" | "upper" | "arms" | "armR";
  loop?: boolean;
  events?: { t: number; name: string }[];
  blendIn?: number;
  blendOut?: number;
  /** Hold the last key until stopped (block, sit, dead). */
  hold?: boolean;
  /** Stretch Luffy's right arm: [t, scale] */
  stretch?: [number, number][];
}

const UPPER: BoneName[] = ["spine", "chest", "neck", "head", "shoulderL", "upperArmL", "foreArmL", "handL", "fingersL", "shoulderR", "upperArmR", "foreArmR", "handR", "fingersR"];
const ARMS: BoneName[] = ["shoulderL", "upperArmL", "foreArmL", "handL", "fingersL", "shoulderR", "upperArmR", "foreArmR", "handR", "fingersR"];
const ARM_R: BoneName[] = ["shoulderR", "upperArmR", "foreArmR", "handR", "fingersR"];
const MASKS: Record<ClipDef["mask"], Set<BoneName>> = {
  full: new Set(BONE_NAMES),
  upper: new Set(UPPER),
  arms: new Set(ARMS),
  armR: new Set(ARM_R),
};

// ——— stances ————————————————————————————————————————————————————————

const FIST = 88;
const RELAX = 22;

export const STANCES: Record<Stance, Pose> = {
  relaxed: {
    upperArmL: [2, 0, 5], upperArmR: [2, 0, -5], foreArmL: [-12, 0, 0], foreArmR: [-12, 0, 0],
    handL: [0, 0, -4], handR: [0, 0, 4], fingersL: [0, 0, -RELAX], fingersR: [0, 0, RELAX],
  },
  sword: {
    spine: [4, 10, 0], chest: [2, 12, 0], neck: [0, -10, 0], head: [-4, -10, 0],
    upperArmR: [-44, 12, 22], foreArmR: [-58, -10, 0], handR: [80, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [-40, -12, -32], foreArmL: [-68, 14, 0], handL: [88, 0, 0], fingersL: [0, 0, -FIST],
  },
  twin: {
    spine: [4, 0, 0],
    upperArmR: [-38, 0, -18], foreArmR: [-52, 0, 0], handR: [-40, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [-38, 0, 18], foreArmL: [-52, 0, 0], handL: [-40, 0, 0], fingersL: [0, 0, -FIST],
  },
  triple: {
    spine: [8, 0, 0], chest: [4, 0, 0], head: [-10, 0, 0],
    upperArmR: [-30, 20, -38], foreArmR: [-40, 0, 0], handR: [-60, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [-30, -20, 38], foreArmL: [-40, 0, 0], handL: [-60, 0, 0], fingersL: [0, 0, -FIST],
  },
  greatsword: {
    spine: [4, 14, 0], chest: [0, 10, 0], head: [0, -14, 0],
    upperArmR: [-28, 0, -8], foreArmR: [-38, 0, 0], handR: [-10, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [4, 0, 6], foreArmL: [-18, 0, 0], fingersL: [0, 0, -RELAX],
  },
  unarmed: {
    spine: [6, 8, 0], chest: [4, 10, 0], head: [-6, -12, 0],
    upperArmR: [-32, 10, 24], foreArmR: [-118, 0, 0], handR: [0, 0, 10], fingersR: [0, 0, FIST],
    upperArmL: [-42, -10, -20], foreArmL: [-122, 0, 0], handL: [0, 0, -10], fingersL: [0, 0, -FIST],
  },
  shotgun: {
    spine: [2, 16, 0], chest: [0, 10, 0], head: [0, -18, 0],
    upperArmR: [-14, 0, 14], foreArmR: [-78, 0, 0], handR: [-6, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [-52, 0, -30], foreArmL: [-40, 0, 0], handL: [-10, 0, 0], fingersL: [0, 0, -FIST * 0.8],
  },
  kunai: {
    spine: [6, 6, 0], chest: [4, 6, 0],
    upperArmR: [-38, 0, 18], foreArmR: [-96, 0, 0], handR: [60, 0, 0], fingersR: [0, 0, FIST],
    upperArmL: [-30, 0, -24], foreArmL: [-100, 0, 0], fingersL: [0, 0, -RELAX],
  },
  carry: {
    upperArmR: [-20, 0, -118], foreArmR: [-100, 0, 0], handR: [0, 0, 0], fingersR: [0, 0, 50],
    upperArmL: [2, 0, 5], foreArmL: [-12, 0, 0], fingersL: [0, 0, -RELAX],
  },
  hold_cat: {
    upperArmR: [-40, 0, 20], foreArmR: [-80, 0, 0], upperArmL: [-40, 0, -20], foreArmL: [-80, 0, 0],
    fingersL: [0, 0, -40], fingersR: [0, 0, 40],
  },
};

// ——— clips ————————————————————————————————————————————————————————————

const P = (pose: Pose): Pose => pose;

export const CLIPS: Record<string, ClipDef> = {
  // Katana, three-hit combo.
  slash1: {
    name: "slash1", duration: 0.52, mask: "upper", events: [{ t: 0.2, name: "hit" }], blendIn: 0.05, blendOut: 0.12,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.12, pose: P({ spine: [0, -18, 0], chest: [-4, -26, 0], head: [0, 20, 0], upperArmR: [-150, 20, -10], foreArmR: [-60, 0, 0], handR: [-10, 0, 0], upperArmL: [-140, -10, -24], foreArmL: [-70, 0, 0], handL: [-10, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out" },
      { t: 0.22, pose: P({ spine: [14, 20, 0], chest: [10, 32, 0], head: [-10, -26, 0], upperArmR: [-36, 0, 46], foreArmR: [-14, 0, 0], handR: [50, 0, 0], upperArmL: [-26, 0, -6], foreArmL: [-30, 0, 0], handL: [50, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout" },
      { t: 0.52, pose: STANCES.sword, ease: "inout" },
    ],
  },
  slash2: {
    name: "slash2", duration: 0.5, mask: "upper", events: [{ t: 0.2, name: "hit" }], blendIn: 0.04, blendOut: 0.12,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.1, pose: P({ spine: [4, 32, 0], chest: [0, 30, 0], head: [0, -30, 0], upperArmR: [-70, 0, 70], foreArmR: [-80, 0, 0], handR: [-30, 50, 0], upperArmL: [-60, 0, 20], foreArmL: [-90, 0, 0], handL: [-20, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out" },
      { t: 0.22, pose: P({ spine: [6, -34, 0], chest: [4, -36, 0], head: [0, 34, 0], upperArmR: [-80, 0, -34], foreArmR: [-10, 0, 0], handR: [-20, -30, 0], upperArmL: [-76, 0, -60], foreArmL: [-24, 0, 0], handL: [-20, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout" },
      { t: 0.5, pose: STANCES.sword, ease: "inout" },
    ],
  },
  slash3: {
    name: "slash3", duration: 0.72, mask: "full", events: [{ t: 0.34, name: "hit" }], blendIn: 0.06, blendOut: 0.16,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.18, pose: P({ hips: [0, 0, 0], spine: [-10, 0, 0], chest: [-8, 0, 0], head: [8, 0, 0], upperArmR: [-176, 0, 8], foreArmR: [-40, 0, 0], handR: [30, 0, 0], upperArmL: [-172, 0, -8], foreArmL: [-44, 0, 0], handL: [30, 0, 0], thighL: [-30, 0, 0], shinL: [30, 0, 0], thighR: [10, 0, 0], shinR: [10, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out", root: { y: -0.02 } },
      { t: 0.34, pose: P({ spine: [24, 0, 0], chest: [16, 0, 0], head: [-18, 0, 0], upperArmR: [-58, 0, 12], foreArmR: [-8, 0, 0], handR: [40, 0, 0], upperArmL: [-54, 0, -12], foreArmL: [-10, 0, 0], handL: [40, 0, 0], thighL: [-48, 0, 0], shinL: [50, 0, 0], thighR: [24, 0, 0], shinR: [12, 0, 0], footL: [0, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout", root: { y: -0.12, z: 0.35 } },
      { t: 0.72, pose: STANCES.sword, ease: "inout", root: { y: 0, z: 0 } },
    ],
  },
  heavy: {
    name: "heavy", duration: 1.0, mask: "full", events: [{ t: 0.62, name: "hit" }], blendIn: 0.08, blendOut: 0.18,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.45, pose: P({ spine: [-14, -30, 0], chest: [-10, -30, 0], head: [10, 40, 0], upperArmR: [-160, 30, -30], foreArmR: [-70, 0, 0], handR: [20, 0, 0], upperArmL: [-150, 0, -30], foreArmL: [-80, 0, 0], handL: [20, 0, 0], thighL: [-20, 0, 0], shinL: [30, 0, 0], thighR: [16, 0, 0], shinR: [26, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out", root: { y: -0.08 } },
      { t: 0.62, pose: P({ spine: [30, 30, 0], chest: [20, 26, 0], head: [-20, -30, 0], upperArmR: [-40, 0, 40], foreArmR: [-10, 0, 0], handR: [-10, 0, 0], upperArmL: [-40, 0, 0], foreArmL: [-20, 0, 0], handL: [-10, 0, 0], thighL: [-56, 0, 0], shinL: [60, 0, 0], thighR: [28, 0, 0], shinR: [10, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout", root: { y: -0.16, z: 0.6 } },
      { t: 1.0, pose: STANCES.sword, ease: "inout", root: { y: 0, z: 0 } },
    ],
  },
  // Unarmed combo.
  jab: {
    name: "jab", duration: 0.36, mask: "upper", events: [{ t: 0.12, name: "hit" }], blendIn: 0.03, blendOut: 0.1,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.12, pose: P({ ...STANCES.unarmed, chest: [4, -18, 0], spine: [6, -8, 0], upperArmL: [-88, 0, -4], foreArmL: [-6, 0, 0], handL: [0, 0, -80] }), ease: "out" },
      { t: 0.36, pose: STANCES.unarmed, ease: "inout" },
    ],
  },
  cross: {
    name: "cross", duration: 0.44, mask: "upper", events: [{ t: 0.16, name: "hit" }], blendIn: 0.03, blendOut: 0.12,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.16, pose: P({ ...STANCES.unarmed, chest: [6, 30, 0], spine: [8, 18, 0], head: [-6, -20, 0], upperArmR: [-90, 0, 10], foreArmR: [-4, 0, 0], handR: [0, 0, 80] }), ease: "out" },
      { t: 0.44, pose: STANCES.unarmed, ease: "inout" },
    ],
  },
  hook: {
    name: "hook", duration: 0.5, mask: "upper", events: [{ t: 0.2, name: "hit" }], blendIn: 0.04, blendOut: 0.14,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.08, pose: P({ ...STANCES.unarmed, chest: [0, 24, 0], upperArmL: [-60, 0, -60], foreArmL: [-90, 0, 0] }), ease: "out" },
      { t: 0.2, pose: P({ ...STANCES.unarmed, chest: [4, -34, 0], spine: [6, -18, 0], upperArmL: [-86, -40, -70], foreArmL: [-84, 0, 0] }), ease: "inout" },
      { t: 0.5, pose: STANCES.unarmed, ease: "inout" },
    ],
  },
  kick: {
    name: "kick", duration: 0.66, mask: "full", events: [{ t: 0.3, name: "hit" }], blendIn: 0.05, blendOut: 0.14,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.16, pose: P({ ...STANCES.unarmed, spine: [-6, 0, 0], thighR: [-80, 0, 0], shinR: [100, 0, 0], thighL: [0, 0, 0], shinL: [16, 0, 0] }), ease: "out" },
      { t: 0.3, pose: P({ ...STANCES.unarmed, spine: [-16, 0, 0], chest: [-6, 0, 0], thighR: [-96, 0, 0], shinR: [4, 0, 0], footR: [30, 0, 0], thighL: [8, 0, 0], shinL: [10, 0, 0] }), ease: "out", root: { z: 0.2 } },
      { t: 0.66, pose: STANCES.unarmed, ease: "inout", root: { z: 0 } },
    ],
  },
  // Shotgun blast (Shelly).
  shoot: {
    name: "shoot", duration: 0.6, mask: "upper", events: [{ t: 0.06, name: "hit" }], blendIn: 0.03, blendOut: 0.16,
    keys: [
      { t: 0, pose: STANCES.shotgun },
      { t: 0.06, pose: STANCES.shotgun },
      { t: 0.14, pose: P({ ...STANCES.shotgun, spine: [-8, 16, 0], chest: [-10, 10, 0], upperArmR: [-30, 0, 14], upperArmL: [-70, 0, -30], foreArmL: [-50, 0, 0] }), ease: "out" },
      { t: 0.6, pose: STANCES.shotgun, ease: "inout" },
    ],
  },
  // Kunai slash (Naruto).
  stab: {
    name: "stab", duration: 0.34, mask: "upper", events: [{ t: 0.13, name: "hit" }], blendIn: 0.03, blendOut: 0.1,
    keys: [
      { t: 0, pose: STANCES.kunai },
      { t: 0.13, pose: P({ ...STANCES.kunai, chest: [6, 26, 0], upperArmR: [-84, 0, 30], foreArmR: [-40, 0, 0], handR: [40, 0, 0] }), ease: "out" },
      { t: 0.34, pose: STANCES.kunai, ease: "inout" },
    ],
  },
  // Defence and reactions.
  block: {
    name: "block", duration: 0.12, mask: "upper", hold: true, blendIn: 0.06, blendOut: 0.12,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.12, pose: P({ spine: [2, 0, 0], head: [6, 0, 0], upperArmR: [-120, 0, 30], foreArmR: [-60, 0, 0], handR: [-10, -80, 0], upperArmL: [-110, 0, -30], foreArmL: [-70, 0, 0], handL: [-10, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }) },
    ],
  },
  guard: {
    name: "guard", duration: 0.12, mask: "upper", hold: true, blendIn: 0.06, blendOut: 0.12,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.12, pose: P({ spine: [10, 0, 0], head: [10, 0, 0], upperArmR: [-70, 0, 36], foreArmR: [-130, 0, 0], upperArmL: [-70, 0, -36], foreArmL: [-130, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }) },
    ],
  },
  dodge: {
    name: "dodge", duration: 0.5, mask: "full", blendIn: 0.04, blendOut: 0.14,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, pose: P({ spine: [30, 0, 0], chest: [20, 0, 0], head: [-10, 0, 0], thighL: [-70, 0, 0], shinL: [80, 0, 0], thighR: [-20, 0, 0], shinR: [100, 0, 0], upperArmL: [-40, 0, 20], upperArmR: [-40, 0, -20], foreArmL: [-60, 0, 0], foreArmR: [-60, 0, 0] }), ease: "out", root: { y: -0.35 } },
      { t: 0.5, pose: {}, ease: "inout", root: { y: 0 } },
    ],
  },
  hit: {
    name: "hit", duration: 0.42, mask: "upper", blendIn: 0.02, blendOut: 0.16,
    keys: [
      { t: 0, pose: {} },
      { t: 0.08, pose: P({ spine: [-14, 8, 0], chest: [-12, 10, 0], head: [-20, -10, 6], upperArmL: [-20, 0, 30], upperArmR: [-20, 0, -30] }), ease: "out" },
      { t: 0.42, pose: {}, ease: "inout" },
    ],
  },
  knockdown: {
    name: "knockdown", duration: 2.1, mask: "full", blendIn: 0.05, blendOut: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: P({ spine: [-20, 0, 0], chest: [-10, 0, 0], head: [20, 0, 0], thighL: [-50, 0, 0], thighR: [-30, 0, 0], shinL: [40, 0, 0], shinR: [60, 0, 0], upperArmL: [-60, 0, 60], upperArmR: [-60, 0, -60] }), ease: "out", root: { y: -0.7, pitch: -70, z: -0.8 } },
      { t: 1.3, pose: P({ spine: [-8, 0, 0], head: [10, 0, 0], thighL: [-20, 0, 0], thighR: [-10, 0, 0], shinL: [20, 0, 0], shinR: [30, 0, 0], upperArmL: [-10, 0, 70], upperArmR: [-10, 0, -70] }), root: { y: -0.84, pitch: -86, z: -1.0 } },
      { t: 1.7, pose: P({ spine: [30, 0, 0], thighL: [-100, 0, 0], thighR: [-100, 0, 0], shinL: [130, 0, 0], shinR: [130, 0, 0], upperArmL: [-30, 0, 20], upperArmR: [-30, 0, -20] }), ease: "inout", root: { y: -0.55, pitch: -10, z: -1.0 } },
      { t: 2.1, pose: {}, ease: "inout", root: { y: 0, pitch: 0, z: -1.0 } },
    ],
  },
  death: {
    name: "death", duration: 1.2, mask: "full", hold: true, blendIn: 0.05,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, pose: P({ spine: [20, 0, 10], chest: [10, 0, 0], head: [20, 0, 0], thighL: [-40, 0, 0], shinL: [80, 0, 0], thighR: [-60, 0, 0], shinR: [100, 0, 0], upperArmL: [-40, 0, 30], upperArmR: [-40, 0, -30] }), ease: "out", root: { y: -0.5, pitch: 20 } },
      { t: 1.2, pose: P({ spine: [4, 0, 6], head: [-10, 30, 0], thighL: [-10, 0, 10], thighR: [0, 0, -6], shinL: [10, 0, 0], shinR: [30, 0, 0], upperArmL: [-60, 0, 80], upperArmR: [-10, 0, -60], foreArmL: [-20, 0, 0] }), ease: "inout", root: { y: -0.86, pitch: 88 } },
    ],
  },
  // Social.
  bow: {
    name: "bow", duration: 1.6, mask: "upper", blendIn: 0.15, blendOut: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.45, pose: P({ spine: [22, 0, 0], chest: [14, 0, 0], neck: [8, 0, 0], head: [6, 0, 0], upperArmL: [-6, 0, 2], upperArmR: [-6, 0, -2], foreArmL: [-4, 0, 0], foreArmR: [-4, 0, 0] }), ease: "inout" },
      { t: 1.05, pose: P({ spine: [22, 0, 0], chest: [14, 0, 0], neck: [8, 0, 0], head: [6, 0, 0], upperArmL: [-6, 0, 2], upperArmR: [-6, 0, -2] }) },
      { t: 1.6, pose: {}, ease: "inout" },
    ],
  },
  talk: {
    name: "talk", duration: 2.4, mask: "arms", blendIn: 0.3, blendOut: 0.4,
    keys: [
      { t: 0, pose: STANCES.relaxed },
      { t: 0.5, pose: P({ ...STANCES.relaxed, upperArmR: [-26, 0, -6], foreArmR: [-70, 0, 0], handR: [0, 0, -30], fingersR: [0, 0, 8] }), ease: "inout" },
      { t: 1.2, pose: P({ ...STANCES.relaxed, upperArmR: [-20, 0, -14], foreArmR: [-60, 30, 0], handR: [0, -20, -40], upperArmL: [-14, 0, 8], foreArmL: [-50, 0, 0] }), ease: "inout" },
      { t: 1.9, pose: P({ ...STANCES.relaxed, upperArmL: [-24, 0, 10], foreArmL: [-66, 0, 0], handL: [0, 0, 30] }), ease: "inout" },
      { t: 2.4, pose: STANCES.relaxed, ease: "inout" },
    ],
  },
  wave: {
    name: "wave", duration: 1.4, mask: "armR", blendIn: 0.15, blendOut: 0.25,
    keys: [
      { t: 0, pose: STANCES.relaxed },
      { t: 0.3, pose: P({ upperArmR: [-10, 0, -150], foreArmR: [-30, 0, 0], handR: [0, 0, 20] }), ease: "out" },
      { t: 0.55, pose: P({ upperArmR: [-10, 0, -150], foreArmR: [-30, 0, 30], handR: [0, 0, -20] }) },
      { t: 0.8, pose: P({ upperArmR: [-10, 0, -150], foreArmR: [-30, 0, -10], handR: [0, 0, 20] }) },
      { t: 1.4, pose: STANCES.relaxed, ease: "inout" },
    ],
  },
  sit: {
    name: "sit", duration: 0.6, mask: "full", hold: true, blendIn: 0.2,
    keys: [
      { t: 0, pose: {} },
      { t: 0.6, pose: P({ spine: [6, 0, 0], thighL: [-88, 0, 4], thighR: [-88, 0, -4], shinL: [88, 0, 0], shinR: [88, 0, 0], upperArmL: [-26, 0, 6], upperArmR: [-26, 0, -6], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0], fingersL: [0, 0, -30], fingersR: [0, 0, 30] }), ease: "inout", root: { y: -0.44 } },
    ],
  },
  drink: {
    name: "drink", duration: 2.2, mask: "armR", blendIn: 0.2, blendOut: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.7, pose: P({ upperArmR: [-40, 0, 20], foreArmR: [-140, 0, 0], handR: [-30, 0, 0], fingersR: [0, 0, 60] }), ease: "inout" },
      { t: 1.4, pose: P({ upperArmR: [-40, 0, 20], foreArmR: [-140, 0, 0], handR: [-50, 0, 0], fingersR: [0, 0, 60] }) },
      { t: 2.2, pose: {}, ease: "inout" },
    ],
  },
  hammer: {
    name: "hammer", duration: 1.1, mask: "armR", loop: true, events: [{ t: 0.62, name: "clang" }], blendIn: 0.2, blendOut: 0.2,
    keys: [
      { t: 0, pose: P({ upperArmR: [-60, 0, 10], foreArmR: [-60, 0, 0], fingersR: [0, 0, FIST] }) },
      { t: 0.45, pose: P({ upperArmR: [-130, 0, 10], foreArmR: [-80, 0, 0], fingersR: [0, 0, FIST] }), ease: "inout" },
      { t: 0.62, pose: P({ upperArmR: [-50, 0, 10], foreArmR: [-40, 0, 0], fingersR: [0, 0, FIST] }), ease: "linear" },
      { t: 1.1, pose: P({ upperArmR: [-60, 0, 10], foreArmR: [-60, 0, 0], fingersR: [0, 0, FIST] }), ease: "inout" },
    ],
  },
  sweep: {
    name: "sweep", duration: 1.8, mask: "arms", loop: true, blendIn: 0.3, blendOut: 0.3,
    keys: [
      { t: 0, pose: P({ upperArmR: [-40, 0, 20], foreArmR: [-40, 0, 0], upperArmL: [-30, 0, -20], foreArmL: [-50, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }) },
      { t: 0.9, pose: P({ upperArmR: [-30, 0, -10], foreArmR: [-40, 0, 0], upperArmL: [-40, 0, 20], foreArmL: [-50, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout" },
      { t: 1.8, pose: P({ upperArmR: [-40, 0, 20], foreArmR: [-40, 0, 0], upperArmL: [-30, 0, -20], foreArmL: [-50, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "inout" },
    ],
  },
  cheer: {
    name: "cheer", duration: 1.2, mask: "arms", blendIn: 0.1, blendOut: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, pose: P({ upperArmR: [-20, 0, -160], foreArmR: [-20, 0, 0], upperArmL: [-20, 0, 160], foreArmL: [-20, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out" },
      { t: 0.9, pose: P({ upperArmR: [-20, 0, -150], foreArmR: [-30, 0, 0], upperArmL: [-20, 0, 150], foreArmL: [-30, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }) },
      { t: 1.2, pose: {}, ease: "inout" },
    ],
  },
  cower: {
    name: "cower", duration: 0.4, mask: "full", hold: true, blendIn: 0.1, blendOut: 0.3,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, pose: P({ spine: [30, 0, 0], chest: [20, 0, 0], head: [10, 0, 0], thighL: [-40, 0, 0], thighR: [-40, 0, 0], shinL: [70, 0, 0], shinR: [70, 0, 0], upperArmL: [-110, 0, -20], upperArmR: [-110, 0, 20], foreArmL: [-100, 0, 0], foreArmR: [-100, 0, 0] }), ease: "out", root: { y: -0.25 } },
    ],
  },
  // Specials.
  iai: {
    name: "iai", duration: 1.0, mask: "full", events: [{ t: 0.42, name: "dash" }, { t: 0.5, name: "hit" }], blendIn: 0.05, blendOut: 0.2,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.35, pose: P({ spine: [20, 30, 0], chest: [10, 20, 0], head: [-10, -40, 0], upperArmR: [-20, 0, 40], foreArmR: [-90, 0, 0], upperArmL: [-10, 0, -10], foreArmL: [-60, 0, 0], thighL: [-50, 0, 0], shinL: [70, 0, 0], thighR: [30, 0, 0], shinR: [60, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out", root: { y: -0.25 } },
      { t: 0.5, pose: P({ spine: [10, -40, 0], chest: [4, -30, 0], head: [0, 40, 0], upperArmR: [-90, 0, -80], foreArmR: [0, 0, 0], handR: [0, -40, 0], upperArmL: [-20, 0, 50], thighL: [-60, 0, 0], shinL: [60, 0, 0], thighR: [40, 0, 0], shinR: [20, 0, 0], fingersR: [0, 0, FIST] }), ease: "out", root: { y: -0.3 } },
      { t: 0.8, pose: P({ spine: [10, -40, 0], chest: [4, -30, 0], upperArmR: [-90, 0, -80], foreArmR: [0, 0, 0], handR: [0, -40, 0], upperArmL: [-20, 0, 50], thighL: [-60, 0, 0], shinL: [60, 0, 0], thighR: [40, 0, 0], shinR: [20, 0, 0], fingersR: [0, 0, FIST] }), root: { y: -0.3 } },
      { t: 1.0, pose: STANCES.sword, ease: "inout", root: { y: 0 } },
    ],
  },
  pistol: {
    name: "pistol", duration: 1.0, mask: "upper", events: [{ t: 0.42, name: "hit" }], blendIn: 0.05, blendOut: 0.2,
    stretch: [[0, 1], [0.3, 1], [0.42, 24], [0.56, 24], [0.8, 1], [1, 1]],
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.3, pose: P({ spine: [0, 40, 0], chest: [0, 30, 0], head: [0, -50, 0], upperArmR: [40, 0, 20], foreArmR: [-100, 0, 0], fingersR: [0, 0, FIST], upperArmL: [-60, 0, -30], foreArmL: [-90, 0, 0], fingersL: [0, 0, -FIST] }), ease: "out" },
      { t: 0.42, pose: P({ spine: [10, -30, 0], chest: [6, -30, 0], head: [0, 40, 0], upperArmR: [-88, 0, 8], foreArmR: [0, 0, 0], handR: [0, 0, 0], fingersR: [0, 0, FIST], upperArmL: [-20, 0, -10], foreArmL: [-60, 0, 0] }), ease: "out" },
      { t: 0.56, pose: P({ spine: [10, -30, 0], chest: [6, -30, 0], head: [0, 40, 0], upperArmR: [-88, 0, 8], foreArmR: [0, 0, 0], handR: [0, 0, 0], fingersR: [0, 0, FIST] }) },
      { t: 1.0, pose: STANCES.unarmed, ease: "inout" },
    ],
  },
  onigiri: {
    name: "onigiri", duration: 1.1, mask: "full", events: [{ t: 0.4, name: "dash" }, { t: 0.5, name: "hit" }], blendIn: 0.05, blendOut: 0.2,
    keys: [
      { t: 0, pose: STANCES.triple },
      { t: 0.35, pose: P({ spine: [30, 0, 0], chest: [10, 0, 0], head: [-26, 0, 0], upperArmR: [-40, 0, 50], foreArmR: [-60, 0, 0], handR: [-60, 0, 0], upperArmL: [-40, 0, -50], foreArmL: [-60, 0, 0], handL: [-60, 0, 0], thighL: [-60, 0, 0], shinL: [80, 0, 0], thighR: [30, 0, 0], shinR: [60, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out", root: { y: -0.3 } },
      { t: 0.55, pose: P({ spine: [20, 0, 0], head: [-10, 0, 0], upperArmR: [-70, 0, -70], foreArmR: [-10, 0, 0], handR: [-40, 0, 0], upperArmL: [-70, 0, 70], foreArmL: [-10, 0, 0], handL: [-40, 0, 0], thighL: [-40, 0, 0], shinL: [40, 0, 0], thighR: [30, 0, 0], shinR: [30, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), ease: "out", root: { y: -0.2 } },
      { t: 0.9, pose: P({ spine: [20, 0, 0], upperArmR: [-70, 0, -70], foreArmR: [-10, 0, 0], upperArmL: [-70, 0, 70], foreArmL: [-10, 0, 0], thighL: [-40, 0, 0], shinL: [40, 0, 0], fingersR: [0, 0, FIST], fingersL: [0, 0, -FIST] }), root: { y: -0.2 } },
      { t: 1.1, pose: STANCES.triple, ease: "inout", root: { y: 0 } },
    ],
  },
  handsign: {
    name: "handsign", duration: 0.9, mask: "upper", events: [{ t: 0.55, name: "cast" }], blendIn: 0.08, blendOut: 0.2,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, pose: P({ spine: [4, 0, 0], head: [8, 0, 0], upperArmR: [-40, 0, 40], foreArmR: [-110, 0, 0], handR: [0, 0, 20], upperArmL: [-40, 0, -40], foreArmL: [-110, 0, 0], handL: [0, 0, -20], fingersR: [0, 0, 10], fingersL: [0, 0, -10] }), ease: "out" },
      { t: 0.6, pose: P({ spine: [4, 0, 0], head: [8, 0, 0], upperArmR: [-40, 0, 44], foreArmR: [-112, 0, 0], handR: [-30, 0, 20], upperArmL: [-40, 0, -44], foreArmL: [-112, 0, 0], handL: [-30, 0, -20] }) },
      { t: 0.9, pose: {}, ease: "inout" },
    ],
  },
  chidori: {
    name: "chidori", duration: 1.4, mask: "full", events: [{ t: 0.9, name: "dash" }, { t: 1.0, name: "hit" }], blendIn: 0.08, blendOut: 0.2,
    keys: [
      { t: 0, pose: {} },
      { t: 0.5, pose: P({ spine: [16, 20, 0], chest: [6, 16, 0], head: [-10, -26, 0], upperArmL: [-20, 0, 40], foreArmL: [-30, 0, 0], handL: [-30, 0, 0], fingersL: [0, 0, -10], upperArmR: [-30, 0, 30], foreArmR: [-90, 0, 0], handR: [0, 0, 30], thighL: [-40, 0, 0], shinL: [60, 0, 0], thighR: [30, 0, 0], shinR: [40, 0, 0] }), ease: "out", root: { y: -0.22 } },
      { t: 0.88, pose: P({ spine: [16, 20, 0], chest: [6, 16, 0], head: [-10, -26, 0], upperArmL: [-20, 0, 40], foreArmL: [-30, 0, 0], handL: [-30, 0, 0], upperArmR: [-30, 0, 30], foreArmR: [-90, 0, 0], thighL: [-40, 0, 0], shinL: [60, 0, 0], thighR: [30, 0, 0], shinR: [40, 0, 0] }), root: { y: -0.22 } },
      { t: 1.0, pose: P({ spine: [20, -20, 0], chest: [10, -20, 0], head: [-16, 20, 0], upperArmL: [-90, 0, 10], foreArmL: [0, 0, 0], handL: [0, 0, 0], fingersL: [0, 0, 0], upperArmR: [20, 0, -20], foreArmR: [-40, 0, 0], thighL: [-50, 0, 0], shinL: [40, 0, 0], thighR: [40, 0, 0], shinR: [20, 0, 0] }), ease: "out", root: { y: -0.15 } },
      { t: 1.4, pose: {}, ease: "inout", root: { y: 0 } },
    ],
  },
  getsuga: {
    name: "getsuga", duration: 1.1, mask: "full", events: [{ t: 0.55, name: "hit" }], blendIn: 0.08, blendOut: 0.2,
    keys: [
      { t: 0, pose: STANCES.greatsword },
      { t: 0.42, pose: P({ spine: [-10, -40, 0], chest: [-6, -30, 0], head: [0, 40, 0], upperArmR: [-170, 0, -20], foreArmR: [-30, 0, 0], handR: [40, 0, 0], upperArmL: [-40, 0, 40], thighL: [-30, 0, 0], shinL: [30, 0, 0], fingersR: [0, 0, FIST] }), ease: "out", root: { y: -0.05 } },
      { t: 0.56, pose: P({ spine: [30, 30, 0], chest: [20, 30, 0], head: [-20, -30, 0], upperArmR: [-50, 0, 40], foreArmR: [-10, 0, 0], handR: [-20, 0, 0], upperArmL: [-10, 0, 20], thighL: [-60, 0, 0], shinL: [60, 0, 0], thighR: [30, 0, 0], shinR: [10, 0, 0], fingersR: [0, 0, FIST] }), ease: "out", root: { y: -0.2, z: 0.4 } },
      { t: 1.1, pose: STANCES.greatsword, ease: "inout", root: { y: 0, z: 0 } },
    ],
  },
  scatter: {
    name: "scatter", duration: 1.3, mask: "upper", events: [{ t: 0.7, name: "cast" }], blendIn: 0.1, blendOut: 0.3,
    keys: [
      { t: 0, pose: STANCES.sword },
      { t: 0.5, pose: P({ spine: [0, 0, 0], head: [0, 0, 0], upperArmR: [-70, 0, 34], foreArmR: [-80, 0, 0], handR: [-60, 0, 0], upperArmL: [2, 0, 5], foreArmL: [-12, 0, 0], fingersR: [0, 0, FIST] }), ease: "inout" },
      { t: 0.8, pose: P({ upperArmR: [-70, 0, 34], foreArmR: [-80, 0, 0], handR: [-70, 0, 0], upperArmL: [2, 0, 5], foreArmL: [-12, 0, 0], fingersR: [0, 0, 20] }) },
      { t: 1.3, pose: STANCES.sword, ease: "inout" },
    ],
  },
  supershell: {
    name: "supershell", duration: 1.0, mask: "full", events: [{ t: 0.3, name: "hit" }], blendIn: 0.06, blendOut: 0.2,
    keys: [
      { t: 0, pose: STANCES.shotgun },
      { t: 0.28, pose: P({ ...STANCES.shotgun, spine: [10, 16, 0], thighL: [-30, 0, 0], shinL: [40, 0, 0], thighR: [20, 0, 0], shinR: [30, 0, 0] }), ease: "out", root: { y: -0.12 } },
      { t: 0.4, pose: P({ ...STANCES.shotgun, spine: [-20, 16, 0], chest: [-14, 10, 0], upperArmR: [-40, 0, 14], upperArmL: [-80, 0, -30], thighL: [-30, 0, 0], shinL: [40, 0, 0], thighR: [30, 0, 0], shinR: [20, 0, 0] }), ease: "out", root: { y: -0.12, z: -0.5 } },
      { t: 1.0, pose: STANCES.shotgun, ease: "inout", root: { y: 0, z: -0.5 } },
    ],
  },
  elbowdrop: {
    name: "elbowdrop", duration: 1.5, mask: "full", events: [{ t: 0.3, name: "leap" }, { t: 0.95, name: "hit" }], blendIn: 0.06, blendOut: 0.25,
    keys: [
      { t: 0, pose: STANCES.unarmed },
      { t: 0.28, pose: P({ spine: [20, 0, 0], thighL: [-60, 0, 0], thighR: [-60, 0, 0], shinL: [100, 0, 0], shinR: [100, 0, 0], upperArmL: [30, 0, 20], upperArmR: [30, 0, -20] }), ease: "out", root: { y: -0.35 } },
      { t: 0.6, pose: P({ spine: [-10, 0, 0], thighL: [-30, 0, 0], thighR: [-10, 0, 0], shinL: [60, 0, 0], shinR: [40, 0, 0], upperArmL: [-160, 0, 20], upperArmR: [-60, 0, -120], foreArmR: [-120, 0, 0], fingersL: [0, 0, -FIST], fingersR: [0, 0, FIST] }), ease: "out", root: { y: 3.2 } },
      { t: 0.95, pose: P({ spine: [40, 0, 0], chest: [20, 0, 0], thighL: [-70, 0, 0], thighR: [-40, 0, 0], shinL: [90, 0, 0], shinR: [80, 0, 0], upperArmR: [-10, 0, -60], foreArmR: [-150, 0, 0], upperArmL: [-40, 0, 40], fingersL: [0, 0, -FIST], fingersR: [0, 0, FIST] }), ease: "inout", root: { y: -0.3 } },
      { t: 1.5, pose: STANCES.unarmed, ease: "inout", root: { y: 0 } },
    ],
  },
};

// ——— animator ——————————————————————————————————————————————————————————

interface Playing {
  clip: ClipDef;
  time: number;
  weight: number;
  stopping: boolean;
  speed: number;
  fired: Set<number>;
  onEvent?: (name: string) => void;
  onEnd?: () => void;
}

const D2R = Math.PI / 180;

function sample(clip: ClipDef, t: number, out: Map<BoneName, E3>, root: { y: number; z: number; pitch: number; roll: number }) {
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  let k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
  const ease = b.ease ?? "inout";
  k = ease === "linear" ? k : ease === "out" ? easeOutCubic(k) : easeInOutCubic(k);
  const bones = new Set<BoneName>([...(Object.keys(a.pose) as BoneName[]), ...(Object.keys(b.pose) as BoneName[])]);
  for (const bn of bones) {
    const pa = a.pose[bn] ?? [0, 0, 0];
    const pb = b.pose[bn] ?? [0, 0, 0];
    out.set(bn, [lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k), lerp(pa[2], pb[2], k)]);
  }
  const ra = a.root ?? {};
  const rb = b.root ?? {};
  const pick = (key: "y" | "z" | "pitch" | "roll") => lerp(ra[key] ?? 0, rb[key] ?? ra[key] ?? 0, k);
  root.y = pick("y");
  root.z = pick("z");
  root.pitch = pick("pitch");
  root.roll = pick("roll");
}

export class Animator {
  speed = 0;
  /** Gait phase 0..1 */
  phase = 0;
  grounded = true;
  vy = 0;
  /** Sideways lean from turning, radians. */
  turnLean = 0;
  stance: Stance = "relaxed";
  private stanceBlend = new Map<Stance, number>([["relaxed", 1]]);
  private playing: Playing[] = [];
  lookYaw = 0;
  lookPitch = 0;
  private lookYawS = 0;
  private lookPitchS = 0;
  time = Math.random() * 10;
  /** Root offsets from clips, applied by the Character. */
  readonly root = { y: 0, z: 0, pitch: 0, roll: 0 };
  armStretch = 1;
  /** Stride length scale (tall characters, kimono). */
  strideScale = 1;
  /** Short shuffling steps for long kimono. */
  demure = false;

  private pose = new Map<BoneName, E3>();
  private tmp = new Map<BoneName, E3>();

  constructor(private bones: Record<BoneName, THREE.Bone>) {}

  setStance(s: Stance) {
    this.stance = s;
    if (!this.stanceBlend.has(s)) this.stanceBlend.set(s, 0);
  }

  play(name: string, opts: { speed?: number; onEvent?: (name: string) => void; onEnd?: () => void; restart?: boolean } = {}): boolean {
    const clip = CLIPS[name];
    if (!clip) return false;
    const existing = this.playing.find((p) => p.clip === clip && !p.stopping);
    if (existing && !opts.restart) {
      existing.onEvent = opts.onEvent ?? existing.onEvent;
      return true;
    }
    // Same-mask clips replace each other.
    for (const p of this.playing) if (p.clip.mask === clip.mask || clip.mask === "full") p.stopping = true;
    this.playing.push({ clip, time: 0, weight: 0, stopping: false, speed: opts.speed ?? 1, fired: new Set(), onEvent: opts.onEvent, onEnd: opts.onEnd });
    return true;
  }

  stop(name: string) {
    for (const p of this.playing) if (p.clip.name === name) p.stopping = true;
  }

  stopAll() {
    for (const p of this.playing) p.stopping = true;
  }

  isPlaying(name?: string): boolean {
    return this.playing.some((p) => !p.stopping && (!name || p.clip.name === name));
  }

  /** True when a full-body or upper-body action is running (locks attacks). */
  busy(): boolean {
    return this.playing.some((p) => !p.stopping && !p.clip.loop && !p.clip.hold && p.clip.name !== "talk" && p.clip.name !== "wave" && p.clip.name !== "drink");
  }

  update(dt: number) {
    this.time += dt;
    const pose = this.pose;
    pose.clear();
    const add = (bn: BoneName, e: E3, w = 1) => {
      const c = pose.get(bn);
      if (c) {
        c[0] += e[0] * w;
        c[1] += e[1] * w;
        c[2] += e[2] * w;
      } else pose.set(bn, [e[0] * w, e[1] * w, e[2] * w]);
    };

    // — locomotion —
    const sp = this.speed;
    const walkW = smoothstep(0.05, 1.0, sp);
    const runW = smoothstep(2.4, 4.6, sp);
    const cadence = lerp(1.7, 2.9, runW) * (this.demure ? 1.2 : 1);
    this.phase = (this.phase + dt * cadence * 0.5 * Math.min(1.25, 0.35 + sp / 3) * (walkW > 0.01 ? 1 : 0)) % 1;
    const ph = this.phase * Math.PI * 2;
    const stride = lerp(24, 46, runW) * walkW * (this.demure ? 0.45 : 1) * this.strideScale;
    for (const [side, off] of [["L", 0], ["R", Math.PI]] as const) {
      const a = ph + off;
      const swing = Math.cos(a);
      const lift = Math.max(0, Math.sin(a - Math.PI));
      add(`thigh${side}`, [-stride * swing - runW * 10, 0, 0]);
      add(`shin${side}`, [walkW * (6 + lerp(46, 95, runW) * Math.pow(lift, 1.2) + (1 - runW) * 8 * Math.max(0, -swing)), 0, 0]);
      add(`foot${side}`, [walkW * (swing > 0.6 ? -10 * swing : 14 * Math.max(0, -Math.sin(a + 0.6))), 0, 0]);
      const armSwing = lerp(18, 38, runW) * walkW * (this.demure ? 0.4 : 1);
      add(`upperArm${side}`, [armSwing * swing, 0, 0]);
      add(`foreArm${side}`, [-runW * 70 - walkW * 8, 0, 0]);
    }
    add("hips", [0, 7 * walkW * Math.cos(ph) * (1 - runW * 0.4), 3 * walkW * Math.sin(ph)]);
    add("spine", [runW * 9 + walkW * 2, -3 * walkW * Math.cos(ph), 0]);
    add("chest", [runW * 4, -6 * walkW * Math.cos(ph), 0]);
    add("head", [-runW * 8, 3 * walkW * Math.cos(ph), 0]);
    const bob = walkW * lerp(0.022, 0.05, runW) * (0.5 + 0.5 * Math.cos(ph * 2));
    // Idle breathing and weight shift.
    const idle = 1 - walkW;
    const br = Math.sin(this.time * 1.7);
    add("chest", [idle * br * 1.4, 0, 0]);
    add("hips", [0, 0, idle * Math.sin(this.time * 0.37) * 1.6]);
    add("head", [idle * Math.sin(this.time * 0.9) * 1.2, idle * Math.sin(this.time * 0.29) * 5, 0]);
    // Turning lean.
    add("hips", [0, 0, (this.turnLean * 180) / Math.PI]);
    // Airborne.
    if (!this.grounded) {
      const up = this.vy > 0 ? 1 : 0.5;
      add("thighL", [-40 * up, 0, 0]);
      add("shinL", [70 * up, 0, 0]);
      add("thighR", [-10, 0, 0]);
      add("shinR", [40, 0, 0]);
      add("upperArmL", [-30, 0, 20]);
      add("upperArmR", [-30, 0, -20]);
    }

    // — stance (upper body) —
    for (const [s, w] of this.stanceBlend) {
      const target = s === this.stance ? 1 : 0;
      const nw = damp(w, target, 10, dt);
      if (nw < 0.001 && target === 0) this.stanceBlend.delete(s);
      else this.stanceBlend.set(s, nw);
    }
    const moveDamp = 1 - runW * 0.35;
    for (const [s, w] of this.stanceBlend) {
      const st = STANCES[s];
      for (const bn of Object.keys(st) as BoneName[]) {
        const e = st[bn]!;
        // Arm swing is kept on top of stances, damped for weapon stances.
        add(bn, e, w * (s === "relaxed" ? 1 : moveDamp));
      }
      if (s !== "relaxed" && walkW > 0) {
        for (const side of ["L", "R"] as const) {
          const c = pose.get(`upperArm${side}`);
          if (c) c[0] -= (lerp(18, 38, runW) * walkW * Math.cos(ph + (side === "L" ? 0 : Math.PI))) * w * 0.75;
        }
      }
    }

    // — actions —
    this.root.y = 0;
    this.root.z = 0;
    this.root.pitch = 0;
    this.root.roll = 0;
    this.armStretch = 1;
    const rootTmp = { y: 0, z: 0, pitch: 0, roll: 0 };
    for (const p of this.playing) {
      const c = p.clip;
      p.time += dt * p.speed;
      const inT = c.blendIn ?? 0.1;
      const outT = c.blendOut ?? 0.15;
      const ending = !c.loop && !c.hold && p.time >= c.duration - outT;
      if (p.stopping || ending) p.weight = Math.max(0, p.weight - dt / Math.max(0.01, outT));
      else p.weight = Math.min(1, p.weight + dt / Math.max(0.01, inT));
      let t = p.time;
      if (c.loop) t = p.time % c.duration;
      else if (c.hold) t = Math.min(p.time, c.duration);
      else t = Math.min(p.time, c.duration);
      for (const [i, ev] of (c.events ?? []).entries()) {
        const et = c.loop ? ev.t : ev.t;
        const passed = c.loop ? (p.time % c.duration) >= et && ((p.time - dt * p.speed) % c.duration) < et : p.time >= et;
        if (passed && (c.loop || !p.fired.has(i)) && !p.stopping) {
          if (!c.loop) p.fired.add(i);
          p.onEvent?.(ev.name);
        }
      }
      this.tmp.clear();
      sample(c, t, this.tmp, rootTmp);
      const mask = MASKS[c.mask];
      const w = easeInOutCubic(p.weight);
      for (const bn of mask) {
        const target = this.tmp.get(bn) ?? [0, 0, 0];
        const cur = pose.get(bn) ?? [0, 0, 0];
        // Keep locomotion on the legs for upper-body clips; full clips override.
        pose.set(bn, [lerp(cur[0], target[0], w), lerp(cur[1], target[1], w), lerp(cur[2], target[2], w)]);
      }
      this.root.y += rootTmp.y * w;
      this.root.z += rootTmp.z * w;
      this.root.pitch += rootTmp.pitch * w;
      this.root.roll += rootTmp.roll * w;
      if (c.stretch) {
        let s = 1;
        for (let i = 0; i < c.stretch.length - 1; i++) {
          const [ta, va] = c.stretch[i];
          const [tb, vb] = c.stretch[i + 1];
          if (t >= ta && t <= tb) s = lerp(va, vb, (t - ta) / Math.max(1e-4, tb - ta));
        }
        this.armStretch = Math.max(this.armStretch, s);
      }
    }
    for (let i = this.playing.length - 1; i >= 0; i--) {
      const p = this.playing[i];
      const done = (p.stopping || (!p.clip.loop && !p.clip.hold && p.time >= p.clip.duration)) && p.weight <= 0.001;
      if (done) {
        this.playing.splice(i, 1);
        p.onEnd?.();
      }
    }

    // — look-at (head & neck), added last —
    this.lookYawS = damp(this.lookYawS, clamp(this.lookYaw, -1.2, 1.2), 6, dt);
    this.lookPitchS = damp(this.lookPitchS, clamp(this.lookPitch, -0.6, 0.6), 6, dt);
    add("neck", [(this.lookPitchS * 0.4) / D2R, (this.lookYawS * 0.4) / D2R, 0]);
    add("head", [(this.lookPitchS * 0.6) / D2R, (this.lookYawS * 0.6) / D2R, 0]);

    // Apply.
    for (const bn of BONE_NAMES) {
      const b = this.bones[bn];
      if (!b) continue;
      const e = pose.get(bn);
      if (e) b.rotation.set(e[0] * D2R, e[1] * D2R, e[2] * D2R);
      else b.rotation.set(0, 0, 0);
    }
    this.bones.hips.position.y = this.hipsRestY - bob;
    // Luffy's stretch: lengthen the right arm, keep the fist its normal size.
    const st = this.armStretch;
    const A = st > 1 ? 1 + (st - 1) * 0.35 : 1;
    const B = st > 1 ? 1 + (st - 1) * 0.65 : 1;
    this.bones.upperArmR.scale.set(1, A, 1);
    this.bones.foreArmR.scale.set(1, B, 1);
    this.bones.handR.scale.set(1, 1 / (A * B), 1);
  }

  hipsRestY = 0;
  bind() {
    this.hipsRestY = this.bones.hips.position.y;
  }
}
