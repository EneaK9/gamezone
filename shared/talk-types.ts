// Contract between the game client and the /api/talk endpoint.
//
// The client sends what the player typed plus a small, bounded summary of game state.
// The server asks Jev a fixed set of typed questions about it and returns the typed
// answers. The game code — not the model — decides what the NPC says and does.

export const INTENTS = [
  "greet",
  "small_talk",
  "ask_topic",
  "ask_directions",
  "buy",
  "haggle",
  "sell",
  "ask_work",
  "report_task",
  "answer_riddle",
  "use_service",
  "challenge",
  "threaten",
  "insult",
  "compliment",
  "farewell",
  "unclear",
] as const;
export type Intent = (typeof INTENTS)[number];

export const REPLIES = ["accept", "decline", "unrelated"] as const;
export type Reply = (typeof REPLIES)[number];

export interface ChatLine {
  from: "player" | "npc";
  text: string;
}

/** A yes/no question the NPC asked and is waiting on. */
export interface PendingQuestion {
  kind: "buy" | "duel" | "service" | "task" | "sell";
  question: string;
}

export interface TalkContext {
  /** NPC's feeling toward the player, -100..100. */
  disposition: number;
  /** Display name of the character the player is playing. */
  playerName: string;
  /** One-line description of how the player's character looks. */
  playerLook: string;
  money: number;
  /** Ids of items in the player's bag (for sell/offer questions). */
  heldItemIds: string[];
  /** Quest ids the player has accepted but not finished. */
  activeTaskIds: string[];
  /** Riddle the monk is waiting on, if any. */
  riddleId?: string | null;
  pending?: PendingQuestion | null;
  /** The last few lines of this conversation, oldest first. */
  recent: ChatLine[];
}

export interface TalkRequest {
  npcId: string;
  message: string;
  context: TalkContext;
}

export interface ChoiceAnswer<K extends string = string> {
  choice: K;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ScoreAnswer {
  /** Probability-weighted level, 0..(levels-1). */
  score: number;
  confidence: number;
}

export interface TalkAnswers {
  intent: ChoiceAnswer<Intent>;
  /** One of the NPC's topic ids, or "none". */
  topic: ChoiceAnswer;
  /** One of the NPC's ware ids, or "none". */
  item: ChoiceAnswer;
  /** One of the player's held item ids, or "none". */
  sellItem: ChoiceAnswer;
  /** One of the village place ids, or "none". */
  place: ChoiceAnswer;
  /** One of the NPC's service ids, or "none" (only asked when the NPC offers several). */
  service: ChoiceAnswer;
  /** 0 hostile, 1 curt, 2 neutral, 3 courteous. */
  politeness: ScoreAnswer;
  /** 0 no case, 1 weak, 2 reasonable, 3 strong and courteous. */
  haggleStrength: ScoreAnswer;
  /** Probabilities (0..1) that the message threatens / insults / flatters the NPC. */
  threat: number;
  insult: number;
  flattery: number;
  /** Probability the player claims to have finished a task. */
  claimsDone: number;
  /** Only present when a pending question was sent. */
  reply: ChoiceAnswer<Reply> | null;
  /** Only present when a riddle was active. */
  riddleAttempt: number | null;
  riddleCorrect: number | null;
}

export interface TalkResponse {
  /** "jev" when TypeSafe answered; "heuristic" when the offline keyword fallback did. */
  mode: "jev" | "heuristic";
  model?: string;
  latencyMs: number;
  answers: TalkAnswers;
  /** A price the player offered, if the message named one. */
  offerValue: number | null;
  /** Why the heuristic was used, when it was. */
  note?: string;
}

export const MAX_MESSAGE_LENGTH = 240;
export const MAX_RECENT_LINES = 6;
