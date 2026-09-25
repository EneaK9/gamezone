// Builds the Jev request for one conversation turn.
//
// One request fans out every judgment the dialogue code might need (speculative fan-out):
// the main intent, which topic / ware / place is meant, tone signals, and — only when
// relevant — the reply to a pending yes/no question, riddle checks, and which number is
// the offered price. The game code later reads only the answers that apply.

import type { ChoiceQuestion, NoulQuestion, Question, ScoreQuestion } from "@typesafe-ai/sdk";
import { ITEMS } from "../shared/items";
import type { NpcDef } from "../shared/npcs";
import { extractNumbers, type NumberCandidate } from "../shared/numbers";
import { PLACES } from "../shared/places";
import { QUESTS } from "../shared/quests";
import { RIDDLE_BY_ID } from "../shared/riddles";
import type { Intent, TalkRequest } from "../shared/talk-types";

type Criteria = Record<string, string | Record<string, unknown> | null>;

const INTENT_CRITERIA: Record<Intent, { what: string; examples?: string[]; not_for?: string }> = {
  greet: { what: "Says hello, bows, or introduces themself, with no request yet", examples: ["Good afternoon!", "Hello, I'm Kenji."] },
  small_talk: { what: "Chats about everyday things without asking for anything", examples: ["Lovely weather today.", "How's business?"] },
  ask_topic: {
    what: "Asks for information, news, rumors, advice, a story, or about the NPC themself",
    examples: ["What do you know about the bandits?", "Tell me about yourself."],
  },
  ask_directions: { what: "Asks where a place or person is, or how to get somewhere", examples: ["Where is the inn?", "How do I reach the shrine?"] },
  buy: {
    what: "Wants to see wares, asks what something costs, or wants to purchase something",
    examples: ["How much for the katana?", "What do you sell?", "I'll take a bowl of ramen."],
    not_for: "Asking for a lower price or making a counteroffer (that is haggle)",
  },
  haggle: { what: "Asks for a lower price or a discount, or makes a counteroffer", examples: ["Would you take 200?", "That's too expensive — any discount?"] },
  sell: { what: "Offers to sell or trade something the player carries", examples: ["Want to buy these bandit tokens?", "I'll sell you this mask."] },
  ask_work: { what: "Asks for a job, task, errand, or a way to earn money or to help", examples: ["Do you need any help?", "Got any work for me?"] },
  report_task: {
    what: "Says a task is done, hands over something for a task, or asks how a task is going",
    examples: ["I found your cat!", "Kurogane won't bother you again.", "Here's the rice you wanted."],
  },
  answer_riddle: { what: "Gives an answer to the riddle in `riddle`", examples: ["Is it a shadow?", "The answer is the moon."] },
  use_service: {
    what: "Asks for one of the NPC's services listed in `npc.services`",
    examples: ["I'd like a room for the night.", "Let's play dice.", "Please train me."],
  },
  challenge: {
    what: "Challenges the NPC to a duel, a sparring bout, or a contest",
    examples: ["I challenge you to a duel!", "Spar with me."],
    not_for: "Threatening to hurt someone who has not agreed to fight (that is threaten)",
  },
  threaten: { what: "Threatens to hurt, rob, or intimidate the NPC", examples: ["Give me your money or I'll cut you down."] },
  insult: { what: "The message is mainly an insult, mockery, or provocation", examples: ["You smell like old fish."] },
  compliment: { what: "The message is mainly praise or flattery", examples: ["Your swords are the finest I've ever seen."] },
  farewell: { what: "Says goodbye or ends the conversation", examples: ["Goodbye.", "I must be going."] },
  unclear: { what: "Gibberish, or nothing the NPC could respond to, or none of the other options" },
};

export interface BuiltRequest {
  state: Record<string, unknown>;
  questions: Record<string, Question>;
  /** Maps "n0", "n1"... Choice keys back to the offered numbers. */
  offerCandidates: NumberCandidate[];
}

export function buildTalkRequest(req: TalkRequest, npc: NpcDef): BuiltRequest {
  const ctx = req.context;
  const wares = (npc.shop?.wares ?? []).map((id) => ITEMS[id]).filter(Boolean);
  const held = ctx.heldItemIds.map((id) => ITEMS[id]).filter(Boolean);
  const riddle = ctx.riddleId ? RIDDLE_BY_ID[ctx.riddleId] : undefined;
  const tasks = ctx.activeTaskIds.map((id) => QUESTS[id]).filter(Boolean);

  const state: Record<string, unknown> = {
    setting:
      "Kazemura, a riverside village in feudal Japan. The player's character is speaking face to face with a villager (the NPC).",
    npc: {
      name: npc.name,
      title: npc.title,
      personality: npc.personality,
      wares: wares.map((w) => ({ id: w.id, name: w.name, price_mon: w.price, description: w.description })),
      services: (npc.services ?? []).map((s) => ({ name: s.label, price_mon: s.price, description: s.description })),
    },
    player: {
      name: ctx.playerName,
      appearance: ctx.playerLook,
      money_mon: ctx.money,
      carrying: held.map((h) => h.name),
      tasks_in_progress: tasks.map((t) => t.summary),
    },
    conversation: ctx.recent.map((l) => ({ speaker: l.from === "npc" ? npc.name : "player", text: l.text })),
    pending_question: ctx.pending?.question ?? null,
    riddle: riddle ? { text: riddle.text, accepted_answer: riddle.acceptedAnswer } : null,
    player_message: req.message,
  };

  const questions: Record<string, Question> = {};

  // — the main act —
  const intents = (Object.keys(INTENT_CRITERIA) as Intent[]).filter((k) => {
    if (k === "answer_riddle") return Boolean(riddle);
    if (k === "use_service") return Boolean(npc.services?.length);
    return true;
  });
  questions.intent = choiceQ(
    {
      question: "What is the player mainly doing with `player_message`?",
      context: "It is a line spoken to `npc`, following `conversation`.",
      focus: "Pick the single main act. Tone decides the act only when the whole message is an insult, a threat, or praise.",
    },
    Object.fromEntries(intents.map((k) => [k, INTENT_CRITERIA[k]])),
  );

  // — slots, asked speculatively; code reads them only for the matching intent —
  if (npc.topics.length) {
    questions.topic = choiceQ(
      {
        question: "Which of the NPC's topics does `player_message` ask about or refer to?",
        focus: "Match by meaning, not exact words. Choose none when the message is not about any listed topic.",
      },
      {
        ...Object.fromEntries(npc.topics.map((t) => [t.id, { topic: t.label, covers: t.about }])),
        none: "The message is not about any of these topics",
      },
    );
  }

  if (wares.length) {
    questions.item = choiceQ(
      {
        question: "Which item from `npc.wares` does `player_message` refer to?",
        focus: "Match by meaning: 'a blade' can mean a sword, 'something to eat' can mean food. Choose none when no ware is meant.",
      },
      {
        ...Object.fromEntries(wares.map((w) => [w.id, { name: w.name, description: w.description }])),
        none: "The message does not refer to any of the wares",
      },
    );
  }

  if (held.length) {
    const unique = [...new Map(held.map((h) => [h.id, h])).values()];
    questions.sell_item = choiceQ(
      {
        question: "Which item from `player.carrying` does the player offer to sell, trade, or hand over?",
        focus: "Choose none when the player does not offer any of their items.",
      },
      {
        ...Object.fromEntries(unique.map((h) => [h.id, { name: h.name, description: h.description }])),
        none: "The player does not offer any of their items",
      },
    );
  }

  questions.place = choiceQ(
    {
      question: "Which place in the village does the player want to find or get to?",
      focus: "Only for requests about locations or directions; choose none otherwise.",
    },
    {
      ...Object.fromEntries(PLACES.map((p) => [p.id, { name: p.name, description: p.description }])),
      none: "The player is not asking where a place is",
    },
  );

  if ((npc.services?.length ?? 0) > 1) {
    questions.service = choiceQ(
      { question: "Which of the NPC's services does `player_message` ask for?", services: "`npc.services`" },
      {
        ...Object.fromEntries((npc.services ?? []).map((sv) => [sv.id, { name: sv.label, description: sv.description }])),
        none: "None of the services",
      },
    );
  }

  questions.politeness = scoreQ(
    {
      question: "How courteous is `player_message` toward the NPC?",
      focus: "Judge manners and respect, not what is being asked for.",
    },
    [
      { what: "Hostile or insulting", signals: ["mockery", "slurs", "contempt"] },
      { what: "Curt or rude", signals: ["barked orders", "impatience", "no courtesy at all"] },
      { what: "Neutral and plain", signals: ["an ordinary request or remark"] },
      { what: "Courteous and respectful", signals: ["please or thank you", "honorifics such as -san or -sama", "bowing or apologizing"] },
    ],
  );

  if (wares.length) {
    questions.haggle_strength = scoreQ(
      {
        question: "How strong is the player's case for a lower price in `player_message`?",
        focus: "Judge the reasons offered, not the wish for a discount. If the player is not asking for a lower price, choose the first level.",
      },
      [
        { what: "No case: not haggling, or simply demanding a lower price" },
        { what: "Weak case: asks for a discount without a real reason", examples: ["Can you go lower?"] },
        { what: "Reasonable case: a concrete reason or a fair counteroffer", examples: ["I'm buying two — would you take 250?", "The hilt wrap is worn; would you take less?"] },
        {
          what: "Strong case: a good reason put respectfully, or an appeal to what the merchant values",
          examples: ["I cleared the bandits off your road, Tetsu-san. Would you consider a fairer price for a friend of the village?"],
        },
      ],
    );
  }

  questions.threat = noulQ(
    {
      question: "Does `player_message` threaten the NPC with violence, robbery, or intimidation?",
      focus: "A formal duel challenge or a request to spar is not a threat.",
    },
    {
      true: { what: "An explicit or clearly implied threat to hurt, rob, or coerce the NPC", examples: ["Hand over your money or else."] },
      false: {
        what: "No threat toward the NPC",
        not_for: "Respectful duel challenges, obvious jokes, or talk about fighting bandits",
        examples: ["I challenge you to a duel.", "I'll deal with those bandits for you."],
      },
    },
  );

  questions.insult = noulQ(
    { question: "Does `player_message` insult, mock, or demean the NPC?" },
    {
      true: { what: "Belittles the NPC, their looks, skill, family, or goods", examples: ["Your swords are junk, old man."] },
      false: { what: "No insult", not_for: "Blunt but respectful remarks, or complaints about prices" },
    },
  );

  questions.flattery = noulQ({ question: "Does `player_message` praise or flatter the NPC, their skill, or their goods?" });

  questions.claims_done = noulQ(
    {
      question: "Does the player claim to have completed a task, or to have found or brought what the NPC wanted?",
      tasks: "`player.tasks_in_progress`",
    },
    {
      true: { what: "States or implies the task is finished", examples: ["I found Mochi!", "Kurogane has been dealt with.", "Here is your rice."] },
      false: { what: "Makes no such claim", not_for: "Asking what the task was or how to do it" },
    },
  );

  if (ctx.pending) {
    questions.reply = choiceQ(
      { question: "How does `player_message` answer `pending_question`?" },
      {
        accept: "Agrees, says yes, or accepts",
        decline: "Refuses, says no, or puts it off",
        unrelated: "Does not answer the question",
      },
    );
  }

  if (riddle) {
    questions.riddle_attempt = noulQ(
      { question: "Is `player_message` an attempt to answer `riddle.text`?" },
      { false: { what: "Not an answer", not_for: "Asking to hear the riddle again, or asking for a hint" } },
    );
    questions.riddle_correct = noulQ(
      {
        question: "Does `player_message` give the answer described in `riddle.accepted_answer`?",
        focus: "Accept synonyms and different wording with the same meaning. A different thing, a vague guess, or several guesses at once is not correct.",
      },
      {
        true: "Names the accepted answer or an equivalent",
        false: "Gives a different answer, hedges between several answers, or doesn't answer",
      },
    );
  }

  // Select instead of generate: code finds the numbers, Jev picks which one is the offer.
  const offerCandidates = extractNumbers(req.message);
  if (offerCandidates.length > 1) {
    questions.offer = choiceQ(
      {
        question: "Which number in `player_message` is the price the player offers to pay?",
        numbers: offerCandidates.map((c) => c.text),
      },
      {
        ...Object.fromEntries(offerCandidates.map((c, i) => [`n${i}`, `the number written "${c.text}"`])),
        none: "None of the numbers is a price the player offers",
      },
    );
  }

  return { state, questions, offerCandidates };
}

function choiceQ(instructions: Record<string, unknown>, criteria: Criteria): ChoiceQuestion {
  return { type: "choice", instructions: instructions as ChoiceQuestion["instructions"], criteria: criteria as ChoiceQuestion["criteria"] };
}

function scoreQ(instructions: Record<string, unknown>, levels: Record<string, unknown>[]): ScoreQuestion {
  return {
    type: "score",
    instructions: instructions as ScoreQuestion["instructions"],
    criteria: levels as unknown as ScoreQuestion["criteria"],
  };
}

function noulQ(instructions: Record<string, unknown>, criteria?: { true?: unknown; false?: unknown }): NoulQuestion {
  return {
    type: "noul",
    instructions: instructions as NoulQuestion["instructions"],
    ...(criteria ? { criteria: criteria as NoulQuestion["criteria"] } : {}),
  };
}
