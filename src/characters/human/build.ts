// Look → a realistic skinned character: MakeHuman body (shaped per character), composed
// skin, fitted eyes/brows/lashes/teeth, garments, hair, headgear and footwear, sharing
// one skeleton. Also computes weapon sockets from the actual anatomy.

import * as THREE from "three";
import type { Look } from "../../../shared/look";
import { Anatomy, SIDES, sx } from "./anatomy";
import { buildAccessories } from "./accessories";
import { buildCostume, buildCostumeUnder } from "./costumes";
import { eyeMaterials, type EyeStyle, type EyeUniforms } from "./eyes";
import { buildFootwear } from "./footwear";
import { buildGarments, decals, Outfit } from "./garments";
import { buildHair } from "./hair";
import { buildHeadgear } from "./headgear";
import { humanKit, type HumanBody, type HumanKit, type HumanSpec } from "./kit";
import { eyeHoles, markStrokes } from "./marks";
import { composeSkin, skinAverage, skinMaterial, toneFor } from "./skin";

export type SocketName = "gripR" | "gripL" | "hipL" | "hipL2" | "hipL3" | "back" | "backWaist" | "thighR" | "mouth" | "headTop";

export interface HumanBuilt {
  /** Holds every skinned part; add this to the scene. */
  root: THREE.Group;
  /** The skin mesh (kept for code that expects one mesh). */
  mesh: THREE.SkinnedMesh;
  meshes: THREE.SkinnedMesh[];
  bones: Record<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  sockets: Record<SocketName, THREE.Object3D>;
  anatomy: Anatomy;
  eyes: EyeUniforms;
  skin: THREE.MeshPhysicalMaterial;
  dispose(): void;
}

// ——— look → body spec ——————————————————————————————————————————————————————————————————

export function specFor(look: Look): HumanSpec {
  const b = look.body ?? {};
  const age = look.age ?? "adult";
  const muscle = b.muscle ?? THREE.MathUtils.clamp(0.42 + 0.58 * (look.muscle ?? 0.25), 0, 1);
  const weight = b.weight ?? THREE.MathUtils.clamp(0.22 + 0.72 * look.build, 0, 1);
  const targets: Record<string, number> = { ...defaultFace(look), ...(b.face ?? {}) };
  return { sex: look.sex, age, muscle, weight, height: look.height, ethnic: b.ethnic, targets };
}

/** Mild defaults so men and women read clearly at game distance. */
function defaultFace(look: Look): Record<string, number> {
  if (look.age === "child") return { "head-age-decr": 0.3 };
  if (look.sex === "m") return { "chin-width-incr": 0.2, "head-square": 0.15 };
  return { "chin-width-decr": 0.15, "head-oval": 0.2 };
}

function skinId(look: Look): string {
  const old = look.age === "elder";
  const race = (look.body?.ethnic?.african ?? 0) > 0.5 ? "african" : (look.body?.ethnic?.caucasian ?? 0) > 0.5 ? "caucasian" : "asian";
  if (old) return `old-asian-${look.sex}`;
  return `young-${race}-${look.sex}`;
}

// ——— textures ————————————————————————————————————————————————————————————————————————————

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(kit: HumanKit, name: string, srgb = true) {
  let t = texCache.get(name);
  if (!t) {
    t = texLoader.load(kit.texture(name));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(name, t);
  }
  return t;
}

const images = new Map<string, HTMLImageElement>();
/** Skin images must be decoded before characters are built (the loader waits on this). */
export async function preloadHumanTextures(kit: HumanKit, skins: string[]) {
  await Promise.all(
    skins.map(
      (id) =>
        new Promise<void>((res) => {
          if (images.has(id)) return res();
          const img = new Image();
          img.onload = () => {
            images.set(id, img);
            res();
          };
          img.onerror = () => res();
          img.src = kit.texture(`skin-${id}.jpg`);
        }),
    ),
  );
}

export const ALL_SKINS = ["young-asian-m", "young-asian-f", "young-caucasian-m", "young-caucasian-f", "young-african-m", "young-african-f", "old-asian-m", "old-asian-f"];

// ——— build ——————————————————————————————————————————————————————————————————————————————————

export interface BuildOpts {
  /** Replace every material (shadow clones). */
  material?: THREE.Material;
  /** Texture size for the composed skin (hero characters get 2048). */
  skinSize?: number;
}

export function buildHuman(look: Look, opts: BuildOpts = {}): HumanBuilt {
  const kit = humanKit();
  const spec = specFor(look);
  const body = kit.body(spec);
  const a = new Anatomy(kit, body);
  const { bones, byName } = kit.skeleton(body);
  const root = new THREE.Group();
  root.name = "human";
  root.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; shadow?: boolean }[] = [];

  // Clothes first: they decide which skin is hidden.
  const outfit = new Outfit(a);
  const costumeStrokes = buildCostumeUnder(outfit, look);
  buildGarments(outfit, look);
  costumeStrokes.push(...buildCostume(outfit, look));
  buildAccessories(outfit, look);
  buildFootwear(outfit, look);
  const hair = buildHair(a, look);
  const gear = buildHeadgear(outfit, look);

  // Skin.
  const sid = skinId(look);
  const img = images.get(sid);
  const eyeR = eyeRadius(kit, body);
  const scalp = hair.scalp;
  const strokes = img ? [...markStrokes(a, look, { scalp, hairColor: look.hair.color, hairline: hair.hairline }), ...costumeStrokes] : [];
  const size = opts.skinSize ?? 1024;
  const key = `${sid}|${size}|${look.costume ?? ""}|${(look.marks ?? []).join(",")}|${look.facial ?? ""}|${look.facialColor ?? ""}|${scalp}|${look.hair.style}|${look.hair.color}|${Math.round(look.height * 100)}`;
  const skinTex = img ? composeSkin(img, key, size, eyeHoles(a, eyeR), strokes) : tex(kit, `skin-${sid}.jpg`);
  const tone = img ? toneFor(skinAverage(img, sid), new THREE.Color(look.skin)) : new THREE.Color(1, 1, 1);
  const skin = skinMaterial({ map: skinTex, tone, roughness: look.body?.oily ? 0.36 : 0.5 });
  const covered = outfit.covered;
  parts.push({ geometry: kit.surfaceGeometry(body, "body", (x, y, z) => !(covered[x] && covered[y] && covered[z])), material: skin });

  // Face parts.
  const eyeStyle: EyeStyle = look.eyeStyle ?? "normal";
  const eyeTex = tex(kit, `eye-${look.eyeTexture ?? "brown"}.png`);
  const em = eyeMaterials(eyeTex, look.eyes, eyeStyle);
  parts.push({ geometry: kit.proxyGeometry(body, "eyes"), material: [em.ball, em.cornea], shadow: false });
  const browId = look.brows ?? (look.sex === "f" ? "brow010" : "brow004");
  const browCol = look.browColor ?? look.hair.color;
  parts.push({ geometry: kit.proxyGeometry(body, browId), material: hairCardMaterial(tex(kit, `${browId}.png`), browCol, 0.85), shadow: false });
  parts.push({ geometry: kit.proxyGeometry(body, look.sex === "f" ? "lashes_long" : "lashes"), material: hairCardMaterial(tex(kit, look.sex === "f" ? "lashes03.png" : "lashes01.png"), "#1c1512", 1), shadow: false });
  parts.push({ geometry: kit.proxyGeometry(body, "teeth"), material: new THREE.MeshStandardMaterial({ map: tex(kit, "teeth.jpg"), roughness: 0.3 }), shadow: false });
  parts.push({ geometry: kit.proxyGeometry(body, "tongue"), material: new THREE.MeshStandardMaterial({ map: tex(kit, "tongue.jpg"), roughness: 0.4 }), shadow: false });

  for (const m of outfit.meshes()) parts.push(m);
  for (const d of decals.get(outfit)?.values() ?? []) parts.push({ geometry: d.acc.geometry(), material: decalMaterial(d.tex) });
  for (const m of hair.meshes) parts.push(m);
  for (const m of gear) parts.push(m);

  const meshes: THREE.SkinnedMesh[] = [];
  const ident = new THREE.Matrix4();
  for (const p of parts) {
    const mesh = new THREE.SkinnedMesh(p.geometry, opts.material ?? p.material);
    mesh.castShadow = p.shadow !== false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton, ident);
    meshes.push(mesh);
  }

  const sockets = makeSockets(a, byName, outfit);
  return {
    root,
    mesh: meshes[0],
    meshes,
    bones: byName,
    skeleton,
    sockets,
    anatomy: a,
    eyes: em.uniforms,
    skin,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
    },
  };
}

function eyeRadius(kit: HumanKit, body: HumanBody): number {
  const g = kit.proxyGeometry(body, "eyes");
  const p = g.getAttribute("position");
  const c = kit.joint(body, "eyeL");
  let r = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (v.x * Math.sign(c.x) < 0) continue;
    r = Math.max(r, v.distanceTo(c));
  }
  g.dispose();
  return r * 0.92;
}

const cardCache = new Map<string, THREE.MeshStandardMaterial>();
/** Alpha-blended strand cards (brows, lashes). */
export function hairCardMaterial(map: THREE.Texture, color: string, opacity = 1) {
  const key = `${map.uuid}:${color}:${opacity}`;
  let m = cardCache.get(key);
  if (!m) {
    // Brow/lash textures are dark strands; lighten them toward the hair colour.
    const c = new THREE.Color(color);
    const lift = new THREE.Color(1, 1, 1).lerp(c, 0.2).multiplyScalar(1 + c.getHSL({ h: 0, s: 0, l: 0 }).l * 3);
    m = new THREE.MeshStandardMaterial({ map, color: lift, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.75, opacity });
    cardCache.set(key, m);
  }
  return m;
}

const decalMats = new Map<string, THREE.MeshStandardMaterial>();
function decalMaterial(t: THREE.Texture) {
  let m = decalMats.get(t.uuid);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    decalMats.set(t.uuid, m);
  }
  return m;
}

// ——— sockets —————————————————————————————————————————————————————————————————————————————

function socketAt(parent: THREE.Bone, world: THREE.Vector3, rot = new THREE.Quaternion(), name = ""): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  parent.updateMatrixWorld(true);
  const inv = parent.matrixWorld.clone().invert();
  o.position.copy(world).applyMatrix4(inv);
  o.quaternion.copy(rot);
  parent.add(o);
  return o;
}

/** Socket whose +z points along `dir` with `up` as +y (weapons extend along +z). */
function aimed(parent: THREE.Bone, world: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, name: string) {
  const z = dir.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return socketAt(parent, world, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), name);
}

function makeSockets(a: Anatomy, b: Record<string, THREE.Bone>, o: Outfit): Record<SocketName, THREE.Object3D> {
  const grip = (side: "L" | "R") => {
    // Inside the curled fingers: between the palm and the knuckles, toward the palm side.
    const wrist = a.joint(`hand${side}`);
    const k2 = a.joint(`index1${side}`);
    const k5 = a.joint(`pinky1${side}`);
    const knuckles = k2.clone().add(k5).multiplyScalar(0.5);
    const p = wrist.clone().lerp(knuckles, 0.95);
    p.x -= sx(side) * 0.022; // palm faces the thigh
    p.y -= 0.012;
    return socketAt(b[`hand${side}`], p, new THREE.Quaternion(), `grip${side}`);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const obi = (ang: number, out: number, dy = 0) => o.ringPoint(a.waistY + dy, ang, out);
  const backP = o.ringPoint(a.chestY + 0.03, Math.PI + 0.35, 0.045);
  const backWaistP = o.ringPoint(a.waistY - 0.01, Math.PI, 0.045);
  backWaistP.x -= 0.02;
  const thigh = a.leg.R.pts[0].clone().lerp(a.leg.R.pts[1], 0.3);
  thigh.x -= 0.075;
  return {
    gripR: grip("R"),
    gripL: grip("L"),
    // Katana through the obi on the left hip: handle forward and up, saya back and down.
    hipL: aimed(b.hips, obi(1.05, 0.035), new THREE.Vector3(0.12, -0.42, -1), up, "hipL"),
    hipL2: aimed(b.hips, obi(1.12, 0.05, -0.012), new THREE.Vector3(0.16, -0.5, -1), up, "hipL2"),
    hipL3: aimed(b.hips, obi(1.2, 0.065, -0.024), new THREE.Vector3(0.2, -0.58, -1), up, "hipL3"),
    // Across the back: grip above the right shoulder, blade down toward the left hip.
    back: aimed(b.chest, backP, new THREE.Vector3(0.55, -0.83, -0.02), new THREE.Vector3(0, 0, -1), "back"),
    backWaist: aimed(b.hips, backWaistP, new THREE.Vector3(1, -0.12, 0), up, "backWaist"),
    thighR: aimed(b.thighR, thigh, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), "thighR"),
    mouth: socketAt(b.head, a.mouth, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), "mouth"),
    headTop: socketAt(b.head, a.headTop, new THREE.Quaternion(), "headTop"),
  };
}

export { SIDES };
