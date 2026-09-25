// Plain-data description of how a character looks. The client turns it into a
// skinned 3D model (src/characters). Kept free of three.js so NPC data can be shared
// with the server.

export type HairStyle =
  | "topknot" // chonmage: shaved pate, folded topknot
  | "ronin" // long hair tied back in a tail
  | "spiky" // wild upward spikes (Naruto / Ichigo)
  | "messy" // short and tousled (Luffy)
  | "buzz" // close-cropped (Zoro)
  | "swept" // bangs with spiky back (Sasuke)
  | "long_straight" // shoulder-length straight hair (Byakuya)
  | "wavy_ponytail" // big wavy ponytail (Shelly)
  | "bun" // women's shimada-style bun
  | "bob" // short bob (child / hostess)
  | "bald" // shaved head (monk)
  | "gray_bun" // elder bun
  | "none";

export type FacialHair = "none" | "stubble" | "mustache" | "beard" | "goatee" | "long_beard";

export type Mark = "whiskers" | "scar_left_eye" | "scar_under_left_eye" | "bandaid" | "chest_x_scar" | "tired_eyes";

export type Headgear =
  | "none"
  | "straw_hat" // Luffy's straw boater with red band
  | "kasa" // conical straw hat
  | "jingasa" // guard's lacquered war hat
  | "leaf_headband" // shinobi forehead protector
  | "hachimaki" // white headband
  | "luchador_mask"
  | "kenseikan" // noble hair ornaments
  | "bandana"
  | "kitsune_mask"
  | "oni_mask"
  | "tenugui"; // cloth tied over the head (workers)

export type Footwear = "waraji" | "zori" | "geta" | "boots" | "ninja_sandals" | "wrestling_boots" | "bare";

export type Garment =
  | { kind: "kimono"; color: string; pattern?: Pattern; accent?: string; sleeves: "wide" | "narrow" | "short" | "none"; collar?: string; open?: boolean }
  | { kind: "long_kimono"; color: string; pattern?: Pattern; accent?: string; collar?: string }
  | { kind: "haori"; color: string; crest?: string; long?: boolean; sleeveless?: boolean }
  | { kind: "hakama"; color: string; stripes?: string }
  | { kind: "pants"; color: string; length: "long" | "knee" | "shorts"; stripe?: string; cuffs?: string; baggy?: boolean }
  | { kind: "shirt"; color: string; sleeves: "long" | "short" | "rolled" | "none"; open?: boolean; collar?: boolean }
  | { kind: "vest"; color: string; buttons?: string }
  | { kind: "track_jacket"; color: string; shoulders: string; collar?: string; zip?: string }
  | { kind: "sash"; color: string; bow?: boolean; wide?: boolean }
  | { kind: "haramaki"; color: string }
  | { kind: "belt"; color: string; buckle?: string; wide?: boolean }
  | { kind: "rope_belt"; color: string }
  | { kind: "waist_cloth"; color: string }
  | { kind: "scarf"; color: string; long?: boolean }
  | { kind: "neck_bandana"; color: string }
  | { kind: "wristbands"; color: string }
  | { kind: "armguards"; color: string }
  | { kind: "arm_bandana"; color: string }
  | { kind: "apron"; color: string }
  | { kind: "do_armor"; color: string; lacing: string }
  | { kind: "kesa"; color: string } // monk's draped robe
  | { kind: "cape"; color: string; lining?: string }
  | { kind: "chest_strap"; color: string }
  | { kind: "tabi"; color: string }
  | { kind: "gloves"; color: string };

export type Pattern = "none" | "waves" | "hemp" | "stripes" | "checks" | "dots" | "cranes" | "stars";

export interface Look {
  sex: "m" | "f";
  age?: "child" | "adult" | "elder";
  /** Standing height in metres. */
  height: number;
  /** 0 slender … 1 very broad. */
  build: number;
  /** 0 soft … 1 heavily muscled (visible definition, bigger shoulders). */
  muscle?: number;
  skin: string;
  hair: { style: HairStyle; color: string };
  eyes?: string;
  facial?: FacialHair;
  facialColor?: string;
  marks?: Mark[];
  headgear?: Headgear;
  headgearColor?: string;
  footwear: Footwear;
  footwearColor?: string;
  garments: Garment[];
  earrings?: number;
  /** Pale tint for shadow clones etc. */
  tint?: string;
}
