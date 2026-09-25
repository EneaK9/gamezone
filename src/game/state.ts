// Everything that persists between sessions: who you play, your purse, your bag,
// your standing in the village, and quest progress. Saved to localStorage.

import { ITEMS } from "../../shared/items";
import { DEFAULT_CHARACTER, ROSTER_BY_ID } from "../../shared/roster";

export type QuestStage = "offered" | "active" | "ready" | "done";

export interface QuestProgress {
  stage: QuestStage;
  /** Free-form counters (students beaten, riddle index...). */
  n: number;
  flags: string[];
}

export interface SaveData {
  version: 1;
  characterId: string;
  money: number;
  honor: number;
  inventory: Record<string, number>;
  /** Weapon item id or "signature" for the character's own weapon. */
  weapon: string;
  armor: string | null;
  cosmetic: string | null;
  maxHpBonus: number;
  damageBonus: number;
  quests: Record<string, QuestProgress>;
  disposition: Record<string, number>;
  /** NPC-specific facts: "defeated:ren", "flattered:day3:genzo"... */
  facts: string[];
  hour: number;
  day: number;
  position: { x: number; z: number; yaw: number } | null;
  talkedTo: string[];
}

const KEY = "kazemura.save.v1";

export function freshSave(characterId = DEFAULT_CHARACTER): SaveData {
  return {
    version: 1,
    characterId,
    money: 120,
    honor: 50,
    inventory: { onigiri: 2, herbal_salve: 1 },
    weapon: "signature",
    armor: null,
    cosmetic: null,
    maxHpBonus: 0,
    damageBonus: 0,
    quests: {},
    disposition: {},
    facts: [],
    hour: 15.2,
    day: 1,
    position: null,
    talkedTo: [],
  };
}

export class GameState {
  data: SaveData;
  private listeners = new Set<() => void>();

  constructor(data?: SaveData) {
    this.data = data ?? freshSave();
  }

  static load(): GameState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== 1 || !ROSTER_BY_ID[d.characterId]) return null;
      return new GameState({ ...freshSave(d.characterId), ...d });
    } catch {
      return null;
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode or quota — the game still runs */
    }
  }

  static clear() {
    localStorage.removeItem(KEY);
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    for (const l of this.listeners) l();
  }

  get character() {
    return ROSTER_BY_ID[this.data.characterId];
  }

  /** The weapon actually in hand: the character's signature one unless another is equipped. */
  get weaponId(): string {
    return this.data.weapon === "signature" ? this.character.weapon : this.data.weapon;
  }

  has(id: string, n = 1) {
    return (this.data.inventory[id] ?? 0) >= n;
  }

  count(id: string) {
    return this.data.inventory[id] ?? 0;
  }

  give(id: string, n = 1) {
    if (!ITEMS[id]) return;
    this.data.inventory[id] = (this.data.inventory[id] ?? 0) + n;
    this.changed();
  }

  take(id: string, n = 1): boolean {
    if (!this.has(id, n)) return false;
    this.data.inventory[id] -= n;
    if (this.data.inventory[id] <= 0) delete this.data.inventory[id];
    this.changed();
    return true;
  }

  addMoney(n: number) {
    this.data.money = Math.max(0, Math.round(this.data.money + n));
    this.changed();
  }

  spend(n: number): boolean {
    if (this.data.money < n) return false;
    this.data.money -= n;
    this.changed();
    return true;
  }

  addHonor(n: number) {
    this.data.honor = Math.max(0, Math.min(100, this.data.honor + n));
    this.changed();
  }

  disposition(npcId: string) {
    return this.data.disposition[npcId] ?? 0;
  }

  addDisposition(npcId: string, n: number) {
    this.data.disposition[npcId] = Math.max(-100, Math.min(100, this.disposition(npcId) + n));
  }

  fact(f: string) {
    return this.data.facts.includes(f);
  }

  setFact(f: string) {
    if (!this.fact(f)) this.data.facts.push(f);
  }

  quest(id: string): QuestProgress | undefined {
    return this.data.quests[id];
  }

  setQuest(id: string, stage: QuestStage, n?: number) {
    const q = this.data.quests[id] ?? { stage, n: 0, flags: [] };
    q.stage = stage;
    if (n !== undefined) q.n = n;
    this.data.quests[id] = q;
    this.changed();
  }

  get activeQuestIds(): string[] {
    return Object.entries(this.data.quests)
      .filter(([, q]) => q.stage === "active" || q.stage === "ready")
      .map(([id]) => id);
  }

  /** Items in the bag as a flat list of ids (for talk context). */
  get heldIds(): string[] {
    return Object.keys(this.data.inventory).filter((id) => this.data.inventory[id] > 0);
  }
}
