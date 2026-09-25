// Offline fallback for when Jev is unavailable (no API key, network down, static hosting).
// Produces the same typed answer shape from keyword matching. It's much blunter than
// Jev — it can't tell "I'd never threaten you" from a threat — but it keeps the game
// playable, and its confidences are kept modest so the game asks for clarification more.

import { ITEMS } from "./items";
import type { NpcDef } from "./npcs";
import { extractNumbers } from "./numbers";
import { PLACES } from "./places";
import { RIDDLE_BY_ID } from "./riddles";
import type { ChoiceAnswer, Intent, Reply, ScoreAnswer, TalkAnswers, TalkRequest, TalkResponse } from "./talk-types";
import { INTENTS } from "./talk-types";

const has = (text: string, re: RegExp) => re.test(text);

const RE = {
  greet: /\b(hi|hello|hey|greetings|good (morning|day|afternoon|evening)|konnichiwa|ohayo|yo|nice to meet|my name is|i am called)\b/,
  farewell: /\b(bye|goodbye|farewell|sayonara|see you|later|take care|i must go|i'll be going|leaving)\b/,
  buy: /\b(buy|purchase|sell me|how much|price|cost|wares|goods|shop|for sale|what do you (have|sell)|i want (a|an|the|to buy)|i'?ll take|order|give me (a|an|the|some) )\b/,
  haggle: /\b(discount|cheaper|lower (the )?price|too (much|expensive|pricey)|deal|bargain|haggle|how about|would you take|best price|knock|reduce)\b/,
  sell: /\b(sell (you|this|my|these|some)|want to sell|buy (this|my|these) from me|trade|offer you (this|my))\b/,
  askWork: /\b(work|job|task|quest|errand|help you|need help|earn|money|anything i can do|any (jobs|work)|bounty|mission)\b/,
  reportTask: /\b(done|finished|completed|found (it|her|your|the)|i found|delivered|brought|here is|here's|defeated|killed|beat (him|kurogane)|got (it|your))\b/,
  directions: /\b(where|how do i get|how to get|which way|direction|find the|looking for|way to|path to|road to|located)\b/,
  askTopic: /\b(tell me|what (is|are|about|do you know)|who is|who are|why|rumou?rs?|news|story|legend|explain|know about|heard|history|advice)\b/,
  challenge: /\b(duel|fight me|spar|challenge|bout|match|test (my|your) (skill|blade)|cross swords|draw your (sword|blade)|let'?s fight)\b/,
  threaten: /\b(kill you|cut you|hurt you|i'?ll (kill|cut|stab|hurt|burn|end)|or (else|die)|your money or|hand over|give me your (money|coins|gold|purse)|rob|die\b|threat|slice you|you'?re dead)\b/,
  insult: /\b(idiot|stupid|fool|dumb|ugly|smell|stink|pig|dog|coward|baka|worthless|trash|pathetic|loser|moron|old hag|shut up|useless|weakling)\b/,
  compliment: /\b(best|finest|great|amazing|beautiful|wonderful|skilled|legendary|genius|impressive|incredible|lovely|delicious|pretty|handsome|master(ful)?|brilliant)\b/,
  service: /\b(room|rest|sleep|stay the night|bed|dice|gamble|bet|cho|han|chō|train|training|teach me|lesson|blessing|bless|pray|heal me)\b/,
  riddle: /\b(answer|is it|it'?s|the answer|i think|you are|a |an )\b/,
  riddleMeta: /\b(repeat|again|hint|what'?s the riddle|what is the riddle|tell me the riddle|riddle)\b/,
  polite: /\b(please|thank|thanks|kindly|sir|madam|excuse me|sorry|pardon|honou?red|arigato|arigatou|onegai|sumimasen|bow|if you don'?t mind|may i|would you)\b|(-san|-sama|-sensei|-dono)\b/,
  rude: /\b(hurry up|now!|give me|shut up|move|out of my way|whatever|listen here|old man|old woman|peasant)\b/,
  accept: /\b(yes|yeah|yep|sure|ok|okay|deal|accept|agreed|of course|certainly|hai|let'?s do it|i will|i'?ll do it|alright|absolutely|fine)\b/,
  decline: /\b(no|nope|nah|not now|maybe later|decline|never|no thanks|pass|forget it|too expensive|not interested|i'?ll think)\b/,
  reason: /\b(because|since|regular|loyal|friend|several|two|three|bulk|poor|cheaper elsewhere|flaw|scratch|dull|used|old|helped|hero|saved|bandits)\b/,
};

function choice<K extends string>(scores: Record<K, number>, floor = 0.02): ChoiceAnswer<K> {
  const keys = Object.keys(scores) as K[];
  const exps = keys.map((k) => Math.exp(scores[k] * 2.2) + floor);
  const sum = exps.reduce((a, b) => a + b, 0);
  const probabilities: Record<string, number> = {};
  keys.forEach((k, i) => (probabilities[k] = exps[i] / sum));
  const best = keys.reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a), keys[0]);
  // Keyword matching is never very sure of itself.
  const confidence = Math.min(0.78, probabilities[best]);
  return { choice: best, confidence, probabilities };
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9ōū]+/).filter((w) => w.length > 2));
}

const STOP = new Set(["the", "and", "for", "you", "your", "about", "what", "with", "that", "this", "his", "her", "their", "from", "into", "they"]);

function overlap(a: Set<string>, text: string): number {
  let n = 0;
  for (const w of words(text)) if (!STOP.has(w) && (a.has(w) || a.has(w.replace(/s$/, "")))) n++;
  return n;
}

/** Nicknames players are likely to use for items. */
const ITEM_ALIASES: Record<string, string[]> = {
  bokken: ["bokken", "wooden sword", "practice sword", "wood sword"],
  katana: ["katana", "sword", "blade", "steel"],
  nodachi: ["nodachi", "big sword", "long sword", "greatsword", "large sword", "field sword"],
  padded_jacket: ["padded", "jacket", "sashiko", "light armor", "cheap armor"],
  lamellar_do: ["lamellar", "chest plate", "breastplate", "dō", "do armor", "medium armor"],
  o_yoroi: ["yoroi", "full armor", "great armor", "heavy armor", "best armor"],
  onigiri: ["onigiri", "rice ball", "riceball"],
  dango: ["dango", "dumpling", "sweet"],
  ramen: ["ramen", "noodle", "noodles", "soup", "bowl"],
  green_tea: ["tea", "matcha"],
  sake: ["sake", "wine", "drink", "booze", "alcohol"],
  grilled_fish: ["fish", "sweetfish", "ayu"],
  herbal_salve: ["salve", "ointment", "medicine", "potion", "heal", "bandage"],
  ginseng_tonic: ["ginseng", "tonic", "strong medicine", "elixir"],
  war_pill: ["tiger", "pill", "strength"],
  straw_hat: ["hat", "kasa", "straw"],
  kitsune_mask: ["fox", "kitsune", "mask"],
  hachimaki: ["headband", "hachimaki"],
  oni_mask: ["oni", "demon mask", "red mask"],
  bandit_token: ["token", "tokens", "tag", "tags"],
};

const PLACE_ALIASES: Record<string, string[]> = {
  square: ["square", "plaza", "well", "notice board", "center", "centre"],
  blacksmith: ["blacksmith", "smith", "forge", "sword shop", "tetsu", "swords"],
  apothecary: ["apothecary", "medicine", "herbalist", "oume", "healer", "potion"],
  armorer: ["armorer", "armourer", "armor", "armour", "masa"],
  general_store: ["general store", "merchant", "kichibei", "hats", "masks", "store"],
  noodle_stall: ["noodle", "ramen", "genzo", "food", "eat"],
  dojo: ["dojo", "training hall", "sensei", "hideaki", "train"],
  inn: ["inn", "room", "sleep", "sayo", "rest", "bed"],
  tea_house: ["tea house", "teahouse", "tea", "dice", "gamble", "chiyo", "jubei"],
  west_gate: ["west gate", "main gate", "goro", "captain", "guard post"],
  north_gate: ["north gate"],
  south_gate: ["south gate"],
  grand_bridge: ["bridge", "red bridge", "vermilion bridge"],
  shrine: ["shrine", "temple", "monk", "kukai", "kūkai", "torii"],
  pagoda: ["pagoda", "tower"],
  pier: ["pier", "dock", "fisherman", "isamu", "fishing"],
  rice_fields: ["rice", "paddy", "paddies", "farm", "hana", "fields"],
  bamboo_grove: ["bamboo"],
  bandit_camp: ["bandit", "bandits", "camp", "kurogane"],
  waterfall: ["waterfall", "falls"],
  south_bridge: ["south bridge"],
  stepping_stones: ["stepping stones", "stones"],
};

function aliasChoice(text: string, ids: string[], aliases: Record<string, string[]>, nameOf: (id: string) => string): ChoiceAnswer {
  const scores: Record<string, number> = { none: 0.6 };
  for (const id of ids) {
    let s = 0;
    const list = [...(aliases[id] ?? []), nameOf(id).toLowerCase()];
    for (const a of list) if (a && text.includes(a)) s = Math.max(s, a.length > 5 ? 2 : 1.5);
    scores[id] = s;
  }
  return choice(scores);
}

function score(value: number, confidence: number): ScoreAnswer {
  return { score: Math.max(0, Math.min(3, value)), confidence };
}

export function interpretOffline(req: TalkRequest, npc: NpcDef, note?: string): TalkResponse {
  const started = Date.now();
  const text = req.message.toLowerCase().trim();
  const ctx = req.context;
  const riddle = ctx.riddleId ? RIDDLE_BY_ID[ctx.riddleId] : undefined;

  // — tone —
  const threat = has(text, RE.threaten) ? 0.82 : 0.04;
  const insult = has(text, RE.insult) ? 0.8 : 0.04;
  const flattery = has(text, RE.compliment) ? 0.72 : 0.05;
  let politeness = 2;
  if (has(text, RE.polite)) politeness += 0.9;
  if (has(text, RE.rude)) politeness -= 0.9;
  if (insult > 0.5 || threat > 0.5) politeness = Math.min(politeness, 0.4);

  // — intent —
  const s: Record<Intent, number> = Object.fromEntries(INTENTS.map((i) => [i, 0])) as Record<Intent, number>;
  s.unclear = 0.4;
  if (has(text, RE.greet)) s.greet += 1.2;
  if (has(text, RE.farewell)) s.farewell += 1.5;
  if (has(text, RE.buy)) s.buy += 1.4;
  if (has(text, RE.haggle)) s.haggle += 1.6;
  if (has(text, RE.sell)) s.sell += 1.8;
  if (has(text, RE.askWork)) s.ask_work += 1.3;
  if (has(text, RE.reportTask)) s.report_task += 1.2;
  if (has(text, RE.directions)) s.ask_directions += 1.5;
  if (has(text, RE.askTopic)) s.ask_topic += 1.1;
  if (has(text, RE.challenge)) s.challenge += 1.7;
  if (has(text, RE.service)) s.use_service += 1.2;
  if (threat > 0.5) s.threaten += 2;
  if (insult > 0.5) s.insult += 1.6;
  if (flattery > 0.5) s.compliment += 0.9;
  if (riddle && !has(text, RE.riddleMeta) && text.split(/\s+/).length <= 8) s.answer_riddle += 1.4;
  if (!Object.entries(s).some(([k, v]) => k !== "unclear" && v > 0) && text.split(/\s+/).length >= 3) s.small_talk += 0.9;
  const intent = choice(s);

  // — slots —
  const topicScores: Record<string, number> = { none: 0.5 };
  const msgWords = words(text);
  for (const t of npc.topics) {
    const o = overlap(msgWords, `${t.id} ${t.label} ${t.about}`);
    topicScores[t.id] = o * 0.9;
  }
  const topic = choice(topicScores);

  const wares = npc.shop?.wares ?? [];
  const item = wares.length ? aliasChoice(text, wares, ITEM_ALIASES, (id) => ITEMS[id]?.name ?? id) : none();
  const held = ctx.heldItemIds.filter((id) => ITEMS[id]);
  const sellItem = held.length ? aliasChoice(text, held, ITEM_ALIASES, (id) => ITEMS[id]?.name ?? id) : none();
  const place = aliasChoice(text, PLACES.map((p) => p.id), PLACE_ALIASES, (id) => PLACES.find((p) => p.id === id)?.name ?? id);
  const SERVICE_ALIASES: Record<string, string[]> = {
    rest: ["room", "rest", "sleep", "bed", "night", "stay"],
    chohan: ["dice", "cho", "han", "gamble", "bet", "game"],
    training: ["train", "training", "teach", "lesson", "drill", "stronger"],
    blessing: ["bless", "blessing", "pray", "heal"],
    spar: ["spar", "sparring", "bout", "practice", "student"],
  };
  const services = npc.services ?? [];
  const service = services.length ? aliasChoice(text, services.map((sv) => sv.id), SERVICE_ALIASES, (id) => id) : none();
  if (services.length === 1 && service.choice === "none") service.choice = services[0].id;

  let haggle = 0;
  if (intent.choice === "haggle") {
    haggle = 1;
    if (has(text, RE.reason)) haggle += 1;
    if (politeness >= 2.6) haggle += 0.6;
  }

  let reply: ChoiceAnswer<Reply> | null = null;
  if (ctx.pending) {
    const a = has(text, RE.accept) ? 1.6 : 0;
    const d = has(text, RE.decline) ? 1.8 : 0;
    reply = choice<Reply>({ accept: a, decline: d, unrelated: a || d ? 0 : 1 });
  }

  let riddleAttempt: number | null = null;
  let riddleCorrect: number | null = null;
  if (riddle) {
    riddleAttempt = has(text, RE.riddleMeta) ? 0.15 : 0.7;
    riddleCorrect = riddle.keywords.some((k) => text.includes(k)) ? 0.85 : 0.08;
  }

  const numbers = extractNumbers(req.message);
  const offerValue = numbers.length ? numbers[numbers.length - 1].value : null;

  const answers: TalkAnswers = {
    intent,
    topic,
    item,
    sellItem,
    place,
    service,
    politeness: score(politeness, 0.6),
    haggleStrength: score(haggle, 0.5),
    threat,
    insult,
    flattery,
    claimsDone: has(text, RE.reportTask) ? 0.75 : 0.06,
    reply,
    riddleAttempt,
    riddleCorrect,
  };
  return { mode: "heuristic", latencyMs: Date.now() - started, answers, offerValue, note };
}

function none(): ChoiceAnswer {
  return { choice: "none", confidence: 1, probabilities: { none: 1 } };
}
