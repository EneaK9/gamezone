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
      sex: "m", age: "adult", height: 1.76, build: 0.55, muscle: 0.45, skin: "#cf9f7b",
      hair: { style: "topknot", color: "#1a1716" }, facial: "stubble", facialColor: "#1f1a18", eyes: "#2a1f18",
      footwear: "waraji",
      garments: [
        { kind: "tabi", color: "#ece8de" },
        { kind: "kimono", color: "#2b3d5a", sleeves: "narrow", collar: "#e6ded0", pattern: "waves", accent: "#35496a" },
        { kind: "hakama", color: "#3a3836", stripes: "#46423e" },
        { kind: "sash", color: "#6e2c22" },
        { kind: "haori", color: "#1c1a19", crest: "#ece6d8" },
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
    playerLook: "a grinning young pirate in a straw hat, an open red vest and rolled-up blue shorts, with a scar under his left eye and an X-shaped scar on his chest",
    look: {
      sex: "m", age: "adult", height: 1.72, build: 0.42, muscle: 0.6, skin: "#d8a47c",
      hair: { style: "messy", color: "#141212" }, eyes: "#1e1714", marks: ["scar_under_left_eye", "chest_x_scar"],
      headgear: "straw_hat", footwear: "zori",
      garments: [
        { kind: "vest", color: "#c3262d", buttons: "#f0c030" },
        { kind: "pants", color: "#3b5f8c", length: "knee", cuffs: "#6384ad" },
        { kind: "sash", color: "#f2c230" },
      ],
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
    playerLook: "a muscular green-haired swordsman in a white shirt and green belly wrap, with a scar over his left eye and three swords at his hip",
    look: {
      sex: "m", age: "adult", height: 1.81, build: 0.62, muscle: 0.85, skin: "#c49670",
      hair: { style: "buzz", color: "#3f7d3c" }, eyes: "#1e1714", marks: ["scar_left_eye"], earrings: 3,
      footwear: "boots", footwearColor: "#1c1a19",
      garments: [
        { kind: "shirt", color: "#efebe2", sleeves: "short" },
        { kind: "pants", color: "#1f1d1c", length: "long" },
        { kind: "haramaki", color: "#3f6f3a" },
        { kind: "arm_bandana", color: "#1a1a1a" },
      ],
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
      sex: "m", age: "adult", height: 1.68, build: 0.4, muscle: 0.45, skin: "#e6b68c",
      hair: { style: "spiky", color: "#efc550" }, eyes: "#2f6fd6", marks: ["whiskers"],
      headgear: "leaf_headband", footwear: "ninja_sandals", footwearColor: "#26304a",
      garments: [
        { kind: "track_jacket", color: "#ef7a22", shoulders: "#1c1c1e", collar: "#ef7a22", zip: "#1c1c1e" },
        { kind: "pants", color: "#ef7a22", length: "long" },
      ],
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
      sex: "m", age: "adult", height: 1.72, build: 0.4, muscle: 0.5, skin: "#eed0b8",
      hair: { style: "swept", color: "#181a24" }, eyes: "#151414",
      footwear: "ninja_sandals", footwearColor: "#1c1c22",
      garments: [
        { kind: "shirt", color: "#f1eee8", sleeves: "long", open: true },
        { kind: "pants", color: "#29304a", length: "long" },
        { kind: "waist_cloth", color: "#29304a" },
        { kind: "rope_belt", color: "#6c4a8e" },
        { kind: "armguards", color: "#1f1f22" },
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
      sex: "m", age: "adult", height: 1.81, build: 0.5, muscle: 0.6, skin: "#e1b692",
      hair: { style: "spiky", color: "#ee8a2c" }, eyes: "#6a4a2e",
      footwear: "waraji",
      garments: [
        { kind: "tabi", color: "#efebe4" },
        { kind: "kimono", color: "#141416", sleeves: "wide", collar: "#efebe4" },
        { kind: "hakama", color: "#141416" },
        { kind: "sash", color: "#efebe4" },
        { kind: "chest_strap", color: "#a8261f" },
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
      sex: "m", age: "adult", height: 1.8, build: 0.4, muscle: 0.35, skin: "#eed4bf",
      hair: { style: "long_straight", color: "#111114" }, eyes: "#565b66",
      headgear: "kenseikan", footwear: "waraji",
      garments: [
        { kind: "tabi", color: "#efebe4" },
        { kind: "kimono", color: "#141416", sleeves: "wide", collar: "#efebe4" },
        { kind: "hakama", color: "#141416" },
        { kind: "sash", color: "#efebe4" },
        { kind: "haori", color: "#f3f1eb", long: true, sleeveless: true },
        { kind: "scarf", color: "#e3e6ec", long: true },
        { kind: "gloves", color: "#f2f0ea" },
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
      sex: "f", age: "adult", height: 1.66, build: 0.35, muscle: 0.35, skin: "#e6c0a0",
      hair: { style: "wavy_ponytail", color: "#7a3fa2" }, eyes: "#5a3478", marks: ["bandaid"],
      footwear: "boots", footwearColor: "#4a2d62",
      garments: [
        { kind: "shirt", color: "#b89ad2", sleeves: "rolled" },
        { kind: "pants", color: "#553176", length: "long", stripe: "#f2c230" },
        { kind: "belt", color: "#3a2a20" },
        { kind: "neck_bandana", color: "#e0b93a" },
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
      sex: "m", age: "adult", height: 1.93, build: 1, muscle: 1, skin: "#c48a60",
      hair: { style: "ronin", color: "#15110f" }, eyes: "#2a1f18",
      headgear: "luchador_mask", footwear: "wrestling_boots", footwearColor: "#1f5cd0",
      garments: [
        { kind: "pants", color: "#1f5cd0", length: "long", stripe: "#f2c21c" },
        { kind: "belt", color: "#b3261e", wide: true, buckle: "#e0b43a" },
        { kind: "wristbands", color: "#1f5cd0" },
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
