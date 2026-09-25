import { beforeEach, describe, expect, it } from "vitest";
import { ROSTER_BY_ID } from "../shared/roster";
import type { TalkAnswers, TalkResponse } from "../shared/talk-types";
import { GameState, freshSave } from "../src/game/state";
import { DialogueDirector, syntheticAnswers } from "../src/systems/dialogue";
import { Quests } from "../src/systems/quests";

function resp(edit: (a: TalkAnswers) => void, offerValue: number | null = null): TalkResponse {
  const a = syntheticAnswers();
  a.politeness.score = 2;
  edit(a);
  return { mode: "jev", latencyMs: 1, answers: a, offerValue };
}

let state: GameState;
let quests: Quests;
const director = (npcId: string) => new DialogueDirector(npcId, state, quests, ROSTER_BY_ID.samurai, { x: -40, z: 0 });

beforeEach(() => {
  state = new GameState(freshSave("samurai"));
  quests = new Quests(state);
});

describe("tone", () => {
  it("guards fight back when threatened; civilians flee and alert the guard", () => {
    const guard = director("goro").respond("hand it over", resp((a) => (a.threat = 0.95)));
    expect(guard.actions.some((x) => x.kind === "fight")).toBe(true);
    const cook = director("genzo").respond("hand it over", resp((a) => (a.threat = 0.95)));
    expect(cook.actions.map((x) => x.kind)).toEqual(expect.arrayContaining(["flee", "alert"]));
    expect(state.data.honor).toBeLessThan(50);
  });

  it("a low-confidence reading asks for clarification instead of guessing", () => {
    const t = director("genzo").respond("hmm", resp((a) => {
      a.intent.choice = "buy";
      a.intent.confidence = 0.2;
    }));
    expect(t.pending).toBeNull();
    expect(t.actions.find((x) => x.kind === "shop")).toBeUndefined();
  });
});

describe("trade", () => {
  it("names the price and waits for a yes before charging", () => {
    const d = director("genzo");
    const t = d.respond("one ramen please", resp((a) => {
      a.intent.choice = "buy";
      a.item.choice = "ramen";
    }));
    expect(t.pending?.kind).toBe("buy");
    expect(state.data.money).toBe(120);
    d.choose("yes");
    expect(state.count("ramen")).toBe(1);
    expect(state.data.money).toBeLessThan(120);
  });

  it("won't sell what you can't afford", () => {
    const d = director("tetsu");
    d.respond("the nodachi", resp((a) => {
      a.intent.choice = "buy";
      a.item.choice = "nodachi";
    }));
    d.choose("yes");
    expect(state.has("nodachi")).toBe(false);
    expect(state.data.money).toBe(120);
  });

  it("a good case earns a discount; a lowball offer is refused", () => {
    const d = director("kichibei");
    const list = d.price("kitsune_mask");
    const t = d.respond("I'm buying for my sister, would you do better?", resp((a) => {
      a.intent.choice = "haggle";
      a.item.choice = "kitsune_mask";
      a.haggleStrength.score = 3;
      a.politeness.score = 3;
    }));
    expect(t.pending?.question).toMatch(/Kitsune Mask for \d+ mon/);
    const offered = Number(/for (\d+) mon/.exec(t.pending!.question)![1]);
    expect(offered).toBeLessThan(list);
    const t2 = director("kichibei").respond("5 mon", resp((a) => {
      a.intent.choice = "haggle";
      a.item.choice = "kitsune_mask";
    }, 5));
    expect(t2.pending).toBeNull();
  });
});

describe("quests", () => {
  it("offers a task, accepts on yes, and only pays out when it's really done", () => {
    const d = director("goro");
    const offer = d.respond("any work?", resp((a) => (a.intent.choice = "ask_work")));
    expect(offer.pending?.kind).toBe("task");
    d.choose("yes");
    expect(quests.isActive("bandits")).toBe(true);
    const lie = d.respond("Kurogane is dead", resp((a) => {
      a.intent.choice = "report_task";
      a.claimsDone = 0.95;
    }));
    expect(lie.lines.join(" ")).toMatch(/Don't lie/);
    expect(state.data.money).toBe(120);
    state.setFact("defeated:kurogane");
    d.respond("Kurogane is dead", resp((a) => {
      a.intent.choice = "report_task";
      a.claimsDone = 0.95;
    }));
    expect(quests.isDone("bandits")).toBe(true);
    expect(state.data.money).toBe(520);
  });

  it("a ready task leads the greeting, and the giver's lines move on once it's done", () => {
    state.setQuest("mochi", "active", 0);
    state.setFact("cat_following");
    const d = director("kenta");
    expect(d.opening().lines[0]).toMatch(/MOCHI/);
    d.choose("report");
    expect(quests.isDone("mochi")).toBe(true);
    expect(state.data.money).toBe(145);
    expect(d.choose("bye").lines.join(" ")).not.toMatch(/come home/);
    expect(director("kenta").opening().lines.join(" ")).not.toMatch(/sniff|white cat/);
  });

  it("riddles advance on a correct answer and give a hint after two misses", () => {
    state.setQuest("riddles", "active", 0);
    const d = director("kukai");
    const wrong = () =>
      d.respond("a fish", resp((a) => {
        a.intent.choice = "answer_riddle";
        a.riddleAttempt = 0.9;
        a.riddleCorrect = 0.05;
      }));
    wrong();
    expect(wrong().lines.join(" ")).toMatch(/hint/i);
    d.respond("my reflection", resp((a) => {
      a.intent.choice = "answer_riddle";
      a.riddleAttempt = 0.95;
      a.riddleCorrect = 0.97;
    }));
    expect(state.quest("riddles")?.n).toBe(1);
  });
});
