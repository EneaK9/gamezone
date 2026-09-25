// Heads-up display.

import * as THREE from "three";
import { ITEMS } from "../../shared/items";
import { PLACE_BY_ID } from "../../shared/places";
import { el, esc, ui } from "./dom";
import { MAP_PX, toMap } from "./mapArt";

export interface HudState {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  money: number;
  honor: number;
  clock: string;
  period: string;
  day: number;
  heading: number; // camera yaw
  player: THREE.Vector3;
  playerYaw: number;
  weaponLabel: string;
  weaponGlyph: string;
  drawn: boolean;
  specialName: string;
  specialCd: number;
  specialMax: number;
  quick: { key: string; id: string | null; count: number }[];
  aiMode: string;
  markers: { x: number; z: number; kind: "place" | "quest" }[];
  dots: { x: number; z: number; kind: "npc" | "hostile" | "shop" }[];
}

export interface Label {
  id: string;
  text: string;
  sub: string;
  pos: THREE.Vector3;
  hostile: boolean;
  hp?: number;
  show: boolean;
}

export class Hud {
  readonly root: HTMLDivElement;
  private hpBar: HTMLElement;
  private hpLag: HTMLElement;
  private stBar: HTMLElement;
  private money: HTMLElement;
  private honor: HTMLElement;
  private nameEl: HTMLElement;
  private clockEl: HTMLElement;
  private periodEl: HTMLElement;
  private jevEl: HTMLElement;
  private strip: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniG: CanvasRenderingContext2D;
  private weaponEl: HTMLElement;
  private promptEl: HTMLElement;
  private toastsEl: HTMLElement;
  private labelsEl: HTMLElement;
  private helpEl: HTMLElement;
  private lockEl: HTMLElement;
  private labelEls = new Map<string, HTMLDivElement>();
  private mapImage: HTMLCanvasElement | null = null;

  constructor() {
    this.root = el("div", "hud");
    this.root.innerHTML = `
      <div class="vitals">
        <div class="name"><span class="nm"></span><small class="tt"></small></div>
        <div class="meter lag"><i class="lag"></i><i class="hp"></i></div>
        <div class="meter st"><i class="stv"></i></div>
        <div class="purse"><span><i class="coin"></i><b class="mon">0</b>&nbsp;mon</span><span><i class="honor-dot"></i><b class="hon">50</b>&nbsp;honor</span></div>
      </div>
      <div class="compass"><div class="strip"></div><div class="centre"></div></div>
      <div class="clock"><b class="time">15:00</b><span class="period">Afternoon</span><div class="jev"></div></div>
      <div class="toasts"></div>
      <div class="labels"></div>
      <div class="prompt hidden"></div>
      <div class="weapon"></div>
      <div class="minimap"><canvas width="340" height="340"></canvas></div>
      <div class="help">
        <div><kbd>WASD</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>C</kbd> dodge</div>
        <div><kbd>E</kbd> talk / interact · <kbd>Q</kbd> draw / sheathe · <kbd>F</kbd> special</div>
        <div><kbd>LMB</kbd> strike · hold for heavy · <kbd>RMB</kbd> block</div>
        <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> items · <kbd>M</kbd> map · <kbd>J</kbd> journal · <kbd>Esc</kbd> menu</div>
      </div>
      <div class="lockhint hidden">Click to look around</div>`;
    ui().appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.hpBar = q(".hp");
    this.hpLag = q(".lag i.lag") ?? q("i.lag");
    this.stBar = q(".stv");
    this.money = q(".mon");
    this.honor = q(".hon");
    this.nameEl = q(".vitals .name");
    this.clockEl = q(".time");
    this.periodEl = q(".period");
    this.jevEl = q(".jev");
    this.strip = q(".strip");
    this.mini = q(".minimap canvas");
    this.miniG = this.mini.getContext("2d")!;
    this.weaponEl = q(".weapon");
    this.promptEl = q(".prompt");
    this.toastsEl = q(".toasts");
    this.labelsEl = q(".labels");
    this.helpEl = q(".help");
    this.lockEl = q(".lockhint");
    // Compass ticks: 0° = north (−z).
    const marks: string[] = [];
    for (let d = -360; d <= 720; d += 15) {
      const dd = ((d % 360) + 360) % 360;
      const name = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" }[dd as 0];
      marks.push(`<span class="tick ${name && name.length === 1 ? "major" : ""}" style="left:${d * 3}px">${name ?? "·"}</span>`);
    }
    this.strip.innerHTML = marks.join("");
    setTimeout(() => (this.helpEl.style.opacity = "0"), 45000);
  }

  setMapImage(c: HTMLCanvasElement) {
    this.mapImage = c;
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? "" : "none";
  }

  dim(d: boolean) {
    this.root.classList.toggle("dim", d);
  }

  hideHelp() {
    this.helpEl.style.opacity = "0";
  }

  update(s: HudState, locked: boolean) {
    this.nameEl.querySelector(".nm")!.textContent = s.name;
    this.nameEl.querySelector(".tt")!.textContent = s.title;
    const hp = Math.max(0, s.hp / s.maxHp) * 100;
    this.hpBar.style.setProperty("--v", `${hp}%`);
    this.hpLag.style.setProperty("--v", `${hp}%`);
    this.stBar.style.setProperty("--v", `${(s.stamina / s.maxStamina) * 100}%`);
    this.money.textContent = String(s.money);
    this.honor.textContent = String(Math.round(s.honor));
    this.clockEl.textContent = s.clock;
    this.periodEl.textContent = `${s.period} · Day ${s.day}`;
    this.jevEl.textContent = s.aiMode;
    this.lockEl.classList.toggle("hidden", locked);

    // Compass: heading in degrees clockwise from north.
    const heading = ((((-s.heading * 180) / Math.PI) % 360) + 360) % 360;
    this.strip.style.transform = `translateX(${-heading * 3}px)`;
    // Markers on the strip.
    this.strip.querySelectorAll(".mark").forEach((m) => m.remove());
    for (const m of s.markers) {
      const bearing = ((Math.atan2(m.x - s.player.x, -(m.z - s.player.z)) * 180) / Math.PI + 360) % 360;
      for (const off of [-360, 0, 360]) {
        const e = el("i", `mark ${m.kind === "quest" ? "quest" : ""}`);
        e.style.left = `${(bearing + off) * 3}px`;
        this.strip.appendChild(e);
      }
    }

    // Weapon, special and items.
    const cdPct = s.specialMax > 0 ? (s.specialCd / s.specialMax) * 100 : 0;
    this.weaponEl.innerHTML = `
      <div class="slot"><kbd>Q</kbd><div><div class="big">${s.weaponGlyph}</div>${esc(s.drawn ? "Drawn" : "Sheathed")}</div></div>
      <div class="slot ${s.specialCd <= 0 ? "ready" : ""}"><kbd>F</kbd><div class="cd" style="--p:${cdPct}%"></div><div><div class="big">技</div>${s.specialCd > 0 ? Math.ceil(s.specialCd) + "s" : "Ready"}</div></div>
      ${s.quick
        .map(
          (q) => `<div class="slot"><kbd>${q.key}</kbd><div>${q.id ? esc(ITEMS[q.id].name.split(" ")[0]) : "—"}</div>${q.id ? `<span class="count">${q.count}</span>` : ""}</div>`,
        )
        .join("")}`;
    this.drawMinimap(s);
  }

  private drawMinimap(s: HudState) {
    const g = this.miniG;
    const W = this.mini.width;
    g.clearRect(0, 0, W, W);
    if (!this.mapImage) return;
    const [px, py] = toMap(s.player.x, s.player.z);
    const zoom = 1.6;
    const view = W / zoom;
    g.save();
    g.drawImage(this.mapImage, px - view / 2, py - view / 2, view, view, 0, 0, W, W);
    const P = (x: number, z: number): [number, number] => {
      const [mx, my] = toMap(x, z);
      return [(mx - px) * zoom + W / 2, (my - py) * zoom + W / 2];
    };
    for (const d of s.dots) {
      const [x, y] = P(d.x, d.z);
      g.fillStyle = d.kind === "hostile" ? "#e2623f" : d.kind === "shop" ? "#d9b25a" : "#f4efe4";
      g.beginPath();
      g.arc(x, y, d.kind === "hostile" ? 5 : 4, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of s.markers) {
      const [x, y] = P(m.x, m.z);
      const cx = Math.max(12, Math.min(W - 12, x));
      const cy = Math.max(12, Math.min(W - 12, y));
      g.fillStyle = m.kind === "quest" ? "#d9b25a" : "#e2623f";
      g.beginPath();
      g.arc(cx, cy, 7, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow.
    g.translate(W / 2, W / 2);
    g.rotate(-s.playerYaw + Math.PI);
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(8, 9);
    g.lineTo(0, 4);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.restore();
    void MAP_PX;
  }

  prompt(text: string | null, sub = "") {
    if (!text) {
      this.promptEl.classList.add("hidden");
      return;
    }
    this.promptEl.classList.remove("hidden");
    this.promptEl.innerHTML = `<kbd>E</kbd>${esc(text)}${sub ? ` <small>${esc(sub)}</small>` : ""}`;
  }

  toast(text: string, tone: "good" | "bad" | "info" = "info", ms = 4200) {
    const t = el("div", `toast ${tone}`, esc(text));
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 600);
    }, ms);
  }

  banner(title: string, sub = "") {
    const b = el("div", "flash-banner", `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}`);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), 3100);
  }

  damage(screen: { x: number; y: number }, text: string, kind: "hit" | "crit" | "block" = "hit") {
    const d = el("div", `dmg ${kind === "hit" ? "" : kind}`, esc(text));
    d.style.left = `${screen.x}px`;
    d.style.top = `${screen.y}px`;
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 950);
  }

  labels(list: Label[], camera: THREE.Camera) {
    const seen = new Set<string>();
    const v = new THREE.Vector3();
    for (const l of list) {
      if (!l.show) continue;
      v.copy(l.pos).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      seen.add(l.id);
      let e = this.labelEls.get(l.id);
      if (!e) {
        e = el("div", "label");
        this.labelsEl.appendChild(e);
        this.labelEls.set(l.id, e);
      }
      e.classList.toggle("hostile", l.hostile);
      const hpHtml = l.hp !== undefined ? `<div class="hp"><i style="width:${Math.max(0, l.hp) * 100}%"></i></div>` : "";
      const html = `<b>${esc(l.text)}</b><span>${esc(l.sub)}</span>${hpHtml}`;
      if (e.dataset.html !== html) {
        e.innerHTML = html;
        e.dataset.html = html;
      }
      e.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      e.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
    for (const [id, e] of this.labelEls) {
      if (!seen.has(id)) {
        e.remove();
        this.labelEls.delete(id);
      }
    }
  }

  static placeMarker(id: string) {
    const p = PLACE_BY_ID[id];
    return p ? { x: p.x, z: p.z, kind: "place" as const } : null;
  }
}
