// Shared body for the player and every NPC: movement with collision and water, gravity,
// health and stamina, blocking/parrying, and hit reactions.

import * as THREE from "three";
import type { Look } from "../../shared/look";
import { Character } from "../characters/Character";
import { clamp, damp, dampAngle, wrapAngle } from "../core/math";
import type { World } from "../world/World";
import { WORLD_HALF } from "../world/layout";

export type Team = "player" | "village" | "bandit" | "clone";

export interface Hit {
  damage: number;
  from: THREE.Vector3;
  attacker: Actor | null;
  knockback: number;
  /** Heavy hits knock the target down. */
  heavy?: boolean;
  /** Can't be blocked (specials). */
  unblockable?: boolean;
  kind: "blade" | "blunt" | "shot" | "energy";
}

export type HitResult = "miss" | "blocked" | "parried" | "hit" | "down" | "killed";

export class Actor {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  radius = 0.34;
  maxHp = 100;
  hp = 100;
  maxStamina = 100;
  stamina = 100;
  armor = 0;
  alive = true;
  /** Knocked out but not dead (sparring, villagers). */
  downed = false;
  downTimer = 0;
  team: Team;
  lethal = true;
  invuln = 0;
  stagger = 0;
  blocking = false;
  private blockSince = 0;
  grounded = true;
  vy = 0;
  /** Desired movement (world XZ, unit length or zero) and speed (m/s). */
  readonly moveDir = new THREE.Vector3();
  wantSpeed = 0;
  /** If set, the actor turns to face this point instead of its movement. */
  faceTarget: THREE.Vector3 | null = null;
  turnRate = 12;
  /** Seconds of impulse movement left (lunges, dodges). */
  private impulse = new THREE.Vector3();
  private impulseT = 0;
  lastHitBy: Actor | null = null;
  lastHitAt = -99;
  age = 0;
  onDown?: (a: Actor) => void;
  onDeath?: (a: Actor) => void;
  onHit?: (a: Actor, result: HitResult, hit: Hit) => void;

  constructor(
    readonly id: string,
    public character: Character,
    team: Team,
  ) {
    this.team = team;
  }

  static make(id: string, look: Look, weapon: string, team: Team) {
    return new Actor(id, new Character(look, weapon), team);
  }

  get height() {
    return this.character.look.height;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  place(x: number, z: number, yaw: number, world: World) {
    this.pos.set(x, world.groundHeight(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.sync();
  }

  lunge(dir: THREE.Vector3, speed: number, seconds: number) {
    this.impulse.copy(dir).setY(0).normalize().multiplyScalar(speed);
    this.impulseT = seconds;
  }

  setBlocking(b: boolean, now: number) {
    if (b && !this.blocking) this.blockSince = now;
    this.blocking = b;
  }

  /** Apply a hit. `now` is game time in seconds (for parry timing). */
  takeHit(hit: Hit, now: number): HitResult {
    if (!this.alive || this.downed || this.invuln > 0) return "miss";
    const toAttacker = new THREE.Vector3().subVectors(hit.from, this.pos).setY(0).normalize();
    const facing = this.forward.dot(toAttacker);
    let result: HitResult = "hit";
    let dmg = hit.damage * (1 - this.armor);
    if (this.blocking && facing > 0.35 && !hit.unblockable) {
      if (now - this.blockSince < 0.22) {
        result = "parried";
        dmg = 0;
      } else {
        result = "blocked";
        dmg *= 0.18;
        this.stamina = Math.max(0, this.stamina - hit.damage * 1.4);
        if (this.stamina <= 0) {
          this.blocking = false;
          this.stagger = 0.9;
          result = "hit";
          dmg = hit.damage * 0.5 * (1 - this.armor);
        }
      }
    }
    this.lastHitBy = hit.attacker;
    this.lastHitAt = now;
    if (dmg > 0) this.hp -= dmg;
    const away = toAttacker.clone().negate();
    if (result === "hit") {
      this.invuln = 0.18;
      this.stagger = Math.max(this.stagger, hit.heavy ? 0.9 : 0.35);
      this.lunge(away, hit.knockback * (hit.heavy ? 1.6 : 1), hit.heavy ? 0.35 : 0.18);
      if (hit.heavy && this.hp > 0) {
        this.character.anim.play("knockdown", { restart: true });
        this.stagger = 2.0;
        this.invuln = 1.2;
      } else this.character.anim.play("hit", { restart: true });
    } else if (result === "blocked") {
      this.lunge(away, hit.knockback * 0.4, 0.12);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.lethal) {
        this.alive = false;
        result = "killed";
        this.character.anim.stopAll();
        this.character.anim.play("death", { restart: true });
        this.onDeath?.(this);
      } else {
        this.downed = true;
        this.downTimer = this.team === "player" ? 6 : 3.5;
        result = "down";
        this.character.anim.stopAll();
        this.character.anim.play("death", { restart: true });
        this.onDown?.(this);
      }
    }
    this.onHit?.(this, result, hit);
    return result;
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  /** Get back up after being knocked out. */
  recover(fraction = 0.35) {
    this.downed = false;
    this.alive = true;
    this.hp = Math.max(1, this.maxHp * fraction);
    this.character.anim.stop("death");
    this.invuln = 1.5;
  }

  update(dt: number, world: World) {
    this.age += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.downed) {
      this.downTimer -= dt;
    }
    const canMove = this.alive && !this.downed && this.stagger <= 0.05;

    // Horizontal velocity toward the wanted movement.
    const target = canMove ? this.moveDir.clone().multiplyScalar(this.wantSpeed) : new THREE.Vector3();
    const accel = this.grounded ? 14 : 3;
    this.vel.x = damp(this.vel.x, target.x, accel, dt);
    this.vel.z = damp(this.vel.z, target.z, accel, dt);
    let vx = this.vel.x;
    let vz = this.vel.z;
    if (this.impulseT > 0) {
      this.impulseT -= dt;
      vx += this.impulse.x;
      vz += this.impulse.z;
    }

    // Facing.
    let desiredYaw: number | null = null;
    if (this.faceTarget) desiredYaw = Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z);
    else if (canMove && this.moveDir.lengthSq() > 0.01) desiredYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
    const prevYaw = this.yaw;
    if (desiredYaw !== null && this.alive && !this.downed) this.yaw = dampAngle(this.yaw, desiredYaw, this.turnRate, dt);
    const turnSpeed = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4);

    // Move with collision; don't walk into deep water.
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    [nx, nz] = world.collision.resolve(nx, nz, this.radius, this.pos.y);
    if (!world.walkable(nx, nz)) {
      if (world.walkable(nx, this.pos.z)) nz = this.pos.z;
      else if (world.walkable(this.pos.x, nz)) nx = this.pos.x;
      else {
        nx = this.pos.x;
        nz = this.pos.z;
      }
    }
    // Keep inside the valley.
    const lim = WORLD_HALF - 30;
    nx = clamp(nx, -lim, lim);
    nz = clamp(nz, -lim, lim);
    // Steep climbs are refused (cliffs, mountains).
    const gNew = world.groundHeight(nx, nz);
    if (gNew - this.pos.y > 0.55 && this.grounded) {
      nx = this.pos.x;
      nz = this.pos.z;
    }
    this.pos.x = nx;
    this.pos.z = nz;

    // Vertical.
    const ground = world.groundHeight(this.pos.x, this.pos.z);
    if (this.grounded) {
      if (ground < this.pos.y - 0.35) {
        this.grounded = false; // walked off an edge
      } else {
        this.pos.y = damp(this.pos.y, ground, 25, dt);
        this.vy = 0;
      }
    }
    if (!this.grounded) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Wading slows you down.
    const depth = world.waterDepth(this.pos.x, this.pos.z);
    if (depth > 0.15 && world.collision.deckHeight(this.pos.x, this.pos.z) === null) {
      this.vel.multiplyScalar(1 - Math.min(0.5, depth) * dt * 4);
    }

    // Stamina regenerates when not blocking.
    if (!this.blocking) this.stamina = Math.min(this.maxStamina, this.stamina + dt * 18);

    // Animation inputs.
    const a = this.character.anim;
    a.speed = Math.hypot(this.vel.x, this.vel.z);
    a.grounded = this.grounded;
    a.vy = this.vy;
    a.turnLean = damp(a.turnLean, clamp(-turnSpeed * 0.02 * Math.min(1, a.speed / 4), -0.2, 0.2), 6, dt);
    this.character.update(dt);
    this.sync();
  }

  jump() {
    if (!this.grounded || !this.alive || this.downed) return false;
    this.vy = 7.2;
    this.grounded = false;
    return true;
  }

  sync() {
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = this.yaw;
  }

  distanceTo(o: Actor) {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  /** Cosine of the angle between this actor's facing and the direction to `p`. */
  facingDot(p: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(p, this.pos).setY(0).normalize();
    return this.forward.dot(d);
  }
}
