// Quest logic: what each task needs and what finishing it gives. Progress is checked
// against real game state, so claiming "I found your cat!" only works if you did.

import { ITEMS } from "../../shared/items";
import { QUESTS, type QuestDef } from "../../shared/quests";
import { RIDDLES } from "../../shared/riddles";
import type { GameState } from "../game/state";

export class Quests {
  constructor(private state: GameState) {}

  def(id: string): QuestDef {
    return QUESTS[id];
  }

  stage(id: string) {
    return this.state.quest(id)?.stage ?? null;
  }

  isActive(id: string) {
    const s = this.stage(id);
    return s === "active" || s === "ready";
  }

  isDone(id: string) {
    return this.stage(id) === "done";
  }

  accept(id: string) {
    this.state.setQuest(id, "active", 0);
    if (id === "rice") this.state.give("rice_bale");
  }

  /** Has the player actually done what the quest asks? */
  requirementsMet(id: string): boolean {
    const s = this.state;
    switch (id) {
      case "bandits":
        return s.fact("defeated:kurogane");
      case "mochi":
        return s.fact("cat_following");
      case "riddles":
        return (s.quest("riddles")?.n ?? 0) >= RIDDLES.length;
      case "rice":
        return s.has("rice_bale");
      case "charm":
        return s.has("lucky_charm");
      case "moonblade":
        return s.has("moon_iron") && s.data.money >= 150;
      case "dojo":
        return s.fact("beat:hideaki");
      case "jubei":
        return s.fact("beat:jubei");
    }
    return false;
  }

  /** Pay out and mark done. Returns the reward description. */
  complete(id: string): string {
    const q = QUESTS[id];
    const s = this.state;
    if (id === "rice") s.take("rice_bale");
    if (id === "charm") s.take("lucky_charm");
    if (id === "moonblade") {
      s.take("moon_iron");
      s.spend(150);
    }
    if (id === "dojo") s.data.damageBonus += 0.1;
    const parts: string[] = [];
    if (q.reward.money) {
      s.addMoney(q.reward.money);
      parts.push(`${q.reward.money} mon`);
    }
    for (const it of q.reward.items ?? []) {
      s.give(it);
      parts.push(ITEMS[it]?.name ?? it);
    }
    if (q.reward.honor) {
      s.addHonor(q.reward.honor);
      parts.push(`+${q.reward.honor} honor`);
    }
    if (id === "dojo") parts.push("+10% damage");
    s.setQuest(id, "done");
    return parts.join(", ");
  }

  studentsBeaten(): number {
    return ["ren", "daichi", "kaede"].filter((n) => this.state.fact(`beat:${n}`)).length;
  }

  /** Current riddle id for the monk, or null. */
  currentRiddle(): string | null {
    const q = this.state.quest("riddles");
    if (!q || q.stage !== "active") return null;
    return RIDDLES[q.n]?.id ?? null;
  }

  advanceRiddle() {
    const q = this.state.quest("riddles");
    if (!q) return;
    q.n += 1;
    this.state.changed();
  }

  /** Journal lines. */
  journal(): { title: string; summary: string; done: boolean }[] {
    return Object.entries(this.state.data.quests).map(([id, p]) => {
      const q = QUESTS[id];
      let summary = q.summary;
      if (id === "dojo" && p.stage !== "done") summary += ` (${this.studentsBeaten()}/3 students)`;
      if (id === "riddles" && p.stage !== "done") summary += ` (${p.n}/${RIDDLES.length} answered)`;
      return { title: q.title, summary, done: p.stage === "done" };
    });
  }
}
