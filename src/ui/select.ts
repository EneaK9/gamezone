// Character select. The 3D preview is the real village behind the panels.

import { ITEMS } from "../../shared/items";
import { ROSTER, type Franchise, type RosterEntry } from "../../shared/roster";
import { el, esc, ui } from "./dom";

const ORDER: Franchise[] = ["Kazemura", "One Piece", "Naruto", "Bleach", "Brawl Stars"];

function swatch(r: RosterEntry): string {
  const g = r.look.garments.find((x) => "color" in x && x.kind !== "tabi" && x.kind !== "gloves") as { color: string } | undefined;
  const hair = r.look.hair.color;
  return `linear-gradient(135deg, ${hair} 0 45%, ${g?.color ?? "#555"} 45% 100%)`;
}

export class SelectScreen {
  private root: HTMLDivElement;
  private selected: string;

  constructor(
    current: string,
    private hasSave: boolean,
    private handlers: { pick: (id: string) => void; begin: (id: string, fresh: boolean) => void; back?: () => void },
    private inGame = false,
  ) {
    this.selected = current;
    this.root = el("div", "select");
    ui().appendChild(this.root);
    this.render();
  }

  private render() {
    const groups = ORDER.map((f) => {
      const cards = ROSTER.filter((r) => r.franchise === f)
        .map(
          (r) => `<button class="card ${r.id === this.selected ? "on" : ""}" data-id="${r.id}">
            <i class="swatch" style="background:${swatch(r)}"></i>
            <div><b>${esc(r.name)}</b><span>${esc(r.title)}</span></div>
            ${r.id === "samurai" ? '<em class="def">Default</em>' : ""}
          </button>`,
        )
        .join("");
      return `<div class="group"><h3>${f === "Kazemura" ? "The Samurai" : f}</h3>${cards}</div>`;
    }).join("");
    const r = ROSTER.find((x) => x.id === this.selected)!;
    const weapon = r.weapon === "fists" ? "Bare fists" : ITEMS[r.weapon]?.name ?? r.weapon;
    const stat = (label: string, v: number, max: number) => `<span>${label}</span><i style="--v:${Math.round((v / max) * 100)}%"></i>`;
    this.root.innerHTML = `
      <div class="col">
        <h1>Kazemura</h1>
        <div class="sub">Choose who walks into the village</div>
        <div class="list">${groups}</div>
      </div>
      <div class="col"></div>
      <div class="col">
        <div class="detail">
          <div class="franchise">${r.franchise === "Kazemura" ? "Original" : r.franchise}</div>
          <h2>${esc(r.name)}</h2>
          <div class="title2">${esc(r.title)}</div>
          <p>${esc(r.blurb)}</p>
          <div class="stats">
            ${stat("Health", r.stats.health, 170)}
            ${stat("Power", r.stats.power, 1.3)}
            ${stat("Speed", r.stats.speed, 1.2)}
            ${stat("Stamina", r.stats.stamina, 130)}
          </div>
          <p style="margin:0 0 6px"><b style="color:var(--paper)">Weapon:</b> ${esc(weapon)}</p>
          <div class="special"><b>F · ${esc(r.special.name)}</b><div>${esc(r.special.description)}</div></div>
          <div class="actions">
            ${
              this.inGame
                ? `<button class="btn primary" data-act="switch">Play as ${esc(r.name.split(" ")[0])}</button><button class="btn" data-act="back">Back</button>`
                : this.hasSave
                  ? `<button class="btn primary" data-act="continue">Continue journey</button><button class="btn" data-act="new">New journey</button>`
                  : `<button class="btn primary" data-act="new">Begin</button>`
            }
          </div>
          <div class="hint">${this.inGame ? "Your money, bag and quests carry over." : "Talk to anyone by typing — villagers understand what you mean. Press Esc in game for settings."}</div>
        </div>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>(".card").forEach((b) =>
      b.addEventListener("click", () => {
        this.selected = b.dataset.id!;
        this.handlers.pick(this.selected);
        this.render();
      }),
    );
    this.root.querySelector('[data-act="new"]')?.addEventListener("click", () => this.handlers.begin(this.selected, true));
    this.root.querySelector('[data-act="continue"]')?.addEventListener("click", () => this.handlers.begin(this.selected, false));
    this.root.querySelector('[data-act="switch"]')?.addEventListener("click", () => this.handlers.begin(this.selected, false));
    this.root.querySelector('[data-act="back"]')?.addEventListener("click", () => this.handlers.back?.());
  }

  destroy() {
    this.root.remove();
  }
}
