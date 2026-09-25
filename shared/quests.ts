// Tasks villagers hand out. Progress lives in the client save; this file is the script.

export interface QuestDef {
  id: string;
  giver: string;
  title: string;
  /** One-line summary shown in the journal and given to Jev as context. */
  summary: string;
  /** A line the giver drops when you first meet, hinting at their trouble. */
  hook?: string;
  /** Eager givers ask for help straight away (the hook becomes the offer). */
  eager?: boolean;
  /** What the giver says when offering the task. */
  offer: string;
  accepted: string;
  /** Reminder while the task is active but not done. */
  reminder: string;
  /** Said when the player claims to be done but isn't. */
  notDone: string;
  complete: string;
  reward: { money?: number; honor?: number; items?: string[] };
}

export const QUESTS: Record<string, QuestDef> = {
  bandits: {
    id: "bandits",
    giver: "goro",
    title: "The Bandit Problem",
    hook: "Bandits in the north woods are bleeding this village dry.",
    summary: "Defeat Kurogane, the bandit chief who camps in the north woods, then report to Captain Goro.",
    offer: "Kurogane and his gang camp in the north woods. Break them — bring down Kurogane himself — and the village will pay you four hundred mon. Will you do it?",
    accepted: "Good. Leave by the north gate and follow the path into the woods. Don't let them surround you.",
    reminder: "Kurogane still breathes. The north woods, past the north gate.",
    notDone: "Don't lie to a guard captain. Kurogane is still out there — my scouts saw his fire last night.",
    complete: "Kurogane — defeated? By the kami... Here. Four hundred mon, as promised. Kazemura owes you.",
    reward: { money: 400, honor: 15 },
  },
  mochi: {
    id: "mochi",
    giver: "kenta",
    title: "Mochi Is Missing",
    hook: "Mochi's gone... my cat! She's white with one black ear. Will you help me find her? Please?",
    eager: true,
    summary: "Find Kenta's white cat Mochi (one black ear) and bring her back to him at the square.",
    offer: "Mochi's been gone since yesterday... She's white with one black ear. Will you help me find her? Please?",
    accepted: "Thank you! She likes high places... and fish!",
    reminder: "Did you find Mochi yet? White, with one black ear!",
    notDone: "That's not Mochi... I don't see her anywhere! You promised!",
    complete: "MOCHI! You found her! Thank you thank you thank you! Here — it's all my savings, and a dango!",
    reward: { money: 25, honor: 6, items: ["dango"] },
  },
  riddles: {
    id: "riddles",
    giver: "kukai",
    title: "Riddles of the Mountain Shrine",
    hook: "Care for a riddle? The fox kami loves a clever guest.",
    summary: "Answer the monk Kukai's three riddles at the mountain shrine.",
    offer: "I have three riddles. Answer them all and the fox kami will grant you her charm. Shall we begin?",
    accepted: "Wonderful. Listen carefully...",
    reminder: "The riddle waits for you.",
    notDone: "Not yet, not yet. The riddles are not finished.",
    complete: "All three! The fox kami is pleased. Take this omamori — she'll keep your body sturdy.",
    reward: { honor: 10, items: ["omamori"] },
  },
  rice: {
    id: "rice",
    giver: "hana",
    title: "Rice for the Inn",
    hook: "You're just who I need! My cart wheel broke and Sayo at the inn needs a bale of rice today. Could you carry it for me?",
    eager: true,
    summary: "Carry a bale of Hana's rice to Sayo at the Sakura Inn.",
    offer: "My cart wheel's broken and Sayo at the inn needs this bale of rice today. Could you carry it for me? She'll pay you.",
    accepted: "You're a lifesaver! Here — careful, it's heavy.",
    reminder: "The rice needs to go to Sayo at the inn, south of the square.",
    notDone: "Hm? The rice isn't delivered yet.",
    complete: "The rice! Hana's rice! Thank you — here's forty mon, and your room is free tonight.",
    reward: { money: 40, honor: 4 },
  },
  charm: {
    id: "charm",
    giver: "isamu",
    title: "The Fisherman's Charm",
    hook: "My lucky carp charm fell in the river up by the stepping stones. Would you look for it? I'll pay sixty mon.",
    eager: true,
    summary: "Find Isamu's lucky carp charm in the shallow river by the stepping stones north of the village.",
    offer: "My lucky carp charm fell in the river by the stepping stones up north. If you find it, I'll give you sixty mon. Deal?",
    accepted: "Look for something glinting in the shallows near the stones.",
    reminder: "The charm's by the stepping stones, north. It glints.",
    notDone: "That's not my charm... My carp is wooden, on a red cord.",
    complete: "My carp! The river gave it back! Here, sixty mon. My luck is back — I can feel it!",
    reward: { money: 60, honor: 4 },
  },
  moonblade: {
    id: "moonblade",
    giver: "tetsu",
    title: "The Moon Blade",
    hook: "Kurogane sits on a lump of moon iron. The finest steel I could ever forge, wasted on a bandit.",
    summary: "Take the moon iron from Kurogane's bandit camp and bring it to Tetsu the swordsmith, with 150 mon for his work.",
    offer: "Kurogane is sitting on a lump of moon iron. Bring it to me with a hundred and fifty mon for charcoal and I'll forge you the Moon Blade. Interested?",
    accepted: "Good. The iron will be near his fire. Pale, cold, heavier than it looks.",
    reminder: "Moon iron, and a hundred and fifty mon. Then we talk.",
    notDone: "That's not moon iron, or you're short on coin. A hundred and fifty, and the iron.",
    complete: "...It sings. Listen. Three days I'd need, but for this — one night. Take it. Tsukikage.",
    reward: { honor: 5, items: ["tsukikage"] },
  },
  dojo: {
    id: "dojo",
    giver: "hideaki",
    title: "Trials of the Dojo",
    summary: "Defeat three dojo students (Ren, Daichi, Kaede) in sparring bouts, then duel Sensei Hideaki.",
    offer: "You wish to be tested? Defeat three of my students in fair bouts. Then face me. Do you accept?",
    accepted: "Speak to Ren, Daichi and Kaede. Bow before each bout.",
    reminder: "Three students, then me.",
    notDone: "You have not defeated all three of my students.",
    complete: "...Well fought. You are the champion of this dojo. Take this, and carry our name with honor.",
    reward: { money: 150, honor: 12 },
  },
  jubei: {
    id: "jubei",
    giver: "jubei",
    title: "The Drunken Ronin",
    summary: "Defeat Jubei the ronin in a duel at the tea house.",
    offer: "You want a fight? A real one? Put up your sword. Winner takes eighty mon.",
    accepted: "Ha! Outside. Draw when you're ready.",
    reminder: "Well? Draw your sword.",
    notDone: "You haven't beaten me yet.",
    complete: "...You're good. Better than me, today. Maybe I'll put down the cup tomorrow. Here — my old kasa. I won't need it in the rain anymore.",
    reward: { honor: 6, items: ["straw_hat"] },
  },
};
