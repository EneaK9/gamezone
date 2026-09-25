// Shared materials: PBR sets from Poly Haven textures plus canvas-painted ones (shoji,
// noren curtains, signboards, paper lanterns). Night-reactive materials glow after dusk.

import * as THREE from "three";
import type { Assets, TextureId } from "../core/assets";

export type MatKey =
  | "plaster"
  | "plasterWarm"
  | "darkWood"
  | "wood"
  | "cedar"
  | "weathered"
  | "tile"
  | "thatch"
  | "stone"
  | "paving"
  | "bamboo"
  | "vermilion"
  | "black"
  | "shoji"
  | "interior"
  | "gold"
  | "copper"
  | "rope"
  | "straw"
  | "lanternRed"
  | "lanternWhite"
  | "clothIndigo"
  | "clothRed"
  | "clothWhite"
  | "clothBrown"
  | "mosen"
  | "earth"
  | "iron"
  | "sakuraBark"
  | "pineBark"
  | "namako"
  | "fire"
  | `noren_${string}`
  | `sign_${string}`;

interface NightGlow {
  mat: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}

const SIGN_GLYPHS: Record<string, { glyph: string; noren: string; label?: string }> = {
  smith: { glyph: "刀", noren: "#27344a", label: "鍛冶" },
  medicine: { glyph: "薬", noren: "#3f5a45", label: "薬種" },
  armor: { glyph: "鎧", noren: "#4a2a26", label: "具足" },
  goods: { glyph: "萬", noren: "#6b4a26", label: "萬屋" },
  tea: { glyph: "茶", noren: "#2d4f6e", label: "茶屋" },
  inn: { glyph: "宿", noren: "#6e2c3a", label: "桜宿" },
  noodles: { glyph: "麺", noren: "#a63a2a", label: "らーめん" },
  dango: { glyph: "団", noren: "#b05a78", label: "団子" },
  dojo: { glyph: "道", noren: "#1f2733", label: "風村道場" },
};

const JP_FONT = `"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "MS Mincho", "Songti SC", serif`;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export class Materials {
  private cache = new Map<string, THREE.Material>();
  private glows: NightGlow[] = [];

  constructor(private assets: Assets) {}

  private pbr(id: TextureId, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const t = this.assets.tex(id);
    return new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.arm,
      roughness: 1,
      metalness: 0,
      ...opts,
    });
  }

  get(key: MatKey): THREE.Material {
    let m = this.cache.get(key);
    if (!m) {
      m = this.create(key);
      m.name = key;
      this.cache.set(key, m);
    }
    return m;
  }

  private create(key: MatKey): THREE.Material {
    switch (key) {
      case "plaster":
        return this.pbr("plastered_wall_02", { color: new THREE.Color("#f2ede2") });
      case "plasterWarm":
        return this.pbr("plastered_wall_02", { color: new THREE.Color("#e8d9bf") });
      case "darkWood":
        return this.pbr("dark_wooden_planks", { color: new THREE.Color("#8a7766") });
      case "wood":
        return this.pbr("hinoki_planks", { color: new THREE.Color("#d8c4a8") });
      case "cedar":
        return this.pbr("hinoki_planks", { color: new THREE.Color("#b08a64") });
      case "weathered":
        return this.pbr("weathered_brown_planks", { color: new THREE.Color("#b8a896") });
      case "tile":
        return this.pbr("grey_roof_tiles_02", { color: new THREE.Color("#8a909a") });
      case "thatch":
        return this.pbr("thatch_roof_angled", { color: new THREE.Color("#c9b48c") });
      case "stone":
        return this.pbr("castle_wall_slates", { color: new THREE.Color("#c2beb4") });
      case "paving":
        return this.pbr("grey_stone_path", { color: new THREE.Color("#d4d0c6") });
      case "bamboo":
        return this.pbr("bamboo_wall", { color: new THREE.Color("#d7c89a") });
      case "sakuraBark":
        return this.pbr("sakura_bark", { color: new THREE.Color("#9a8a86") });
      case "pineBark":
        return this.pbr("pine_bark", { color: new THREE.Color("#a09080") });
      case "vermilion": {
        const t = this.assets.tex("hinoki_planks");
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#d2452b"), normalMap: t.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.62 });
      }
      case "black":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#211d1b"), roughness: 0.55 });
      case "interior":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#2a211b"), roughness: 1 });
      case "gold":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#d4a94c"), roughness: 0.35, metalness: 1 });
      case "copper":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#5f9a86"), roughness: 0.55, metalness: 0.35 });
      case "iron":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#3b3b3d"), roughness: 0.45, metalness: 0.8 });
      case "rope":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#d8c796"), roughness: 0.95 });
      case "straw":
        return this.pbr("thatch_roof_angled", { color: new THREE.Color("#e2cf9c") });
      case "earth":
        return new THREE.MeshStandardMaterial({ color: new THREE.Color("#6b5a47"), roughness: 1 });
      case "clothIndigo":
        return this.cloth("#26344c");
      case "clothRed":
        return this.cloth("#b03a2c");
      case "clothWhite":
        return this.cloth("#ece6da");
      case "clothBrown":
        return this.cloth("#6d5238");
      case "mosen":
        return this.cloth("#c8352c");
      case "shoji":
        return this.shoji();
      case "namako":
        return this.namako();
      case "lanternRed":
        return this.lantern("#d64a2e", "#ff8a4a");
      case "lanternWhite":
        return this.lantern("#f3ead6", "#ffd9a0");
      case "fire": {
        const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#ff9a40"), emissive: new THREE.Color("#ff7a20"), emissiveIntensity: 3, roughness: 1 });
        return m;
      }
      default:
        if (key.startsWith("noren_")) return this.noren(key.slice(6));
        if (key.startsWith("sign_")) return this.signboard(key.slice(5));
        throw new Error(`unknown material ${key}`);
    }
  }

  private cloth(hex: string): THREE.MeshStandardMaterial {
    const t = this.assets.tex("terry_cloth");
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), normalMap: t.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92, side: THREE.DoubleSide });
  }

  private shoji(): THREE.MeshStandardMaterial {
    const tex = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#efe7d2";
      g.fillRect(0, 0, 256, 256);
      // Paper fibres.
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(190,170,130,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 6, 1);
      }
      g.fillStyle = "#5a4232";
      for (let i = 0; i <= 4; i++) g.fillRect(i * 64 - 3, 0, 6, 256);
      for (let j = 0; j <= 6; j++) g.fillRect(0, j * (256 / 6) - 2.5, 256, 5);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color("#ffc27a"), emissiveIntensity: 0, roughness: 0.9 });
    this.glows.push({ mat: m, day: 0, night: 0.9 });
    return m;
  }

  private namako(): THREE.MeshStandardMaterial {
    // Kura storehouse wall: square dark tiles with raised white plaster diagonal joints.
    const tex = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#e9e4d8";
      g.fillRect(0, 0, 256, 256);
      g.save();
      g.translate(128, 128);
      g.rotate(Math.PI / 4);
      g.fillStyle = "#3a3d42";
      const s = 64;
      for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) g.fillRect(i * s * 0.707 * 1.414 + 5, j * s * 0.707 * 1.414 + 5, s - 10, s - 10);
      g.restore();
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  }

  private lantern(hex: string, glow: string): THREE.MeshStandardMaterial {
    const tex = canvasTexture(128, 128, (g) => {
      g.fillStyle = hex;
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      for (let y = 8; y < 128; y += 12) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(128, y);
        g.stroke();
      }
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(glow), emissiveIntensity: 0.15, roughness: 0.8 });
    this.glows.push({ mat: m, day: 0.12, night: 2.6 });
    return m;
  }

  private noren(sign: string): THREE.MeshStandardMaterial {
    const info = SIGN_GLYPHS[sign] ?? SIGN_GLYPHS.goods;
    const tex = canvasTexture(512, 256, (g) => {
      g.fillStyle = info.noren;
      g.fillRect(0, 0, 512, 256);
      // Slits between the panels.
      g.fillStyle = "rgba(0,0,0,0.35)";
      for (let i = 1; i < 4; i++) g.fillRect(i * 128 - 2, 60, 4, 196);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, 0, 512, 22);
      g.fillStyle = "#f3ecde";
      g.font = `bold 150px ${JP_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(info.glyph, 256, 140);
    });
    const t = this.assets.tex("terry_cloth");
    return new THREE.MeshStandardMaterial({ map: tex, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.95, side: THREE.DoubleSide });
  }

  private signboard(sign: string): THREE.MeshStandardMaterial {
    const info = SIGN_GLYPHS[sign] ?? SIGN_GLYPHS.goods;
    const text = info.label ?? info.glyph;
    const tex = canvasTexture(512, 160, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 160);
      grad.addColorStop(0, "#6a4a30");
      grad.addColorStop(1, "#4d3421");
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 160);
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(30,18,10,${0.15 + Math.random() * 0.2})`;
        g.beginPath();
        const y = Math.random() * 160;
        g.moveTo(0, y);
        g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 3);
        g.stroke();
      }
      g.strokeStyle = "#2b1c11";
      g.lineWidth = 10;
      g.strokeRect(5, 5, 502, 150);
      g.fillStyle = "#1a120c";
      g.font = `bold ${text.length > 3 ? 92 : 110}px ${JP_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, 256, 84);
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  }

  /** Called every frame with 0 (day) … 1 (night). */
  updateNight(night: number) {
    for (const g of this.glows) g.mat.emissiveIntensity = g.day + (g.night - g.day) * night;
  }
}
