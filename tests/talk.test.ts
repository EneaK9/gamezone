import { describe, expect, it } from "vitest";
import { interpretOffline } from "../shared/heuristic";
import { NPC_BY_ID } from "../shared/npcs";
import { extractNumbers } from "../shared/numbers";
import type { TalkRequest } from "../shared/talk-types";
import { buildTalkRequest } from "../server/questions";
import { BadRequest, handleTalk, parseTalkRequest } from "../server/talk";

const ctx = (over: Partial<TalkRequest["context"]> = {}): TalkRequest["context"] => ({
  disposition: 0,
  playerName: "Hayato",
  playerLook: "a samurai",
  money: 120,
  heldItemIds: [],
  activeTaskIds: [],
  recent: [],
  ...over,
});

describe("extractNumbers", () => {
  it("finds digits and spelled-out numbers in order", () => {
    expect(extractNumbers("I'll give you 200 for two katanas").map((n) => n.value)).toEqual([200, 2]);
    expect(extractNumbers("two hundred and fifty mon?").map((n) => n.value)).toEqual([250]);
    expect(extractNumbers("a sword please")).toEqual([]);
  });
});

describe("parseTalkRequest", () => {
  it("rejects missing fields", () => {
    expect(() => parseTalkRequest({})).toThrow(BadRequest);
    expect(() => parseTalkRequest({ npcId: "tetsu", message: "   " })).toThrow(BadRequest);
  });

  it("clamps and filters untrusted context", () => {
    const r = parseTalkRequest({
      npcId: "tetsu",
      message: "x".repeat(1000),
      context: { disposition: 9999, money: -5, heldItemIds: ["katana", "not_an_item", 3], activeTaskIds: ["bandits", "nope"], riddleId: "made_up", recent: Array(20).fill({ from: "npc", text: "hi" }) },
    });
    expect(r.message.length).toBe(240);
    expect(r.context.disposition).toBe(100);
    expect(r.context.money).toBe(0);
    expect(r.context.heldItemIds).toEqual(["katana"]);
    expect(r.context.activeTaskIds).toEqual(["bandits"]);
    expect(r.context.riddleId).toBeNull();
    expect(r.context.recent.length).toBe(6);
  });
});

describe("handleTalk without an API key", () => {
  it("answers with the keyword fallback", async () => {
    const res = await handleTalk({ npcId: "tetsu", message: "How much for the katana?", context: ctx() }, {});
    expect(res.mode).toBe("heuristic");
    expect(res.answers.intent.choice).toBe("buy");
    expect(res.answers.item.choice).toBe("katana");
  });

  it("refuses NPCs you can't talk to", async () => {
    await expect(handleTalk({ npcId: "kurogane", message: "hi", context: ctx() }, {})).rejects.toThrow(BadRequest);
  });
});

describe("buildTalkRequest", () => {
  it("asks ware and haggle questions only for merchants", () => {
    const merchant = buildTalkRequest({ npcId: "tetsu", message: "hi", context: ctx() }, NPC_BY_ID.tetsu);
    expect(merchant.questions.item).toBeDefined();
    expect(merchant.questions.haggle_strength).toBeDefined();
    const kid = buildTalkRequest({ npcId: "kenta", message: "hi", context: ctx() }, NPC_BY_ID.kenta);
    expect(kid.questions.item).toBeUndefined();
    expect(kid.questions.haggle_strength).toBeUndefined();
  });

  it("adds riddle, reply and offer questions only when relevant", () => {
    const plain = buildTalkRequest({ npcId: "kukai", message: "hello", context: ctx() }, NPC_BY_ID.kukai);
    expect(plain.questions.riddle_correct).toBeUndefined();
    expect(plain.questions.reply).toBeUndefined();
    const busy = buildTalkRequest(
      { npcId: "kukai", message: "is it 3 or 4?", context: ctx({ riddleId: "reflection", pending: { kind: "task", question: "Accept?" } }) },
      NPC_BY_ID.kukai,
    );
    expect(busy.questions.riddle_correct).toBeDefined();
    expect(busy.questions.reply).toBeDefined();
    expect(busy.questions.offer).toBeDefined();
    expect(busy.offerCandidates.map((c) => c.value)).toEqual([3, 4]);
  });

  it("keeps question ids out of the model's view by putting meaning in instructions", () => {
    const b = buildTalkRequest({ npcId: "tetsu", message: "hi", context: ctx() }, NPC_BY_ID.tetsu);
    for (const q of Object.values(b.questions)) expect(q.instructions).toBeTruthy();
  });
});

describe("interpretOffline", () => {
  const ask = (npcId: string, message: string, over: Partial<TalkRequest["context"]> = {}) => interpretOffline({ npcId, message, context: ctx(over) }, NPC_BY_ID[npcId]);

  it("reads threats and insults", () => {
    expect(ask("genzo", "Give me your money or I'll cut you").answers.threat).toBeGreaterThan(0.7);
    expect(ask("genzo", "you stupid old fool").answers.insult).toBeGreaterThan(0.7);
  });

  it("routes directions to a place", () => {
    const a = ask("villager_0", "where is the dojo?").answers;
    expect(a.intent.choice).toBe("ask_directions");
    expect(a.place.choice).toBe("dojo");
  });

  it("judges riddle answers by keyword", () => {
    expect(ask("kukai", "your reflection", { riddleId: "reflection" }).answers.riddleCorrect).toBeGreaterThan(0.6);
    expect(ask("kukai", "a fish", { riddleId: "reflection" }).answers.riddleCorrect).toBeLessThan(0.3);
  });
});
