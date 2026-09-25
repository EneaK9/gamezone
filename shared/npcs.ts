// Everyone who lives in (or menaces) Kazemura.
//
// The authored lines here are what NPCs actually say. Jev never writes dialogue: it
// reads the player's message and returns typed judgments (intent, topic, item,
// politeness, threat...). The game code then picks from these lines and runs the
// consequences. Lines may use {player}, {item}, {price}, {place}, {money} placeholders.

import type { Look } from "./look";

export type NpcRole =
  | "merchant"
  | "villager"
  | "guard"
  | "sensei"
  | "student"
  | "monk"
  | "innkeeper"
  | "hostess"
  | "fisher"
  | "farmer"
  | "child"
  | "ronin"
  | "bandit"
  | "chief";

export type ServiceId = "rest" | "chohan" | "training" | "blessing" | "spar";

export interface NpcService {
  id: ServiceId;
  label: string;
  price: number;
  description: string;
}

export interface NpcTopic {
  id: string;
  label: string;
  /** What the topic covers — used by Jev to match the player's question. */
  about: string;
  lines: string[];
}

export interface NpcFighter {
  hp: number;
  damage: number;
  /** Item id of the weapon they fight with ("fists" for unarmed). */
  weapon: string;
  /** 0 clumsy … 1 master: affects block chance, reaction time and combos. */
  skill: number;
  /** Attacks the player on sight. */
  hostile?: boolean;
  /** Accepts formal duels; prize paid by the NPC on defeat. */
  duel?: { prize: number };
  /** Non-lethal sparring (dojo). */
  sparring?: boolean;
}

export interface NpcLines {
  greet: string[];
  greetFriendly?: string[];
  greetCold?: string[];
  smallTalk: string[];
  farewell: string[];
  unclear: string[];
  insulted: string[];
  threatened: string[];
  flattered: string[];
  noWares?: string[];
  noWork?: string[];
  challengeRefused?: string[];
  challengeAccepted?: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  /** Short role title shown under the name. */
  title: string;
  role: NpcRole;
  /** A sentence about who they are, given to Jev as context. */
  personality: string;
  home: { x: number; z: number; facing: number };
  /** Metres they amble around home (0 = stays put). */
  wander: number;
  /** Patrol loop for guards. */
  route?: { x: number; z: number }[];
  look: Look;
  shop?: {
    wares: string[];
    /** Item ids this merchant will buy from the player. */
    buys: string[];
    /** Largest haggled discount, 0..1. */
    maxDiscount: number;
  };
  services?: NpcService[];
  /** Quest this NPC gives. */
  quest?: string;
  topics: NpcTopic[];
  lines: NpcLines;
  fighter?: NpcFighter;
  /** Hostiles can't be talked to. */
  talkable: boolean;
}

// ——— shared line pools ——————————————————————————————————————————

const COMMON_UNCLEAR = [
  "Hm? Speak plainly, traveler.",
  "I don't follow you.",
  "Say that again — the river is loud today.",
];

const VILLAGER_TOPICS: NpcTopic[] = [
  {
    id: "village",
    label: "Kazemura",
    about: "The village itself, its history, name, or what life is like here",
    lines: [
      "Kazemura means 'wind village'. The wind comes down the valley every evening and rings every chime in town.",
      "Rice, fish, and Tetsu's steel — that's all Kazemura is. It's enough.",
    ],
  },
  {
    id: "bandits",
    label: "The bandits",
    about: "The bandits, Kurogane the bandit chief, danger outside the walls",
    lines: [
      "Kurogane's gang camps in the northern woods. They wear red oni masks and take what they like.",
      "Captain Goro at the west gate pays for bandit tokens. Not that I'd go near those woods.",
    ],
  },
  {
    id: "shrine",
    label: "The shrine",
    about: "The mountain shrine, the torii path, the monk Kukai, prayer",
    lines: [
      "Cross the red bridge and follow the torii up the hill. Kūkai keeps the shrine. He talks in riddles.",
      "Thirty gates on the path to the shrine, each one donated by a family. Ours is the eleventh.",
    ],
  },
];

const VILLAGER_LINES: NpcLines = {
  greet: ["Good day to you.", "Ah — a traveler. Welcome to Kazemura.", "Mind the carts on the main street."],
  greetFriendly: ["{player}! Good to see you again.", "Ah, {player}. The village is safer with you around."],
  greetCold: ["...What do you want?", "Keep your distance, please."],
  smallTalk: [
    "The cherry trees bloomed early this year. Old Oume says it means a mild summer.",
    "My back aches from the paddies, but the rice looks good.",
    "Have you tried Genzo's ramen? I'd walk to the capital and back for that broth.",
    "The wind comes down the valley every evening. You'll hear the chimes.",
  ],
  farewell: ["Walk safely.", "Take care on the roads.", "Until next time."],
  unclear: COMMON_UNCLEAR,
  insulted: ["How rude!", "Hmph. And I thought you were a decent sort."],
  threatened: ["P-please, I have nothing! Guards!", "Leave me alone! I'll call Captain Goro!"],
  flattered: ["Oh, you're too kind.", "Ha! Flattery won't get you free rice."],
  noWares: ["I'm no merchant. Try the shops on the main street.", "I've nothing to sell. The market's on the main street."],
  noWork: ["Work? Ask Captain Goro at the west gate, or check the notice board in the square."],
  challengeRefused: ["Fight? Me? I'm a rice farmer, not a samurai!"],
};

// ——— named NPCs ——————————————————————————————————————————————

export const NPCS: NpcDef[] = [
  {
    id: "tetsu",
    name: "Tetsu",
    title: "Swordsmith",
    role: "merchant",
    personality: "Gruff, soot-stained master swordsmith in his fifties. Respects strength and honesty, hates haggling and flattery, secretly soft-hearted. Proud of his steel.",
    home: { x: -86, z: -7.2, facing: 0 },
    wander: 1.5,
    look: {
      sex: "m", age: "adult", height: 1.72, build: 0.75, muscle: 0.7, skin: "#c89a74",
      hair: { style: "topknot", color: "#2a2522" }, facial: "beard", facialColor: "#3b3430",
      headgear: "tenugui", headgearColor: "#e8e2d2", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#3c3f45", sleeves: "short", collar: "#2c2e33" },
        { kind: "pants", color: "#2e2b27", length: "long", baggy: true },
        { kind: "apron", color: "#5a3b26" },
        { kind: "sash", color: "#1f1d1b" },
      ],
    },
    shop: { wares: ["bokken", "katana", "nodachi"], buys: ["bokken", "katana", "nodachi", "bandit_token"], maxDiscount: 0.12 },
    quest: "moonblade",
    topics: [
      {
        id: "steel",
        label: "His swords",
        about: "Tetsu's swords, sword-making, folding steel, the quality of his blades",
        lines: [
          "Each blade is folded sixteen times and quenched in water from the falls. That's why it doesn't chip.",
          "A katana isn't a tool. It's a promise. Don't buy one if you don't mean to keep it.",
        ],
      },
      {
        id: "moon_blade",
        label: "The Moon Blade",
        about: "The legend of the Moon Blade, moon iron, a legendary sword he wants to forge",
        lines: [
          "A star fell on the northern ridge when I was a boy. The iron from it is pale as moonlight. Kurogane's bandits dug it up and sit on it like crows.",
          "Bring me that moon iron and I'll forge you a blade the world hasn't seen. Tsukikage — the Moon's Shadow.",
        ],
      },
      {
        id: "self",
        label: "Himself",
        about: "Tetsu's own life, family, how long he's been a smith",
        lines: [
          "Forty years at this anvil. My father's anvil, and his father's.",
          "I had an apprentice once. He went to the capital to make pretty swords for lords. Pretty swords break.",
        ],
      },
    ],
    lines: {
      greet: ["Hm. You've got the look of someone who needs a sword.", "Don't touch the blades on the rack unless you mean to buy."],
      greetFriendly: ["{player}. Come in, come in. The forge is hot today."],
      greetCold: ["You again. Buy something or let me work."],
      smallTalk: [
        "Too hot to talk. The forge doesn't care about the weather.",
        "Sakura blossoms are fine. Steel is finer.",
      ],
      farewell: ["Keep your edge oiled.", "Go on, then."],
      unclear: ["Speak up. I've been deaf in one ear since '82."],
      insulted: ["Say that again and I'll quench YOU in the trough.", "Watch your tongue in my forge."],
      threatened: ["You'd threaten a man holding a hammer? Try it.", "Guards! — Ha, I don't need guards. Get out."],
      flattered: ["Flattery won't lower my prices.", "Hmph. My steel speaks for itself."],
      noWork: ["Work? If you want to help, bring me moon iron from Kurogane's camp."],
      challengeRefused: ["I make swords. I don't duel with them. Go bother the dojo."],
    },
    talkable: true,
  },
  {
    id: "oume",
    name: "Grandmother Oume",
    title: "Apothecary",
    role: "merchant",
    personality: "Tiny, sharp-eyed herbalist in her eighties. Warm to polite people, merciless to rude ones. Knows every plant in the valley and every rumor in the village.",
    home: { x: -72, z: 7.2, facing: Math.PI },
    wander: 1,
    look: {
      sex: "f", age: "elder", height: 1.46, build: 0.3, skin: "#d9b596",
      hair: { style: "gray_bun", color: "#c9c5bf" }, footwear: "zori",
      garments: [
        { kind: "long_kimono", color: "#5d6b54", pattern: "hemp", accent: "#3e4a38", collar: "#e8e0cf" },
        { kind: "sash", color: "#8a5a3c", wide: true },
      ],
    },
    shop: { wares: ["herbal_salve", "ginseng_tonic", "war_pill", "green_tea"], buys: ["herbal_salve", "ginseng_tonic"], maxDiscount: 0.2 },
    topics: [
      {
        id: "herbs",
        label: "Herbs",
        about: "Herbs, medicine, healing, remedies, what her potions do",
        lines: [
          "Mugwort for cuts, ginseng for the tired heart, and a tiger pill when you must be braver than you are.",
          "The salve heals a good deal. The tonic heals everything but foolishness.",
        ],
      },
      {
        id: "rumors",
        label: "Rumors",
        about: "Gossip, rumors, secrets about villagers",
        lines: [
          "Jubei the ronin was a great swordsman once. Then his lord died and he found the sake jug. Beat him in a duel and he might remember who he was.",
          "Little Kenta lost his cat again. Mochi likes high places... and fish.",
          "They say the bandit chief keeps moon iron in a chest by his fire. Tetsu would give his beard for it.",
        ],
      },
      {
        id: "self",
        label: "Herself",
        about: "Oume's own life and age",
        lines: ["Eighty-three winters. I've outlived three husbands and two lords.", "My mother taught me herbs. Her mother taught her. You don't want to know what I teach my cats."],
      },
    ],
    lines: {
      greet: ["Come in, child. What ails you?", "Mind the jars, dear."],
      greetFriendly: ["Ah, {player}! Sit, sit. You look thin."],
      greetCold: ["Oh. It's you. What do you want?"],
      smallTalk: ["The mugwort grows well by the river this spring.", "My knees tell me it will rain tomorrow. My knees are never wrong."],
      farewell: ["Eat something warm.", "Don't get stabbed, dear."],
      unclear: ["Speak up, child, I'm old, not a mind-reader."],
      insulted: ["Such a mouth! Your mother would weep.", "Rudeness is a sickness too, and I have no cure for it."],
      threatened: ["Hah! I've buried braver men than you.", "Go on then. My ginseng doesn't work on the dead."],
      flattered: ["Oh, stop. Well — keep going.", "Charming. Your price is still your price."],
      noWork: ["Work? Help Kenta find his cat. The boy's been crying all morning."],
      challengeRefused: ["Duel an old woman? Is that what samurai do now?"],
    },
    talkable: true,
  },
  {
    id: "genzo",
    name: "Genzo",
    title: "Noodle Vendor",
    role: "merchant",
    personality: "Loud, jolly, round noodle vendor who loves feeding people and telling bad jokes. Generous with good customers.",
    home: { x: -28, z: 10.3, facing: Math.PI },
    wander: 1.2,
    look: {
      sex: "m", age: "adult", height: 1.66, build: 0.95, skin: "#d4a27c",
      hair: { style: "buzz", color: "#1c1a18" }, facial: "mustache", facialColor: "#1c1a18",
      headgear: "hachimaki", footwear: "geta",
      garments: [
        { kind: "kimono", color: "#e9e2d0", sleeves: "short", collar: "#d9d0bb" },
        { kind: "pants", color: "#39465a", length: "knee" },
        { kind: "apron", color: "#2f4b6e" },
      ],
    },
    shop: { wares: ["ramen", "onigiri", "dango", "grilled_fish", "sake"], buys: ["grilled_fish"], maxDiscount: 0.25 },
    topics: [
      {
        id: "food",
        label: "His food",
        about: "Genzo's food, ramen, recipes, broth, cooking",
        lines: [
          "The broth simmers for two days. Pork bones, kelp, and a secret I'll take to my grave.",
          "Onigiri for the road, ramen for the soul, sake for courage. Pick your medicine!",
        ],
      },
      {
        id: "jokes",
        label: "A joke",
        about: "Jokes, something funny, humor",
        lines: [
          "Why did the ronin bring a ladder to the tea house? He heard the drinks were on the house! Ha!",
          "What do you call a samurai with no sword? A-mu-rai! ...Because he's missing... never mind.",
        ],
      },
      {
        id: "fish",
        label: "Fish",
        about: "Fish, the fisherman Isamu, the river",
        lines: ["Isamu brings me sweetfish every morning. Lately his luck's been terrible — lost his lucky charm in the river."],
      },
    ],
    lines: {
      greet: ["Irasshai! Hungry? Of course you're hungry!", "Hey hey! Best noodles in the province, right here!"],
      greetFriendly: ["{player}! Your usual? I'll give you extra pork."],
      greetCold: ["...We're closing. Maybe."],
      smallTalk: ["A good day is a day with full bowls.", "If you see my wife, I'm working very hard."],
      farewell: ["Come back hungry!", "Don't fight on a full stomach!"],
      unclear: ["Ha? You want noodles or not?"],
      insulted: ["Hey! Insult me, fine, but never my broth!", "Rude! You get the small bowl."],
      threatened: ["Whoa whoa! Take the dumplings, just don't hurt the pot!", "Guards! Someone's threatening a noodle man!"],
      flattered: ["Ha! You have a golden tongue. Here, taste this.", "Tell everyone! Tell the whole province!"],
      noWork: ["Work? Deliver noodles? Ha — no, but Hana the farmer always needs hands."],
      challengeRefused: ["I fight only with ladles, friend."],
    },
    talkable: true,
  },
  {
    id: "masa",
    name: "Masa",
    title: "Armorer",
    role: "merchant",
    personality: "Calm, precise former soldier who makes armor. Speaks little, values preparation, gives honest advice about protection.",
    home: { x: -12, z: -7, facing: 0 },
    wander: 1,
    look: {
      sex: "m", age: "adult", height: 1.78, build: 0.6, muscle: 0.5, skin: "#c69a78",
      hair: { style: "ronin", color: "#22201e" }, facial: "goatee", facialColor: "#22201e", marks: ["scar_left_eye"],
      footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#4a3a2c", sleeves: "narrow", collar: "#2b221b" },
        { kind: "hakama", color: "#2d2a26" },
        { kind: "sash", color: "#6e2c22" },
      ],
    },
    shop: { wares: ["padded_jacket", "lamellar_do", "o_yoroi"], buys: ["padded_jacket", "lamellar_do", "o_yoroi"], maxDiscount: 0.15 },
    topics: [
      {
        id: "armor",
        label: "Armor",
        about: "Armor, protection, which armor to choose",
        lines: [
          "The padded jacket stops a glancing blow. The lamellar dō stops a real one. The ō-yoroi stops almost anything — and slows you down.",
          "Bandits swing wild. A little armor turns their best cut into a bruise.",
        ],
      },
      {
        id: "war",
        label: "The war",
        about: "Masa's past as a soldier, battles, war",
        lines: ["I carried a spear at Sekigahara... No. I don't talk about that.", "I lost an eye and a lord in the same afternoon. Now I make armor so others keep theirs."],
      },
    ],
    lines: {
      greet: ["Armor?", "Come. Let me see your shoulders — I'll find a fit."],
      greetFriendly: ["{player}. Still in one piece. Good."],
      greetCold: ["Hm."],
      smallTalk: ["Weather doesn't matter. Preparation does.", "Keep your chin down in a fight."],
      farewell: ["Guard well.", "Chin down."],
      unclear: ["Say again."],
      insulted: ["...Noted.", "I've been insulted by better men. Most of them are dead."],
      threatened: ["Try it. I'm wearing my own work.", "You'd lose."],
      flattered: ["Thank you. The price stays.", "Hm. Kind of you."],
      noWork: ["No work here. Goro needs swords at the west gate."],
      challengeRefused: ["I've had enough fighting for one life."],
    },
    talkable: true,
  },
  {
    id: "kichibei",
    name: "Kichibei",
    title: "Traveling Merchant",
    role: "merchant",
    personality: "Chatty, sly traveling merchant with a huge backpack. Loves a good haggle and respects a clever bargainer. Always exaggerates.",
    home: { x: 4, z: 7, facing: Math.PI },
    wander: 2,
    look: {
      sex: "m", age: "adult", height: 1.64, build: 0.45, skin: "#d2a784",
      hair: { style: "topknot", color: "#2d2a26" }, facial: "mustache", facialColor: "#2d2a26",
      headgear: "kasa", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#7b5a2e", sleeves: "narrow", pattern: "checks", accent: "#5e4422", collar: "#e2d8c4" },
        { kind: "pants", color: "#3c3b36", length: "knee" },
        { kind: "sash", color: "#2c4a3a" },
      ],
    },
    shop: {
      wares: ["straw_hat", "kitsune_mask", "hachimaki", "onigiri", "sake"],
      buys: ["bandit_token", "oni_mask", "kitsune_mask", "straw_hat", "grilled_fish", "sake", "herbal_salve"],
      maxDiscount: 0.3,
    },
    topics: [
      {
        id: "travels",
        label: "His travels",
        about: "Kichibei's travels, the capital, other provinces, the road",
        lines: [
          "I've sold hats to a shogun's nephew and masks to a ghost. Well — she looked like a ghost.",
          "The road from Edo takes nineteen days. Eighteen if the ferryman owes you money.",
        ],
      },
      {
        id: "masks",
        label: "The masks",
        about: "The kitsune fox mask, festival masks, the oni mask",
        lines: ["The fox mask is from the spring festival in Kyoto. Wear it and the kami think you're one of them.", "Red oni masks? Bandits wear those. I'd pay well for one — collectors love them."],
      },
    ],
    lines: {
      greet: ["Friend! Come, come — the finest goods from nine provinces!", "Ah, a customer with taste! I can always tell."],
      greetFriendly: ["{player}! My favorite customer — don't tell the others."],
      greetCold: ["Oh. You. Cash only today."],
      smallTalk: ["Business is business. Weather is just weather.", "Every village says their ramen is the best. Kazemura is actually right."],
      farewell: ["Come back when your purse is heavier!", "Safe roads, friend!"],
      unclear: ["Ha! Say it in plain merchant, friend."],
      insulted: ["Ouch! My prices just went up.", "Insults are free. My goods are not."],
      threatened: ["Now, now — violence is bad for business. Guards!", "Take a hat, take a hat, just don't hit me!"],
      flattered: ["A silver tongue! I like you. Let's talk prices.", "Flattery! My favorite currency after coins."],
      noWork: ["Work? Bring me bandit tokens or an oni mask — I'll pay."],
      challengeRefused: ["Duel? I'm a merchant. My weapon is a ledger."],
    },
    talkable: true,
  },
  {
    id: "hideaki",
    name: "Sensei Hideaki",
    title: "Dojo Master",
    role: "sensei",
    personality: "Stern, disciplined sword master in his sixties. Values courtesy, respect, and effort above talent. Speaks in short, deliberate sentences. Rude challengers are refused.",
    home: { x: -40, z: -84.6, facing: 0 },
    wander: 2,
    look: {
      sex: "m", age: "elder", height: 1.7, build: 0.45, muscle: 0.5, skin: "#c99d7c",
      hair: { style: "topknot", color: "#d6d2cc" }, facial: "long_beard", facialColor: "#d6d2cc",
      footwear: "bare",
      garments: [
        { kind: "kimono", color: "#f0ebe0", sleeves: "wide", collar: "#e0d8c8" },
        { kind: "hakama", color: "#1f2733" },
        { kind: "sash", color: "#1f2733" },
      ],
    },
    services: [
      { id: "training", label: "Train (+10% damage)", price: 150, description: "A day of hard drills with the sensei. Permanently strengthens your strikes." },
      { id: "spar", label: "Spar with a student", price: 0, description: "A practice bout with wooden swords. Win to earn 30 mon." },
    ],
    quest: "dojo",
    fighter: { hp: 260, damage: 16, weapon: "bokken", skill: 0.95, duel: { prize: 150 } },
    topics: [
      {
        id: "bushido",
        label: "The way of the sword",
        about: "Bushido, the way of the warrior, honor, discipline, sword technique",
        lines: [
          "The sword is the soul. A soul without courtesy is only a blade.",
          "Strike when the enemy breathes in. Guard when he breathes out. Most men never notice they breathe at all.",
        ],
      },
      {
        id: "dojo",
        label: "The dojo",
        about: "The dojo, its students, training, trials to become champion",
        lines: [
          "Defeat three of my students in fair bouts. Then you may face me.",
          "My students are young. They fight with enthusiasm. Enthusiasm is not technique.",
        ],
      },
      {
        id: "jubei",
        label: "Jubei",
        about: "Jubei the ronin, Hideaki's former student",
        lines: ["Jubei was my finest student. Now he duels with sake cups. It shames us both."],
      },
    ],
    lines: {
      greet: ["Bow when you enter a dojo.", "Hm. You carry yourself like a fighter. Do you have the discipline to match?"],
      greetFriendly: ["{player}. Your stance has improved."],
      greetCold: ["You again. Your manners have not improved."],
      smallTalk: ["The seasons change. The way does not.", "Idle talk dulls the mind."],
      farewell: ["Train every day.", "Go. Practice."],
      unclear: ["Speak clearly. Clarity is the first discipline."],
      insulted: ["Your words show your training. It is lacking.", "Leave my dojo until you learn respect."],
      threatened: ["A threat is a confession of weakness.", "Draw, then. I will teach you something."],
      flattered: ["Praise is wind. It moves nothing.", "Save your breath for training."],
      noWork: ["The only work here is training."],
      challengeRefused: ["You have not earned a bout with me. Defeat three of my students first."],
      challengeAccepted: ["Very well. Bow — then begin."],
    },
    talkable: true,
  },
  {
    id: "ren",
    name: "Ren",
    title: "Dojo Student",
    role: "student",
    personality: "Cocky, energetic teenage dojo student who wants to prove himself.",
    home: { x: -46, z: -80, facing: 0 },
    wander: 3,
    look: {
      sex: "m", age: "adult", height: 1.68, build: 0.35, skin: "#d4a888",
      hair: { style: "ronin", color: "#1b1917" }, headgear: "hachimaki", footwear: "bare",
      garments: [
        { kind: "kimono", color: "#e8e3d8", sleeves: "narrow", collar: "#d8d0c0" },
        { kind: "hakama", color: "#2c3a52" },
      ],
    },
    fighter: { hp: 90, damage: 7, weapon: "bokken", skill: 0.35, sparring: true, duel: { prize: 30 } },
    topics: [
      { id: "training", label: "Training", about: "Dojo training, sparring, the sensei", lines: ["Sensei makes us do a thousand cuts before breakfast. A THOUSAND.", "I'm going to be dojo champion by autumn. You'll see."] },
    ],
    lines: {
      greet: ["Hey! You want to spar? Come on!", "You're new. Bet you can't beat me."],
      smallTalk: ["My arms hurt. Don't tell Sensei."],
      farewell: ["Next time I'll win!"],
      unclear: ["Huh?"],
      insulted: ["Oh yeah? Let's settle it with bokken!"],
      threatened: ["Real swords aren't allowed here, idiot!"],
      flattered: ["Heh. I know."],
      challengeAccepted: ["Finally! Bokken ready — go!"],
    },
    talkable: true,
  },
  {
    id: "daichi",
    name: "Daichi",
    title: "Dojo Student",
    role: "student",
    personality: "Big, quiet, patient dojo student. Friendly and polite, surprisingly strong.",
    home: { x: -34, z: -78, facing: 0 },
    wander: 3,
    look: {
      sex: "m", age: "adult", height: 1.86, build: 0.85, muscle: 0.6, skin: "#c9966f",
      hair: { style: "buzz", color: "#161412" }, footwear: "bare",
      garments: [
        { kind: "kimono", color: "#e8e3d8", sleeves: "narrow", collar: "#d8d0c0" },
        { kind: "hakama", color: "#2c3a52" },
      ],
    },
    fighter: { hp: 130, damage: 9, weapon: "bokken", skill: 0.45, sparring: true, duel: { prize: 30 } },
    topics: [
      { id: "training", label: "Training", about: "Dojo training, sparring, strength", lines: ["Sensei says strength is nothing without timing. I'm still working on the timing part.", "Ren talks a lot. He's actually good, though."] },
    ],
    lines: {
      greet: ["Hello. Would you like to spar?", "Good afternoon."],
      smallTalk: ["I like the sound of the bamboo in the wind."],
      farewell: ["Be well."],
      unclear: ["Sorry, I didn't understand."],
      insulted: ["...That wasn't very nice."],
      threatened: ["Please don't. I don't want to hurt you."],
      flattered: ["Oh — thank you."],
      challengeAccepted: ["Alright. Go easy on me."],
    },
    talkable: true,
  },
  {
    id: "kaede",
    name: "Kaede",
    title: "Dojo Student",
    role: "student",
    personality: "Serious, precise young woman, the best student in the dojo. Blunt and competitive.",
    home: { x: -40, z: -76, facing: 0 },
    wander: 3,
    look: {
      sex: "f", age: "adult", height: 1.62, build: 0.3, muscle: 0.3, skin: "#e0b898",
      hair: { style: "ronin", color: "#141210" }, headgear: "hachimaki", footwear: "bare",
      garments: [
        { kind: "kimono", color: "#e8e3d8", sleeves: "narrow", collar: "#d8d0c0" },
        { kind: "hakama", color: "#6b2330" },
      ],
    },
    fighter: { hp: 110, damage: 10, weapon: "bokken", skill: 0.6, sparring: true, duel: { prize: 40 } },
    topics: [
      { id: "training", label: "Training", about: "Dojo training, technique, being the best student", lines: ["I've beaten Ren forty times. He's beaten me twice. He counts them as four.", "Watch the shoulders, not the sword. The shoulders move first."] },
    ],
    lines: {
      greet: ["You're blocking the practice floor.", "Here to train, or to watch?"],
      smallTalk: ["I don't really do small talk."],
      farewell: ["Hm."],
      unclear: ["What?"],
      insulted: ["Say that with a bokken in your hand."],
      threatened: ["I'd like to see you try."],
      flattered: ["Flattery won't make me go easy."],
      challengeAccepted: ["Good. Don't hold back — I won't."],
    },
    talkable: true,
  },
  {
    id: "sayo",
    name: "Sayo",
    title: "Innkeeper",
    role: "innkeeper",
    personality: "Kind, organized innkeeper in her forties who runs the Sakura Inn. Motherly but businesslike. Worried about rice deliveries from the farm.",
    home: { x: -40, z: 70.6, facing: Math.PI },
    wander: 1.5,
    look: {
      sex: "f", age: "adult", height: 1.58, build: 0.45, skin: "#e3bfa0",
      hair: { style: "bun", color: "#231e1b" }, footwear: "zori",
      garments: [
        { kind: "long_kimono", color: "#7a3048", pattern: "cranes", accent: "#e8dcc8", collar: "#f1e8d8" },
        { kind: "sash", color: "#d9b25a", wide: true },
      ],
    },
    services: [{ id: "rest", label: "Rent a room (rest until morning)", price: 30, description: "A futon, a bath, and a hot meal. Restores all health and saves your journey." }],
    topics: [
      { id: "inn", label: "The inn", about: "The Sakura Inn, rooms, the bath, staying the night", lines: ["Our bath is fed by a hot spring. Guests sleep like stones.", "Thirty mon a night, and that includes breakfast. Cheaper than a funeral."] },
      { id: "rice", label: "Rice", about: "Rice deliveries, Hana the farmer, the kitchen", lines: ["Hana's rice cart is late again. If someone brought me a bale I'd pay them for their trouble."] },
    ],
    lines: {
      greet: ["Welcome to the Sakura Inn. A room for the night?", "Welcome, welcome. Please, take off your sandals."],
      greetFriendly: ["{player}! Your room is ready whenever you are."],
      greetCold: ["...We may be full tonight."],
      smallTalk: ["The guests say the wind chimes keep them up. I say they're lucky to hear them.", "Busy season. Travelers everywhere."],
      farewell: ["Rest well.", "Come back before dark."],
      unclear: ["I'm sorry — could you say that again?"],
      insulted: ["There's no need for that kind of talk here.", "I've thrown out drunker men than you."],
      threatened: ["Guards! There's trouble at the inn!", "Please! Take it outside!"],
      flattered: ["Oh, you're sweet. The price is still thirty.", "Thank you. We try our best."],
      noWork: ["If you're going past the farms, Hana might have rice for me."],
      challengeRefused: ["This is an inn, not a dojo!"],
    },
    talkable: true,
  },
  {
    id: "chiyo",
    name: "Chiyo",
    title: "Tea House Hostess",
    role: "hostess",
    personality: "Graceful, witty tea house hostess who also runs the chō-han dice table. Teasing, perceptive, never loses at dice.",
    home: { x: -3, z: 54, facing: Math.PI },
    wander: 1.5,
    look: {
      sex: "f", age: "adult", height: 1.6, build: 0.3, skin: "#efd2bd",
      hair: { style: "bun", color: "#120f0e" }, footwear: "geta",
      garments: [
        { kind: "long_kimono", color: "#2d4f6e", pattern: "waves", accent: "#dce6ee", collar: "#f3eee6" },
        { kind: "sash", color: "#c7483a", wide: true, bow: true },
      ],
    },
    shop: { wares: ["green_tea", "dango", "sake"], buys: [], maxDiscount: 0.1 },
    services: [{ id: "chohan", label: "Play chō-han (dice)", price: 10, description: "Two dice in a cup. Bet on even (chō) or odd (han). Win double your bet." }],
    topics: [
      { id: "dice", label: "Chō-han", about: "The dice game cho-han, gambling, betting", lines: ["Two dice in the cup. Even is chō, odd is han. Simple as rain.", "I never cheat. I simply never lose. There's a difference."] },
      { id: "jubei", label: "Jubei", about: "Jubei, the drunken ronin at the tea house", lines: ["Jubei? He drinks here every day and pays every other week. He was a real samurai once — you can see it when he stands up straight. Rarely."] },
      { id: "tea", label: "Tea", about: "Tea, the tea ceremony, the tea house", lines: ["Matcha from Uji. Whisked, not stirred. Stirring is for peasants.", "Tea steadies the breath. Useful, if you're about to fight someone."] },
    ],
    lines: {
      greet: ["Welcome to the tea house. Tea? Or are you feeling lucky?", "Sit, traveler. The dice are warm."],
      greetFriendly: ["{player}! I saved you the good cushion."],
      greetCold: ["Oh. You're back."],
      smallTalk: ["The umbrellas are new. Red, for luck.", "The wind brings petals into every cup this time of year."],
      farewell: ["Come back when you're feeling lucky.", "Mind the step."],
      unclear: ["You'll have to be clearer than that, darling."],
      insulted: ["My, my. Someone didn't get enough tea today.", "Careful. I remember faces."],
      threatened: ["Jubei, dear, would you mind?", "Threatening a hostess. How very bold. How very stupid."],
      flattered: ["Oh, you're sweet. The dice still won't like you.", "Flatterer. Sit down."],
      noWork: ["Work? The notice board in the square always has something."],
      challengeRefused: ["I duel with dice, not swords."],
    },
    talkable: true,
  },
  {
    id: "jubei",
    name: "Jubei",
    title: "Drunken Ronin",
    role: "ronin",
    personality: "Disheveled masterless samurai who drinks at the tea house. Proud, bitter, quick to take offense, but honorable underneath. Will duel anyone who insults him or challenges him properly.",
    home: { x: 5.6, z: 53.1, facing: Math.PI },
    wander: 0,
    look: {
      sex: "m", age: "adult", height: 1.8, build: 0.55, muscle: 0.55, skin: "#c79a76",
      hair: { style: "ronin", color: "#262320" }, facial: "stubble", facialColor: "#262320", marks: ["tired_eyes"],
      footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#51463f", sleeves: "wide", collar: "#3a322c", open: true },
        { kind: "hakama", color: "#3b3631" },
        { kind: "sash", color: "#2a2623" },
      ],
    },
    quest: "jubei",
    fighter: { hp: 200, damage: 14, weapon: "katana", skill: 0.8, duel: { prize: 80 } },
    topics: [
      { id: "past", label: "His past", about: "Jubei's past, his lord, why he drinks, being a ronin", lines: ["I served Lord Asano for twelve years. He died of a fever. A FEVER. No enemy to avenge. So I drink.", "A ronin is a wave on the sea. Masterless. Going nowhere."] },
      { id: "kurogane", label: "Kurogane", about: "Kurogane the bandit chief, how to beat him", lines: ["Kurogane swings his kanabō like a woodcutter. Overhead, always overhead. Step aside and cut. Easy. If you're sober."] },
    ],
    lines: {
      greet: ["Mm? You're in my light.", "Buy me a drink or go away."],
      greetFriendly: ["Hah! {player}! The only one in this village who can use a sword. Sit!"],
      greetCold: ["Get lost."],
      smallTalk: ["The sake here is watered. The tea is not. Life is unfair.", "*hic* ...Beautiful day for dying. Or napping."],
      farewell: ["Mm.", "Go on. I'll be here. I'm always here."],
      unclear: ["*hic* What?"],
      insulted: ["What did you say? Draw your sword.", "You insult a samurai? Outside. Now."],
      threatened: ["You threaten ME? Ha! Draw!", "Finally, some excitement."],
      flattered: ["Hah. Flattery. Buy me a drink instead.", "...Nobody's said that in years."],
      noWork: ["Work? Ha. Go kill some bandits. Goro pays."],
      challengeAccepted: ["A duel! Finally. Don't die too quickly."],
    },
    talkable: true,
  },
  {
    id: "goro",
    name: "Captain Goro",
    title: "Captain of the Guard",
    role: "guard",
    personality: "Tired but dutiful guard captain at the west gate. Overworked, underpaid, desperate for help against the bandits. Respects competence.",
    home: { x: -151, z: 5.8, facing: -Math.PI / 2 },
    wander: 2,
    look: {
      sex: "m", age: "adult", height: 1.76, build: 0.7, muscle: 0.5, skin: "#c4956f",
      hair: { style: "topknot", color: "#2b2724" }, facial: "mustache", facialColor: "#2b2724",
      headgear: "jingasa", headgearColor: "#2a2a2c", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#2c3a4d", sleeves: "narrow", collar: "#1d2633" },
        { kind: "hakama", color: "#2a2a2c" },
        { kind: "do_armor", color: "#2b2b2e", lacing: "#9b2a26" },
      ],
    },
    shop: { wares: [], buys: ["bandit_token", "oni_mask"], maxDiscount: 0 },
    quest: "bandits",
    fighter: { hp: 220, damage: 15, weapon: "katana", skill: 0.7 },
    topics: [
      { id: "bandits", label: "The bandits", about: "Kurogane's bandits, the bounty, the camp", lines: ["Kurogane has twelve men — well, six now, and a temper. They camp in the north woods past the north gate.", "Twenty mon for every bandit token. Four hundred for Kurogane himself. That's a lord's ransom for this village."] },
      { id: "guard", label: "The guard", about: "The village guard, his men, keeping the peace", lines: ["I have four men, two spears, and one working gate. Don't tell anyone."] },
    ],
    lines: {
      greet: ["Halt — oh, a traveler. State your business.", "Welcome to Kazemura. Keep your blade sheathed inside the walls."],
      greetFriendly: ["{player}! The bandits whisper your name now. Good."],
      greetCold: ["I'm watching you."],
      smallTalk: ["Quiet day. I hate quiet days. Something always follows.", "My feet hurt. The gate doesn't guard itself."],
      farewell: ["Keep the peace.", "Watch the north road."],
      unclear: ["Report clearly, please."],
      insulted: ["Watch it. I can throw you in the stocks.", "Insult the guard again and you'll sleep in a cell."],
      threatened: ["Threatening a guard captain? Draw, then!", "That's it — you're under arrest!"],
      flattered: ["Hm. Flattery won't get you past the gate. Actually, it's open. Go ahead."],
      noWork: ["Work? Kill bandits. I'm serious. Please."],
      challengeRefused: ["I don't duel civilians. Fight bandits instead."],
    },
    talkable: true,
  },
  {
    id: "kukai",
    name: "Kūkai",
    title: "Shrine Monk",
    role: "monk",
    personality: "Serene, playful old monk who keeps the mountain shrine. Speaks in riddles and gentle jokes. Rewards wisdom, not strength.",
    home: { x: 142, z: -47.5, facing: 0 },
    wander: 2,
    look: {
      sex: "m", age: "elder", height: 1.64, build: 0.35, skin: "#d0a684",
      hair: { style: "bald", color: "#2b2724" }, facial: "none", footwear: "zori",
      garments: [
        { kind: "kimono", color: "#3a3532", sleeves: "wide", collar: "#e8e0d0" },
        { kind: "kesa", color: "#b7762c" },
        { kind: "hakama", color: "#3a3532" },
      ],
    },
    services: [{ id: "blessing", label: "Receive a blessing (heal)", price: 20, description: "Kūkai chants and rings the bell. Your wounds close." }],
    quest: "riddles",
    topics: [
      { id: "riddles", label: "Riddles", about: "Kukai's riddles, the riddle challenge, wisdom", lines: ["Answer my three riddles, and the kami will give you a gift.", "A riddle is a door. The answer is the key. Most people just knock louder."] },
      { id: "shrine", label: "The shrine", about: "The shrine, the kami, the torii gates", lines: ["The kami of this mountain is a fox with nine tails. She likes fried tofu and honest people.", "Every torii was donated by a family. Walk through them and you walk through a hundred years of gratitude."] },
    ],
    lines: {
      greet: ["Ah. A visitor climbed all those steps. Your legs must be very wise.", "Welcome, welcome. Would you like a riddle?"],
      greetFriendly: ["{player}! The fox kami asked about you."],
      greetCold: ["Even the unkind may pray. Go ahead."],
      smallTalk: ["The wind asks nothing, and receives everything.", "I swept these steps this morning. Tomorrow I will sweep them again. That is the whole teaching."],
      farewell: ["May the kami walk beside you.", "Go gently."],
      unclear: ["Hmm! A riddle of your own? I cannot solve it."],
      insulted: ["The mountain has been insulted by storms for ten thousand years. It is still here.", "Your words fall like leaves. I will sweep them up tomorrow."],
      threatened: ["You may take my life. I recommend the blessing instead — it is cheaper.", "Violence at a shrine? The fox kami will be very cross."],
      flattered: ["Ho ho. Your words are sweet. The riddle is not.", "Thank you. Now, the riddle..."],
      noWork: ["Work? Solve my riddles. That is work for the mind."],
      challengeRefused: ["I duel only with questions."],
    },
    talkable: true,
  },
  {
    id: "isamu",
    name: "Isamu",
    title: "Fisherman",
    role: "fisher",
    personality: "Laid-back, superstitious fisherman who has had bad luck since losing his lucky charm in the river. Talks slowly, loves the river.",
    home: { x: 53.2, z: 72, facing: Math.PI / 2 },
    wander: 1,
    look: {
      sex: "m", age: "adult", height: 1.7, build: 0.5, skin: "#b98660",
      hair: { style: "messy", color: "#221f1c" }, facial: "stubble", facialColor: "#221f1c", headgear: "kasa", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#5f7482", sleeves: "short", collar: "#48596a" },
        { kind: "pants", color: "#434a4f", length: "knee" },
        { kind: "sash", color: "#2a2d30" },
      ],
    },
    shop: { wares: ["grilled_fish"], buys: [], maxDiscount: 0.15 },
    quest: "charm",
    topics: [
      { id: "river", label: "The river", about: "The river, fishing, the waterfall, the current", lines: ["The river comes down from the falls in the north, cold and clear. The sweetfish love it.", "Petals on the water mean the fish are feeding. Or that it's spring. One of those."] },
      { id: "charm", label: "Lucky charm", about: "Isamu's lost lucky charm, the carved carp", lines: ["My lucky carp charm fell in the river up by the stepping stones. North of the village. It glints when the sun hits it.", "Since I lost it I've caught nothing but boots and bad moods."] },
    ],
    lines: {
      greet: ["Mm. Hello there.", "Shh — the fish are listening."],
      greetFriendly: ["{player}! The fish are biting since you came around."],
      greetCold: ["You're scaring the fish."],
      smallTalk: ["The river doesn't hurry and it gets everywhere.", "My grandfather caught a carp as long as a man here. Or so he said."],
      farewell: ["Tight lines.", "Mm. See you."],
      unclear: ["Mm? Say again, slowly."],
      insulted: ["Mean words scare the fish.", "Hmph."],
      threatened: ["Whoa! I'll jump in the river, I swear!", "Guards! ...Ah, they never come down to the pier."],
      flattered: ["Heh. Kind of you.", "Nobody's complimented my fishing before."],
      noWork: ["Work? If you find my lucky charm, I'll pay you."],
      challengeRefused: ["I fight fish, not people."],
    },
    talkable: true,
  },
  {
    id: "hana",
    name: "Hana",
    title: "Rice Farmer",
    role: "farmer",
    personality: "Cheerful, hard-working young rice farmer. Direct and friendly, always busy, needs help with deliveries.",
    home: { x: 108, z: 100, facing: 0 },
    wander: 4,
    look: {
      sex: "f", age: "adult", height: 1.57, build: 0.4, skin: "#d6a882",
      hair: { style: "bob", color: "#1d1917" }, headgear: "kasa", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#3f5a7a", sleeves: "narrow", pattern: "checks", accent: "#2d4461", collar: "#e6dcc8" },
        { kind: "pants", color: "#3a4d66", length: "long", baggy: true },
        { kind: "sash", color: "#b0413e" },
      ],
    },
    quest: "rice",
    topics: [
      { id: "rice", label: "Rice farming", about: "Rice, the paddies, farming, the harvest", lines: ["Plant in spring, pray in summer, harvest in autumn, complain in winter. That's farming!", "The paddies reflect the sky. On still days you can't tell which way is up."] },
      { id: "delivery", label: "The delivery", about: "The rice delivery to the inn, the bale for Sayo", lines: ["Sayo at the inn needs a bale of rice, but my cart wheel broke. Could you carry one? It's heavy but you look strong."] },
    ],
    lines: {
      greet: ["Oh! Hello! Mind the mud.", "Hi there! Come to help or come to watch?"],
      greetFriendly: ["{player}! My favorite delivery person!"],
      greetCold: ["I'm busy."],
      smallTalk: ["The frogs were so loud last night! That means good rain.", "My feet have been wet since March."],
      farewell: ["Bye! Don't step on the seedlings!", "See you!"],
      unclear: ["Huh? Sorry, the frogs are loud."],
      insulted: ["Hey! I work hard!", "Rude! I hope you step in a paddy."],
      threatened: ["I'll hit you with this hoe, I swear!", "Help! Bandits!"],
      flattered: ["Ha! Thanks!", "Oh, stop it."],
      noWork: ["Could you carry a rice bale to Sayo at the inn? I'd be so grateful."],
      challengeRefused: ["Fight? I have rice to plant!"],
    },
    talkable: true,
  },
  {
    id: "kenta",
    name: "Kenta",
    title: "Village Boy",
    role: "child",
    personality: "Eight-year-old boy, anxious and sniffly because his cat Mochi is missing. Easily impressed by swords and heroes.",
    home: { x: -34, z: -6, facing: Math.PI },
    wander: 3,
    look: {
      sex: "m", age: "child", height: 1.25, build: 0.35, skin: "#e2b996",
      hair: { style: "bob", color: "#191614" }, footwear: "zori",
      garments: [
        { kind: "kimono", color: "#c8793a", sleeves: "narrow", pattern: "dots", accent: "#e8b27a", collar: "#f0e6d4" },
        { kind: "pants", color: "#4a4038", length: "knee" },
        { kind: "sash", color: "#3a5a7a" },
      ],
    },
    quest: "mochi",
    topics: [
      { id: "mochi", label: "Mochi the cat", about: "Kenta's missing cat Mochi, where the cat might be", lines: ["Mochi is white with one black ear. She likes high places and fish. She's been gone since yesterday!", "Maybe she went across the river? She loves the pagoda. Or the fish at the pier."] },
      { id: "heroes", label: "Heroes", about: "Samurai, heroes, swords, becoming strong", lines: ["When I grow up I'm going to be a samurai! Or a noodle chef. Maybe both!", "Is that a real sword? Can I touch it? No? Okay."] },
    ],
    lines: {
      greet: ["*sniff* ...Hi.", "Mister — have you seen a white cat?"],
      greetFriendly: ["{player}! You're the coolest!"],
      greetCold: ["...You're scary."],
      smallTalk: ["I can count to a thousand. Want to hear?", "Genzo gave me a dango today!"],
      farewell: ["Bye!", "If you see Mochi, tell her to come home!"],
      unclear: ["Huh?"],
      insulted: ["*sniff* ...I'm telling my mom!", "You're mean!"],
      threatened: ["WAAAH!", "Mom! MOM!"],
      flattered: ["Really? Hehe.", "You think I'm brave?"],
      noWork: ["Can you find Mochi? Please?"],
      challengeRefused: ["I'm only eight!"],
    },
    talkable: true,
  },
  {
    id: "kurogane",
    name: "Kurogane",
    title: "Bandit Chief",
    role: "chief",
    personality: "Brutal bandit chief in a red oni mask who wields an iron club. Hoards moon iron.",
    home: { x: -140, z: -170, facing: 0 },
    wander: 3,
    look: {
      sex: "m", age: "adult", height: 1.95, build: 1, muscle: 0.9, skin: "#b58462",
      hair: { style: "ronin", color: "#1a1816" }, facial: "beard", facialColor: "#1a1816", headgear: "oni_mask", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#5a1f1c", sleeves: "none", collar: "#2e1210", open: true },
        { kind: "hakama", color: "#2a211d" },
        { kind: "do_armor", color: "#1c1a19", lacing: "#7a1c18" },
        { kind: "wristbands", color: "#3a2a20" },
      ],
    },
    fighter: { hp: 380, damage: 16, weapon: "kanabo", skill: 0.7, hostile: true },
    topics: [],
    lines: {
      greet: ["You walked into the wrong woods."],
      smallTalk: [],
      farewell: [],
      unclear: [],
      insulted: [],
      threatened: [],
      flattered: [],
    },
    talkable: false,
  },
];

// ——— generic villagers, guards and bandits ——————————————————————————

const GIVEN_M = ["Hiro", "Taro", "Shin", "Kazu", "Yoshi", "Makoto", "Jiro", "Sora"];
const GIVEN_F = ["Aiko", "Yumi", "Emi", "Natsu", "Rin", "Mei", "Haru", "Sachi"];
const KIMONO_COLORS = ["#5b6f84", "#7c5c44", "#6d7a5a", "#8a4b4b", "#44556b", "#8f7a55", "#5e4f6a", "#3f6660", "#9a6a3a", "#6a6f78"];
const SKINS = ["#e2bb9a", "#d4a784", "#c9986f", "#e8c6a8", "#bf8e68", "#dab091"];
const HAIR = ["#1a1716", "#221e1b", "#2c2622", "#161412"];

/** Small deterministic RNG so the server and client generate identical villagers. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VILLAGER_SPOTS = [
  { x: -60, z: -4 }, { x: -18, z: 4 }, { x: -100, z: 3 }, { x: -120, z: -3 },
  { x: 20, z: -3 }, { x: -52, z: 30 }, { x: -24, z: -40 }, { x: -90, z: 40 },
  { x: -70, z: -45 }, { x: 30, z: 40 }, { x: -110, z: 60 }, { x: 10, z: -50 },
];

function makeVillagers(): NpcDef[] {
  const r = rng(1337);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  return VILLAGER_SPOTS.map((spot, i) => {
    const female = i % 2 === 1;
    const name = female ? GIVEN_F[(i >> 1) % GIVEN_F.length] : GIVEN_M[(i >> 1) % GIVEN_M.length];
    const elder = r() < 0.2;
    const color = pick(KIMONO_COLORS);
    const look: Look = female
      ? {
          sex: "f", age: elder ? "elder" : "adult", height: 1.52 + r() * 0.1, build: 0.3 + r() * 0.3, skin: pick(SKINS),
          hair: { style: elder ? "gray_bun" : "bun", color: elder ? "#bdb7ae" : pick(HAIR) }, footwear: r() < 0.5 ? "zori" : "geta",
          garments: [
            { kind: "long_kimono", color, pattern: pick(["hemp", "waves", "dots", "checks", "none"] as const), accent: "#e6dccb", collar: "#efe7d8" },
            { kind: "sash", color: pick(["#c7483a", "#d9b25a", "#3a5a7a", "#2c4a3a", "#e6dccb"]), wide: true },
          ],
        }
      : {
          sex: "m", age: elder ? "elder" : "adult", height: 1.62 + r() * 0.14, build: 0.35 + r() * 0.45, skin: pick(SKINS),
          hair: { style: pick(["topknot", "topknot", "ronin", "buzz"] as const), color: elder ? "#bdb7ae" : pick(HAIR) },
          facial: pick(["none", "none", "stubble", "mustache", "beard"] as const), facialColor: elder ? "#bdb7ae" : "#221e1b",
          headgear: r() < 0.3 ? "tenugui" : r() < 0.2 ? "kasa" : "none", headgearColor: "#ddd5c4", footwear: "waraji",
          garments: [
            { kind: "kimono", color, sleeves: r() < 0.5 ? "narrow" : "short", collar: "#2c2825" },
            r() < 0.5 ? { kind: "hakama", color: pick(["#3a3631", "#2d2a26", "#45403a"]) } : { kind: "pants", color: pick(["#3a3631", "#45403a", "#39465a"]), length: "knee" },
            { kind: "sash", color: pick(["#2a2623", "#3a5a7a", "#6e2c22"]) },
          ],
        };
    return {
      id: `villager_${i}`,
      name,
      title: elder ? "Elder" : female ? "Villager" : pick(["Villager", "Carpenter", "Porter", "Weaver"]),
      role: "villager" as const,
      personality: `An ordinary ${elder ? "elderly " : ""}resident of Kazemura going about their day. Polite with polite people, wary of armed strangers.`,
      home: { x: spot.x, z: spot.z, facing: r() * Math.PI * 2 },
      wander: 10 + r() * 8,
      look,
      topics: VILLAGER_TOPICS,
      lines: VILLAGER_LINES,
      talkable: true,
    };
  });
}

function makeGuards(): NpcDef[] {
  const routes = [
    [{ x: -148, z: -8 }, { x: -110, z: -4 }, { x: -60, z: -4 }, { x: -110, z: -4 }],
    [{ x: -40, z: -104 }, { x: -40, z: -40 }, { x: -40, z: 40 }, { x: -40, z: 100 }, { x: -40, z: 40 }, { x: -40, z: -40 }],
    [{ x: 40, z: -50 }, { x: 42, z: 0 }, { x: 44, z: 60 }, { x: 42, z: 0 }],
  ];
  return routes.map((route, i) => ({
    id: `guard_${i}`,
    name: ["Tadashi", "Kenji", "Masaru"][i],
    title: "Village Guard",
    role: "guard" as const,
    personality: "A village guard on patrol. Dutiful, suspicious of trouble-makers, friendly to honorable people.",
    home: { x: route[0].x, z: route[0].z, facing: 0 },
    wander: 0,
    route,
    look: {
      sex: "m", age: "adult", height: 1.72 + i * 0.03, build: 0.6, muscle: 0.4, skin: SKINS[i + 1],
      hair: { style: "topknot", color: HAIR[i] }, headgear: "jingasa", headgearColor: "#2a2a2c", footwear: "waraji",
      garments: [
        { kind: "kimono", color: "#2c3a4d", sleeves: "narrow", collar: "#1d2633" },
        { kind: "hakama", color: "#2a2a2c" },
        { kind: "do_armor", color: "#2b2b2e", lacing: "#3a5a8a" },
      ],
    } satisfies Look,
    fighter: { hp: 150, damage: 12, weapon: "katana", skill: 0.55 },
    topics: VILLAGER_TOPICS,
    lines: {
      ...VILLAGER_LINES,
      greet: ["Move along, citizen.", "Keep your blade sheathed within the walls."],
      greetFriendly: ["{player}! Good to have you with us."],
      smallTalk: ["Patrol, patrol, patrol. My sandals are worn through.", "Captain Goro wants more men. He's got me."],
      threatened: ["You dare threaten the guard? Draw!", "That's it — you're coming with me!"],
      challengeRefused: ["No duels on duty."],
    },
    talkable: true,
  }));
}

const BANDIT_SPOTS = [
  { x: -150, z: -160 }, { x: -130, z: -158 }, { x: -146, z: -178 }, { x: -128, z: -176 }, { x: -160, z: -150 }, { x: -120, z: -145 },
];

function makeBandits(): NpcDef[] {
  const r = rng(99);
  return BANDIT_SPOTS.map((spot, i) => ({
    id: `bandit_${i}`,
    name: "Bandit",
    title: "Kurogane's Gang",
    role: "bandit" as const,
    personality: "A ruthless bandit.",
    home: { x: spot.x, z: spot.z, facing: r() * Math.PI * 2 },
    wander: 5,
    look: {
      sex: "m", age: "adult", height: 1.68 + r() * 0.16, build: 0.4 + r() * 0.5, muscle: 0.4, skin: SKINS[Math.floor(r() * SKINS.length)],
      hair: { style: r() < 0.5 ? "ronin" : "messy", color: HAIR[i % HAIR.length] }, facial: r() < 0.6 ? "stubble" : "beard", facialColor: "#1f1c1a",
      headgear: r() < 0.5 ? "oni_mask" : "bandana", headgearColor: "#6e1f1a", footwear: "waraji",
      garments: [
        { kind: "kimono", color: ["#3d2b24", "#40372c", "#2b2a2c"][i % 3], sleeves: r() < 0.5 ? "none" : "short", collar: "#201815", open: r() < 0.5 },
        { kind: "pants", color: "#2a2520", length: "knee", baggy: true },
        { kind: "sash", color: "#6e1f1a" },
      ],
    } satisfies Look,
    fighter: { hp: 80 + Math.floor(r() * 40), damage: 6 + Math.floor(r() * 3), weapon: r() < 0.7 ? "katana" : "bokken", skill: 0.25 + r() * 0.25, hostile: true },
    topics: [],
    lines: { greet: [], smallTalk: [], farewell: [], unclear: [], insulted: [], threatened: [], flattered: [] },
    talkable: false,
  }));
}

export const ALL_NPCS: NpcDef[] = [...NPCS, ...makeVillagers(), ...makeGuards(), ...makeBandits()];
export const NPC_BY_ID: Record<string, NpcDef> = Object.fromEntries(ALL_NPCS.map((n) => [n.id, n]));
