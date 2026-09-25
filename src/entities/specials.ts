// Shadow clones: short-lived allies that hunt the nearest enemy and brawl.

import * as THREE from "three";
import type { RosterEntry } from "../../shared/roster";
import { Character } from "../characters/Character";
import { makeCharacterMaterial } from "../characters/material";
import type { GameCtx } from "../game/context";
import { Actor } from "./Actor";
import { attackProfile, strike } from "./combat";

let cloneMaterial: THREE.Material | null = null;

interface Clone {
  actor: Actor;
  cd: number;
  combo: number;
}

export class CloneSquad {
  private clones: Clone[] = [];
  private life: number;
  done = false;

  constructor(entry: RosterEntry, weaponId: string, private owner: Actor, ctx: GameCtx, count: number, seconds: number) {
    this.life = seconds;
    cloneMaterial ??= makeCharacterMaterial({ tint: new THREE.Color("#fff6ea") });
    for (let i = 0; i < count; i++) {
      const ang = owner.yaw + ((i - (count - 1) / 2) * Math.PI) / 3 + Math.PI;
      const x = owner.pos.x + Math.sin(ang) * 1.6;
      const z = owner.pos.z + Math.cos(ang) * 1.6;
      const c = new Character(entry.look, weaponId, cloneMaterial);
      c.setDrawn(false);
      c.anim.setStance("unarmed");
      const actor = new Actor(`clone_${i}`, c, "clone");
      actor.maxHp = actor.hp = 40;
      actor.lethal = true;
      actor.place(x, z, owner.yaw, ctx.world);
      ctx.addActor(actor);
      ctx.effects.smoke(actor.pos, 14, new THREE.Color("#f2f0ea"), 0.8);
      this.clones.push({ actor, cd: 0.3 + i * 0.2, combo: 0 });
    }
  }

  update(dt: number, ctx: GameCtx) {
    this.life -= dt;
    for (const cl of this.clones) {
      const a = cl.actor;
      if (!a.alive || this.life <= 0) continue;
      cl.cd -= dt;
      // Nearest hostile to the owner's cause.
      let target: Actor | null = null;
      let best = 16;
      for (const t of ctx.actors) {
        if (!t.alive || t.downed || t.team === "clone" || t.team === "player") continue;
        if (!ctx.canHit(this.owner, t) || !(t.team === "bandit" || t.lastHitBy === this.owner)) continue;
        const d = a.distanceTo(t);
        if (d < best) {
          best = d;
          target = t;
        }
      }
      if (!target) {
        // Stay near the owner.
        const d = a.distanceTo(this.owner);
        if (d > 3) {
          a.moveDir.subVectors(this.owner.pos, a.pos).setY(0).normalize();
          a.wantSpeed = d > 6 ? 5.5 : 3;
        } else a.wantSpeed = 0;
        a.faceTarget = null;
      } else {
        a.faceTarget = target.pos;
        const d = a.distanceTo(target);
        if (d > 1.5) {
          a.moveDir.subVectors(target.pos, a.pos).setY(0).normalize();
          a.wantSpeed = 5.8;
        } else {
          a.wantSpeed = 0;
          if (cl.cd <= 0 && !a.character.anim.busy()) {
            const prof = attackProfile("fists", false, 7);
            const clip = prof.combo[cl.combo++ % prof.combo.length];
            cl.cd = 0.55;
            a.character.anim.play(clip, {
              restart: true,
              onEvent: (n) => {
                if (n !== "hit") return;
                const res = strike(a, ctx.actors, { reach: 1.7, arc: 0.9, damage: 8, kind: "blunt", knockback: 3 }, ctx.now, (x, y) => y.team !== "player" && y.team !== "clone" && ctx.canHit(this.owner, y));
                ctx.onStrike(this.owner, res, "blunt");
              },
            });
          }
        }
      }
    }
    if (this.life <= 0 || this.clones.every((c) => !c.actor.alive)) this.dispose(ctx);
  }

  dispose(ctx: GameCtx) {
    if (this.done) return;
    this.done = true;
    for (const cl of this.clones) {
      ctx.effects.smoke(cl.actor.pos, 12, new THREE.Color("#f2f0ea"), 0.8);
      ctx.removeActor(cl.actor);
    }
    ctx.audio.play("poof");
  }
}
