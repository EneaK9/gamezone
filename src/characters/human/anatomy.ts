// Measurements and per-vertex fields for one assembled body: where each stored vertex
// sits along its arm or leg, landmark heights, and head dimensions. Garments, hair and
// props are all positioned from these.

import * as THREE from "three";
import type { HumanBody, HumanKit } from "./kit";

export type Side = "L" | "R";
export const SIDES: Side[] = ["L", "R"];
/** +1 for the character's left (+x), −1 for the right. */
export const sx = (s: Side) => (s === "L" ? 1 : -1);

export interface Chain {
  pts: THREE.Vector3[];
  len: number[];
  total: number;
}

function chain(pts: THREE.Vector3[]): Chain {
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, len, total: len[len.length - 1] };
}

/** Project p onto a polyline: t in 0..1 along it, and distance from it. */
export function projectChain(c: Chain, p: THREE.Vector3): { t: number; d: number; at: THREE.Vector3; dir: THREE.Vector3 } {
  let best = { t: 0, d: Infinity, at: c.pts[0].clone(), dir: new THREE.Vector3(0, -1, 0) };
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i];
    const b = c.pts[i + 1];
    ab.subVectors(b, a);
    const l2 = ab.lengthSq();
    const k = THREE.MathUtils.clamp(ap.subVectors(p, a).dot(ab) / l2, i === 0 ? -0.5 : 0, i === c.pts.length - 2 ? 1.5 : 1);
    const q = a.clone().addScaledVector(ab, k);
    const d = q.distanceTo(p);
    if (d < best.d) best = { t: (c.len[i] + k * Math.sqrt(l2)) / c.total, d, at: q, dir: ab.clone().normalize() };
  }
  return best;
}

export class Anatomy {
  readonly n: number;
  /** Dominant bone per stored vertex. */
  readonly bone: Uint8Array;
  /** Region per stored vertex: 0 torso/neck, 1 head, 2 arm L, 3 arm R, 4 hand L, 5 hand R, 6 leg L, 7 leg R, 8 foot L, 9 foot R. */
  readonly region: Uint8Array;
  /** Parameter along the arm (shoulder 0 → wrist 1) or leg (hip 0 → ankle 1); NaN elsewhere. */
  readonly limbT: Float32Array;
  readonly arm: Record<Side, Chain>;
  readonly leg: Record<Side, Chain>;
  readonly H: number;
  // Landmarks (world rest pose).
  readonly ground = 0;
  readonly hipY: number;
  readonly waistY: number;
  readonly navelY: number;
  readonly chestY: number;
  readonly shoulderY: number;
  readonly neckY: number;
  readonly chinY: number;
  readonly kneeY: number;
  readonly ankleY: number;
  readonly headTop: THREE.Vector3;
  readonly headCentre: THREE.Vector3;
  /** Skull half-extents (x: width, y: height from centre to crown, z: depth). */
  readonly headRadii: THREE.Vector3;
  /** Front of the face (tip of nose) z. */
  readonly faceZ: number;
  readonly eye: Record<Side, THREE.Vector3>;
  readonly mouth: THREE.Vector3;

  constructor(
    readonly kit: HumanKit,
    readonly body: HumanBody,
  ) {
    const n = (this.n = kit.vertexCount);
    const wi = kit.view<Uint8Array>("weights:idx");
    const J = (b: string) => kit.joint(body, b);
    const names = kit.boneNames;
    this.bone = new Uint8Array(n);
    this.region = new Uint8Array(n);
    this.limbT = new Float32Array(n).fill(NaN);
    for (let i = 0; i < n; i++) this.bone[i] = wi[i * 4];
    this.arm = {
      L: chain([J("upperArmL"), J("foreArmL"), J("handL")]),
      R: chain([J("upperArmR"), J("foreArmR"), J("handR")]),
    };
    this.leg = {
      L: chain([J("thighL"), J("shinL"), J("footL")]),
      R: chain([J("thighR"), J("shinR"), J("footR")]),
    };
    const p = new THREE.Vector3();
    const head: number[] = [];
    for (let i = 0; i < n; i++) {
      const name = names[this.bone[i]];
      p.fromArray(body.pos, i * 3);
      let r = 0;
      if (/^(head|jaw|eye|lid|tail)/.test(name)) r = 1;
      else if (/^(upperArm|foreArm)/.test(name)) r = name.endsWith("L") ? 2 : 3;
      else if (/^(hand|thumb|index|middle|ring|pinky|fingers)/.test(name)) r = name.endsWith("L") ? 4 : 5;
      else if (/^(thigh|shin)/.test(name)) r = name.endsWith("L") ? 6 : 7;
      else if (/^(foot|toes)/.test(name)) r = name.endsWith("L") ? 8 : 9;
      else if (name.startsWith("shoulder")) {
        // Deltoid region: counts as arm when outside the shoulder joint.
        const s = name.endsWith("L") ? "L" : "R";
        const j = this.arm[s].pts[0];
        r = Math.abs(p.x) > Math.abs(j.x) - 0.015 ? (s === "L" ? 2 : 3) : 0;
      }
      this.region[i] = r;
      if (r === 2 || r === 3 || r === 4 || r === 5) this.limbT[i] = projectChain(this.arm[r % 2 === 0 ? "L" : "R"], p).t;
      else if (r >= 6) this.limbT[i] = projectChain(this.leg[r % 2 === 0 ? "L" : "R"], p).t;
      if (r === 1) head.push(i);
    }
    this.H = body.spec.height;
    this.hipY = J("thighL").y;
    this.waistY = THREE.MathUtils.lerp(J("spine").y, J("chest").y, 0.35);
    this.navelY = THREE.MathUtils.lerp(J("hips").y, J("chest").y, 0.42);
    this.chestY = THREE.MathUtils.lerp(J("chest").y, J("neck").y, 0.45);
    this.shoulderY = J("upperArmL").y;
    this.neckY = J("neck").y;
    this.kneeY = J("shinL").y;
    this.ankleY = J("footL").y;
    // Head bounds from head-region body vertices (not the proxies).
    const bodyVtx = kit.view<Uint16Array>("body:vtx");
    const onBody = new Uint8Array(n);
    for (let i = 0; i < bodyVtx.length; i++) onBody[bodyVtx[i]] = 1;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const neckJ = J("head");
    for (const i of head) {
      if (!onBody[i]) continue;
      p.fromArray(body.pos, i * 3);
      if (p.y < neckJ.y - 0.02) continue;
      min.min(p);
      max.max(p);
    }
    this.headTop = new THREE.Vector3((min.x + max.x) / 2, max.y, (min.z + max.z) / 2);
    this.faceZ = max.z;
    this.eye = { L: J("eyeL"), R: J("eyeR") };
    // Skull centre: level with the eyes, midway front-back (excluding the nose).
    const skullBack = min.z;
    const brow = this.eye.L.z + 0.012;
    this.headCentre = new THREE.Vector3(0, this.eye.L.y + 0.004, (skullBack + brow) / 2 - 0.004);
    this.headRadii = new THREE.Vector3((max.x - min.x) / 2, max.y - this.headCentre.y, (brow - skullBack) / 2 + 0.006);
    this.chinY = min.y;
    this.mouth = new THREE.Vector3(0, THREE.MathUtils.lerp(this.chinY, this.eye.L.y, 0.36), this.faceZ - 0.012);
  }

  pos(i: number, out = new THREE.Vector3()) {
    return out.fromArray(this.body.pos, i * 3);
  }

  nrm(i: number, out = new THREE.Vector3()) {
    return out.fromArray(this.body.normals, i * 3);
  }

  joint(b: string, out = new THREE.Vector3()) {
    return this.kit.joint(this.body, b, out);
  }

  /** Head-local direction of a point from the skull centre, normalised by the radii. */
  headDir(p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.subVectors(p, this.headCentre).divide(this.headRadii);
  }
}
