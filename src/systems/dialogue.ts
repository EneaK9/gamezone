// DialogueDirector: turns Jev's typed judgments about what the player said into what the
// NPC says and does. Option buttons go through the same path with synthetic answers, so
// typing "got any swords, old man?" and clicking "Browse wares" end up in the same code.
//
// Policy lives here, in code: thresholds, prices, who fights back, what counts as done.

import { ITEMS } from "../../shared/items";
import { NPC_BY_ID, type NpcDef, type ServiceId } from "../../shared/npcs";
import { PLACE_BY_ID, PLACES } from "../../shared/places";
import { QUESTS } from "../../shared/quests";
import { RIDDLE_BY_ID } from "../../shared/riddles";
import type { RosterEntry } from "../../shared/roster";
import type { ChatLine, Intent, PendingQuestion, TalkAnswers, TalkResponse } from "../../shared/talk-types";
import { INTENTS } from "../../shared/talk-types";
import { makeRng } from "../core/math";
import type { GameState } from "../game/state";
import type { Quests } from "./quests";

export interface DialogueOption {
  id: string;
  label: string;
}

export type DirectorAction =
  | { kind: "shop"; highlight?: string }
  | { kind: "service"; id: ServiceId }
  | { kind: "marker"; place: string }
  | { kind: "fight"; duel: { prize: number; sparring: boolean } | null }
  | { kind: "flee" }
  | { kind: "cower" }
  | { kind: "alert" }
  | { kind: "end"; delay?: number }
  | { kind: "bow" }
  | { kind: "wave" }
  | { kind: "toast"; text: string; tone?: "good" | "bad" | "info" }
  | { kind: "quest"; id: string; accepted: boolean }
  | { kind: "catHome" }
  | { kind: "sound"; id: "coin" | "quest" | "error" | "bell" };

export interface Turn {
  lines: string[];
  actions: DirectorAction[];
  options: DialogueOption[];
  pending: PendingQuestion | null;
  /** Change in the NPC's feelings this turn (for the little heart indicator). */
  mood: number;
  /** Debug/UX: how the message was read. */
  reading?: string;
}

interface Pending {
  q: PendingQuestion;
  yes: () => Turn;
  no: () => Turn;
}

const T = (lines: string | string[], extra: Partial<Turn> = {}): Turn => ({
  lines: Array.isArray(lines) ? lines : [lines],
  actions: [],
  options: [],
  pending: null,
  mood: 0,
  ...extra,
});

export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export class DialogueDirector {
  readonly npc: NpcDef;
  history: ChatLine[] = [];
  private pending: Pending | null = null;
  private rng = makeRng(Date.now() % 100000);
  private lastLine = "";
  private lastItem: string | null = null;
  private deals = new Map<string, number>();
  private haggles = new Map<string, number>();
  private offended = false;
  private politeCredited = false;
  private topicCursor = new Map<string, number>();
  private riddleMisses = 0;

  constructor(
    npcId: string,
    private state: GameState,
    private quests: Quests,
    private player: RosterEntry,
    /** Where the NPC is standing (for directions). */
    private at: { x: number; z: number },
  ) {
    this.npc = NPC_BY_ID[npcId];
  }

  get pendingQuestion(): PendingQuestion | null {
    return this.pending?.q ?? null;
  }

  private pick(lines: string[] | undefined, fallback = "..."): string {
    const pool = lines && lines.length ? lines : [fallback];
    let l = pool[Math.floor(this.rng.next() * pool.length)];
    if (l === this.lastLine && pool.length > 1) l = pool[(pool.indexOf(l) + 1) % pool.length];
    this.lastLine = l;
    return fill(l, { player: this.player.name });
  }

  private disp() {
    return this.state.disposition(this.npc.id);
  }

  private mood(n: number) {
    this.state.addDisposition(this.npc.id, n);
    return n;
  }

  private say(t: Turn): Turn {
    for (const l of t.lines) this.history.push({ from: "npc", text: l });
    if (this.history.length > 12) this.history.splice(0, this.history.length - 12);
    if (!t.options.length) t.options = this.defaultOptions();
    if (t.pending) t.options = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }, ...t.options.filter((o) => o.id === "bye")];
    return t;
  }

  // ——— entry points ————————————————————————————————————————————————————

  opening(): Turn {
    const d = this.disp();
    const first = !this.state.data.talkedTo.includes(this.npc.id);
    if (first) this.state.data.talkedTo.push(this.npc.id);
    let line: string;
    if (d >= 30 && this.npc.lines.greetFriendly) line = this.pick(this.npc.lines.greetFriendly);
    else if (d <= -25 && this.npc.lines.greetCold) line = this.pick(this.npc.lines.greetCold);
    else line = this.pick(this.npc.lines.greet);
    const lines = [line];
    if (first) {
      const reaction = archetypeReaction(this.player.archetype, this.npc);
      if (reaction) lines.push(reaction);
    }
    // Quest nudges.
    const q = this.npc.quest;
    if (q && this.quests.isActive(q) && this.quests.requirementsMet(q)) lines.push(this.npcOnQuestReady(q));
    if (this.npc.id === "sayo" && this.state.has("rice_bale") && this.quests.isActive("rice")) lines.push("Is that... a rice bale? From Hana?");
    return this.say(T(lines, { actions: [{ kind: "bow" }] }));
  }

  /** A typed message, already interpreted by Jev (or the fallback). */
  respond(message: string, resp: TalkResponse): Turn {
    this.history.push({ from: "player", text: message });
    const t = this.route(resp.answers, resp.offerValue, false);
    t.reading = describe(resp);
    return this.say(t);
  }

  /** An option button. */
  choose(id: string): Turn {
    const label = this.optionLabel(id);
    if (label) this.history.push({ from: "player", text: label });
    if (id === "yes" || id === "no") {
      const p = this.pending;
      this.pending = null;
      if (!p) return this.say(T(this.pick(this.npc.lines.unclear)));
      return this.say(id === "yes" ? p.yes() : p.no());
    }
    const [kind, arg] = id.split(":");
    const a = syntheticAnswers();
    switch (kind) {
      case "buy":
        a.intent.choice = "buy";
        break;
      case "sell":
        a.intent.choice = "sell";
        if (arg) a.sellItem.choice = arg;
        break;
      case "topic":
        a.intent.choice = "ask_topic";
        a.topic.choice = arg;
        break;
      case "work":
        a.intent.choice = "ask_work";
        break;
      case "report":
        a.intent.choice = "report_task";
        a.claimsDone = 1;
        break;
      case "service":
        a.intent.choice = "use_service";
        a.service.choice = arg;
        break;
      case "duel":
        a.intent.choice = "challenge";
        a.politeness.score = 3;
        break;
      case "riddle":
        a.intent.choice = "ask_topic";
        a.topic.choice = "riddles";
        break;
      case "where":
        a.intent.choice = "ask_directions";
        a.place.choice = arg ?? "none";
        break;
      case "bye":
        a.intent.choice = "farewell";
        break;
    }
    return this.say(this.route(a, null, true));
  }

  private optionLabel(id: string): string | null {
    const [kind, arg] = id.split(":");
    switch (kind) {
      case "yes":
        return "Yes.";
      case "no":
        return "No.";
      case "buy":
        return "Show me your wares.";
      case "sell":
        return arg ? `I'd like to sell my ${ITEMS[arg]?.name ?? arg}.` : "I have something to sell.";
      case "topic":
        return `Tell me about ${this.npc.topics.find((t) => t.id === arg)?.label.toLowerCase() ?? arg}.`;
      case "work":
        return "Is there any work for me?";
      case "report":
        return "About that task...";
      case "service":
        return this.npc.services?.find((s) => s.id === arg)?.label ?? "Your services, please.";
      case "duel":
        return "I challenge you to a duel.";
      case "riddle":
        return "What was the riddle?";
      case "where":
        return `Where is ${PLACE_BY_ID[arg]?.name ?? "that"}?`;
      case "bye":
        return "Farewell.";
    }
    return null;
  }

  defaultOptions(): DialogueOption[] {
    const n = this.npc;
    const o: DialogueOption[] = [];
    if (n.shop && n.shop.wares.length) o.push({ id: "buy", label: "Browse wares" });
    const sellable = this.state.heldIds.filter((id) => n.shop?.buys.includes(id));
    if (sellable.length) o.push({ id: `sell:${sellable[0]}`, label: `Sell ${ITEMS[sellable[0]].name}` });
    for (const s of n.services ?? []) o.push({ id: `service:${s.id}`, label: s.price ? `${s.label} · ${s.price} mon` : s.label });
    if (n.quest) {
      const st = this.quests.stage(n.quest);
      if (!st) o.push({ id: "work", label: "Any work?" });
      else if (st !== "done") o.push({ id: "report", label: `About: ${QUESTS[n.quest].title}` });
    }
    if (n.id === "kukai" && this.quests.currentRiddle()) o.push({ id: "riddle", label: "Hear the riddle again" });
    if (n.fighter?.duel && !this.state.fact(`beat:${n.id}`)) o.push({ id: "duel", label: n.fighter.sparring ? "Spar" : "Challenge to a duel" });
    for (const t of n.topics.slice(0, 3)) o.push({ id: `topic:${t.id}`, label: `Ask about ${t.label.toLowerCase()}` });
    o.push({ id: "bye", label: "Farewell" });
    return o.slice(0, 7);
  }

  // ——— the policy ——————————————————————————————————————————————————————————

  private route(a: TalkAnswers, offer: number | null, fromButton: boolean): Turn {
    const n = this.npc;
    const lines: string[] = [];
    let mood = 0;
    const fighter = !!n.fighter && n.role !== "child";

    // 1. Tone.
    if (a.threat >= 0.72) {
      this.pending = null;
      this.state.addHonor(-4);
      mood += this.mood(-25);
      if (fighter || n.role === "guard") {
        return T(this.pick(n.lines.threatened), { actions: [{ kind: "fight", duel: null }, { kind: "end", delay: 1.2 }], mood });
      }
      return T(this.pick(n.lines.threatened), { actions: [n.role === "child" ? { kind: "cower" } : { kind: "flee" }, { kind: "alert" }, { kind: "end", delay: 1 }], mood });
    }
    if (a.insult >= 0.72) {
      mood += this.mood(-12);
      this.offended = true;
      this.state.addHonor(-1);
      if ((n.id === "jubei" || n.id === "ren" || n.id === "kaede") && !this.state.fact(`beat:${n.id}`)) {
        const prize = n.fighter?.duel?.prize ?? 30;
        this.pending = {
          q: { kind: "duel", question: `${n.name} wants to settle it with a duel. Accept?` },
          yes: () => this.startDuel(),
          no: () => T(n.id === "jubei" ? "Hah. All mouth, no steel." : "Coward."),
        };
        return T([this.pick(n.lines.insulted), `Duel me, then. ${prize} mon says you lose.`], { pending: this.pending.q, mood });
      }
      if (a.intent.choice === "insult" || a.intent.confidence < 0.5) return T(this.pick(n.lines.insulted), { mood });
      lines.push(this.pick(n.lines.insulted));
    }
    if (a.flattery >= 0.7) {
      const key = `flattered:${this.state.data.day}:${n.id}`;
      if (!this.state.fact(key)) {
        this.state.setFact(key);
        mood += this.mood(4);
      }
      if (a.intent.choice === "compliment") return T(this.pick(n.lines.flattered), { mood });
    }
    if (!this.politeCredited && !fromButton) {
      if (a.politeness.score >= 2.5) {
        this.politeCredited = true;
        mood += this.mood(2);
      } else if (a.politeness.score <= 0.8) {
        mood += this.mood(-3);
      }
    }

    // 2. A yes/no we were waiting on.
    if (this.pending && a.reply && a.reply.choice !== "unrelated" && a.reply.confidence >= 0.5) {
      const p = this.pending;
      this.pending = null;
      const t = a.reply.choice === "accept" ? p.yes() : p.no();
      t.lines = [...lines, ...t.lines];
      t.mood += mood;
      return t;
    }

    // Riddles: an answer can arrive without the intent being "answer_riddle".
    const riddleId = n.id === "kukai" ? this.quests.currentRiddle() : null;
    if (riddleId && (a.intent.choice === "answer_riddle" || (a.riddleAttempt ?? 0) >= 0.6) && !fromButton) {
      return this.withMood(this.answerRiddle(riddleId, a), lines, mood);
    }

    // 3. What did they want?
    const intent = a.intent;
    if (intent.confidence < 0.34 && !fromButton) {
      return this.withMood(T(this.pick(n.lines.unclear)), lines, mood);
    }
    let t: Turn;
    switch (intent.choice as Intent) {
      case "greet":
        t = T(this.pick(this.disp() > 30 ? n.lines.greetFriendly ?? n.lines.greet : n.lines.greet), { actions: [{ kind: "bow" }] });
        break;
      case "small_talk":
        t = a.topic.choice !== "none" && a.topic.confidence > 0.5 ? this.topic(a.topic.choice) : T(this.pick(n.lines.smallTalk));
        break;
      case "ask_topic":
        if (a.topic.choice !== "none" && (a.topic.confidence >= 0.35 || fromButton)) t = this.topic(a.topic.choice);
        else if (a.place.choice !== "none" && a.place.confidence >= 0.45) t = this.directions(a.place.choice);
        else if (n.id === "kukai" && riddleId) t = this.presentRiddle(riddleId);
        else t = T(n.topics.length ? "Hmm, I couldn't say. Ask me about something I know." : this.pick(n.lines.smallTalk));
        break;
      case "ask_directions":
        if (a.place.choice !== "none" && (a.place.confidence >= 0.35 || fromButton)) t = this.directions(a.place.choice);
        else t = T("Where are you trying to go?", { options: this.placeOptions() });
        break;
      case "buy":
        t = this.buy(a);
        break;
      case "haggle":
        t = this.haggle(a, offer);
        break;
      case "sell":
        t = this.sell(a);
        break;
      case "ask_work":
        t = this.work();
        break;
      case "report_task":
        t = this.report(a);
        break;
      case "answer_riddle":
        t = riddleId ? this.answerRiddle(riddleId, a) : T("A riddle? I didn't ask one.");
        break;
      case "use_service":
        t = this.service(a);
        break;
      case "challenge":
        t = this.challenge(a);
        break;
      case "compliment":
        t = T(this.pick(n.lines.flattered));
        break;
      case "insult":
        t = T(this.pick(n.lines.insulted));
        break;
      case "threaten":
        t = T(this.pick(n.lines.threatened));
        break;
      case "farewell":
        t = T(this.pick(n.lines.farewell), { actions: [{ kind: "bow" }, { kind: "end", delay: 1.4 }] });
        break;
      default:
        t = T(this.pick(n.lines.unclear));
    }
    return this.withMood(t, lines, mood);
  }

  private withMood(t: Turn, prefix: string[], mood: number): Turn {
    t.lines = [...prefix, ...t.lines];
    t.mood += mood;
    return t;
  }

  // ——— topics & directions ——————————————————————————————————————————————————

  private topic(id: string): Turn {
    const topic = this.npc.topics.find((t) => t.id === id);
    if (!topic) return T(this.pick(this.npc.lines.smallTalk));
    const i = this.topicCursor.get(id) ?? 0;
    this.topicCursor.set(id, i + 1);
    const line = fill(topic.lines[i % topic.lines.length], { player: this.player.name });
    const t = T(line);
    if (id === "riddles" && this.npc.id === "kukai") {
      const r = this.quests.currentRiddle();
      if (r) t.lines.push(`The riddle is this: "${RIDDLE_BY_ID[r].text}"`);
      else if (!this.quests.stage("riddles")) return this.work();
    }
    if ((id === "bandits" || id === "moon_blade") && !this.quests.stage("bandits") && this.npc.id !== "goro") t.actions.push({ kind: "marker", place: "west_gate" });
    return t;
  }

  private placeOptions(): DialogueOption[] {
    return ["blacksmith", "inn", "dojo", "shrine", "tea_house", "bandit_camp"].map((id) => ({ id: `where:${id}`, label: PLACE_BY_ID[id].name.replace(/^the /, "The ") }));
  }

  private directions(placeId: string): Turn {
    const p = PLACE_BY_ID[placeId];
    if (!p) return T("I don't know that place.");
    const dx = p.x - this.at.x;
    const dz = p.z - this.at.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) return T(`${capitalize(p.name)}? You're standing right by it.`, { actions: [{ kind: "marker", place: placeId }] });
    const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const dir = COMPASS[Math.round(((bearing + 360) % 360) / 45) % 8];
    const paces = Math.round((dist / 0.8) / 10) * 10;
    const hint = p.description.split(",")[0].toLowerCase();
    return T(`${capitalize(p.name)}? About ${paces} paces ${dir} of here — ${hint}.`, { actions: [{ kind: "marker", place: placeId }, { kind: "toast", text: `Marked ${p.name} on your compass`, tone: "info" }] });
  }

  // ——— trade ——————————————————————————————————————————————————————————————

  /** Price after mood, honor and bad manners. */
  price(itemId: string): number {
    const base = ITEMS[itemId].price;
    const d = this.disp();
    const honor = this.state.data.honor;
    let k = 1 - d / 500;
    if (honor >= 80) k *= 0.93;
    if (honor < 25) k *= 1.2;
    if (this.offended) k *= 1.15;
    return Math.max(1, Math.round(base * k));
  }

  /** What the player pays right now: a haggled deal if there is one, else the list price. */
  currentPrice(itemId: string): number {
    return this.deals.get(itemId) ?? this.price(itemId);
  }

  sellPrice(itemId: string): number {
    const base = ITEMS[itemId].sellPrice ?? 0;
    return Math.max(1, Math.round(base * (1 + this.disp() / 400)));
  }

  private buy(a: TalkAnswers): Turn {
    const shop = this.npc.shop;
    if (!shop || !shop.wares.length) {
      const where = PLACES.find((p) => ["blacksmith", "general_store", "noodle_stall", "apothecary"].includes(p.id));
      return T(this.pick(this.npc.lines.noWares), { actions: where ? [] : [] });
    }
    if (a.item.choice !== "none" && a.item.confidence >= 0.5 && shop.wares.includes(a.item.choice)) {
      return this.offerSale(a.item.choice);
    }
    if (a.item.choice !== "none" && shop.wares.includes(a.item.choice)) this.lastItem = a.item.choice;
    return T(shop.wares.length > 2 ? "Have a look. Everything's priced fair." : "Here's what I have.", { actions: [{ kind: "shop", highlight: a.item.choice !== "none" ? a.item.choice : undefined }] });
  }

  /** Ask the player to confirm buying one item at the current (maybe negotiated) price. */
  offerSale(itemId: string): Turn {
    const it = ITEMS[itemId];
    this.lastItem = itemId;
    const price = this.deals.get(itemId) ?? this.price(itemId);
    this.pending = {
      q: { kind: "buy", question: `Buy the ${it.name} for ${price} mon?` },
      yes: () => this.completePurchase(itemId, price),
      no: () => T(this.rng.chance(0.5) ? "Suit yourself." : "Maybe next time."),
    };
    return T(`The ${it.name}? ${price} mon.`, { pending: this.pending.q });
  }

  completePurchase(itemId: string, price: number): Turn {
    const it = ITEMS[itemId];
    if (!this.state.spend(price)) return T(`You're short. It's ${price} mon, and you have ${this.state.data.money}.`, { actions: [{ kind: "sound", id: "error" }] });
    this.state.give(itemId);
    this.mood(1);
    this.deals.delete(itemId);
    return T(this.rng.chance(0.5) ? "A pleasure doing business." : "Take good care of it.", {
      actions: [{ kind: "sound", id: "coin" }, { kind: "toast", text: `Bought ${it.name} (−${price} mon)`, tone: "good" }],
    });
  }

  private haggle(a: TalkAnswers, offer: number | null): Turn {
    const shop = this.npc.shop;
    if (!shop || !shop.wares.length) return T("Haggle? I'm not selling anything.");
    const item = a.item.choice !== "none" && shop.wares.includes(a.item.choice) ? a.item.choice : this.lastItem;
    if (!item) return T("Haggle over what? Pick something first.", { actions: [{ kind: "shop" }] });
    this.lastItem = item;
    const it = ITEMS[item];
    const list = this.price(item);
    const tries = this.haggles.get(item) ?? 0;
    this.haggles.set(item, tries + 1);
    if (tries >= 2) return T(`${this.npc.name === "Tetsu" ? "Enough." : "No more haggling."} ${this.deals.get(item) ?? list} mon for the ${it.name}. Take it or leave it.`);
    // What the merchant will give, from the strength of the case and their mood.
    const strength = a.haggleStrength.score; // 0..3
    const polite = a.politeness.score; // 0..3
    let discount = 0.03 * strength + 0.02 * Math.max(0, polite - 1.5) + Math.max(0, this.disp()) / 1000;
    if (polite < 1) discount *= 0.3;
    discount = Math.min(shop.maxDiscount, discount);
    const floor = Math.round(list * (1 - shop.maxDiscount));
    const counter = Math.round(list * (1 - discount));
    if (offer !== null && offer > 0) {
      if (offer >= list) return this.offerSale(item);
      if (offer >= counter) {
        this.deals.set(item, Math.round(offer));
        const t = this.offerSale(item);
        t.lines.unshift(`${Math.round(offer)}? ...Fine. Deal.`);
        return t;
      }
      if (offer < floor * 0.8) {
        this.mood(-3);
        return T(`${Math.round(offer)}?! For a ${it.name}? Don't insult me. ${list} mon.`);
      }
      this.deals.set(item, counter);
      const t = this.offerSale(item);
      t.lines[0] = `${Math.round(offer)} is too low. I can do ${counter} mon for the ${it.name}.`;
      return t;
    }
    if (discount < 0.02) return T(strength < 1 ? `Give me a reason and we'll talk. It's ${list} mon.` : `It's worth every copper. ${list} mon.`);
    this.deals.set(item, counter);
    const t = this.offerSale(item);
    t.lines[0] = `Hmm. For you, ${counter} mon for the ${it.name}.`;
    return t;
  }

  private sell(a: TalkAnswers): Turn {
    const shop = this.npc.shop;
    const itemId = a.sellItem.choice !== "none" ? a.sellItem.choice : this.state.heldIds.find((id) => shop?.buys.includes(id)) ?? null;
    if (!shop || !itemId || !shop.buys.includes(itemId)) {
      return T(itemId ? `I've no use for a ${ITEMS[itemId]?.name ?? "that"}.` : "What would you sell me?");
    }
    if (!this.state.has(itemId)) return T("You don't have that.");
    const count = this.state.count(itemId);
    const each = this.sellPrice(itemId);
    const it = ITEMS[itemId];
    const total = each * count;
    this.pending = {
      q: { kind: "sell", question: `Sell ${count > 1 ? `${count} × ` : ""}${it.name} for ${total} mon?` },
      yes: () => {
        this.state.take(itemId, count);
        this.state.addMoney(total);
        if (itemId === "bandit_token") this.state.addHonor(1);
        return T(itemId === "bandit_token" && this.npc.id === "goro" ? "Good work. Every token is one less bandit." : "Done.", {
          actions: [{ kind: "sound", id: "coin" }, { kind: "toast", text: `Sold ${it.name} (+${total} mon)`, tone: "good" }],
        });
      },
      no: () => T("As you like."),
    };
    return T(`${count > 1 ? `${count} of them? ` : ""}I'll give you ${total} mon.`, { pending: this.pending.q });
  }

  // ——— tasks —————————————————————————————————————————————————————————————

  private npcOnQuestReady(q: string): string {
    return q === "mochi" ? "Is — is that MOCHI?!" : "You look like someone with news.";
  }

  private work(): Turn {
    const q = this.npc.quest;
    if (!q) return T(this.pick(this.npc.lines.noWork, "I've nothing for you, sorry."));
    const def = QUESTS[q];
    const st = this.quests.stage(q);
    if (st === "done") return T(q === "jubei" ? "You already beat me. Leave me to my cup." : "You've done plenty. Thank you.");
    if (st === "active" || st === "ready") {
      if (this.quests.requirementsMet(q)) return this.finishQuest(q);
      if (q === "dojo" && this.quests.studentsBeaten() >= 3 && !this.state.fact("beat:hideaki")) return this.challenge(syntheticAnswers());
      if (q === "riddles") {
        const r = this.quests.currentRiddle();
        if (r) return this.presentRiddle(r);
      }
      return T(def.reminder);
    }
    if (q === "jubei") return this.challenge(syntheticAnswers());
    this.pending = {
      q: { kind: "task", question: `Accept "${def.title}"?` },
      yes: () => {
        this.quests.accept(q);
        const t = T(def.accepted, { actions: [{ kind: "quest", id: q, accepted: true }, { kind: "sound", id: "quest" }] });
        if (q === "riddles") t.lines.push(`"${RIDDLE_BY_ID[this.quests.currentRiddle()!].text}"`);
        if (q === "bandits" || q === "moonblade") t.actions.push({ kind: "marker", place: "bandit_camp" });
        if (q === "rice") t.actions.push({ kind: "marker", place: "inn" }, { kind: "toast", text: "You're carrying a rice bale", tone: "info" });
        if (q === "charm") t.actions.push({ kind: "marker", place: "stepping_stones" });
        return t;
      },
      no: () => T("Another time, then."),
    };
    return T(def.offer, { pending: this.pending.q });
  }

  private report(a: TalkAnswers): Turn {
    // Deliveries to someone other than the quest giver.
    if (this.npc.id === "sayo" && this.quests.isActive("rice")) {
      if (this.state.has("rice_bale")) return this.finishQuest("rice");
    }
    const q = this.npc.quest;
    if (!q || !this.quests.stage(q)) return this.work();
    if (this.quests.isDone(q)) return T("That's all settled. Thank you again.");
    if (this.quests.requirementsMet(q)) return this.finishQuest(q);
    if (q === "dojo" && this.quests.studentsBeaten() >= 3) return this.challenge(syntheticAnswers());
    if (a.claimsDone >= 0.6) {
      this.mood(-4);
      return T(QUESTS[q].notDone);
    }
    return T(QUESTS[q].reminder);
  }

  private finishQuest(q: string): Turn {
    const def = QUESTS[q];
    const reward = this.quests.complete(q);
    this.mood(20);
    const t = T(def.complete, { actions: [{ kind: "sound", id: "quest" }, { kind: "toast", text: `${def.title} complete — ${reward}`, tone: "good" }, { kind: "quest", id: q, accepted: false }] });
    if (q === "mochi") t.actions.push({ kind: "catHome" });
    return t;
  }

  // ——— riddles ——————————————————————————————————————————————————————————————

  private presentRiddle(id: string): Turn {
    return T(`Listen: "${RIDDLE_BY_ID[id].text}"`);
  }

  private answerRiddle(id: string, a: TalkAnswers): Turn {
    const correct = (a.riddleCorrect ?? 0) >= 0.6;
    if (correct) {
      this.riddleMisses = 0;
      this.quests.advanceRiddle();
      const next = this.quests.currentRiddle();
      this.mood(5);
      if (!next) return this.finishQuest("riddles");
      return T(["Yes! Exactly so.", `The next one: "${RIDDLE_BY_ID[next].text}"`], { actions: [{ kind: "sound", id: "bell" }] });
    }
    this.riddleMisses++;
    const r = RIDDLE_BY_ID[id];
    if (this.riddleMisses >= 2) return T(["No, no.", `A hint, then: ${r.hint}`]);
    return T(this.rng.chance(0.5) ? "Ho ho. No. Think again." : "Close your eyes and listen to the riddle once more.");
  }

  // ——— services & duels ——————————————————————————————————————————————————————

  private service(a: TalkAnswers): Turn {
    const services = this.npc.services ?? [];
    if (!services.length) return T("I don't offer anything like that.");
    const sv = services.find((s) => s.id === a.service.choice) ?? services[0];
    if (sv.id === "spar") return this.challenge(a, true);
    if (sv.price > this.state.data.money) return T(`That's ${sv.price} mon. You have ${this.state.data.money}.`, { actions: [{ kind: "sound", id: "error" }] });
    if (sv.id === "training" && this.state.fact("trained:hideaki")) return T("I have taught you what a day can teach. The rest is practice.");
    if (sv.id === "chohan") return T(`Sit, then. Place your bet.`, { actions: [{ kind: "service", id: "chohan" }] });
    this.pending = {
      q: { kind: "service", question: `${sv.label} for ${sv.price} mon?` },
      yes: () => {
        if (!this.state.spend(sv.price)) return T("You can't pay for that.");
        return T(sv.id === "rest" ? "Your room is ready. Sleep well." : sv.id === "blessing" ? "Close your eyes..." : "Then we begin. Draw.", {
          actions: [{ kind: "service", id: sv.id }, ...(sv.price ? [{ kind: "sound", id: "coin" } as DirectorAction] : [])],
        });
      },
      no: () => T("Another time."),
    };
    return T(`${sv.description}`, { pending: this.pending.q });
  }

  private challenge(a: TalkAnswers, sparring = false): Turn {
    const n = this.npc;
    const f = n.fighter;
    if (!f || (!f.duel && !f.sparring)) return T(this.pick(n.lines.challengeRefused, "I won't fight you."));
    if (this.state.fact(`beat:${n.id}`) && n.id !== "ren" && n.id !== "daichi" && n.id !== "kaede") return T("We've settled that already.");
    if (n.id === "hideaki" && this.quests.studentsBeaten() < 3) return T(this.pick(n.lines.challengeRefused));
    if (n.role === "sensei" && a.politeness.score < 1.2) return T("Come back when you can ask with respect.");
    if (sparring && n.id === "hideaki") {
      return T("Choose one of my students — Ren, Daichi or Kaede — and ask them.");
    }
    const prize = f.duel?.prize ?? 30;
    this.pending = {
      q: { kind: "duel", question: `Duel ${n.name}? Winner gets ${prize} mon.` },
      yes: () => this.startDuel(),
      no: () => T("Hm. Another day."),
    };
    return T(f.sparring ? `A bout with bokken? Win and I'll give you ${prize} mon.` : `A duel? Win and you take ${prize} mon.`, { pending: this.pending.q });
  }

  private startDuel(): Turn {
    const f = this.npc.fighter!;
    return T(this.pick(this.npc.lines.challengeAccepted, "Very well."), {
      actions: [{ kind: "bow" }, { kind: "fight", duel: { prize: f.duel?.prize ?? 30, sparring: !!f.sparring || this.npc.role === "sensei" || this.npc.id === "jubei" } }, { kind: "end", delay: 1.4 }],
    });
  }
}

// ——— helpers ——————————————————————————————————————————————————————————————

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function syntheticAnswers(): TalkAnswers {
  const c = (choice: string) => ({ choice, confidence: 1, probabilities: { [choice]: 1 } });
  return {
    intent: { ...c("unclear"), choice: "unclear" } as TalkAnswers["intent"],
    topic: c("none"),
    item: c("none"),
    sellItem: c("none"),
    place: c("none"),
    service: c("none"),
    politeness: { score: 2.5, confidence: 1 },
    haggleStrength: { score: 0, confidence: 1 },
    threat: 0,
    insult: 0,
    flattery: 0,
    claimsDone: 0,
    reply: null,
    riddleAttempt: null,
    riddleCorrect: null,
  };
}

function describe(r: TalkResponse): string {
  const a = r.answers;
  const top = Object.entries(a.intent.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 2);
  const bits = [`${top.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ")}`];
  if (a.item.choice !== "none") bits.push(`item: ${a.item.choice}`);
  if (a.topic.choice !== "none") bits.push(`topic: ${a.topic.choice}`);
  if (a.place.choice !== "none") bits.push(`place: ${a.place.choice}`);
  bits.push(`polite ${a.politeness.score.toFixed(1)}/3`);
  if (a.threat > 0.5) bits.push(`threat ${(a.threat * 100).toFixed(0)}%`);
  if (a.insult > 0.5) bits.push(`insult ${(a.insult * 100).toFixed(0)}%`);
  void INTENTS;
  return bits.join(" · ");
}

function archetypeReaction(arch: RosterEntry["archetype"], npc: NpcDef): string | null {
  if (npc.role === "bandit" || npc.role === "chief") return null;
  const lines: Record<RosterEntry["archetype"], string[]> = {
    samurai: ["A samurai, and a masterless one by the look of you."],
    pirate: ["A pirate? In a river village? Keep your hands off our boats.", "That straw hat... are you a farmer or a pirate?"],
    swordsman: ["Three swords? Most people manage fine with one.", "You wear a lot of steel for a traveler."],
    ninja: ["That orange could stop a heart. Aren't shinobi supposed to hide?", "A shinobi, walking in broad daylight. Strange times."],
    soul_reaper: ["All in black, like a funeral. Who died?", "There's something cold about you. Like a ghost that forgot to leave."],
    brawler: ["Kami above, you're enormous. Mind the doorframes.", "A masked wrestler! The children will follow you all day."],
    gunslinger: ["Is that a foreign gun? Point it somewhere else, please.", "Purple hair... is that the fashion in the capital now?"],
  };
  const pool = lines[arch];
  if (npc.role === "child") return arch === "brawler" ? "WHOA. Are you a sumo? Can you lift a horse?" : "Whoa... are you a hero?";
  return pool[Math.floor(Math.random() * pool.length)];
}
