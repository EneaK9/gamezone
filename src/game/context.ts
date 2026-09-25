// What entities can see of the game, without importing the Game class.

import type { Audio } from "../core/audio";
import type { Actor } from "../entities/Actor";
import type { StrikeResult } from "../entities/combat";
import type { Effects } from "../systems/effects";
import type { DayNight } from "../systems/time";
import type { NavGrid } from "../world/nav";
import type { World } from "../world/World";

export interface GameCtx {
  world: World;
  nav: NavGrid;
  effects: Effects;
  audio: Audio;
  time: DayNight;
  /** Game-clock seconds since start. */
  now: number;
  player: Actor;
  actors: Actor[];
  canHit(attacker: Actor, target: Actor): boolean;
  /** Called after any strike resolves (for sounds, honor, hit-stop). */
  onStrike(attacker: Actor, results: StrikeResult[], kind: string): void;
  /** Number of NPCs currently allowed to press the attack on the player. */
  attackTokens: Set<Actor>;
  addActor(a: Actor): void;
  removeActor(a: Actor): void;
}
