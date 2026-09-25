// Every item the player can own. Prices are in mon (文), the village's copper coin.

export type ItemKind = "weapon" | "armor" | "food" | "remedy" | "cosmetic" | "charm" | "quest" | "trade";

export type WeaponStyle = "fists" | "sword" | "greatsword" | "twin" | "triple" | "shotgun" | "kunai";

export interface WeaponStats {
  style: WeaponStyle;
  damage: number;
  /** Attack reach in metres. */
  reach: number;
  /** Multiplier on attack speed (1 = normal). */
  speed: number;
}

export interface ItemDef {
  id: string;
  name: string;
  /** Japanese name shown under the English one. */
  jp?: string;
  kind: ItemKind;
  price: number;
  description: string;
  weapon?: WeaponStats;
  /** Fraction of incoming damage removed. */
  armor?: number;
  /** Movement speed multiplier while worn. */
  armorSpeed?: number;
  heal?: number;
  stamina?: number;
  /** Timed buff applied when consumed. */
  buff?: { kind: "stamina_regen" | "power" | "tipsy"; seconds: number };
  cosmetic?: "straw_hat" | "kitsune_mask" | "hachimaki" | "oni_mask";
  /** Price a merchant pays when the player sells it (0 = not sellable). */
  sellPrice?: number;
  /** Signature weapons belong to one character and are never sold. */
  signature?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  // — weapons —
  bokken: {
    id: "bokken", name: "Wooden Bokken", jp: "木刀", kind: "weapon", price: 40,
    description: "A white-oak practice sword. It bruises rather than cuts.",
    weapon: { style: "sword", damage: 9, reach: 2.1, speed: 1.1 }, sellPrice: 15,
  },
  katana: {
    id: "katana", name: "Katana", jp: "刀", kind: "weapon", price: 260,
    description: "A folded-steel blade with a black lacquered scabbard. Balanced and quick.",
    weapon: { style: "sword", damage: 17, reach: 2.3, speed: 1 }, sellPrice: 110,
  },
  nodachi: {
    id: "nodachi", name: "Nodachi", jp: "野太刀", kind: "weapon", price: 540,
    description: "A field sword as tall as a man. Slow, but it clears a crowd.",
    weapon: { style: "greatsword", damage: 26, reach: 2.9, speed: 0.78 }, sellPrice: 230,
  },
  tsukikage: {
    id: "tsukikage", name: "Tsukikage, the Moon Blade", jp: "月影", kind: "weapon", price: 0,
    description: "Forged by Tetsu from moon iron. The steel holds a pale light even at night.",
    weapon: { style: "sword", damage: 32, reach: 2.4, speed: 1.08 },
  },

  // — signature weapons (one per playable character) —
  santoryu: {
    id: "santoryu", name: "Three Swords", jp: "三刀流", kind: "weapon", price: 0, signature: true,
    description: "A white blade, a cursed red blade, and a black one. One of them goes in the mouth.",
    weapon: { style: "triple", damage: 21, reach: 2.4, speed: 0.95 },
  },
  zangetsu: {
    id: "zangetsu", name: "Zangetsu", jp: "斬月", kind: "weapon", price: 0, signature: true,
    description: "A cleaver of a sword with no guard, taller than its wielder.",
    weapon: { style: "greatsword", damage: 25, reach: 2.8, speed: 0.85 },
  },
  senbonzakura: {
    id: "senbonzakura", name: "Senbonzakura", jp: "千本桜", kind: "weapon", price: 0, signature: true,
    description: "An elegant blade that can scatter into a thousand petal-thin edges.",
    weapon: { style: "sword", damage: 19, reach: 2.3, speed: 1.05 },
  },
  kusanagi: {
    id: "kusanagi", name: "Kusanagi", jp: "草薙", kind: "weapon", price: 0, signature: true,
    description: "A straight chokutō worn at the small of the back.",
    weapon: { style: "sword", damage: 18, reach: 2.2, speed: 1.15 },
  },
  kunai: {
    id: "kunai", name: "Kunai", jp: "苦無", kind: "weapon", price: 0, signature: true,
    description: "A ninja's throwing knife, worn in a thigh holster.",
    weapon: { style: "kunai", damage: 11, reach: 1.6, speed: 1.35 },
  },
  boomstick: {
    id: "boomstick", name: "Boomstick", kind: "weapon", price: 0, signature: true,
    description: "A double-barrel shotgun. Loud, short-ranged, very persuasive.",
    weapon: { style: "shotgun", damage: 15, reach: 7, speed: 0.8 },
  },

  kanabo: {
    id: "kanabo", name: "Iron Kanabō", jp: "金棒", kind: "weapon", price: 0,
    description: "A studded iron club. Swung by oni in the old stories, and by Kurogane now.",
    weapon: { style: "greatsword", damage: 24, reach: 2.6, speed: 0.75 },
  },

  // — armor —
  padded_jacket: {
    id: "padded_jacket", name: "Padded Jacket", jp: "刺子", kind: "armor", price: 90,
    description: "Quilted sashiko cotton. Turns a glancing blow.", armor: 0.15, sellPrice: 35,
  },
  lamellar_do: {
    id: "lamellar_do", name: "Lamellar Dō", jp: "胴", kind: "armor", price: 290,
    description: "Lacquered iron scales laced with blue silk.", armor: 0.3, armorSpeed: 0.97, sellPrice: 120,
  },
  o_yoroi: {
    id: "o_yoroi", name: "Ō-yoroi Armor", jp: "大鎧", kind: "armor", price: 680,
    description: "Full great armor of a mounted warrior. Heavy, and very hard to cut through.",
    armor: 0.45, armorSpeed: 0.9, sellPrice: 280,
  },

  // — food —
  onigiri: {
    id: "onigiri", name: "Onigiri", jp: "おにぎり", kind: "food", price: 6,
    description: "A rice ball with pickled plum, wrapped in nori.", heal: 20, sellPrice: 2,
  },
  dango: {
    id: "dango", name: "Hanami Dango", jp: "花見団子", kind: "food", price: 5,
    description: "Pink, white and green rice dumplings on a skewer.", heal: 12, stamina: 30, sellPrice: 2,
  },
  ramen: {
    id: "ramen", name: "Bowl of Ramen", jp: "ラーメン", kind: "food", price: 14,
    description: "Genzo's pork-bone broth. Restores body and spirit.", heal: 45,
  },
  green_tea: {
    id: "green_tea", name: "Green Tea", jp: "緑茶", kind: "food", price: 8,
    description: "Whisked matcha. Your breath comes easier for a while.",
    heal: 5, buff: { kind: "stamina_regen", seconds: 90 },
  },
  sake: {
    id: "sake", name: "Flask of Sake", jp: "酒", kind: "food", price: 15,
    description: "Warm rice wine. Hits harder; so do you. Walking straight is optional.",
    heal: 10, buff: { kind: "tipsy", seconds: 40 }, sellPrice: 6,
  },
  grilled_fish: {
    id: "grilled_fish", name: "Grilled Sweetfish", jp: "鮎の塩焼き", kind: "food", price: 10,
    description: "River ayu on a skewer, salted and charred.", heal: 28, sellPrice: 4,
  },

  // — remedies —
  herbal_salve: {
    id: "herbal_salve", name: "Herbal Salve", jp: "軟膏", kind: "remedy", price: 25,
    description: "Oume's comfrey and mugwort salve for cuts and bruises.", heal: 60, sellPrice: 10,
  },
  ginseng_tonic: {
    id: "ginseng_tonic", name: "Ginseng Tonic", jp: "高麗人参", kind: "remedy", price: 60,
    description: "Bitter as regret. Heals you completely and steadies your breathing.",
    heal: 999, buff: { kind: "stamina_regen", seconds: 120 }, sellPrice: 25,
  },
  war_pill: {
    id: "war_pill", name: "Tiger Pill", jp: "虎丸", kind: "remedy", price: 45,
    description: "A black pill of secret herbs. Your strikes land harder for a minute.",
    buff: { kind: "power", seconds: 60 }, sellPrice: 15,
  },

  // — cosmetics & gifts —
  straw_hat: {
    id: "straw_hat", name: "Straw Kasa", jp: "笠", kind: "cosmetic", price: 30,
    description: "A wide woven hat that keeps off sun and rain.", cosmetic: "straw_hat", sellPrice: 10,
  },
  kitsune_mask: {
    id: "kitsune_mask", name: "Kitsune Mask", jp: "狐面", kind: "cosmetic", price: 45,
    description: "A white fox mask from the spring festival.", cosmetic: "kitsune_mask", sellPrice: 15,
  },
  oni_mask: {
    id: "oni_mask", name: "Oni Mask", jp: "鬼面", kind: "cosmetic", price: 0,
    description: "Kurogane's red demon mask. Villagers flinch when they see it.", cosmetic: "oni_mask", sellPrice: 60,
  },
  hachimaki: {
    id: "hachimaki", name: "Hachimaki", jp: "鉢巻", kind: "cosmetic", price: 12,
    description: "A white headband for resolve.", cosmetic: "hachimaki", sellPrice: 4,
  },
  omamori: {
    id: "omamori", name: "Shrine Omamori", jp: "御守", kind: "charm", price: 0,
    description: "A silk charm blessed by Kūkai. Your body feels sturdier (+20 max health).",
  },

  // — quest & trade goods —
  rice_bale: {
    id: "rice_bale", name: "Rice Bale", jp: "米俵", kind: "quest", price: 0,
    description: "A straw bale of Hana's rice, meant for the inn's kitchen.",
  },
  lucky_charm: {
    id: "lucky_charm", name: "Isamu's Lucky Charm", jp: "お守り", kind: "quest", price: 0,
    description: "A small carved wooden carp on a red cord, still damp from the river.",
  },
  moon_iron: {
    id: "moon_iron", name: "Moon Iron", jp: "月鉄", kind: "quest", price: 0,
    description: "A lump of pale meteoric iron, cool to the touch. Kurogane was hoarding it.",
  },
  bandit_token: {
    id: "bandit_token", name: "Bandit Token", jp: "賊札", kind: "trade", price: 0,
    description: "A wooden tag bandits carry. Captain Goro pays a bounty for each.", sellPrice: 20,
  },
};

export function item(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown item ${id}`);
  return def;
}
