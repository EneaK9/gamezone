// Sends what the player typed to /api/talk (server-side Jev). If the server can't be
// reached — static hosting, offline — it interprets the message locally with the same
// keyword fallback the server uses, so conversations always work.

import { interpretOffline } from "../../shared/heuristic";
import { NPC_BY_ID } from "../../shared/npcs";
import type { TalkRequest, TalkResponse } from "../../shared/talk-types";

export class TalkClient {
  /** Last mode that answered, for the little indicator in the dialogue box. */
  lastMode: "jev" | "heuristic" | null = null;
  lastNote = "";
  lastLatency = 0;
  private serverDown = false;

  async interpret(req: TalkRequest): Promise<TalkResponse> {
    const npc = NPC_BY_ID[req.npcId];
    if (!this.serverDown) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const type = res.headers.get("content-type") ?? "";
        if (res.ok && type.includes("json")) {
          const data = (await res.json()) as TalkResponse;
          this.remember(data);
          return data;
        }
        if (res.status === 404 || !type.includes("json")) this.serverDown = true;
      } catch {
        // Network error: try again next time, but answer now.
      }
    }
    const data = interpretOffline(req, npc, this.serverDown ? "No /api/talk on this host — keyword mode." : "Couldn't reach /api/talk — keyword mode.");
    this.remember(data);
    return data;
  }

  private remember(r: TalkResponse) {
    this.lastMode = r.mode;
    this.lastNote = r.note ?? "";
    this.lastLatency = r.latencyMs;
  }
}
