// Conversation panel: the NPC's lines, option buttons, yes/no prompts, and a free-text box
// whose messages are interpreted by Jev on the server.

import type { NpcDef } from "../../shared/npcs";
import { MAX_MESSAGE_LENGTH } from "../../shared/talk-types";
import type { DialogueOption } from "../systems/dialogue";
import { el, esc, ui } from "./dom";

export class DialogueUI {
  readonly root: HTMLDivElement;
  private log: HTMLDivElement;
  private opts: HTMLDivElement;
  private input: HTMLInputElement;
  private meta: HTMLDivElement;
  private moodEl: HTMLElement;
  private busy = false;
  onSay: (text: string) => void = () => {};
  onOption: (id: string) => void = () => {};
  onClose: () => void = () => {};
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.onClose();
      return;
    }
    const typing = document.activeElement === this.input;
    // Number keys pick options unless you're mid-sentence.
    if (typing && this.input.value.length > 0) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) {
      const b = this.opts.querySelectorAll<HTMLButtonElement>(".opt")[n - 1];
      if (b) {
        e.preventDefault();
        b.click();
      }
    } else if (!typing && (e.key === "Enter" || e.key === "t" || e.key === "T")) {
      e.preventDefault();
      this.input.focus();
    }
  };

  constructor(npc: NpcDef) {
    this.root = el("div", "dialogue interactive");
    this.root.innerHTML = `
      <header><b>${esc(npc.name)}</b><span>${esc(npc.title)}</span><span class="mood">Mood <i></i></span></header>
      <div class="log"></div>
      <div class="options"></div>
      <form autocomplete="off"><input maxlength="${MAX_MESSAGE_LENGTH}" placeholder="Say anything… (Enter to type, 1–9 for options, Esc to leave)" /><button class="btn small" type="submit">Say</button></form>
      <div class="meta"><span class="ai"></span><span class="reading"></span></div>`;
    ui().appendChild(this.root);
    this.log = this.root.querySelector(".log")!;
    this.opts = this.root.querySelector(".options")!;
    this.input = this.root.querySelector("input")!;
    this.meta = this.root.querySelector(".meta")!;
    this.moodEl = this.root.querySelector(".mood i")!;
    this.root.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || this.busy) return;
      this.input.value = "";
      this.onSay(text);
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.input.blur();
        e.stopPropagation();
      }
    });
    window.addEventListener("keydown", this.keyHandler);
  }

  focusInput() {
    this.input.focus();
  }

  line(text: string, who: "npc" | "you" | "sys" = "npc") {
    const d = el("div", `line ${who === "npc" ? "" : who}`, esc(text));
    this.log.appendChild(d);
    while (this.log.children.length > 14) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  thinking(on: boolean) {
    this.busy = on;
    this.log.querySelector(".thinking")?.remove();
    if (on) {
      this.log.appendChild(el("div", "thinking", "…"));
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  options(list: DialogueOption[]) {
    this.opts.innerHTML = "";
    list.forEach((o, i) => {
      const b = el("button", `opt ${o.id === "yes" ? "yes" : o.id === "no" ? "no" : ""}`, `<kbd>${i + 1}</kbd>${esc(o.label)}`);
      b.type = "button";
      b.addEventListener("click", () => !this.busy && this.onOption(o.id));
      this.opts.appendChild(b);
    });
  }

  mood(value: number) {
    const m = Math.max(-100, Math.min(100, value));
    this.moodEl.style.setProperty("--m", String(Math.abs(m)));
    this.moodEl.style.setProperty("--o", m < 0 ? "-100%" : "0");
    this.moodEl.style.setProperty("--c", m < 0 ? "var(--vermilion)" : "var(--jade)");
  }

  status(mode: "jev" | "heuristic" | null, latency: number, reading?: string, note?: string) {
    const ai = this.meta.querySelector(".ai")!;
    if (mode === "jev") ai.innerHTML = `<b>✦ Jev</b> understood you in ${latency} ms`;
    else if (mode === "heuristic") ai.innerHTML = `Keyword mode${note ? ` — ${esc(note)}` : ""}`;
    else ai.textContent = "Type to talk — TypeSafe Jev reads what you mean";
    this.meta.querySelector(".reading")!.textContent = reading ?? "";
  }

  destroy() {
    window.removeEventListener("keydown", this.keyHandler);
    this.root.remove();
  }
}
