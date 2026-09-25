// The player: camera-relative movement, combos, heavy attacks, blocking, dodging,
// drawing/sheathing, quick items, and each character's special move.

import * as THREE from "three";
import { ITEMS } from "../../shared/items";
import type { RosterEntry } from "../../shared/roster";
import { Character } from "../characters/Character";
import type { Input } from "../core/input";
import { clamp } from "../core/math";
import type { CameraRig } from "../game/camera";
import type { GameCtx } from "../game/context";
import type { GameState } from "../game/state";
import { Actor } from "./Actor";
import { attackProfile, strike } from "./combat";
import { CloneSquad } from "./specials";

export interface Buffs {
  stamina_regen: number;
  power: number;
  tipsy: number;
}

export class Player {
  actor: Actor;
  entry: RosterEntry;
  private comboIdx = 0;
  private comboT = 0;
  specialCd = 0;
  specialMax = 8;
  readonly buffs: Buffs = { stamina_regen: 0, power: 0, tipsy: 0 };
  private stepT = 0;
  private dodgeCd = 0;
  clones: CloneSquad | null = null;
  /** Visible trail key for the blade. */
  private trailKey = {};
  inCombat = 0;
  carrying: "rice" | "cat" | null = null;

  constructor(entry: RosterEntry, private state: GameState, lookOverride?: RosterEntry["look"]) {
    this.entry = entry;
    this.actor = new Actor("player", new Character(lookOverride ?? entry.look, state.weaponId), "player");
    this.actor.lethal = true;
    this.applyStats();
  }

  applyStats() {
    const s = this.entry.stats;
    const d = this.state.data;
    const armor = d.armor ? ITEMS[d.armor] : null;
    const oldMax = this.actor.maxHp;
    this.actor.maxHp = s.health + d.maxHpBonus + (this.state.has("omamori") ? 20 : 0);
    if (oldMax !== this.actor.maxHp) this.actor.hp = Math.min(this.actor.maxHp, this.actor.hp + Math.max(0, this.actor.maxHp - oldMax));
    this.actor.maxStamina = s.stamina;
    this.actor.armor = armor?.armor ?? 0;
    this.specialMax = this.entry.special.cooldown;
  }

  get weaponId() {
    return this.state.weaponId;
  }

  private get power() {
    return this.entry.stats.power * (1 + this.state.data.damageBonus) * (this.buffs.power > 0 ? 1.3 : 1) * (this.buffs.tipsy > 0 ? 1.1 : 1);
  }

  private get moveSpeedMul() {
    const armor = this.state.data.armor ? ITEMS[this.state.data.armor] : null;
    return this.entry.stats.speed * (armor?.armorSpeed ?? 1);
  }

  toggleDraw(ctx: GameCtx) {
    const c = this.actor.character;
    if (this.weaponId === "fists") {
      c.anim.setStance(c.anim.stance === "unarmed" ? "relaxed" : "unarmed");
      return;
    }
    c.setDrawn(!c.drawn);
    ctx.audio.play(c.drawn ? "block" : "click", 0.5);
  }

  /** Nearest hostile within reach+slack in front of the camera/player, for auto-aim. */
  private aimTarget(ctx: GameCtx, reach: number): Actor | null {
    let best: Actor | null = null;
    let bestScore = Infinity;
    const a = this.actor;
    for (const t of ctx.actors) {
      if (t === a || !t.alive || t.downed || t.team === "clone" || t.team === "player") continue;
      const d = a.distanceTo(t);
      if (d > reach + 2.5) continue;
      const dot = a.facingDot(t.pos);
      if (dot < 0.1) continue;
      const hostileBonus = ctx.canHit(a, t) && (t.team === "bandit" || (t.lastHitBy === a)) ? 0 : 2;
      const score = d * (1.6 - dot) + hostileBonus;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  update(dt: number, ctx: GameCtx, input: Input, cam: CameraRig) {
    const a = this.actor;
    const anim = a.character.anim;
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboT -= dt;
    this.inCombat = Math.max(0, this.inCombat - dt);
    for (const k of Object.keys(this.buffs) as (keyof Buffs)[]) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    if (this.buffs.stamina_regen > 0) a.stamina = Math.min(a.maxStamina, a.stamina + dt * 20);

    const canAct = a.alive && !a.downed && a.stagger <= 0.05;
    // Movement.
    const fwd = cam.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3();
    if (input.isDown("forward")) mv.add(fwd);
    if (input.isDown("back")) mv.sub(fwd);
    if (input.isDown("right")) mv.add(right);
    if (input.isDown("left")) mv.sub(right);
    if (this.buffs.tipsy > 0 && mv.lengthSq() > 0) mv.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(ctx.now * 1.7) * 0.35);
    const moving = mv.lengthSq() > 0.01;
    if (moving) mv.normalize();
    let speed = 4.3;
    const sprint = input.isDown("run") && a.stamina > 1 && moving;
    if (sprint) {
      speed = 6.9;
      a.stamina = Math.max(0, a.stamina - dt * 14);
    }
    if (input.isDown("walk")) speed = 1.6;
    if (a.blocking) speed = 1.3;
    if (this.carrying === "rice") speed = Math.min(speed, 3.4);
    if (anim.busy()) speed *= 0.25;
    a.moveDir.copy(mv);
    a.wantSpeed = moving ? speed * this.moveSpeedMul : 0;
    a.faceTarget = null;
    if (a.blocking) {
      a.faceTarget = a.pos.clone().add(fwd.clone().multiplyScalar(3));
    }
    cam.follow(a.yaw, moving && !input.locked, dt);

    // Footsteps and dust.
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (a.grounded && sp > 0.8) {
      this.stepT -= dt * sp * 0.55;
      if (this.stepT <= 0) {
        this.stepT = 1;
        ctx.audio.play(ctx.world.waterDepth(a.pos.x, a.pos.z) > 0.1 ? "splash" : "step", clamp(sp / 5, 0.4, 1));
        if (sp > 5.5) ctx.effects.dust(a.pos, 2, 0.2);
      }
    }

    if (!canAct) {
      a.setBlocking(false, ctx.now);
      return;
    }
    if (input.wasPressed("jump") && !a.blocking && !anim.busy()) {
      if (a.jump()) ctx.audio.play("whoosh", 0.3);
    }
    if (input.wasPressed("draw")) this.toggleDraw(ctx);

    const prof = attackProfile(this.weaponId, a.character.drawn, 9 + (this.weaponId === "fists" ? 3 : 0));

    // Block.
    const wantBlock = input.isDown("block") && a.grounded;
    if (wantBlock && !a.blocking && !anim.busy()) {
      a.setBlocking(true, ctx.now);
      anim.play(a.character.drawn && this.weaponId !== "boomstick" ? "block" : "guard");
    } else if (!wantBlock && a.blocking) {
      a.setBlocking(false, ctx.now);
      anim.stop("block");
      anim.stop("guard");
    }

    // Dodge.
    if (input.wasPressed("dodge") && this.dodgeCd <= 0 && a.stamina >= 22 && a.grounded) {
      this.dodgeCd = 0.6;
      a.stamina -= 22;
      a.invuln = 0.4;
      const dir = moving ? mv.clone() : a.forward.clone().negate();
      a.lunge(dir, 9, 0.32);
      a.yaw = Math.atan2(dir.x, dir.z);
      anim.play("dodge", { restart: true });
      ctx.audio.play("whoosh", 0.6);
      ctx.effects.dust(a.pos, 5, 0.3);
    }

    // Attacks: tap for combo, hold and release for a heavy attack.
    if (!a.blocking && input.wasPressed("attack") === false && input.heldFor("attack") === 0) {
      const held = input.lastHeldMs.get("attack");
      if (held !== undefined) {
        input.lastHeldMs.delete("attack");
        if (held > 380) this.attack(ctx, prof, true);
        else this.attack(ctx, prof, false);
      }
    }

    if (input.wasPressed("special") && this.specialCd <= 0 && a.stagger <= 0.05) this.special(ctx);

    // Blade trail while swinging.
    if (a.character.drawn && anim.busy() && this.weaponId !== "boomstick") {
      const grip = a.character.built.sockets.gripR;
      const base = new THREE.Vector3(0, 0, 0.35).applyMatrix4(grip.matrixWorld);
      const tip = new THREE.Vector3(0, 0, this.weaponId === "zangetsu" ? 1.6 : this.weaponId === "kunai" ? 0.25 : 0.95).applyMatrix4(grip.matrixWorld);
      ctx.effects.trail(this.trailKey, base, tip, this.weaponId === "tsukikage" ? new THREE.Color("#a8c8ff") : new THREE.Color("#f0f4ff"));
    }
    if (this.clones) {
      this.clones.update(dt, ctx);
      if (this.clones.done) this.clones = null;
    }
  }

  private attack(ctx: GameCtx, prof: ReturnType<typeof attackProfile>, heavy: boolean) {
    const a = this.actor;
    const anim = a.character.anim;
    if (anim.busy() && this.comboT < 0.12) return;
    if (a.stamina < 6) return;
    let clip: string;
    if (heavy) {
      clip = prof.heavy;
      this.comboIdx = 0;
    } else {
      if (this.comboT <= 0) this.comboIdx = 0;
      clip = prof.combo[this.comboIdx % prof.combo.length];
      this.comboIdx++;
    }
    a.stamina -= heavy ? 16 : 7;
    this.comboT = 0.9;
    const target = this.aimTarget(ctx, prof.reach);
    if (target) a.yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    const dmg = prof.damage * this.power * (heavy ? 1.8 : clip === "slash3" || clip === "kick" ? 1.3 : 1);
    ctx.audio.play(prof.kind === "shot" ? "click" : heavy ? "swingHeavy" : prof.kind === "blunt" ? "whoosh" : "swing", 0.8);
    this.inCombat = 6;
    anim.play(clip, {
      restart: true,
      speed: prof.speed * (heavy ? 1 : 1.05),
      onEvent: (name) => {
        if (name !== "hit") return;
        if (prof.ranged) {
          ctx.audio.play("boom");
          const muzzle = new THREE.Vector3(0, 0.03, 0.8).applyMatrix4(a.character.built.sockets.gripR.matrixWorld);
          ctx.effects.sparks(muzzle, 20, new THREE.Color("#ffc46a"), 9);
          ctx.effects.smoke(muzzle, 5, new THREE.Color("#b8b4ac"), 0.4);
        }
        if (clip === "slash3" || clip === "heavy") a.lunge(a.forward, 5, 0.18);
        const res = strike(a, ctx.actors, { reach: prof.reach, arc: prof.arc, damage: dmg, kind: prof.kind, knockback: heavy ? 6 : 3.5, heavy: heavy || clip === "kick" }, ctx.now, (x, y) => ctx.canHit(x, y));
        ctx.onStrike(a, res, prof.kind);
      },
    });
  }

  // ——— specials ———————————————————————————————————————————————————————————

  private special(ctx: GameCtx) {
    const a = this.actor;
    const anim = a.character.anim;
    const sp = this.entry.special.id;
    const p = this.power;
    const canHit = (x: Actor, y: Actor) => ctx.canHit(x, y);
    this.specialCd = this.specialMax;
    this.inCombat = 8;
    const target = this.aimTarget(ctx, 8);
    if (target) a.yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    ctx.audio.play("special");
    const needsBlade = sp === "iai" || sp === "oni_giri" || sp === "getsuga" || sp === "senbonzakura" || sp === "super_shell";
    if (needsBlade && !a.character.drawn && this.weaponId !== "fists") a.character.setDrawn(true);
    switch (sp) {
      case "iai": {
        anim.play("iai", {
          restart: true,
          onEvent: (n) => {
            if (n === "dash") {
              a.invuln = 0.6;
              a.lunge(a.forward, 17, 0.4);
            }
            if (n === "hit") {
              setTimeout(() => {
                const res = strike(a, ctx.actors, { reach: 3.2, arc: 1.6, damage: 46 * p, kind: "blade", heavy: true, knockback: 7, unblockable: true, radial: true }, ctx.now, canHit);
                ctx.onStrike(a, res, "special");
                ctx.effects.arcFlash(a.pos.clone().setY(a.pos.y + 1.1), a.yaw, 3.2);
              }, 120);
            }
          },
        });
        break;
      }
      case "gum_pistol": {
        anim.play("pistol", {
          restart: true,
          onEvent: (n) => {
            if (n !== "hit") return;
            const res = strike(a, ctx.actors, { reach: 7.5, arc: 0.28, damage: 34 * p, kind: "blunt", heavy: true, knockback: 10 }, ctx.now, canHit);
            ctx.onStrike(a, res, "special");
            ctx.audio.play("boom", 0.6);
            const fist = a.pos.clone().addScaledVector(a.forward, 6).setY(a.pos.y + 1.3);
            ctx.effects.dust(fist, 8, 0.6, new THREE.Color("#e8d8c0"));
          },
        });
        break;
      }
      case "oni_giri": {
        anim.play("onigiri", {
          restart: true,
          onEvent: (n) => {
            if (n === "dash") {
              a.invuln = 0.6;
              a.lunge(a.forward, 15, 0.4);
            }
            if (n === "hit") {
              setTimeout(() => {
                const res = strike(a, ctx.actors, { reach: 3.5, arc: Math.PI, damage: 42 * p, kind: "blade", heavy: true, knockback: 7, radial: true }, ctx.now, canHit);
                ctx.onStrike(a, res, "special");
                for (let k = 0; k < 3; k++) ctx.effects.arcFlash(a.pos.clone().setY(a.pos.y + 0.8 + k * 0.3), a.yaw + (k - 1) * 0.6, 3.4, new THREE.Color("#d8ffe0"));
              }, 150);
            }
          },
        });
        break;
      }
      case "shadow_clones": {
        anim.play("handsign", {
          restart: true,
          onEvent: (n) => {
            if (n !== "cast") return;
            ctx.audio.play("poof");
            this.clones?.dispose(ctx);
            this.clones = new CloneSquad(this.entry, this.weaponId, a, ctx, 3, 12);
          },
        });
        break;
      }
      case "chidori": {
        let crackle = 0;
        const hand = a.character.built.bones.handL;
        const tick = () => {
          if (crackle++ > 30) return;
          ctx.effects.lightning(hand.getWorldPosition(new THREE.Vector3()), 3, 0.45);
          if (crackle % 6 === 0) ctx.audio.play("thunder", 0.4);
          setTimeout(tick, 33);
        };
        tick();
        anim.play("chidori", {
          restart: true,
          onEvent: (n) => {
            if (n === "dash") {
              a.invuln = 0.5;
              a.lunge(a.forward, 18, 0.35);
            }
            if (n === "hit") {
              const res = strike(a, ctx.actors, { reach: 2.8, arc: 0.9, damage: 58 * p, kind: "energy", heavy: true, knockback: 9, unblockable: true }, ctx.now, canHit);
              ctx.onStrike(a, res, "special");
              ctx.effects.lightning(hand.getWorldPosition(new THREE.Vector3()), 12, 1.4);
            }
          },
        });
        break;
      }
      case "getsuga": {
        anim.play("getsuga", {
          restart: true,
          onEvent: (n) => {
            if (n !== "hit") return;
            const hitSet = new Set<Actor>();
            const dir = a.forward.clone();
            const from = a.pos.clone().addScaledVector(dir, 1.2).setY(a.pos.y + 1.0);
            ctx.audio.play("whoosh", 1);
            ctx.effects.crescent(from, dir, 24, 22, new THREE.Color("#bcd6ff"), (pos) => {
              for (const t of ctx.actors) {
                if (hitSet.has(t) || t === a || !t.alive || t.downed || !canHit(a, t)) continue;
                if (Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) < 1.9) {
                  hitSet.add(t);
                  const r = t.takeHit({ damage: 44 * p, from: pos.clone().sub(dir), attacker: a, knockback: 8, heavy: true, unblockable: true, kind: "energy" }, ctx.now);
                  ctx.onStrike(a, [{ target: t, result: r, point: t.pos.clone().setY(t.pos.y + 1) }], "special");
                }
              }
              return false;
            });
          },
        });
        break;
      }
      case "senbonzakura": {
        anim.play("scatter", {
          restart: true,
          onEvent: (n) => {
            if (n !== "cast") return;
            let pulses = 0;
            const pulse = () => {
              if (pulses++ >= 10) return;
              ctx.effects.petals(a.pos, 70, 7, { swirl: 7, up: 0.3, life: 1.2, glow: true });
              const res = strike(a, ctx.actors, { reach: 7, arc: Math.PI, damage: 9 * p, kind: "blade", knockback: 1.5, radial: true, unblockable: true, maxTargets: 8 }, ctx.now, canHit);
              ctx.onStrike(a, res, "petals");
              ctx.audio.play("whoosh", 0.35);
              setTimeout(pulse, 320);
            };
            pulse();
          },
        });
        break;
      }
      case "super_shell": {
        anim.play("supershell", {
          restart: true,
          onEvent: (n) => {
            if (n !== "hit") return;
            ctx.audio.play("boom", 1.3);
            const muzzle = new THREE.Vector3(0, 0.03, 0.8).applyMatrix4(a.character.built.sockets.gripR.matrixWorld);
            ctx.effects.sparks(muzzle, 50, new THREE.Color("#ffb45a"), 14);
            ctx.effects.smoke(muzzle, 14, new THREE.Color("#a8a49c"), 0.7);
            const res = strike(a, ctx.actors, { reach: 8.5, arc: 0.55, damage: 40 * p, kind: "shot", heavy: true, knockback: 12, unblockable: true, maxTargets: 6 }, ctx.now, canHit);
            ctx.onStrike(a, res, "special");
          },
        });
        break;
      }
      case "elbow_drop": {
        anim.play("elbowdrop", {
          restart: true,
          onEvent: (n) => {
            if (n === "leap") {
              a.lunge(a.forward, 6, 0.6);
              a.invuln = 1;
            }
            if (n === "hit") {
              ctx.effects.shockwave(a.pos, 6);
              ctx.audio.play("boom", 1.2);
              const res = strike(a, ctx.actors, { reach: 4.8, arc: Math.PI, damage: 40 * p, kind: "blunt", heavy: true, knockback: 9, radial: true, unblockable: true, maxTargets: 8 }, ctx.now, canHit);
              ctx.onStrike(a, res, "special");
            }
          },
        });
        break;
      }
    }
  }

  /** Eat/drink an item. Returns a message or null if nothing happened. */
  consume(id: string, ctx: GameCtx): string | null {
    const it = ITEMS[id];
    if (!it || !this.state.has(id)) return null;
    if (it.kind !== "food" && it.kind !== "remedy") return null;
    this.state.take(id);
    if (it.heal) this.actor.heal(it.heal);
    if (it.stamina) this.actor.stamina = Math.min(this.actor.maxStamina, this.actor.stamina + it.stamina);
    if (it.buff) this.buffs[it.buff.kind] = Math.max(this.buffs[it.buff.kind], it.buff.seconds);
    ctx.audio.play("eat");
    return `${it.name}${it.heal ? ` (+${Math.min(it.heal, 999) === 999 ? "full" : it.heal} health)` : ""}`;
  }
}
