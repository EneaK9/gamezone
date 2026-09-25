// Attack profiles per weapon style and strike resolution.

import * as THREE from "three";
import { ITEMS, type WeaponStyle } from "../../shared/items";
import type { Actor, Hit, HitResult } from "./Actor";

export interface AttackProfile {
  combo: string[];
  heavy: string;
  reach: number;
  /** Half-angle of the hit arc (radians). */
  arc: number;
  damage: number;
  speed: number;
  kind: Hit["kind"];
  /** Ranged cone (shotgun). */
  ranged?: boolean;
}

export function weaponStyle(weaponId: string): WeaponStyle {
  if (weaponId === "fists") return "fists";
  return ITEMS[weaponId]?.weapon?.style ?? "fists";
}

export function attackProfile(weaponId: string, drawn: boolean, unarmedDamage = 9): AttackProfile {
  const w = ITEMS[weaponId]?.weapon;
  if (!drawn || !w || weaponId === "fists") {
    return { combo: ["jab", "cross", "hook", "kick"], heavy: "kick", reach: 1.6, arc: 0.9, damage: unarmedDamage, speed: 1.1, kind: "blunt" };
  }
  switch (w.style) {
    case "greatsword":
      return { combo: ["slash1", "slash3"], heavy: "heavy", reach: w.reach, arc: 1.25, damage: w.damage, speed: w.speed, kind: weaponId === "kanabo" ? "blunt" : "blade" };
    case "triple":
    case "twin":
      return { combo: ["slash1", "slash2", "slash3"], heavy: "heavy", reach: w.reach, arc: 1.2, damage: w.damage, speed: w.speed, kind: "blade" };
    case "shotgun":
      return { combo: ["shoot"], heavy: "shoot", reach: w.reach, arc: 0.36, damage: w.damage, speed: w.speed, kind: "shot", ranged: true };
    case "kunai":
      return { combo: ["stab", "stab", "cross", "kick"], heavy: "kick", reach: w.reach, arc: 0.9, damage: w.damage, speed: w.speed, kind: "blade" };
    case "fists":
      return { combo: ["jab", "cross", "hook", "kick"], heavy: "kick", reach: 1.6, arc: 0.9, damage: w.damage, speed: 1.1, kind: "blunt" };
    default:
      return { combo: ["slash1", "slash2", "slash3"], heavy: "heavy", reach: w.reach, arc: 1.05, damage: w.damage, speed: w.speed, kind: weaponId === "bokken" ? "blunt" : "blade" };
  }
}

export interface StrikeOpts {
  reach: number;
  arc: number;
  damage: number;
  knockback?: number;
  heavy?: boolean;
  unblockable?: boolean;
  kind: Hit["kind"];
  /** Strike centre; defaults to the attacker. */
  origin?: THREE.Vector3;
  /** Direction; defaults to the attacker's facing. */
  dir?: THREE.Vector3;
  maxTargets?: number;
  /** Full circle (ignore arc). */
  radial?: boolean;
}

export interface StrikeResult {
  target: Actor;
  result: HitResult;
  point: THREE.Vector3;
}

/** Resolve a strike against candidate targets; returns what connected. */
export function strike(attacker: Actor, candidates: Actor[], o: StrikeOpts, now: number, canHit: (a: Actor, t: Actor) => boolean): StrikeResult[] {
  const origin = o.origin ?? attacker.pos;
  const dir = (o.dir ?? attacker.forward).clone().setY(0).normalize();
  const hits: { t: Actor; d: number }[] = [];
  for (const t of candidates) {
    if (t === attacker || !t.alive || t.downed || !canHit(attacker, t)) continue;
    const dx = t.pos.x - origin.x;
    const dz = t.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > o.reach + t.radius) continue;
    if (Math.abs(t.pos.y - origin.y) > 2.2) continue;
    if (!o.radial && d > 0.35) {
      const cos = (dx * dir.x + dz * dir.z) / d;
      if (cos < Math.cos(o.arc)) continue;
    }
    hits.push({ t, d });
  }
  hits.sort((a, b) => a.d - b.d);
  const out: StrikeResult[] = [];
  for (const { t } of hits.slice(0, o.maxTargets ?? 4)) {
    const result = t.takeHit(
      { damage: o.damage, from: origin.clone(), attacker, knockback: o.knockback ?? 3, heavy: o.heavy, unblockable: o.unblockable, kind: o.kind },
      now,
    );
    if (result === "miss") continue;
    const point = t.pos.clone().add(new THREE.Vector3(0, t.height * 0.62, 0)).lerp(origin.clone().setY(t.pos.y + t.height * 0.62), 0.35);
    out.push({ target: t, result, point });
    if (result === "parried") attacker.stagger = Math.max(attacker.stagger, 0.8);
  }
  return out;
}
