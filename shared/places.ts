// Named places in Kazemura. Positions are world metres (x east, z south).
// NPCs use these to give directions; the game puts a marker on the compass.

export interface PlaceDef {
  id: string;
  name: string;
  /** How villagers describe it, also used by Jev to match a request to a place. */
  description: string;
  x: number;
  z: number;
}

export const PLACES: PlaceDef[] = [
  { id: "square", name: "the village square", description: "Open plaza with the well, the big cherry tree and the notice board, in the middle of the main street", x: -40, z: 0 },
  { id: "blacksmith", name: "Tetsu's forge", description: "Blacksmith and sword shop on the north side of the main street", x: -86, z: -15 },
  { id: "apothecary", name: "Oume's apothecary", description: "Medicine and herbal remedy shop on the south side of the main street", x: -72, z: 15 },
  { id: "armorer", name: "Masa's armory", description: "Armor shop on the north side of the main street, east of the square", x: -12, z: -15 },
  { id: "general_store", name: "Kichibei's general store", description: "Traveling merchant's shop selling hats, masks, food and odds and ends, south side of the main street", x: 8, z: 15 },
  { id: "noodle_stall", name: "Genzo's noodle stall", description: "Ramen and food stall at the square", x: -28, z: 9 },
  { id: "dojo", name: "the dojo", description: "Sword training hall of Sensei Hideaki, north of the square", x: -40, z: -84 },
  { id: "inn", name: "the Sakura Inn", description: "Inn with rooms to rest for the night, south of the square", x: -40, z: 74 },
  { id: "tea_house", name: "the tea house", description: "Tea house with red umbrellas, where dice games are played; southeast of the square", x: -4, z: 55 },
  { id: "west_gate", name: "the west gate", description: "Main gate of the village with the guard post and watchtower", x: -150, z: 0 },
  { id: "north_gate", name: "the north gate", description: "Small gate at the north wall, toward the forest and the bandit camp", x: -40, z: -112 },
  { id: "south_gate", name: "the south gate", description: "Gate in the south wall that opens onto the farm fields", x: -40, z: 107 },
  { id: "grand_bridge", name: "the vermilion bridge", description: "Big red arched bridge crossing the river at the east end of the main street", x: 60, z: 0 },
  { id: "shrine", name: "the mountain shrine", description: "Shinto shrine on the hill east of the river, reached through a path of red torii gates", x: 142, z: -46 },
  { id: "pagoda", name: "the five-story pagoda", description: "Tall wooden pagoda on the low hill east of the river, south of the shrine path", x: 112, z: 44 },
  { id: "pier", name: "the fishing pier", description: "Wooden pier on the west bank of the river where the fisherman works", x: 45, z: 72 },
  { id: "rice_fields", name: "the rice paddies", description: "Flooded rice fields and Hana's farmhouse across the river to the southeast", x: 112, z: 108 },
  { id: "bamboo_grove", name: "the bamboo grove", description: "Dense bamboo forest northeast of the river", x: 105, z: -120 },
  { id: "bandit_camp", name: "the bandit camp", description: "Camp of Kurogane's bandits in the forest northwest, outside the north gate", x: -140, z: -168 },
  { id: "waterfall", name: "the waterfall", description: "Waterfall where the river comes down from the mountains, far north", x: 52, z: -214 },
  { id: "south_bridge", name: "the south bridge", description: "Plain wooden bridge over the river south of the village", x: 66, z: 128 },
  { id: "stepping_stones", name: "the stepping stones", description: "Stones across the shallow river north of the village", x: 58, z: -122 },
];

export const PLACE_BY_ID: Record<string, PlaceDef> = Object.fromEntries(PLACES.map((p) => [p.id, p]));
