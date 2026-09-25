// Playable characters. The samurai is the default; the rest are live-action style takes
// on characters from One Piece, Naruto, Bleach and Brawl Stars — realistic proportions
// and materials rather than anime shapes.

import type { Look } from "./look";

export type Franchise = "Kazemura" | "One Piece" | "Naruto" | "Bleach" | "Brawl Stars";

export type SpecialId = "iai" | "gum_pistol" | "oni_giri" | "shadow_clones" | "chidori" | "getsuga" | "senbonzakura" | "super_shell" | "elbow_drop";

export interface RosterEntry {
  id: string;
  name: string;
  franchise: Franchise;
  title: string;
  blurb: string;
  /** How NPCs see you (sent to Jev as context). */
  playerLook: string;
  look: Look;
  /** Signature weapon item id, or "fists". */
  weapon: string;
  stats: { health: number; speed: number; power: number; stamina: number };
  special: { id: SpecialId; name: string; description: string; cooldown: number };
  /** Kind of fighter, used for NPC reactions. */
  archetype: "samurai" | "pirate" | "swordsman" | "ninja" | "soul_reaper" | "brawler" | "gunslinger";
}

export const ROSTER: RosterEntry[] = [
  {
    id: "samurai",
    name: "Hayato",
    franchise: "Kazemura",
    title: "Wandering Samurai",
    blurb: "A masterless samurai with a quiet blade and an empty purse. The river brought him to Kazemura.",
    playerLook: "a samurai in a navy kimono, charcoal hakama and a black crested haori, with a topknot and a katana at the hip",
    look: {
      sex: "m", age: "adult", height: 1.76, build: 0.5, muscle: 0.45, skin: "#c49a76",
      hair: { style: "topknot", color: "#15110f" }, facial: "stubble", facialColor: "#1f1a18", eyes: "#2b1b12", brows: "brow002",
      footwear: "waraji", footwearColor: "#c9b27c", costume: "samurai",
      body: { muscle: 0.62, weight: 0.42, face: { "cheek-bones-incr": 0.35, "chin-prominent-incr": 0.2, "nose-hump-incr": 0.25, "eyebrows-angle-down": 0.2, "head-square": 0.2 } },
      garments: [
        { kind: "tabi", color: "#f1eee6" },
        { kind: "kimono", color: "#2f3b52", sleeves: "narrow", collar: "#e6dfcf" },
        { kind: "hakama", color: "#6a635a", stripes: "#3e3a34" },
        { kind: "sash", color: "#2e241c" },
        { kind: "haori", color: "#2b2927", crest: "#eceae2" },
      ],
    },
    weapon: "katana",
    stats: { health: 120, speed: 1.0, power: 1.0, stamina: 100 },
    special: { id: "iai", name: "Iaijutsu: Flash Draw", description: "Sheathe, breathe, and cut through everything in a straight line.", cooldown: 8 },
    archetype: "samurai",
  },
  {
    id: "luffy",
    name: "Monkey D. Luffy",
    franchise: "One Piece",
    title: "Straw Hat Pirate",
    blurb: "A rubber-limbed pirate captain who fights with his fists and never skips a meal.",
    playerLook: "a grinning young pirate in a straw hat and an open red cardigan with a yellow sash, blue shorts with white fur cuffs, a scar under his left eye and an X-shaped scar on his chest",
    look: {
      sex: "m", age: "adult", height: 1.74, build: 0.3, muscle: 0.6, skin: "#c8926c",
      hair: { style: "messy", color: "#15110f" }, eyes: "#22160f", brows: "brow008", browColor: "#15110f", marks: ["scar_under_left_eye", "chest_x_scar"],
      headgear: "straw_hat", footwear: "zori", footwearColor: "#5a4230", costume: "luffy",
      body: { muscle: 0.74, weight: 0.3, ethnic: { caucasian: 0.35 }, face: { "head-age-decr": 0.35, "eye-scale-incr": 0.3, "mouth-scale-horiz-incr": 0.35, "chin-width-decr": 0.2, "head-oval": 0.3 } },
      garments: [{ kind: "pants", color: "#4a6593", length: "knee", baggy: true, fabric: "denim" }],
    },
    weapon: "fists",
    stats: { health: 115, speed: 1.1, power: 1.05, stamina: 120 },
    special: { id: "gum_pistol", name: "Gum-Gum Pistol", description: "Wind up and fire a punch that stretches ten metres.", cooldown: 6 },
    archetype: "pirate",
  },
  {
    id: "zoro",
    name: "Roronoa Zoro",
    franchise: "One Piece",
    title: "Three-Sword Style",
    blurb: "A swordsman who fights with a blade in each hand and one in his teeth. Hopeless with directions.",
    playerLook: "a muscular green-haired swordsman in a long dark-green coat with a crimson sash, three gold earrings, a scar over his closed left eye and three swords at his hip",
    look: {
      sex: "m", age: "adult", height: 1.81, build: 0.6, muscle: 0.9, skin: "#c99070",
      hair: { style: "buzz", color: "#5e8c4c" }, eyes: "#2b2320", brows: "brow009", browColor: "#2b4428", marks: ["scar_left_eye"], closedEye: "L", earrings: 3,
      footwear: "boots", footwearColor: "#2a2624", costume: "zoro",
      body: { muscle: 0.96, weight: 0.55, face: { "chin-width-incr": 0.5, "head-square": 0.5, "cheek-bones-incr": 0.4, "eyebrows-angle-down": 0.45, "mouth-scale-horiz-decr": 0.2, "neck-scale-horiz-incr": 0.6 } },
      garments: [{ kind: "pants", color: "#1b1b1d", length: "long", fabric: "canvas" }],
    },
    weapon: "santoryu",
    stats: { health: 135, speed: 1.0, power: 1.2, stamina: 110 },
    special: { id: "oni_giri", name: "Oni Giri", description: "Cross all three swords and dash through the enemy.", cooldown: 7 },
    archetype: "swordsman",
  },
  {
    id: "naruto",
    name: "Naruto Uzumaki",
    franchise: "Naruto",
    title: "Hidden Leaf Ninja",
    blurb: "A loud, stubborn shinobi in unmistakable orange. Never goes back on his word.",
    playerLook: "a spiky-blond young ninja in a bright orange and black tracksuit, with a metal-plated headband and whisker marks on his cheeks",
    look: {
      sex: "m", age: "adult", height: 1.66, build: 0.3, muscle: 0.5, skin: "#e6b08e",
      hair: { style: "spiky", color: "#e4b84f" }, eyes: "#3c7dc6", eyeTexture: "blue", brows: "brow003", browColor: "#b48a3c", marks: ["whiskers"],
      headgear: "leaf_headband", footwear: "ninja_sandals", footwearColor: "#3e3a2e", costume: "naruto",
      body: { muscle: 0.62, weight: 0.38, ethnic: { caucasian: 0.25 }, face: { "head-age-decr": 0.4, "cheek-volume-incr": 0.35, "head-round": 0.3, "nose-scale-horiz-decr": 0.2, "mouth-scale-horiz-incr": 0.3 } },
      garments: [{ kind: "pants", color: "#e8691e", length: "calf", baggy: true, fabric: "cotton" }],
    },
    weapon: "kunai",
    stats: { health: 110, speed: 1.15, power: 0.95, stamina: 130 },
    special: { id: "shadow_clones", name: "Shadow Clone Jutsu", description: "Three clones join the fight for twelve seconds.", cooldown: 14 },
    archetype: "ninja",
  },
  {
    id: "sasuke",
    name: "Sasuke Uchiha",
    franchise: "Naruto",
    title: "Last of the Uchiha",
    blurb: "A cold, precise swordsman whose left hand can call down lightning.",
    playerLook: "a pale, dark-haired young swordsman in an open white shirt, navy trousers and a purple rope belt, with a straight sword at the small of his back",
    look: {
      sex: "m", age: "adult", height: 1.68, build: 0.28, muscle: 0.55, skin: "#f0d8c4",
      hair: { style: "swept", color: "#14161c" }, eyes: "#231b17", brows: "brow005", browColor: "#111216",
      footwear: "ninja_sandals", footwearColor: "#4f4d3e", costume: "sasuke",
      body: { muscle: 0.64, weight: 0.3, face: { "head-oval": 0.4, "chin-prominent-incr": 0.2, "cheek-bones-incr": 0.35, "eye-corner1-up": 0.3, "nose-scale-horiz-decr": 0.3, "head-age-decr": 0.3 } },
      garments: [
        { kind: "pants", color: "#252833", length: "long", baggy: true, fabric: "canvas" },
        { kind: "waist_cloth", color: "#4b5586" },
        { kind: "rope_belt", color: "#6e5a8e" },
      ],
    },
    weapon: "kusanagi",
    stats: { health: 110, speed: 1.12, power: 1.1, stamina: 110 },
    special: { id: "chidori", name: "Chidori", description: "Gather lightning in one hand, then lunge through your target.", cooldown: 9 },
    archetype: "ninja",
  },
  {
    id: "ichigo",
    name: "Ichigo Kurosaki",
    franchise: "Bleach",
    title: "Substitute Soul Reaper",
    blurb: "A scowling soul reaper with a cleaver of a sword taller than he is.",
    playerLook: "a scowling orange-haired young man in a black soul reaper's kimono and hakama, with a huge guardless cleaver-like sword strapped to his back",
    look: {
      sex: "m", age: "adult", height: 1.74, build: 0.35, muscle: 0.6, skin: "#e2b797",
      hair: { style: "spiky", color: "#d96a1e" }, eyes: "#5c3b24", brows: "brow012", browColor: "#7a3a14",
      footwear: "waraji", footwearColor: "#c8b07a", costume: "ichigo",
      body: { muscle: 0.7, weight: 0.35, face: { "eyebrows-angle-down": 0.6, "head-oval": 0.3, "chin-width-decr": 0.1, "head-age-decr": 0.3 } },
      garments: [
        { kind: "tabi", color: "#f1f0ea" },
        { kind: "kimono", color: "#17171b", sleeves: "wide", collar: "#eeede6" },
        { kind: "hakama", color: "#17171b" },
        { kind: "sash", color: "#f0eee6" },
        { kind: "chest_strap", color: "#8e1b1e" },
      ],
    },
    weapon: "zangetsu",
    stats: { health: 125, speed: 1.05, power: 1.2, stamina: 110 },
    special: { id: "getsuga", name: "Getsuga Tenshō", description: "Swing Zangetsu and send a crescent of spirit energy tearing forward.", cooldown: 8 },
    archetype: "soul_reaper",
  },
  {
    id: "byakuya",
    name: "Byakuya Kuchiki",
    franchise: "Bleach",
    title: "Captain of the Sixth",
    blurb: "A composed noble captain whose blade scatters into a thousand cherry-blossom edges.",
    playerLook: "a composed nobleman with long black hair and white hair ornaments, wearing a black kimono under a sleeveless white captain's coat and a long silver scarf",
    look: {
      sex: "m", age: "adult", height: 1.8, build: 0.28, muscle: 0.4, skin: "#edd3c3",
      hair: { style: "long_straight", color: "#0e0f13" }, eyes: "#6e7580", eyeTexture: "grey", brows: "brow007", browColor: "#121216",
      headgear: "kenseikan", footwear: "waraji", footwearColor: "#c9b27c", costume: "byakuya",
      body: { muscle: 0.5, weight: 0.3, face: { "head-oval": 0.5, "cheek-bones-incr": 0.4, "nose-scale-horiz-decr": 0.3, "chin-width-decr": 0.2, "eye-height2-decr": 0.3 } },
      garments: [
        { kind: "tabi", color: "#f1eee6" },
        { kind: "kimono", color: "#141418", sleeves: "wide", collar: "#eeede6" },
        { kind: "hakama", color: "#141418" },
        { kind: "sash", color: "#dcdce2" },
        { kind: "gloves", color: "#d6e6df" },
      ],
    },
    weapon: "senbonzakura",
    stats: { health: 115, speed: 1.05, power: 1.15, stamina: 100 },
    special: { id: "senbonzakura", name: "Scatter, Senbonzakura", description: "Your blade dissolves into a storm of petals that cuts everything around you.", cooldown: 12 },
    archetype: "soul_reaper",
  },
  {
    id: "shelly",
    name: "Shelly",
    franchise: "Brawl Stars",
    title: "Shotgun Brawler",
    blurb: "Purple from head to toe and never far from her boomstick. Up close, nobody argues with Shelly.",
    playerLook: "a tough woman with a big wavy purple ponytail, a lavender shirt with rolled sleeves, a gold bandana at her neck and a double-barrelled shotgun",
    look: {
      sex: "f", age: "adult", height: 1.66, build: 0.35, muscle: 0.5, skin: "#c58a66",
      hair: { style: "wavy_ponytail", color: "#6c2391" }, eyes: "#4a2e1e", brows: "brow001", browColor: "#4b2160", marks: ["bandaid"],
      footwear: "boots", footwearColor: "#1b1e36", costume: "shelly",
      body: { muscle: 0.62, weight: 0.4, ethnic: { caucasian: 0.4 }, face: { "eye-scale-incr": 0.3, "cheek-volume-incr": 0.3, "head-round": 0.2, "nose-point-up": 0.3 } },
      garments: [
        { kind: "shirt", color: "#9a80cf", sleeves: "rolled", fabric: "cotton" },
        { kind: "pants", color: "#262c50", length: "long", stripe: "#f09a1e", fabric: "denim" },
        { kind: "belt", color: "#6a3420" },
        { kind: "neck_bandana", color: "#f5a817" },
      ],
    },
    weapon: "boomstick",
    stats: { health: 115, speed: 1.0, power: 1.1, stamina: 100 },
    special: { id: "super_shell", name: "Super Shell", description: "A point-blank blast that blows enemies off their feet.", cooldown: 8 },
    archetype: "gunslinger",
  },
  {
    id: "elprimo",
    name: "El Primo",
    franchise: "Brawl Stars",
    title: "Luchador",
    blurb: "A mountain of a wrestler in a blue mask. He fights with his fists and a lot of heart.",
    playerLook: "a huge, shirtless, heavily muscled luchador in a blue, red and gold wrestling mask, blue tights, a red belt and blue boots",
    look: {
      sex: "m", age: "adult", height: 1.9, build: 0.95, muscle: 1, skin: "#a8653f",
      hair: { style: "none", color: "#15110f" }, eyes: "#3a2416",
      headgear: "luchador_mask", footwear: "wrestling_boots", footwearColor: "#1747a8", costume: "elprimo",
      body: { muscle: 1, weight: 0.85, oily: true, ethnic: { caucasian: 0.3, african: 0.2 }, face: { "neck-scale-horiz-incr": 1, "chin-width-incr": 0.6, "head-square": 0.5, "mouth-scale-horiz-incr": 0.4, "nose-scale-horiz-incr": 0.4 } },
      garments: [
        { kind: "pants", color: "#1a5bc8", length: "long", fabric: "spandex" },
        { kind: "wristbands", color: "#2551c2" },
      ],
    },
    weapon: "fists",
    stats: { health: 170, speed: 0.9, power: 1.25, stamina: 110 },
    special: { id: "elbow_drop", name: "Flying Elbow Drop", description: "Leap high and crash down, flattening everyone around the landing.", cooldown: 9 },
    archetype: "brawler",
  },
];

export const ROSTER_BY_ID: Record<string, RosterEntry> = Object.fromEntries(ROSTER.map((r) => [r.id, r]));
export const DEFAULT_CHARACTER = "samurai";
