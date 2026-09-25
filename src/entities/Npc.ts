// NPC behaviour: daily routines (work, wander, patrol, sit), conversation, fleeing,
// and a sword-fighting AI that approaches, strafes, blocks and strikes.

import * as THREE from "three";
import { ITEMS } from "../../shared/items";
import type { NpcDef } from "../../shared/npcs";
import { Character } from "../characters/Character";
import { clamp, makeRng, type Rng } from "../core/math";
import type { GameCtx } from "../game/context";
import { Actor } from "./Actor";
import { attackProfile, strike } from "./combat";

export type NpcMode = "idle" | "wander" | "patrol" | "work" | "sit" | "talk" | "flee" | "cower" | "fight" | "follow" | "down" | "dead" | "bow";

export interface Duel {
  prize: number;
  sparring: boolean;
  onWin: () => void;
  onLose: () => void;
}

export class Npc {
  readonly actor: Actor;
  mode: NpcMode;
  private baseMode: NpcMode;
  readonly home = new THREE.Vector3();
  homeYaw: number;
  private path: [number, number][] | null = null;
  private pathIdx = 0;
  private repathT = 0;
  private timer = 0;
  private rng: Rng;
  target: Actor | null = null;
  hostileToPlayer = false;
  duel: Duel | null = null;
  private attackCd = 1;
  private blockT = 0;
  private strafe = 1;
  private comboIdx = 0;
  private comboLeft = 0;
  private routeIdx = 0;
  private workT = 0;
  fleeFrom: THREE.Vector3 | null = null;
  /** Follow target (the cat follows the player). */
  followTarget: Actor | null = null;
  talkingTo: Actor | null = null;
  speakT = 0;
  weaponId: string;
  aggroRange = 0;

  constructor(readonly def: NpcDef, ctx: GameCtx) {
    const weapon = def.fighter?.weapon ?? "fists";
    this.weaponId = weapon;
    const team = def.role === "bandit" || def.role === "chief" ? "bandit" : "village";
    this.actor = new Actor(def.id, new Character(def.look, weapon), team);
    this.rng = makeRng(hashId(def.id));
    const f = def.fighter;
    if (f) {
      this.actor.maxHp = this.actor.hp = f.hp;
      this.actor.lethal = team === "bandit";
    } else {
      this.actor.maxHp = this.actor.hp = 60;
      this.actor.lethal = false;
    }
    this.actor.radius = 0.32 * (def.look.height / 1.75) + (def.look.build > 0.8 ? 0.06 : 0);
    this.home.set(def.home.x, 0, def.home.z);
    this.homeYaw = def.home.facing;
    this.baseMode = defaultMode(def);
    this.mode = this.baseMode;
    this.actor.place(def.home.x, def.home.z, def.home.facing, ctx.world);
    this.home.y = this.actor.pos.y;
    if (team === "bandit") {
      this.hostileToPlayer = true;
      this.aggroRange = def.role === "chief" ? 20 : 16;
      this.actor.character.setDrawn(true);
    }
    if (this.mode === "sit") this.actor.character.anim.play("sit");
    this.timer = this.rng.range(0, 4);
  }

  get busyTalking() {
    return this.mode === "talk";
  }

  startTalk(with_: Actor) {
    this.talkingTo = with_;
    this.mode = this.mode === "sit" ? "sit" : "talk";
    this.path = null;
    this.actor.wantSpeed = 0;
  }

  endTalk() {
    this.talkingTo = null;
    if (this.mode === "talk") this.mode = this.baseMode;
    this.actor.faceTarget = null;
  }

  /** Make this NPC fight the player (angered or in a duel). */
  engage(target: Actor, duel: Duel | null = null) {
    this.target = target;
    this.duel = duel;
    this.hostileToPlayer = true;
    this.mode = "fight";
    this.talkingTo = null;
    if (this.actor.character.anim.isPlaying("sit")) this.actor.character.anim.stop("sit");
    this.actor.character.setDrawn(true);
    this.attackCd = 0.8 + this.rng.range(0, 0.6);
  }

  calm() {
    this.hostileToPlayer = this.actor.team === "bandit";
    this.target = null;
    this.duel = null;
    if (this.actor.team !== "bandit") this.actor.character.setDrawn(false);
    this.mode = this.baseMode;
    this.path = null;
    this.actor.setBlocking(false, 0);
    this.actor.faceTarget = null;
    if (this.baseMode === "sit") this.actor.character.anim.play("sit");
  }

  flee(from: THREE.Vector3, seconds = 6) {
    if (this.mode === "fight" || !this.actor.alive || this.actor.downed) return;
    this.fleeFrom = from.clone();
    this.mode = "flee";
    this.timer = seconds;
    this.path = null;
    if (this.actor.character.anim.isPlaying("sit")) this.actor.character.anim.stop("sit");
  }

  cower(seconds = 3) {
    if (this.mode === "fight") return;
    this.mode = "cower";
    this.timer = seconds;
    this.actor.character.anim.play("cower");
  }

  // ——— movement helpers ———————————————————————————————————————————————

  private goTo(ctx: GameCtx, x: number, z: number, speed: number, dt: number): boolean {
    const a = this.actor;
    const d = Math.hypot(x - a.pos.x, z - a.pos.z);
    if (d < 0.5) {
      a.wantSpeed = 0;
      this.path = null;
      return true;
    }
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0) {
      this.repathT = 3 + this.rng.range(0, 1);
      if (ctx.nav.clear(a.pos.x, a.pos.z, x, z)) this.path = [[x, z]];
      else this.path = ctx.nav.path(a.pos.x, a.pos.z, x, z, 4000) ?? [[x, z]];
      this.pathIdx = 0;
    }
    const wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
    const dx = wp[0] - a.pos.x;
    const dz = wp[1] - a.pos.z;
    const wd = Math.hypot(dx, dz);
    if (wd < 0.6 && this.pathIdx < this.path.length - 1) this.pathIdx++;
    a.moveDir.set(dx / (wd || 1), 0, dz / (wd || 1));
    a.wantSpeed = speed;
    return false;
  }

  private stand() {
    this.actor.wantSpeed = 0;
    this.actor.moveDir.set(0, 0, 0);
  }

  // ——— main update ——————————————————————————————————————————————————————

  update(dt: number, ctx: GameCtx) {
    const a = this.actor;
    const anim = a.character.anim;
    this.timer -= dt;
    this.speakT = Math.max(0, this.speakT - dt);

    if (!a.alive) {
      this.mode = "dead";
      this.stand();
      a.update(dt, ctx.world);
      return;
    }
    if (a.downed) {
      this.mode = "down";
      this.stand();
      if (a.downTimer <= 0) {
        a.recover(0.4);
        const duel = this.duel;
        this.calm();
        if (duel) {
          duel.onWin();
        }
      }
      a.update(dt, ctx.world);
      return;
    }

    // Bandits notice the player.
    if (this.aggroRange > 0 && this.mode !== "fight" && ctx.player.alive && !ctx.player.downed) {
      if (a.distanceTo(ctx.player) < this.aggroRange) this.engage(ctx.player);
    }

    switch (this.mode) {
      case "idle":
      case "work": {
        this.stand();
        a.faceTarget = null;
        const d = Math.hypot(this.home.x - a.pos.x, this.home.z - a.pos.z);
        if (d > 1.2) this.goTo(ctx, this.home.x, this.home.z, 1.4, dt);
        else {
          a.yaw += Math.sin(((this.homeYaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * dt * 3;
          this.ambient(ctx, dt);
        }
        this.lookAtPlayer(ctx);
        break;
      }
      case "wander": {
        if (this.timer <= 0 || !this.path) {
          if (this.timer <= 0 && this.path === null) {
            // Pick a new spot near home.
            for (let k = 0; k < 6; k++) {
              const ang = this.rng.range(0, Math.PI * 2);
              const r = Math.sqrt(this.rng.next()) * this.def.wander;
              const tx = this.home.x + Math.cos(ang) * r;
              const tz = this.home.z + Math.sin(ang) * r;
              if (ctx.nav.free(tx, tz)) {
                this.path = [[tx, tz]];
                this.pathIdx = 0;
                this.repathT = 0;
                break;
              }
            }
            this.timer = this.rng.range(4, 9);
          }
        }
        if (this.path) {
          const goal = this.path[this.path.length - 1];
          const arrived = this.goTo(ctx, goal[0], goal[1], this.def.role === "child" ? 1.9 : 1.25, dt);
          if (arrived) {
            this.path = null;
            this.timer = this.rng.range(2, 6);
          }
        } else {
          this.stand();
          this.ambient(ctx, dt);
        }
        this.lookAtPlayer(ctx);
        break;
      }
      case "patrol": {
        const route = this.def.route ?? [{ x: this.home.x, z: this.home.z }];
        const p = route[this.routeIdx % route.length];
        if (this.goTo(ctx, p.x, p.z, 1.35, dt)) {
          if (this.timer <= 0) {
            this.routeIdx++;
            this.timer = this.rng.range(1, 3);
          }
        }
        this.lookAtPlayer(ctx);
        break;
      }
      case "sit": {
        this.stand();
        if (!anim.isPlaying("sit")) anim.play("sit");
        if (!anim.isPlaying("drink") && this.rng.next() < dt * 0.08 && !this.talkingTo) anim.play("drink");
        if (this.talkingTo) a.faceTarget = null;
        this.lookAtPlayer(ctx);
        break;
      }
      case "talk": {
        this.stand();
        if (this.talkingTo) a.faceTarget = this.talkingTo.pos;
        if (this.speakT > 0 && !anim.isPlaying("talk") && this.rng.next() < dt * 1.5) anim.play("talk");
        break;
      }
      case "flee": {
        const from = this.fleeFrom ?? ctx.player.pos;
        const away = new THREE.Vector3().subVectors(a.pos, from).setY(0);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize();
        const tx = a.pos.x + away.x * 6;
        const tz = a.pos.z + away.z * 6;
        if (ctx.nav.free(tx, tz)) {
          a.moveDir.copy(away);
          a.wantSpeed = 4.8;
        } else {
          this.goTo(ctx, this.home.x, this.home.z, 4, dt);
        }
        a.faceTarget = null;
        if (this.timer <= 0) this.mode = this.baseMode;
        break;
      }
      case "cower": {
        this.stand();
        if (this.timer <= 0) {
          anim.stop("cower");
          this.mode = this.baseMode;
        }
        break;
      }
      case "bow": {
        this.stand();
        if (this.timer <= 0) this.mode = this.target ? "fight" : this.baseMode;
        break;
      }
      case "follow": {
        const t = this.followTarget;
        if (!t) {
          this.mode = this.baseMode;
          break;
        }
        const d = a.distanceTo(t);
        if (d > 2.2) {
          const dir = new THREE.Vector3().subVectors(t.pos, a.pos).setY(0).normalize();
          a.moveDir.copy(dir);
          a.wantSpeed = d > 6 ? 5.5 : d > 3.5 ? 3.5 : 1.6;
          if (d > 30) a.place(t.pos.x - dir.x * 2, t.pos.z - dir.z * 2, a.yaw, ctx.world);
        } else this.stand();
        break;
      }
      case "fight":
        this.fight(dt, ctx);
        break;
      default:
        this.stand();
    }
    a.update(dt, ctx.world);
  }

  private lookAtPlayer(ctx: GameCtx) {
    const a = this.actor;
    const p = ctx.player;
    const d = a.distanceTo(p);
    const anim = a.character.anim;
    if (d < 6 && p.alive) {
      const yawTo = Math.atan2(p.pos.x - a.pos.x, p.pos.z - a.pos.z);
      let rel = yawTo - a.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      anim.lookYaw = Math.abs(rel) < 1.6 ? rel : 0;
      anim.lookPitch = 0;
    } else anim.lookYaw = 0;
  }

  private ambient(ctx: GameCtx, dt: number) {
    const anim = this.actor.character.anim;
    this.workT -= dt;
    const role = this.def.role;
    const nearPlayer = this.actor.distanceTo(ctx.player) < 4;
    if (this.def.id === "tetsu" && !nearPlayer) {
      if (!anim.isPlaying("hammer")) anim.play("hammer", { onEvent: (n) => n === "clang" && this.actor.distanceTo(ctx.player) < 22 && ctx.audio.play("block", 0.35) });
      return;
    }
    if (this.def.id === "tetsu" && nearPlayer) anim.stop("hammer");
    if (this.def.id === "kukai" && !nearPlayer) {
      if (!anim.isPlaying("sweep")) anim.play("sweep");
      return;
    }
    if (this.def.id === "kukai" && nearPlayer) anim.stop("sweep");
    if (role === "student" && this.workT <= 0) {
      this.workT = this.rng.range(3, 7);
      if (!nearPlayer) {
        this.actor.character.setDrawn(true);
        const clip = this.rng.pick(["slash1", "slash2", "slash3"]);
        anim.play(clip, { onEnd: () => this.rng.chance(0.5) && this.actor.character.setDrawn(false) });
      }
      return;
    }
    if (this.workT <= 0) {
      this.workT = this.rng.range(5, 12);
      if (role === "child" && this.rng.chance(0.3)) anim.play("wave");
      else if ((role === "merchant" || role === "hostess" || role === "innkeeper") && this.rng.chance(0.5)) anim.play("talk");
    }
  }

  // ——— combat AI ——————————————————————————————————————————————————————————

  private fight(dt: number, ctx: GameCtx) {
    const a = this.actor;
    const t = this.target;
    const anim = a.character.anim;
    if (!t || !t.alive || t.downed) {
      if (this.duel && t && t.downed) {
        const duel = this.duel;
        this.calm();
        duel.onLose();
        return;
      }
      // Look for another target (clones) or calm down.
      const next = ctx.actors.find((o) => o !== a && o.alive && !o.downed && (o.team === "player" || o.team === "clone") && a.distanceTo(o) < 14 && this.hostileToPlayer);
      if (next) this.target = next;
      else {
        this.calm();
        ctx.attackTokens.delete(a);
      }
      return;
    }
    const f = this.def.fighter;
    const skill = f?.skill ?? 0.3;
    const prof = attackProfile(this.weaponId, true, f?.damage ?? 8);
    const reach = prof.ranged ? 6 : prof.reach;
    const d = a.distanceTo(t);
    a.faceTarget = t.pos;
    this.attackCd -= dt;
    this.blockT -= dt;
    if (a.stagger > 0 || anim.busy()) {
      a.wantSpeed = anim.busy() ? a.wantSpeed * 0.9 : 0;
      if (this.blockT <= 0) a.setBlocking(false, ctx.now);
      return;
    }
    // Leash: don't chase forever.
    if (this.home.distanceTo(a.pos) > 60 && !this.duel) {
      this.calm();
      return;
    }
    // Block incoming attacks sometimes.
    const threat = t.character.anim.busy() && d < reach + 1.2 && t.facingDot(a.pos) > 0.6;
    if (threat && this.blockT <= 0 && this.rng.next() < skill * 0.55 * dt * 12) {
      this.blockT = 0.4 + this.rng.range(0, 0.4);
      a.setBlocking(true, ctx.now);
      anim.play(this.weaponId === "fists" ? "guard" : "block");
    }
    if (this.blockT > 0) {
      a.wantSpeed = 0;
      return;
    }
    if (a.blocking) {
      a.setBlocking(false, ctx.now);
      anim.stop("block");
      anim.stop("guard");
    }

    // Take turns: only a couple of NPCs press the attack at once.
    const hasToken = ctx.attackTokens.has(a) || ctx.attackTokens.size < 2;
    if (hasToken) ctx.attackTokens.add(a);
    const idealDist = hasToken ? reach * 0.8 : 4.2;

    if (d > idealDist + 0.4) {
      const dir = new THREE.Vector3().subVectors(t.pos, a.pos).setY(0).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafe * 0.3);
      a.moveDir.copy(dir.add(side).normalize());
      a.wantSpeed = d > 7 ? 5.2 : 2.6;
      return;
    }
    if (d < idealDist - 1.2) {
      const dir = new THREE.Vector3().subVectors(a.pos, t.pos).setY(0).normalize();
      a.moveDir.copy(dir);
      a.wantSpeed = 1.8;
      return;
    }
    if (hasToken && this.attackCd <= 0 && d <= reach + 0.3) {
      if (this.comboLeft <= 0) {
        this.comboLeft = 1 + Math.floor(this.rng.next() * (1 + skill * 2.2));
        this.comboIdx = 0;
      }
      const clip = prof.combo[this.comboIdx % prof.combo.length];
      this.comboIdx++;
      this.comboLeft--;
      const dmg = (f?.damage ?? 8) * (this.duel?.sparring ? 0.7 : 1);
      ctx.audio.play(prof.kind === "shot" ? "boom" : clip.startsWith("slash") || clip === "heavy" ? "swing" : "whoosh", 0.6);
      anim.play(clip, {
        speed: 0.85 + skill * 0.3,
        restart: true,
        onEvent: (name) => {
          if (name !== "hit") return;
          const res = strike(a, ctx.actors, { reach: reach, arc: prof.arc, damage: dmg, kind: prof.kind, knockback: 3.2, heavy: clip === "heavy" || clip === "slash3" }, ctx.now, (x, y) => ctx.canHit(x, y));
          ctx.onStrike(a, res, prof.kind);
        },
      });
      this.attackCd = this.comboLeft > 0 ? 0.08 : clamp(1.9 - skill * 1.1, 0.6, 2) + this.rng.range(0, 0.7);
      a.wantSpeed = 0.6;
      a.moveDir.copy(a.forward);
      return;
    }
    // Circle.
    if (this.rng.next() < dt * 0.4) this.strafe *= -1;
    const dir = new THREE.Vector3().subVectors(t.pos, a.pos).setY(0).normalize();
    a.moveDir.set(-dir.z * this.strafe, 0, dir.x * this.strafe);
    a.wantSpeed = 1.2;
  }

  /** Item drops when defeated (bandits). */
  loot(): { money: number; items: string[] } {
    if (this.def.role === "chief") return { money: 120, items: ["oni_mask", "bandit_token"] };
    if (this.def.role === "bandit") return { money: 8 + Math.floor(this.rng.next() * 14), items: ["bandit_token"] };
    return { money: 0, items: [] };
  }
}

function defaultMode(def: NpcDef): NpcMode {
  if (def.route) return "patrol";
  if (def.id === "jubei") return "sit";
  if (def.role === "merchant" || def.role === "monk" || def.role === "innkeeper" || def.role === "hostess" || def.role === "fisher" || def.role === "sensei") return "work";
  if (def.role === "chief") return "idle";
  if (def.wander > 0) return "wander";
  return "idle";
}

function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function itemName(id: string) {
  return ITEMS[id]?.name ?? id;
}
