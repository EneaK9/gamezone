// POST /api/talk — interprets one thing the player said to an NPC.
//
// Shared by the Vite dev server (vite.config.ts) and the Vercel function (api/talk.ts).
// The TypeSafe key only ever lives here, on the server. The client can't send its own
// questions: the question set is built from the NPC catalog, so this endpoint can't be
// used as an open proxy for the key.

import { APIError, TypeSafeClient, type ChoiceResponse, type NoulResponse, type ScoreResponse } from "@typesafe-ai/sdk";
import { interpretOffline } from "../shared/heuristic";
import { ITEMS } from "../shared/items";
import { NPC_BY_ID, type NpcDef } from "../shared/npcs";
import { QUESTS } from "../shared/quests";
import { RIDDLE_BY_ID } from "../shared/riddles";
import {
  INTENTS,
  MAX_MESSAGE_LENGTH,
  MAX_RECENT_LINES,
  type ChoiceAnswer,
  type Intent,
  type PendingQuestion,
  type Reply,
  type ScoreAnswer,
  type TalkAnswers,
  type TalkRequest,
  type TalkResponse,
} from "../shared/talk-types";
import { buildTalkRequest } from "./questions";

export class BadRequest extends Error {}

let client: TypeSafeClient | null = null;
let clientKey = "";

function getClient(apiKey: string): TypeSafeClient {
  if (!client || clientKey !== apiKey) {
    client = new TypeSafeClient({ apiKey, timeout: 4000, retry: { maxRetries: 1 }, logLevel: "warn" });
    clientKey = apiKey;
  }
  return client;
}

// ——— validation ————————————————————————————————————————————————

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;

export function parseTalkRequest(raw: unknown): TalkRequest {
  if (!raw || typeof raw !== "object") throw new BadRequest("Body must be a JSON object");
  const body = raw as Record<string, unknown>;
  const npcId = str(body.npcId, 40);
  const message = str(body.message, MAX_MESSAGE_LENGTH).trim();
  if (!npcId) throw new BadRequest("npcId is required");
  if (!message) throw new BadRequest("message is required");
  const c = (body.context && typeof body.context === "object" ? body.context : {}) as Record<string, unknown>;

  const recent = Array.isArray(c.recent) ? c.recent.slice(-MAX_RECENT_LINES) : [];
  const pendingRaw = c.pending && typeof c.pending === "object" ? (c.pending as Record<string, unknown>) : null;
  const pendingKinds: PendingQuestion["kind"][] = ["buy", "duel", "service", "task", "sell"];
  const pending: PendingQuestion | null =
    pendingRaw && pendingKinds.includes(pendingRaw.kind as PendingQuestion["kind"])
      ? { kind: pendingRaw.kind as PendingQuestion["kind"], question: str(pendingRaw.question, 200) }
      : null;

  return {
    npcId,
    message,
    context: {
      disposition: num(c.disposition, -100, 100, 0),
      playerName: str(c.playerName, 40) || "Traveler",
      playerLook: str(c.playerLook, 160),
      money: Math.round(num(c.money, 0, 1e7, 0)),
      heldItemIds: (Array.isArray(c.heldItemIds) ? c.heldItemIds : [])
        .filter((id): id is string => typeof id === "string" && id in ITEMS)
        .slice(0, 24),
      activeTaskIds: (Array.isArray(c.activeTaskIds) ? c.activeTaskIds : [])
        .filter((id): id is string => typeof id === "string" && id in QUESTS)
        .slice(0, 12),
      riddleId: typeof c.riddleId === "string" && c.riddleId in RIDDLE_BY_ID ? c.riddleId : null,
      pending,
      recent: recent
        .filter((l): l is { from: unknown; text: unknown } => Boolean(l) && typeof l === "object")
        .map((l) => ({ from: l.from === "npc" ? ("npc" as const) : ("player" as const), text: str(l.text, 300) }))
        .filter((l) => l.text),
    },
  };
}

// ——— rate limit (per client, in memory) ————————————————————————————

const buckets = new Map<string, { tokens: number; at: number }>();
const BURST = 20;
const REFILL_PER_SEC = 1.5;

export function allowRequest(clientId: string): boolean {
  const now = Date.now();
  const b = buckets.get(clientId) ?? { tokens: BURST, at: now };
  b.tokens = Math.min(BURST, b.tokens + ((now - b.at) / 1000) * REFILL_PER_SEC);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(clientId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(clientId, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

// ——— answer mapping ————————————————————————————————————————————————

type AnyAnswer = ChoiceResponse | ScoreResponse | NoulResponse;

function asChoice<K extends string>(a: AnyAnswer | undefined, fallback: K): ChoiceAnswer<K> {
  if (a && a.type === "choice") {
    return { choice: a.choice as K, confidence: a.confidence, probabilities: { ...a.probabilities } as Record<string, number> };
  }
  return { choice: fallback, confidence: 1, probabilities: { [fallback]: 1 } };
}

function asScore(a: AnyAnswer | undefined): ScoreAnswer {
  if (a && a.type === "score") return { score: a.score, confidence: a.confidence };
  return { score: 0, confidence: 1 };
}

function asNoul(a: AnyAnswer | undefined): number | null {
  return a && a.type === "noul" ? a.noul : null;
}

// ——— handler ———————————————————————————————————————————————————————

export interface TalkEnv {
  apiKey?: string;
  model?: string;
}

export async function handleTalk(raw: unknown, env: TalkEnv): Promise<TalkResponse> {
  const req = parseTalkRequest(raw);
  const npc: NpcDef | undefined = NPC_BY_ID[req.npcId];
  if (!npc || !npc.talkable) throw new BadRequest(`Unknown NPC ${req.npcId}`);

  if (!env.apiKey) return interpretOffline(req, npc, "No TYPESAFE_API_KEY configured — using the keyword fallback.");

  const { state, questions, offerCandidates } = buildTalkRequest(req, npc);
  const started = Date.now();
  try {
    const result = await getClient(env.apiKey).systemOne(
      { state: state as never, questions, ...(env.model ? { model: env.model } : {}) },
      { timeout: 4000 },
    );
    const a = result.answers as Record<string, AnyAnswer>;

    const intent = asChoice<Intent>(a.intent, "unclear");
    if (!INTENTS.includes(intent.choice)) intent.choice = "unclear";

    let offerValue: number | null = null;
    if (offerCandidates.length === 1) offerValue = offerCandidates[0].value;
    else if (offerCandidates.length > 1) {
      const pick = asChoice(a.offer, "none");
      const idx = pick.choice.startsWith("n") ? Number(pick.choice.slice(1)) : -1;
      offerValue = idx >= 0 && offerCandidates[idx] ? offerCandidates[idx].value : null;
    }

    const answers: TalkAnswers = {
      intent,
      topic: asChoice(a.topic, "none"),
      item: asChoice(a.item, "none"),
      sellItem: asChoice(a.sell_item, "none"),
      place: asChoice(a.place, "none"),
      service: asChoice(a.service, (npc.services?.length ?? 0) === 1 ? npc.services![0].id : "none"),
      politeness: asScore(a.politeness),
      haggleStrength: asScore(a.haggle_strength),
      threat: asNoul(a.threat) ?? 0,
      insult: asNoul(a.insult) ?? 0,
      flattery: asNoul(a.flattery) ?? 0,
      claimsDone: asNoul(a.claims_done) ?? 0,
      reply: a.reply ? asChoice<Reply>(a.reply, "unrelated") : null,
      riddleAttempt: asNoul(a.riddle_attempt),
      riddleCorrect: asNoul(a.riddle_correct),
    };
    return { mode: "jev", model: result.model, latencyMs: Date.now() - started, answers, offerValue };
  } catch (err) {
    const why = err instanceof APIError ? `Jev returned ${err.status}` : err instanceof Error ? err.message : String(err);
    return interpretOffline(req, npc, `${why} — using the keyword fallback.`);
  }
}
