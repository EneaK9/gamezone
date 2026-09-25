// Shop, journal/bag, pause menu, full map, chō-han table and the defeat screen.

import * as THREE from "three";
import { ITEMS } from "../../shared/items";
import type { NpcDef } from "../../shared/npcs";
import { PLACES } from "../../shared/places";
import { el, esc, ui } from "./dom";
import { MAP_PX, toMap } from "./mapArt";

// ——— shop ———————————————————————————————————————————————————————————————

export class ShopPanel {
  readonly root: HTMLDivElement;
  onBuy: (id: string) => void = () => {};
  onSell: (id: string) => void = () => {};

  constructor(private npc: NpcDef) {
    this.root = el("div", "panel shop interactive");
    ui().appendChild(this.root);
  }

  render(money: number, price: (id: string) => number, sellPrice: (id: string) => number, held: Record<string, number>, highlight?: string) {
    const shop = this.npc.shop!;
    const stat = (id: string) => {
      const it = ITEMS[id];
      if (it.weapon) return `Damage ${it.weapon.damage} · reach ${it.weapon.reach} m`;
      if (it.armor) return `Blocks ${Math.round(it.armor * 100)}% of damage${it.armorSpeed ? ` · ${Math.round((1 - it.armorSpeed) * 100)}% slower` : ""}`;
      if (it.heal) return it.heal >= 999 ? "Full heal" : `+${it.heal} health`;
      if (it.buff) return `${it.buff.kind.replace("_", " ")} for ${it.buff.seconds}s`;
      if (it.cosmetic) return "Wearable";
      return "";
    };
    const rows = shop.wares
      .map((id) => {
        const it = ITEMS[id];
        const p = price(id);
        return `<div class="row ${id === highlight ? "hl" : ""}">
          <b>${esc(it.name)}<span class="jp">${it.jp ?? ""}</span></b>
          <button class="btn small ${money >= p ? "primary" : ""} buy" data-buy="${id}">${p} mon</button>
          <p>${esc(it.description)} <span class="stat">${stat(id)}</span></p>
        </div>`;
      })
      .join("");
    const sellable = Object.keys(held).filter((id) => held[id] > 0 && shop.buys.includes(id));
    const sellRows = sellable
      .map((id) => `<div class="row"><b>${esc(ITEMS[id].name)} × ${held[id]}</b><button class="btn small buy" data-sell="${id}">Sell ${sellPrice(id) * held[id]}</button><p>${sellPrice(id)} mon each</p></div>`)
      .join("");
    this.root.innerHTML = `<div class="eyebrow">${esc(this.npc.name)}'s wares</div><h2>For sale</h2>
      <div class="money"><i class="coin"></i>${money} mon in your purse</div>
      ${rows}
      ${sellable.length ? `<h2 style="margin-top:16px;font-size:22px">They'll buy</h2>${sellRows}` : ""}
      <p style="font:400 12px/1.5 var(--sans);color:var(--paper-3);margin:12px 0 0">Tip: haggle by typing — “would you take 200 for the katana?” Good manners and a good reason help.</p>`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => b.addEventListener("click", () => this.onBuy(b.dataset.buy!)));
    this.root.querySelectorAll<HTMLButtonElement>("[data-sell]").forEach((b) => b.addEventListener("click", () => this.onSell(b.dataset.sell!)));
  }

  destroy() {
    this.root.remove();
  }
}

// ——— journal & bag ——————————————————————————————————————————————————————————

export interface JournalData {
  quests: { title: string; summary: string; done: boolean }[];
  items: { id: string; count: number; equipped: boolean }[];
  weapon: string;
  armor: string | null;
  cosmetic: string | null;
}

export class JournalPanel {
  readonly root: HTMLDivElement;
  onUse: (id: string) => void = () => {};
  onEquip: (id: string) => void = () => {};
  onClose: () => void = () => {};

  constructor() {
    this.root = el("div", "panel journal interactive");
    ui().appendChild(this.root);
  }

  render(d: JournalData) {
    const quests = d.quests.length
      ? d.quests.map((q) => `<div class="q ${q.done ? "done" : ""}"><b>${esc(q.title)}</b><p>${esc(q.summary)}</p></div>`).join("")
      : `<p style="color:var(--paper-3);font:400 13px/1.5 var(--sans)">No tasks yet. Ask villagers if they need help — or check the notice board in the square.</p>`;
    const items = d.items
      .map(({ id, count, equipped }) => {
        const it = ITEMS[id];
        const usable = it.kind === "food" || it.kind === "remedy";
        const equip = it.kind === "weapon" || it.kind === "armor" || it.kind === "cosmetic";
        return `<div class="inv"><div>${esc(it.name)}${count > 1 ? ` × ${count}` : ""}${equipped ? ' <span style="color:var(--gold)">· equipped</span>' : ""}<small>${esc(it.description)}</small></div>
          <div class="acts">${usable ? `<button class="btn small" data-use="${id}">Use</button>` : ""}${equip ? `<button class="btn small" data-eq="${id}">${equipped ? "Remove" : "Equip"}</button>` : ""}</div></div>`;
      })
      .join("");
    this.root.innerHTML = `
      <div><div class="eyebrow">Journal</div><h2>Tasks</h2>${quests}</div>
      <div><div class="eyebrow">Bag</div><h2>Belongings</h2>
        <div class="inv"><div>Signature weapon<small>Your character's own weapon</small></div><div class="acts"><button class="btn small" data-eq="signature">${d.weapon === "signature" ? "Equipped" : "Equip"}</button></div></div>
        ${items || '<p style="color:var(--paper-3)">Empty.</p>'}
        <div style="margin-top:14px"><button class="btn small" data-close>Close (J)</button></div>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-use]").forEach((b) => b.addEventListener("click", () => this.onUse(b.dataset.use!)));
    this.root.querySelectorAll<HTMLButtonElement>("[data-eq]").forEach((b) => b.addEventListener("click", () => this.onEquip(b.dataset.eq!)));
    this.root.querySelector("[data-close]")?.addEventListener("click", () => this.onClose());
  }

  destroy() {
    this.root.remove();
  }
}

// ——— pause menu ——————————————————————————————————————————————————————————————

export interface Settings {
  volume: number;
  music: boolean;
  sensitivity: number;
  invertY: boolean;
  quality: "low" | "medium" | "high";
}

export class MenuPanel {
  readonly root: HTMLDivElement;
  constructor(settings: Settings, handlers: { resume: () => void; characters: () => void; save: () => void; reset: () => void; settings: (s: Settings) => void }, aiStatus: string) {
    this.root = el("div", "panel menu interactive");
    this.root.innerHTML = `
      <div class="eyebrow">Paused</div><h2>Kazemura</h2>
      <div class="items">
        <button class="btn primary" data-a="resume">Resume</button>
        <button class="btn" data-a="characters">Change character</button>
        <button class="btn" data-a="save">Save journey</button>
      </div>
      <div class="row2">
        <span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${settings.volume}" data-s="volume" />
        <span>Music</span><select data-s="music"><option value="1" ${settings.music ? "selected" : ""}>On</option><option value="0" ${!settings.music ? "selected" : ""}>Off</option></select>
        <span>Mouse speed</span><input type="range" min="0.3" max="2.5" step="0.05" value="${settings.sensitivity}" data-s="sensitivity" />
        <span>Invert look</span><select data-s="invertY"><option value="0" ${!settings.invertY ? "selected" : ""}>No</option><option value="1" ${settings.invertY ? "selected" : ""}>Yes</option></select>
        <span>Graphics</span><select data-s="quality">${["high", "medium", "low"].map((q) => `<option ${settings.quality === q ? "selected" : ""}>${q}</option>`).join("")}</select>
      </div>
      <div class="controls">
        <kbd>WASD</kbd><span>Move · <kbd>Shift</kbd> run · <kbd>Z</kbd> walk · <kbd>Space</kbd> jump</span>
        <kbd>LMB</kbd><span>Strike (tap for combos, hold and release for heavy)</span>
        <kbd>RMB</kbd><span>Block — block just as a blow lands to parry</span>
        <kbd>C</kbd><span>Dodge roll</span>
        <kbd>Q</kbd><span>Draw / sheathe — sheathed means bare-handed</span>
        <kbd>F</kbd><span>Special technique</span>
        <kbd>E</kbd><span>Talk, interact, pick up</span>
        <kbd>1 2 3</kbd><span>Quick items: healing, tea, sake</span>
        <kbd>M</kbd><span>Map · <kbd>J</kbd> journal and bag</span>
      </div>
      <p style="font:400 12px/1.5 var(--sans);color:var(--paper-3);margin:14px 0 0">${esc(aiStatus)}</p>
      <div class="items" style="margin-top:10px"><button class="btn small" data-a="reset">Erase save and start over</button></div>`;
    ui().appendChild(this.root);
    this.root.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.a as keyof typeof handlers;
        if (a === "reset" && !confirm("Erase your saved journey?")) return;
        (handlers[a] as () => void)();
      }),
    );
    const read = (): Settings => {
      const v = (k: string) => (this.root.querySelector(`[data-s="${k}"]`) as HTMLInputElement).value;
      return { volume: Number(v("volume")), music: v("music") === "1", sensitivity: Number(v("sensitivity")), invertY: v("invertY") === "1", quality: v("quality") as Settings["quality"] };
    };
    this.root.querySelectorAll("[data-s]").forEach((e) => e.addEventListener("input", () => handlers.settings(read())));
  }

  destroy() {
    this.root.remove();
  }
}

// ——— full map ——————————————————————————————————————————————————————————————

export class MapPanel {
  readonly root: HTMLDivElement;
  private c: HTMLCanvasElement;
  constructor(base: HTMLCanvasElement, player: THREE.Vector3, yaw: number, markers: { x: number; z: number; kind: string }[], onClose: () => void) {
    this.root = el("div", "mapview interactive");
    this.c = document.createElement("canvas");
    this.root.appendChild(this.c);
    this.root.appendChild(el("div", "legend", "You are the white arrow · red: marked destination · gold: task"));
    const close = el("button", "btn small close", "Close (M)");
    close.addEventListener("click", onClose);
    this.root.appendChild(close);
    ui().appendChild(this.root);
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.c.width = w * devicePixelRatio;
    this.c.height = h * devicePixelRatio;
    const g = this.c.getContext("2d")!;
    g.scale(devicePixelRatio, devicePixelRatio);
    g.fillStyle = "#e9dfc8";
    g.fillRect(0, 0, w, h);
    // Fit the valley's interesting middle.
    const [cx, cy] = toMap(-10, -20);
    const span = MAP_PX * 0.72;
    const k = Math.min(w, h) / span;
    const ox = w / 2 - cx * k;
    const oy = h / 2 - cy * k;
    g.save();
    g.translate(ox, oy);
    g.scale(k, k);
    g.globalAlpha = 0.95;
    g.drawImage(base, 0, 0);
    g.globalAlpha = 1;
    g.restore();
    const P = (x: number, z: number): [number, number] => {
      const [mx, my] = toMap(x, z);
      return [mx * k + ox, my * k + oy];
    };
    g.textAlign = "center";
    g.font = "600 16px 'Cormorant Garamond', Georgia, serif";
    const minor = new Set(["apothecary", "armorer", "general_store", "noodle_stall"]);
    for (const pl of PLACES) {
      if (minor.has(pl.id)) continue;
      const [x, y] = P(pl.x, pl.z);
      g.fillStyle = "#1d1a16";
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      const name = pl.name.replace(/^the /, "");
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      g.lineWidth = 4;
      g.strokeStyle = "#efe6d2";
      g.strokeText(label, x, y - 8);
      g.fillStyle = "#1d1a16";
      g.fillText(label, x, y - 8);
    }
    for (const m of markers) {
      const [x, y] = P(m.x, m.z);
      g.fillStyle = m.kind === "quest" ? "#c9a24a" : "#c3432a";
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
    }
    const [px, py] = P(player.x, player.z);
    g.save();
    g.translate(px, py);
    g.rotate(-yaw + Math.PI);
    g.fillStyle = "#fff";
    g.strokeStyle = "#1d1a16";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.fillStyle = "#1d1a16";
    g.font = "600 30px 'Cormorant Garamond', Georgia, serif";
    g.textAlign = "left";
    g.fillText("Kazemura", 24, 42);
    g.font = "500 12px 'Geist Sans', sans-serif";
    g.fillText("N ↑", 26, 64);
  }

  destroy() {
    this.root.remove();
  }
}

// ——— chō-han ——————————————————————————————————————————————————————————————

export class ChohanPanel {
  readonly root: HTMLDivElement;
  private bet = 10;
  private call: "cho" | "han" | null = null;
  private rolling = false;

  constructor(private money: () => number, private play: (bet: number, call: "cho" | "han") => { dice: [number, number]; win: boolean } | null, private sound: (s: "dice" | "coin" | "error") => void, private onClose: () => void) {
    this.root = el("div", "panel chohan interactive");
    ui().appendChild(this.root);
    this.render("Chiyo shakes the cup. Even is chō, odd is han.");
  }

  private render(result: string, dice: [number, number] | null = null) {
    this.root.innerHTML = `<div class="eyebrow">Tea house</div><h2>Chō-han</h2>
      <div class="dice"><div class="die ${this.rolling ? "roll" : ""}">${dice ? dice[0] : "?"}</div><div class="die ${this.rolling ? "roll" : ""}">${dice ? dice[1] : "?"}</div></div>
      <div class="result">${esc(result)}</div>
      <div class="bets">${[10, 50, 100].map((b) => `<button class="btn small ${this.bet === b ? "on" : ""}" data-bet="${b}">${b} mon</button>`).join("")}</div>
      <div class="bets"><button class="btn ${this.call === "cho" ? "on" : ""}" data-call="cho">丁 Chō (even)</button><button class="btn ${this.call === "han" ? "on" : ""}" data-call="han">半 Han (odd)</button></div>
      <div class="bets"><button class="btn primary" data-roll>Roll</button><button class="btn" data-leave>Leave</button></div>
      <p style="font:400 12px/1.4 var(--sans);color:var(--paper-3)">Purse: ${this.money()} mon. Win pays double.</p>`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-bet]").forEach((b) => b.addEventListener("click", () => ((this.bet = Number(b.dataset.bet)), this.render(result, dice))));
    this.root.querySelectorAll<HTMLButtonElement>("[data-call]").forEach((b) => b.addEventListener("click", () => ((this.call = b.dataset.call as "cho" | "han"), this.render(result, dice))));
    this.root.querySelector("[data-roll]")!.addEventListener("click", () => this.roll());
    this.root.querySelector("[data-leave]")!.addEventListener("click", () => this.onClose());
  }

  private roll() {
    if (this.rolling) return;
    if (!this.call) return this.render("Call chō or han first.");
    if (this.money() < this.bet) {
      this.sound("error");
      return this.render("You can't cover that bet.");
    }
    this.rolling = true;
    this.sound("dice");
    this.render("The dice rattle in the cup…");
    setTimeout(() => {
      this.rolling = false;
      const r = this.play(this.bet, this.call!);
      if (!r) return this.render("You can't cover that bet.");
      const sum = r.dice[0] + r.dice[1];
      if (r.win) this.sound("coin");
      this.render(`${sum} — ${sum % 2 === 0 ? "chō" : "han"}. ${r.win ? `You win ${this.bet * 2} mon!` : "The house wins."}`, r.dice);
    }, 1100);
  }

  destroy() {
    this.root.remove();
  }
}

// ——— defeat ——————————————————————————————————————————————————————————————————

export function showDefeat(text: string, sub: string, onContinue: () => void) {
  const d = el("div", "defeat", `<div><b>${esc(text)}</b><p>${esc(sub)}</p><button class="btn primary">Wake up</button></div>`);
  ui().appendChild(d);
  d.querySelector("button")!.addEventListener("click", () => {
    d.remove();
    onContinue();
  });
}
