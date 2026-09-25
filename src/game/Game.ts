// Orchestrates the whole game: boot, character select, play, conversations, fights,
// services, quests, day and night, saving.

import * as THREE from "three";
import { ITEMS } from "../../shared/items";
import { ALL_NPCS, NPC_BY_ID } from "../../shared/npcs";
import { PLACE_BY_ID, PLACES } from "../../shared/places";
import { QUESTS } from "../../shared/quests";
import { DEFAULT_CHARACTER, ROSTER_BY_ID, type RosterEntry } from "../../shared/roster";
import type { Look } from "../../shared/look";
import type { TalkRequest } from "../../shared/talk-types";
import { Character } from "../characters/Character";
import { setFabricNormal } from "../characters/material";
import { Assets } from "../core/assets";
import { Audio } from "../core/audio";
import { Input } from "../core/input";
import { clamp, damp, makeRng } from "../core/math";
import type { Actor } from "../entities/Actor";
import type { StrikeResult } from "../entities/combat";
import { Npc } from "../entities/Npc";
import { Player } from "../entities/Player";
import { Materials } from "../render/materials";
import { Renderer } from "../render/renderer";
import { Sky } from "../render/sky";
import { DialogueDirector, type DirectorAction, type Turn } from "../systems/dialogue";
import { Effects } from "../systems/effects";
import { Quests } from "../systems/quests";
import { TalkClient } from "../systems/talkClient";
import { DayNight } from "../systems/time";
import { DialogueUI } from "../ui/dialogueUI";
import { el, esc, ui } from "../ui/dom";
import { Hud, type Label } from "../ui/hud";
import { LoadingScreen } from "../ui/loading";
import { paintMap } from "../ui/mapArt";
import { ChohanPanel, JournalPanel, MapPanel, MenuPanel, ShopPanel, showDefeat, type Settings } from "../ui/panels";
import { SelectScreen } from "../ui/select";
import { BANDIT_CAMP, RIVER, SPAWN } from "../world/layout";
import { NavGrid } from "../world/nav";
import { World } from "../world/World";
import { CameraRig } from "./camera";
import { Cat } from "./cat";
import type { GameCtx } from "./context";
import { GameState } from "./state";

type Mode = "loading" | "select" | "play" | "dialogue" | "menu" | "map" | "journal" | "chohan" | "dead" | "sleep" | "notice";

const SETTINGS_KEY = "kazemura.settings";
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

interface Conversation {
  npc: Npc;
  director: DialogueDirector;
  ui: DialogueUI;
  shop: ShopPanel | null;
  highlight?: string;
  endAt: number | null;
}

export class Game {
  private canvas = document.getElementById("game") as HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2500);
  private renderer!: Renderer;
  private sky!: Sky;
  private time = new DayNight(15.2);
  private sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  private assets = new Assets();
  private materials!: Materials;
  private world!: World;
  private nav!: NavGrid;
  private effects = new Effects();
  private audio = new Audio();
  private input = new Input(this.canvas);
  private rig!: CameraRig;
  private hud!: Hud;
  private talk = new TalkClient();
  private state: GameState = new GameState();
  private quests = new Quests(this.state);
  private player: Player | null = null;
  private npcs: Npc[] = [];
  private extra: Actor[] = [];
  private actors: Actor[] = [];
  private mode: Mode = "loading";
  private selectScreen: SelectScreen | null = null;
  private preview: Character | null = null;
  private previewId = DEFAULT_CHARACTER;
  private convo: Conversation | null = null;
  private panel: { destroy(): void } | null = null;
  private marker: string | null = null;
  private mapBase: HTMLCanvasElement | null = null;
  private seconds = 0;
  private clockSeconds = 0;
  private hitStop = 0;
  private flash = 0;
  private wantedT = 0;
  private attackTokens = new Set<Actor>();
  private cat = new Cat();
  private charmGlintT = 0;
  private lastArea = "";
  private areaCooldown = 0;
  private autosaveT = 30;
  private rng = makeRng(123);
  private settings: Settings = { volume: 0.8, music: true, sensitivity: 1, invertY: false, quality: "high" };
  private ctx!: GameCtx;
  private last = performance.now();
  private hpShown = 1;

  async boot() {
    const loading = new LoadingScreen();
    this.loadSettings();
    this.renderer = new Renderer(this.canvas, this.scene, this.camera);
    this.renderer.setQuality(this.settings.quality);
    this.sky = new Sky(this.renderer.gl);
    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.FogExp2(0xdde6e6, 0.002);
    this.setupLights();

    await this.assets.load((f, label) => loading.progress(f * 0.6, f < 1 ? `Unpacking ${label.replace(/_/g, " ")}` : "Unpacking textures"));
    const cloth = this.assets.tex("terry_cloth").normalMap.clone();
    cloth.repeat.set(1.3, 1.3);
    cloth.needsUpdate = true;
    setFabricNormal(cloth);
    this.materials = new Materials(this.assets);

    loading.progress(0.62, "Raising the hills and the rooftops");
    await nextFrame();
    this.world = new World(this.assets, this.materials);
    this.scene.add(this.world.group);
    this.scene.add(this.effects.group);
    loading.progress(0.8, "Teaching the villagers their paths");
    await nextFrame();
    this.nav = new NavGrid(this.world);
    this.rig = new CameraRig(this.camera, this.world);
    // Losing the mouse while playing (Esc, alt-tab) pauses the game.
    this.input.onUnlock = () => {
      if (this.mode === "play") this.openMenu();
    };
    this.hud = new Hud();
    this.hud.setVisible(false);
    this.ctx = this.makeCtx();

    loading.progress(0.86, "Waking the village");
    await nextFrame();
    for (const def of ALL_NPCS) {
      const n = new Npc(def, this.ctx);
      this.npcs.push(n);
      this.scene.add(n.actor.character.root);
    }
    this.cat.place(106.6, 44.5, this.world);
    this.cat.root.visible = false;
    this.scene.add(this.cat.root);

    loading.progress(0.92, "Painting the map");
    await nextFrame();
    this.mapBase = paintMap(this.world, false);
    this.hud.setMapImage(this.mapBase);

    loading.progress(0.97, "Lighting the lanterns");
    await nextFrame();
    const saved = GameState.load();
    if (saved) {
      this.previewId = saved.data.characterId;
      this.time.hour = 16.8;
    } else this.time.hour = 16.8;
    this.showSelect(!!saved);
    this.updateEnvironment(0);
    this.renderer.gl.compile(this.scene, this.camera);
    this.renderer.render(0.016);
    await nextFrame();
    loading.progress(1, "Ready");
    document.body.dataset.boot = "ready";
    setTimeout(() => loading.hide(), 300);
    this.loop();
  }

  private setupLights() {
    this.sun.castShadow = true;
    const q = this.settings.quality;
    this.sun.shadow.mapSize.set(q === "high" ? 4096 : q === "medium" ? 2048 : 1024, q === "high" ? 4096 : q === "medium" ? 2048 : 1024);
    const c = this.sun.shadow.camera;
    c.left = -45;
    c.right = 45;
    c.top = 45;
    c.bottom = -45;
    c.near = 1;
    c.far = 320;
    this.sun.shadow.radius = 2.5;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);
  }

  private loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (s) this.settings = { ...this.settings, ...s };
    } catch {
      /* defaults */
    }
  }

  private applySettings(s: Settings) {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    this.audio.setVolume(s.volume);
    this.audio.musicOn = s.music;
    this.rig.sensitivity = s.sensitivity;
    this.rig.invertY = s.invertY;
    if (qualityChanged) {
      this.renderer.setQuality(s.quality);
      const size = s.quality === "high" ? 4096 : s.quality === "medium" ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
  }

  private makeCtx(): GameCtx {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const game = this;
    return {
      world: this.world,
      nav: this.nav,
      effects: this.effects,
      audio: this.audio,
      time: this.time,
      get now() {
        return game.clockSeconds;
      },
      get player() {
        return game.player!.actor;
      },
      get actors() {
        return game.actors;
      },
      attackTokens: this.attackTokens,
      canHit: (a, t) => this.canHit(a, t),
      onStrike: (a, r, k) => this.onStrike(a, r, k),
      addActor: (a) => {
        this.extra.push(a);
        this.scene.add(a.character.root);
      },
      removeActor: (a) => {
        this.extra = this.extra.filter((x) => x !== a);
        a.character.root.removeFromParent();
      },
    } as GameCtx;
  }

  // ——— character select ——————————————————————————————————————————————————————

  private showSelect(hasSave: boolean, inGame = false) {
    this.mode = "select";
    this.hud?.setVisible(false);
    this.input.exitLock();
    this.input.gameplay = false;
    this.setPreview(this.previewId);
    this.selectScreen = new SelectScreen(this.previewId, hasSave, {
      pick: (id) => this.setPreview(id),
      begin: (id, fresh) => this.begin(id, fresh),
      back: () => {
        this.selectScreen?.destroy();
        this.selectScreen = null;
        this.clearPreview();
        this.mode = "play";
        this.hud.setVisible(true);
        this.input.gameplay = true;
      },
    }, inGame);
  }

  private previewSpot = new THREE.Vector3(60, 0, 0);

  private setPreview(id: string) {
    this.previewId = id;
    this.clearPreview();
    const r = ROSTER_BY_ID[id];
    const c = new Character(r.look, r.weapon);
    const x = 41.2;
    const z = 14.5;
    this.previewSpot.set(x, this.world.groundHeight(x, z), z);
    c.root.position.copy(this.previewSpot);
    c.root.rotation.y = -2.3;
    c.setDrawn(r.weapon !== "fists");
    this.scene.add(c.root);
    this.preview = c;
    // Settle into the stance.
    for (let i = 0; i < 30; i++) c.update(1 / 30);
  }

  private clearPreview() {
    if (this.preview) {
      this.preview.dispose();
      this.preview = null;
    }
  }

  private begin(id: string, fresh: boolean) {
    this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.audio.musicOn = this.settings.music;
    this.rig.sensitivity = this.settings.sensitivity;
    this.rig.invertY = this.settings.invertY;
    const inGame = !!this.player;
    if (!inGame) {
      if (fresh) {
        GameState.clear();
        this.state.data = new GameState().data;
        this.state.data.characterId = id;
      } else {
        const s = GameState.load();
        if (s) this.state.data = s.data;
        this.state.data.characterId = id;
      }
      this.time.hour = this.state.data.hour;
      this.time.day = this.state.data.day;
    } else {
      this.state.data.characterId = id;
      this.state.data.weapon = "signature";
    }
    this.selectScreen?.destroy();
    this.selectScreen = null;
    this.clearPreview();
    this.spawnPlayer(ROSTER_BY_ID[id], inGame);
    this.mode = "play";
    this.hud.setVisible(true);
    this.input.gameplay = true;
    this.input.requestLock();
    this.restoreWorldState();
    if (!inGame) {
      this.hud.banner("Kazemura", fresh ? "The river brought you here. Your purse holds 120 mon." : `Day ${this.time.day}`);
      if (fresh) setTimeout(() => this.hud.toast("Tip: walk up to anyone and press E. Type whatever you want to say.", "info", 8000), 3500);
    } else {
      this.hud.toast(`You are now ${ROSTER_BY_ID[id].name}.`, "info");
    }
    this.state.save();
  }

  /** Build the player's look including worn armor and a cosmetic. */
  private playerLook(entry: RosterEntry): Look {
    const look: Look = JSON.parse(JSON.stringify(entry.look));
    const d = this.state.data;
    if (d.armor === "padded_jacket") look.garments.push({ kind: "haori", color: "#2f3a52", sleeveless: true });
    if (d.armor === "lamellar_do") look.garments.push({ kind: "do_armor", color: "#2b2b2e", lacing: "#3a5a8a" });
    if (d.armor === "o_yoroi") look.garments.push({ kind: "do_armor", color: "#6e1f1a", lacing: "#d9b25a" });
    const cos = d.cosmetic ? ITEMS[d.cosmetic]?.cosmetic : null;
    if (cos === "straw_hat") look.headgear = "kasa";
    if (cos === "kitsune_mask") look.headgear = "kitsune_mask";
    if (cos === "oni_mask") look.headgear = "oni_mask";
    if (cos === "hachimaki") look.headgear = "hachimaki";
    return look;
  }

  private spawnPlayer(entry: RosterEntry, keepPlace: boolean) {
    const old = this.player;
    const p = new Player(entry, this.state, this.playerLook(entry));
    p.actor.lethal = false;
    p.actor.onDown = () => this.onPlayerDown();
    if (old && keepPlace) {
      p.actor.place(old.actor.pos.x, old.actor.pos.z, old.actor.yaw, this.world);
      p.actor.hp = Math.min(p.actor.maxHp, (old.actor.hp / old.actor.maxHp) * p.actor.maxHp);
      old.clones?.dispose(this.ctx);
      old.actor.character.dispose();
    } else if (this.state.data.position) {
      const pos = this.state.data.position;
      p.actor.place(pos.x, pos.z, pos.yaw, this.world);
    } else {
      p.actor.place(SPAWN.x, SPAWN.z, SPAWN.facing, this.world);
    }
    this.scene.add(p.actor.character.root);
    this.player = p;
    this.rig.yaw = p.actor.yaw + Math.PI;
    if (p.weaponId !== "fists" && this.state.data.weapon === "signature") p.actor.character.setDrawn(false);
  }

  private refreshPlayerLook() {
    if (!this.player) return;
    const look = this.playerLook(this.player.entry);
    const c = this.player.actor.character;
    c.rebuild(look);
    c.setWeapon(this.state.weaponId);
    this.player.applyStats();
  }

  private restoreWorldState() {
    // Defeated bandits stay defeated; the cat is where the quest says.
    for (const n of this.npcs) {
      if ((n.def.role === "bandit" || n.def.role === "chief") && this.state.fact(`defeated:${n.def.id}`)) {
        n.actor.alive = false;
        n.actor.character.root.visible = false;
      }
    }
    const mochi = this.state.quest("mochi");
    if (mochi?.stage === "done") {
      this.cat.root.visible = true;
      this.cat.place(-35, -4, this.world);
      this.cat.home = new THREE.Vector3(-35, 0, -4);
    } else if (mochi?.stage === "active") {
      this.cat.root.visible = true;
      if (this.state.fact("cat_following") && this.player) {
        this.cat.following = { pos: this.player.actor.pos };
        this.cat.place(this.player.actor.pos.x + 1, this.player.actor.pos.z, this.world);
      }
    }
  }

  // ——— the loop ——————————————————————————————————————————————————————————————————

  private loop = () => {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.seconds += dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.12;
    }
    this.clockSeconds += dt;
    try {
      this.frame(dt);
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };

  private frame(dt: number) {
    const input = this.input;
    if (this.mode === "select") {
      this.time.paused = true;
      this.updateSelect(dt);
      this.updateEnvironment(dt);
      this.renderer.render(dt);
      return;
    }
    this.time.paused = this.mode === "dialogue" || this.mode === "menu" || this.mode === "sleep" || this.mode === "dead" || this.mode === "chohan" || this.mode === "notice";
    const p = this.player;
    if (!p) return;

    // Menus and toggles.
    if (input.wasPressed("menu")) {
      if (this.mode === "play") this.openMenu();
      else if (this.mode === "menu" || this.mode === "map" || this.mode === "journal" || this.mode === "notice") this.closePanel();
    }
    if (input.wasPressed("map") && (this.mode === "play" || this.mode === "map")) this.mode === "map" ? this.closePanel() : this.openMap();
    if (input.wasPressed("journal") && (this.mode === "play" || this.mode === "journal")) this.mode === "journal" ? this.closePanel() : this.openJournal();

    const playing = this.mode === "play";
    input.gameplay = playing;
    if (playing) {
      this.rig.input(input.mouseDX, input.mouseDY, input.wheel);
      p.update(dt, this.ctx, input, this.rig);
      if (input.wasPressed("interact")) this.interact();
      if (input.wasPressed("item1")) this.quickUse(0);
      if (input.wasPressed("item2")) this.quickUse(1);
      if (input.wasPressed("item3")) this.quickUse(2);
      if (input.wasPressed("attack") || input.wasPressed("special")) this.hud.hideHelp();
    } else {
      p.actor.moveDir.set(0, 0, 0);
      p.actor.wantSpeed = 0;
    }
    if (this.mode !== "menu" && this.mode !== "map" && this.mode !== "journal") {
      p.actor.update(dt, this.world);
    }

    // Everyone else.
    this.actors.length = 0;
    this.actors.push(p.actor, ...this.extra);
    const cam = this.camera.position;
    for (const n of this.npcs) {
      if (!n.actor.alive && !n.actor.character.root.visible) continue;
      const d = n.actor.pos.distanceTo(p.actor.pos);
      const visible = d < 115 || n.mode === "fight";
      n.actor.character.root.visible = visible && (n.actor.alive || n.actor.age - n.actor.lastHitAt < 30);
      if (!visible && n.mode !== "fight") continue;
      this.actors.push(n.actor);
    }
    const frozen = this.mode === "menu" || this.mode === "map" || this.mode === "journal";
    if (!frozen) {
      for (const n of this.npcs) {
        if (!n.actor.character.root.visible && n.mode !== "fight") continue;
        const d = n.actor.pos.distanceTo(p.actor.pos);
        // Far NPCs think less often.
        if (d > 50 && (Math.floor(this.seconds * 30) + n.def.id.length) % 3 !== 0 && n.mode !== "fight") continue;
        n.update(d > 50 ? dt * 3 : dt, this.ctx);
      }
      for (const a of this.extra) a.update(dt, this.world);
      this.cat.update(dt, this.world, this.seconds);
      this.updateWorldLogic(dt);
    }
    // Clean up attack tokens.
    for (const a of this.attackTokens) if (!a.alive || a.downed) this.attackTokens.delete(a);

    if (this.convo) this.updateConversation(dt);

    // Camera.
    this.rig.update(dt, p.actor.pos, p.actor.height);
    this.updateEnvironment(dt);
    this.effects.update(dt);
    this.updateHud(dt);
    this.audio.update({
      riverDist: this.riverDistance(p.actor.pos),
      night: this.time.palette.night,
      combat: this.inCombat(),
    });
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.renderer.grade.uniforms.uFlash.value = this.flash;
    this.renderer.render(dt);

    this.autosaveT -= dt;
    if (this.autosaveT <= 0 && this.mode === "play") {
      this.autosaveT = 30;
      this.saveNow();
    }
  }

  private updateSelect(dt: number) {
    const c = this.preview;
    if (!c) return;
    c.update(dt);
    // Sweep slowly back and forth so the bridge and river stay behind the character.
    const t = Math.sin(this.seconds * 0.16) * 0.55;
    const r = 3.6;
    const base = -2.35;
    const target = this.previewSpot.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.camera.position.set(target.x + Math.sin(base + t) * r, target.y + 0.3, target.z + Math.cos(base + t) * r);
    this.camera.lookAt(target.x, target.y + 0.1, target.z);
    if (Math.floor(this.seconds) % 9 === 0 && !c.anim.busy() && this.rng.next() < dt * 0.6) {
      const r2 = ROSTER_BY_ID[this.previewId];
      const clip = r2.weapon === "fists" ? "jab" : r2.weapon === "boomstick" ? "shoot" : "slash1";
      c.anim.play(clip);
    }
    this.world.update(dt, this.time, this.camera.position, this.seconds);
    this.effects.update(dt);
    if (this.rng.next() < dt * 3) this.effects.petals(this.previewSpot.clone().add(new THREE.Vector3(0, 2, 0)), 1, 5);
  }

  private updateEnvironment(dt: number) {
    this.time.update(dt);
    const pal = this.time.palette;
    this.sky.update(this.time, this.seconds);
    this.sky.refreshEnvironment(this.scene, this.time);
    this.sun.color.copy(pal.sun);
    this.sun.intensity = pal.sunIntensity;
    const focus = this.player && this.mode !== "select" ? this.player.actor.pos : this.previewSpot;
    // Texel-snapped shadow frustum around the focus.
    const texel = (90 / this.sun.shadow.mapSize.x) * 2;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.time.lightDir, 140);
    this.hemi.color.copy(pal.hemiSky);
    this.hemi.groundColor.copy(pal.hemiGround);
    this.hemi.intensity = pal.hemiIntensity;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(pal.fog);
    fog.density = pal.fogDensity;
    this.renderer.gl.toneMappingExposure = pal.exposure;
    if (this.mode !== "select") this.world.update(dt, this.time, this.camera.position, this.seconds);
  }

  private riverDistance(p: THREE.Vector3) {
    let best = Infinity;
    for (let i = 0; i < RIVER.length; i += 3) best = Math.min(best, Math.hypot(RIVER[i].x - p.x, RIVER[i].z - p.z) - RIVER[i].hw);
    return Math.max(0, best);
  }

  private inCombat() {
    return this.npcs.some((n) => n.mode === "fight" && n.target === this.player?.actor && n.actor.distanceTo(this.player!.actor) < 25);
  }

  // ——— world logic ————————————————————————————————————————————————————————————

  private updateWorldLogic(dt: number) {
    const p = this.player!;
    this.wantedT = Math.max(0, this.wantedT - dt);
    // Named areas.
    this.areaCooldown -= dt;
    let area = "";
    for (const pl of PLACES) {
      const r = pl.id === "square" ? 16 : pl.id === "shrine" || pl.id === "bandit_camp" || pl.id === "rice_fields" || pl.id === "bamboo_grove" ? 26 : 12;
      if (Math.hypot(pl.x - p.actor.pos.x, pl.z - p.actor.pos.z) < r) {
        area = pl.id;
        break;
      }
    }
    if (area && area !== this.lastArea && this.areaCooldown <= 0 && ["shrine", "pagoda", "bandit_camp", "rice_fields", "bamboo_grove", "dojo", "waterfall", "grand_bridge", "square", "pier"].includes(area)) {
      const pl = PLACE_BY_ID[area];
      const name = pl.name.replace(/^the /, "");
      this.hud.banner(name.charAt(0).toUpperCase() + name.slice(1), pl.description.split(",")[0]);
      this.areaCooldown = 20;
    }
    if (area) this.lastArea = area;
    if (this.marker) {
      const m = PLACE_BY_ID[this.marker];
      if (m && Math.hypot(m.x - p.actor.pos.x, m.z - p.actor.pos.z) < 8) {
        this.marker = null;
        this.hud.toast(`You've reached ${m.name}.`, "info", 2500);
      }
    }
    // The charm glints in the shallows while the task is open.
    if (this.quests.isActive("charm") && !this.state.has("lucky_charm")) {
      this.charmGlintT -= dt;
      if (this.charmGlintT <= 0) {
        this.charmGlintT = 0.35;
        this.effects.sparks(this.world.props.charmSpot.clone().add(new THREE.Vector3(0, 0.12, 0)), 2, new THREE.Color("#fff4c0"), 1.2);
      }
    }
    // Guards chase wanted players.
    if (this.wantedT > 0) {
      for (const n of this.npcs) {
        if (n.def.role !== "guard" || n.mode === "fight" || !n.actor.alive || n.actor.downed) continue;
        if (n.actor.distanceTo(p.actor) < 40) {
          n.engage(p.actor);
          n.speakT = 2;
        }
      }
    }
    // Petals drift near sakura in the village.
    if (this.rng.next() < dt * 2.5) this.effects.petals(p.actor.pos.clone().add(new THREE.Vector3(this.rng.range(-8, 8), 3, this.rng.range(-8, 8))), 2, 3);
  }

  // ——— combat rules ——————————————————————————————————————————————————————————

  private isAlly(a: Actor, b: Actor) {
    const t = (x: Actor) => (x.team === "clone" ? "player" : x.team);
    return t(a) === t(b);
  }

  private npcOf(a: Actor): Npc | undefined {
    return this.npcs.find((n) => n.actor === a);
  }

  private canHit(attacker: Actor, target: Actor): boolean {
    if (this.isAlly(attacker, target)) return false;
    if (attacker.team === "player" || attacker.team === "clone") return true;
    const an = this.npcOf(attacker);
    if (!an) return false;
    if (target.team === "player" || target.team === "clone") return an.hostileToPlayer;
    return false;
  }

  private onStrike(attacker: Actor, results: StrikeResult[], kind: string) {
    const p = this.player!;
    for (const r of results) {
      const t = r.target;
      const screen = r.point.clone().project(this.camera);
      const sx = ((screen.x + 1) / 2) * innerWidth;
      const sy = ((1 - screen.y) / 2) * innerHeight;
      const involvesPlayer = attacker === p.actor || t === p.actor;
      if (r.result === "blocked" || r.result === "parried") {
        this.audio.play(r.result === "parried" ? "parry" : "block");
        this.effects.sparks(r.point, r.result === "parried" ? 26 : 12, new THREE.Color(r.result === "parried" ? "#bfe0ff" : "#ffe0a0"), 6);
        if (involvesPlayer) this.hud.damage({ x: sx, y: sy }, r.result === "parried" ? "Parry!" : "Blocked", "block");
        if (r.result === "parried") {
          this.hitStop = 0.12;
          this.rig.addShake(0.4);
        }
        continue;
      }
      this.audio.play(kind === "blunt" || kind === "shot" ? "hitBlunt" : "hit");
      this.effects.sparks(r.point, kind === "energy" ? 20 : 10, new THREE.Color(kind === "energy" ? "#bcd8ff" : kind === "petals" ? "#ffc4d0" : "#fff0d0"), 5);
      if (involvesPlayer && kind !== "petals") this.hud.damage({ x: sx + this.rng.range(-20, 20), y: sy }, t === p.actor ? "−" : "✦", r.result === "down" || r.result === "killed" ? "crit" : "hit");
      if (t === p.actor) {
        this.flash = Math.min(1, this.flash + 0.55);
        this.rig.addShake(0.5);
        p.inCombat = 6;
      } else if (attacker === p.actor || attacker.team === "clone") {
        this.rig.addShake(kind === "special" ? 0.5 : 0.18);
        if (kind !== "petals") this.hitStop = Math.max(this.hitStop, kind === "special" ? 0.1 : 0.045);
        this.onPlayerHitNpc(t, r.result);
      }
      if (r.result === "killed") this.onKilled(t);
    }
  }

  private onPlayerHitNpc(t: Actor, result: StrikeResult["result"]) {
    const n = this.npcOf(t);
    if (!n) return;
    const p = this.player!.actor;
    if (n.def.role === "bandit" || n.def.role === "chief") {
      if (n.mode !== "fight") n.engage(p);
      return;
    }
    if (n.duel) return; // fair fight
    // Attacking a villager.
    this.state.addHonor(result === "down" ? -8 : -3);
    this.state.addDisposition(n.def.id, -30);
    if (n.def.fighter && n.def.role !== "child") {
      if (n.mode !== "fight") {
        n.engage(p);
        this.hud.toast(`${n.def.name} fights back!`, "bad");
      }
    } else {
      n.flee(p.pos, 8);
    }
    for (const o of this.npcs) {
      if (o === n || !o.actor.alive) continue;
      const d = o.actor.distanceTo(t);
      if (d < 18 && !o.def.fighter && o.def.role !== "bandit") o.flee(p.pos, 6);
    }
    if (this.wantedT <= 0) this.hud.toast("The guards are after you!", "bad");
    this.wantedT = 45;
  }

  private onKilled(t: Actor) {
    const n = this.npcOf(t);
    if (!n) return;
    const p = this.player!;
    this.state.setFact(`defeated:${n.def.id}`);
    const loot = n.loot();
    if (loot.money) this.state.addMoney(loot.money);
    for (const it of loot.items) this.state.give(it);
    const parts = [loot.money ? `${loot.money} mon` : "", ...loot.items.map((i) => ITEMS[i].name)].filter(Boolean);
    if (parts.length) this.hud.toast(`${n.def.name} defeated — ${parts.join(", ")}`, "good");
    this.audio.play("coin");
    this.attackTokens.delete(t);
    if (n.def.role === "chief") {
      this.hud.banner("Kurogane has fallen", "Report to Captain Goro at the west gate.");
      this.state.addHonor(5);
    }
    setTimeout(() => {
      n.actor.character.root.visible = false;
    }, 12000);
    p.inCombat = 4;
    this.saveNow();
  }

  private onPlayerDown() {
    const p = this.player!;
    const by = p.actor.lastHitBy ? this.npcOf(p.actor.lastHitBy) : undefined;
    // Duels: the NPC's duel handler sees us down and resolves the loss.
    if (by?.duel) return;
    const bandit = !by || by.def.role === "bandit" || by.def.role === "chief";
    this.mode = "dead";
    this.input.exitLock();
    for (const n of this.npcs) if (n.target === p.actor) n.calm();
    this.wantedT = 0;
    setTimeout(() => {
      if (bandit) {
        const lost = Math.round(this.state.data.money * 0.2);
        this.state.addMoney(-lost);
        showDefeat("Defeated", `You wake at the Sakura Inn. Someone paid for your room — and took ${lost} mon for the trouble.`, () => this.respawn("inn"));
      } else {
        const fine = Math.round(this.state.data.money * 0.3);
        this.state.addMoney(-fine);
        this.state.addHonor(-5);
        showDefeat("Arrested", `The guards drag you to the gate. Captain Goro fines you ${fine} mon.`, () => this.respawn("west_gate"));
      }
    }, 1600);
  }

  private respawn(where: "inn" | "west_gate") {
    const p = this.player!;
    const at = where === "inn" ? { x: -40, z: 68, yaw: 0 } : { x: -148, z: 3, yaw: Math.PI / 2 };
    p.actor.recover(0.6);
    p.actor.alive = true;
    p.actor.place(at.x, at.z, at.yaw, this.world);
    p.actor.character.anim.stopAll();
    this.time.advanceTo((this.time.hour + 6) % 24);
    this.mode = "play";
    this.input.gameplay = true;
    this.input.requestLock();
    this.saveNow();
  }

  // ——— interaction ——————————————————————————————————————————————————————————

  private nearestTalkable(): Npc | null {
    const p = this.player!.actor;
    let best: Npc | null = null;
    let bestD = 2.8;
    for (const n of this.npcs) {
      if (!n.def.talkable || !n.actor.alive || n.actor.downed || n.mode === "fight" || n.hostileToPlayer) continue;
      const d = n.actor.distanceTo(p);
      if (d < bestD && p.facingDot(n.actor.pos) > -0.2) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  private interactables(): { label: string; sub?: string; d: number; run: () => void }[] {
    const p = this.player!.actor;
    const out: { label: string; sub?: string; d: number; run: () => void }[] = [];
    const add = (pos: THREE.Vector3, r: number, label: string, run: () => void, sub?: string) => {
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
      if (d < r) out.push({ label, d, run, sub });
    };
    const props = this.world.props;
    add(props.noticeBoard, 2.6, "Read the notice board", () => this.openNotices());
    add(props.well, 2.4, "Drink from the well", () => {
      p.heal(8);
      this.audio.play("splash");
      this.hud.toast("Cold, clean water. (+8 health)", "good", 2500);
    });
    if (!this.state.fact("chest_opened")) add(props.chest, 2.2, "Pry open the chest", () => this.openChest());
    if (this.quests.isActive("charm") && !this.state.has("lucky_charm")) {
      add(props.charmSpot, 2.2, "Pick up the glinting thing", () => {
        this.state.give("lucky_charm");
        this.audio.play("quest");
        this.hud.toast("Found Isamu's lucky carp charm!", "good");
      });
    }
    if (this.quests.isActive("mochi") && !this.state.fact("cat_following") && this.cat.root.visible) {
      add(this.cat.pos, 2, "Pick up the white cat", () => {
        this.state.setFact("cat_following");
        this.cat.following = { pos: this.player!.actor.pos };
        this.audio.play("quest");
        this.hud.toast("Mochi trots along beside you. Take her home to Kenta.", "good");
      }, "One black ear — it's Mochi");
    }
    return out.sort((a, b) => a.d - b.d);
  }

  private interact() {
    const n = this.nearestTalkable();
    const others = this.interactables();
    if (n && (!others.length || n.actor.distanceTo(this.player!.actor) <= others[0].d)) {
      this.openConversation(n);
      return;
    }
    if (others.length) others[0].run();
  }

  private openChest() {
    this.state.setFact("chest_opened");
    this.state.give("moon_iron");
    this.state.addMoney(90);
    this.audio.play("coin");
    this.hud.toast("You pry the chest open: 90 mon and a lump of pale, cold iron. Moon iron!", "good", 6000);
    this.saveNow();
  }

  private quickUse(slot: number) {
    const p = this.player!;
    const order = [
      ["ginseng_tonic", "herbal_salve", "ramen", "grilled_fish", "onigiri", "dango"],
      ["green_tea", "dango", "war_pill"],
      ["sake", "war_pill"],
    ][slot];
    const id = order.find((i) => this.state.has(i));
    if (!id) {
      this.audio.play("error");
      this.hud.toast(slot === 0 ? "Nothing to heal with. Buy food or salve." : "You don't have anything for that slot.", "bad", 2500);
      return;
    }
    const msg = p.consume(id, this.ctx);
    if (msg) this.hud.toast(msg, "good", 2500);
  }

  // ——— conversations ——————————————————————————————————————————————————————————

  private openConversation(n: Npc) {
    const p = this.player!;
    this.mode = "dialogue";
    this.input.exitLock();
    this.input.clear();
    n.startTalk(p.actor);
    p.actor.faceTarget = n.actor.pos;
    p.actor.yaw = Math.atan2(n.actor.pos.x - p.actor.pos.x, n.actor.pos.z - p.actor.pos.z);
    if (p.actor.character.drawn) p.actor.character.setDrawn(false);
    this.rig.focus = { a: p.actor.pos, b: n.actor.pos };
    this.hud.dim(true);
    const director = new DialogueDirector(n.def.id, this.state, this.quests, p.entry, { x: n.actor.pos.x, z: n.actor.pos.z });
    const dui = new DialogueUI(n.def);
    this.convo = { npc: n, director, ui: dui, shop: null, endAt: null };
    dui.onSay = (text) => this.say(text);
    dui.onOption = (id) => this.applyTurn(director.choose(id));
    dui.onClose = () => this.closeConversation();
    dui.status(this.talk.lastMode, this.talk.lastLatency);
    this.applyTurn(director.opening());
    this.audio.play("open");
    setTimeout(() => dui.focusInput(), 50);
  }

  private async say(text: string) {
    const c = this.convo;
    if (!c) return;
    const p = this.player!;
    c.ui.line(text, "you");
    c.ui.thinking(true);
    const req: TalkRequest = {
      npcId: c.npc.def.id,
      message: text,
      context: {
        disposition: this.state.disposition(c.npc.def.id),
        playerName: p.entry.name,
        playerLook: p.entry.playerLook,
        money: this.state.data.money,
        heldItemIds: this.state.heldIds,
        activeTaskIds: this.state.activeQuestIds,
        riddleId: c.npc.def.id === "kukai" ? this.quests.currentRiddle() : null,
        pending: c.director.pendingQuestion,
        recent: c.director.history.slice(-6),
      },
    };
    const resp = await this.talk.interpret(req);
    if (this.convo !== c) return;
    c.ui.thinking(false);
    const turn = c.director.respond(text, resp);
    c.ui.status(resp.mode, resp.latencyMs, turn.reading, resp.note);
    this.applyTurn(turn);
  }

  private applyTurn(t: Turn) {
    const c = this.convo;
    if (!c) return;
    for (const l of t.lines) c.ui.line(l);
    c.npc.speakT = 2.5;
    c.ui.options(t.options);
    c.ui.mood(this.state.disposition(c.npc.def.id));
    for (const a of t.actions) this.runAction(a);
    if (c.shop) this.renderShop();
  }

  private runAction(a: DirectorAction) {
    const c = this.convo;
    const p = this.player!;
    switch (a.kind) {
      case "shop":
        if (c && c.npc.def.shop) {
          c.highlight = a.highlight;
          if (!c.shop) {
            c.shop = new ShopPanel(c.npc.def);
            c.shop.onBuy = (id) => {
              const price = c.director.currentPrice(id);
              this.applyTurn(c.director.completePurchase(id, price));
              this.afterPurchase(id);
            };
            c.shop.onSell = (id) => this.applyTurn(c.director.choose(`sell:${id}`));
          }
          this.renderShop();
        }
        break;
      case "service":
        this.runService(a.id);
        break;
      case "marker":
        this.marker = a.place;
        break;
      case "fight": {
        if (!c) break;
        const n = c.npc;
        if (a.duel) {
          const prize = a.duel.prize;
          const def = n.def;
          const questFor = def.id === "jubei" ? "jubei" : def.role === "student" || def.role === "sensei" ? "dojo" : null;
          if (questFor && !this.quests.stage(questFor)) this.state.setQuest(questFor, "active");
          setTimeout(() => {
            this.hud.banner("Duel", `${def.name} · ${prize} mon`);
            n.actor.character.anim.play("bow");
            p.actor.character.anim.play("bow");
            n.mode = "bow";
            setTimeout(() => {
              if (p.weaponId !== "fists" && !p.actor.character.drawn) p.actor.character.setDrawn(true);
              n.engage(p.actor, {
                prize,
                sparring: a.duel!.sparring,
                onWin: () => this.duelWon(n, prize),
                onLose: () => this.duelLost(n),
              });
            }, 1300);
          }, 1500);
        } else {
          setTimeout(() => {
            n.engage(p.actor);
            if (n.def.role === "guard") this.wantedT = 30;
          }, 900);
          this.state.addHonor(-2);
        }
        break;
      }
      case "flee":
        if (c) setTimeout(() => c.npc.flee(p.actor.pos, 8), 800);
        break;
      case "cower":
        if (c) setTimeout(() => c.npc.cower(4), 400);
        break;
      case "alert":
        for (const n of this.npcs) {
          if (n.def.role === "guard" && n.actor.distanceTo(p.actor) < 30) {
            n.engage(p.actor);
            this.wantedT = 25;
          }
        }
        break;
      case "end":
        if (c) c.endAt = this.seconds + (a.delay ?? 0);
        break;
      case "bow":
        if (c) c.npc.actor.character.anim.play("bow");
        break;
      case "wave":
        if (c) c.npc.actor.character.anim.play("wave");
        break;
      case "toast":
        this.hud.toast(a.text, a.tone ?? "info");
        break;
      case "quest":
        if (a.accepted) this.hud.toast(`New task: ${QUESTS[a.id].title}`, "info");
        if (a.id === "mochi" && a.accepted) this.cat.root.visible = true;
        this.saveNow();
        break;
      case "catHome":
        this.cat.following = null;
        this.cat.home = new THREE.Vector3(-35, 0, -4);
        this.state.data.facts = this.state.data.facts.filter((f) => f !== "cat_following");
        break;
      case "sound":
        this.audio.play(a.id);
        break;
    }
  }

  private afterPurchase(id: string) {
    const it = ITEMS[id];
    if (!this.state.has(id)) return;
    // Wear or wield new gear straight away.
    if (it.kind === "weapon") this.hud.toast(`Equip the ${it.name} from your journal (J), or keep your own weapon.`, "info", 5000);
    if (it.kind === "armor") {
      this.state.data.armor = id;
      this.refreshPlayerLook();
      this.hud.toast(`You put on the ${it.name}.`, "good");
    }
    if (it.kind === "cosmetic") {
      this.state.data.cosmetic = id;
      this.refreshPlayerLook();
    }
    this.saveNow();
  }

  private renderShop() {
    const c = this.convo;
    if (!c?.shop) return;
    c.shop.render(this.state.data.money, (id) => c.director.currentPrice(id), (id) => c.director.sellPrice(id), this.state.data.inventory, c.highlight);
  }

  private updateConversation(dt: number) {
    const c = this.convo!;
    void dt;
    if (c.endAt !== null && this.seconds >= c.endAt) this.closeConversation();
    if (c.npc.mode === "fight" || !c.npc.actor.alive) this.closeConversation();
  }

  private closeConversation() {
    const c = this.convo;
    if (!c) return;
    c.ui.destroy();
    c.shop?.destroy();
    c.npc.endTalk();
    this.player!.actor.faceTarget = null;
    this.rig.focus = null;
    this.convo = null;
    this.hud.dim(false);
    if (this.mode === "dialogue") this.mode = "play";
    // The key that closed the conversation (Esc) must not also open the menu.
    this.input.clear();
    this.input.gameplay = true;
    this.input.requestLock();
    this.audio.play("close");
    this.saveNow();
  }

  private duelWon(n: Npc, prize: number) {
    const def = n.def;
    this.state.addMoney(prize);
    this.state.setFact(`beat:${def.id}`);
    this.state.addHonor(3);
    this.state.addDisposition(def.id, 15);
    this.audio.play("quest");
    this.hud.banner("Victory", `+${prize} mon`);
    n.actor.character.anim.play("bow");
    if (def.role === "student") {
      const beaten = this.quests.studentsBeaten();
      this.hud.toast(beaten >= 3 ? "All three students beaten. Now face Sensei Hideaki." : `Dojo students beaten: ${beaten}/3`, "good");
    }
    if (def.id === "hideaki") this.hud.toast("Talk to the sensei to claim your title.", "good");
    if (def.id === "jubei") this.hud.toast("Jubei yields. Talk to him.", "good");
    this.player!.actor.character.setDrawn(false);
    this.saveNow();
  }

  private duelLost(n: Npc) {
    const p = this.player!;
    this.hud.banner("Defeated", `${n.def.name} wins the bout.`);
    setTimeout(() => {
      p.actor.recover(0.35);
      this.mode = "play";
    }, 2500);
  }

  private runService(id: string) {
    const p = this.player!;
    switch (id) {
      case "rest":
        this.closeConversation();
        this.sleep();
        break;
      case "blessing":
        p.actor.heal(999);
        this.audio.play("bell");
        this.effects.petals(p.actor.pos, 60, 3, { swirl: 2, up: 0.8, life: 2.5, glow: true });
        this.hud.toast("Kūkai rings the bell. Your wounds close.", "good");
        break;
      case "training":
        this.state.data.damageBonus += 0.1;
        this.state.setFact("trained:hideaki");
        this.hud.toast("A day of drills with Sensei Hideaki: +10% damage.", "good");
        this.time.advanceTo((this.time.hour + 3) % 24);
        break;
      case "chohan": {
        this.closeConversation();
        this.mode = "chohan";
        this.input.exitLock();
        this.panel = new ChohanPanel(
          () => this.state.data.money,
          (bet, call) => {
            if (!this.state.spend(bet)) return null;
            const d: [number, number] = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
            const even = (d[0] + d[1]) % 2 === 0;
            const win = (call === "cho") === even;
            if (win) this.state.addMoney(bet * 2);
            this.saveNow();
            return { dice: d, win };
          },
          (s) => this.audio.play(s),
          () => this.closePanel(),
        );
        break;
      }
    }
  }

  private sleep() {
    this.mode = "sleep";
    const fade = el("div", "fade-screen");
    ui().appendChild(fade);
    requestAnimationFrame(() => fade.classList.add("on"));
    setTimeout(() => {
      this.time.advanceTo(7.2);
      const p = this.player!;
      p.actor.heal(999);
      p.actor.stamina = p.actor.maxStamina;
      p.actor.place(-40, 69, 0, this.world);
      this.saveNow();
      fade.classList.remove("on");
      this.hud.banner(`Day ${this.time.day}`, "Morning at the Sakura Inn");
      setTimeout(() => fade.remove(), 1000);
      this.mode = "play";
      this.input.gameplay = true;
    }, 1400);
  }

  // ——— panels ——————————————————————————————————————————————————————————————————

  private closePanel() {
    this.panel?.destroy();
    this.panel = null;
    this.mode = "play";
    this.input.gameplay = true;
    this.hud.dim(false);
    this.input.requestLock();
  }

  private openMenu() {
    this.mode = "menu";
    this.input.exitLock();
    this.hud.dim(true);
    const status =
      this.talk.lastMode === "jev"
        ? "Conversations are understood by TypeSafe's Jev."
        : this.talk.lastMode === "heuristic"
          ? `Conversations are using the offline keyword fallback. ${this.talk.lastNote}`
          : "Conversations are understood by TypeSafe's Jev when the server has a TYPESAFE_API_KEY; otherwise a keyword fallback is used.";
    this.panel = new MenuPanel(this.settings, {
      resume: () => this.closePanel(),
      characters: () => {
        this.panel?.destroy();
        this.panel = null;
        this.hud.dim(false);
        this.previewId = this.state.data.characterId;
        this.showSelect(true, true);
      },
      save: () => {
        this.saveNow();
        this.hud.toast("Journey saved.", "good", 2000);
      },
      reset: () => {
        GameState.clear();
        location.reload();
      },
      settings: (s) => this.applySettings(s),
    }, status);
  }

  private openMap() {
    this.mode = "map";
    this.input.exitLock();
    const p = this.player!;
    this.panel = new MapPanel(this.mapBase!, p.actor.pos, p.actor.yaw, this.currentMarkers(), () => this.closePanel());
  }

  private openJournal() {
    this.mode = "journal";
    this.input.exitLock();
    const j = new JournalPanel();
    const render = () =>
      j.render({
        quests: this.quests.journal(),
        items: Object.entries(this.state.data.inventory)
          .filter(([, n]) => n > 0)
          .map(([id, count]) => ({ id, count, equipped: this.state.data.weapon === id || this.state.data.armor === id || this.state.data.cosmetic === id })),
        weapon: this.state.data.weapon,
        armor: this.state.data.armor,
        cosmetic: this.state.data.cosmetic,
      });
    j.onUse = (id) => {
      const msg = this.player!.consume(id, this.ctx);
      if (msg) this.hud.toast(msg, "good", 2500);
      render();
    };
    j.onEquip = (id) => {
      const d = this.state.data;
      if (id === "signature") d.weapon = "signature";
      else {
        const it = ITEMS[id];
        if (it.kind === "weapon") d.weapon = d.weapon === id ? "signature" : id;
        if (it.kind === "armor") d.armor = d.armor === id ? null : id;
        if (it.kind === "cosmetic") d.cosmetic = d.cosmetic === id ? null : id;
      }
      this.refreshPlayerLook();
      this.saveNow();
      render();
    };
    j.onClose = () => this.closePanel();
    render();
    this.panel = j;
  }

  private openNotices() {
    this.mode = "notice";
    this.input.exitLock();
    const open = Object.values(QUESTS).filter((q) => !this.quests.stage(q.id));
    const root = el("div", "panel menu interactive");
    root.innerHTML = `<div class="eyebrow">Notice board</div><h2>Help wanted</h2>
      ${open.length ? open.map((q) => `<div style="padding:10px 0;border-top:1px solid var(--hair)"><b style="font:600 17px/1.2 var(--serif)">${esc(q.title)}</b><p style="margin:4px 0 0;font:400 13px/1.45 var(--sans);color:var(--paper-2)">Ask ${esc(NPC_BY_ID[q.giver].name)} (${esc(NPC_BY_ID[q.giver].title.toLowerCase())}).</p></div>`).join("") : "<p>Nothing posted. You've helped everyone!</p>"}
      <div class="items"><button class="btn" data-c>Close</button></div>`;
    ui().appendChild(root);
    root.querySelector("[data-c]")!.addEventListener("click", () => this.closePanel());
    this.panel = { destroy: () => root.remove() };
  }

  // ——— HUD ————————————————————————————————————————————————————————————————————

  private currentMarkers(): { x: number; z: number; kind: "place" | "quest" }[] {
    const out: { x: number; z: number; kind: "place" | "quest" }[] = [];
    if (this.marker) {
      const m = PLACE_BY_ID[this.marker];
      if (m) out.push({ x: m.x, z: m.z, kind: "place" });
    }
    const q = (id: string, place: string) => this.quests.isActive(id) && out.push({ x: PLACE_BY_ID[place].x, z: PLACE_BY_ID[place].z, kind: "quest" });
    if (!this.state.fact("defeated:kurogane")) q("bandits", "bandit_camp");
    else q("bandits", "west_gate");
    if (this.state.has("rice_bale")) q("rice", "inn");
    if (!this.state.has("lucky_charm")) q("charm", "stepping_stones");
    else q("charm", "pier");
    if (!this.state.has("moon_iron")) q("moonblade", "bandit_camp");
    else q("moonblade", "blacksmith");
    q("riddles", "shrine");
    if (this.state.fact("cat_following")) q("mochi", "square");
    return out;
  }

  private updateHud(dt: number) {
    const p = this.player!;
    const a = p.actor;
    this.hpShown = damp(this.hpShown, a.hp / a.maxHp, 8, dt);
    const drawn = a.character.drawn || (p.weaponId === "fists" && a.character.anim.stance === "unarmed");
    const weaponItem = ITEMS[p.weaponId];
    const quick = [
      ["1", ["ginseng_tonic", "herbal_salve", "ramen", "grilled_fish", "onigiri", "dango"]],
      ["2", ["green_tea", "dango", "war_pill"]],
      ["3", ["sake", "war_pill"]],
    ].map(([key, ids]) => {
      const id = (ids as string[]).find((i) => this.state.has(i)) ?? null;
      return { key: key as string, id, count: id ? this.state.count(id) : 0 };
    });
    const dots: { x: number; z: number; kind: "npc" | "hostile" | "shop" }[] = [];
    for (const n of this.npcs) {
      if (!n.actor.alive || !n.actor.character.root.visible) continue;
      if (n.actor.distanceTo(a) > 70) continue;
      dots.push({ x: n.actor.pos.x, z: n.actor.pos.z, kind: n.hostileToPlayer ? "hostile" : n.def.shop?.wares.length ? "shop" : "npc" });
    }
    this.hud.update(
      {
        name: p.entry.name,
        title: p.entry.title,
        hp: a.hp,
        maxHp: a.maxHp,
        stamina: a.stamina,
        maxStamina: a.maxStamina,
        money: this.state.data.money,
        honor: this.state.data.honor,
        clock: this.time.clock(),
        period: this.time.periodName(),
        day: this.time.day,
        heading: this.rig.yaw,
        player: a.pos,
        playerYaw: a.yaw,
        weaponLabel: weaponItem?.name ?? "Fists",
        weaponGlyph: p.weaponId === "fists" ? "拳" : p.weaponId === "boomstick" ? "銃" : weaponItem?.jp?.charAt(0) ?? "刀",
        drawn,
        specialName: p.entry.special.name,
        specialCd: p.specialCd,
        specialMax: p.specialMax,
        quick,
        aiMode: this.talk.lastMode === "jev" ? "✦ Jev online" : this.talk.lastMode === "heuristic" ? "keyword mode" : "",
        markers: this.currentMarkers(),
        dots,
      },
      this.input.locked || this.mode !== "play",
    );
    // Name labels for people nearby.
    const labels: Label[] = [];
    if (this.mode === "play") {
      for (const n of this.npcs) {
        if (!n.actor.alive || !n.actor.character.root.visible) continue;
        const d = n.actor.distanceTo(a);
        const fighting = n.mode === "fight";
        if (d > (fighting ? 22 : 9)) continue;
        labels.push({
          id: n.def.id,
          text: n.def.name,
          sub: n.duel ? "Duel" : n.def.title,
          pos: n.actor.pos.clone().add(new THREE.Vector3(0, n.actor.height + 0.35, 0)),
          hostile: n.hostileToPlayer,
          hp: fighting || n.actor.hp < n.actor.maxHp ? n.actor.hp / n.actor.maxHp : undefined,
          show: true,
        });
      }
    }
    this.hud.labels(labels, this.camera);
    // Interaction prompt.
    if (this.mode === "play") {
      const n = this.nearestTalkable();
      const others = this.interactables();
      if (n && (!others.length || n.actor.distanceTo(a) <= others[0].d)) this.hud.prompt(`Talk to ${n.def.name}`, n.def.title);
      else if (others.length) this.hud.prompt(others[0].label, others[0].sub);
      else this.hud.prompt(null);
    } else this.hud.prompt(null);
  }

  /** Dev helper (console): switch character without the menu. */
  debugCharacter(id: string) {
    if (!ROSTER_BY_ID[id]) return;
    this.state.data.characterId = id;
    this.state.data.weapon = "signature";
    this.spawnPlayer(ROSTER_BY_ID[id], true);
  }

  private saveNow() {
    const p = this.player;
    if (!p) return;
    const d = this.state.data;
    d.hour = this.time.hour;
    d.day = this.time.day;
    d.position = { x: p.actor.pos.x, z: p.actor.pos.z, yaw: p.actor.yaw };
    this.state.save();
  }
}

// Keep a reference for debugging in the console.
declare global {
  interface Window {
    kazemura?: Game;
  }
}
export function startGame() {
  const g = new Game();
  window.kazemura = g;
  void g.boot();
  void BANDIT_CAMP;
  void clamp;
}
