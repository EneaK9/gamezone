// Dev page for the MakeHuman-based kit: bodies under studio light, with test poses.
//   ?humanlab[&pose=tpose|fist|bend|walk][&focus=face|hand][&n=0,1,2][&turn=0.6]

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ROSTER } from "../../shared/roster";
import { NPCS } from "../../shared/npcs";
import { Assets } from "../core/assets";
import { ALL_SKINS, buildHuman, preloadHumanTextures } from "../characters/human/build";
import { setFabricAssets } from "../characters/human/fabric";
import { loadHumanKit, type HumanKit, type HumanSpec } from "../characters/human/kit";

const SPECS: { label: string; spec: HumanSpec; skin: string; eye: string; brow: string }[] = [
  { label: "adult m", spec: { sex: "m", age: "adult", muscle: 0.5, weight: 0.5, height: 1.74 }, skin: "young-asian-m", eye: "brown", brow: "brow004" },
  { label: "athletic m", spec: { sex: "m", age: "adult", muscle: 0.85, weight: 0.45, height: 1.81 }, skin: "young-caucasian-m", eye: "brownlight", brow: "brow004" },
  { label: "heavy m", spec: { sex: "m", age: "adult", muscle: 0.9, weight: 0.95, height: 1.9 }, skin: "young-african-m", eye: "brown", brow: "brow008" },
  { label: "adult f", spec: { sex: "f", age: "adult", muscle: 0.5, weight: 0.45, height: 1.62 }, skin: "young-asian-f", eye: "brown", brow: "brow010" },
  { label: "elder m", spec: { sex: "m", age: "elder", muscle: 0.5, weight: 0.4, height: 1.62 }, skin: "old-asian-m", eye: "grey", brow: "brow009" },
  { label: "elder f", spec: { sex: "f", age: "elder", muscle: 0.5, weight: 0.6, height: 1.5 }, skin: "old-asian-f", eye: "brown", brow: "brow011" },
  { label: "child", spec: { sex: "m", age: "child", muscle: 0.5, weight: 0.5, height: 1.25 }, skin: "young-asian-m", eye: "brown", brow: "brow006" },
];

const tex = new Map<string, THREE.Texture>();
function load(kit: HumanKit, name: string, srgb = true) {
  let t = tex.get(name);
  if (!t) {
    t = new THREE.TextureLoader().load(kit.texture(name));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    tex.set(name, t);
  }
  return t;
}

function buildPerson(kit: HumanKit, e: (typeof SPECS)[number]) {
  const body = kit.body(e.spec);
  const { bones, byName } = kit.skeleton(body);
  const group = new THREE.Group();
  const root = bones[0];
  group.add(root);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const skin = new THREE.MeshStandardMaterial({ map: load(kit, `skin-${e.skin}.jpg`), roughness: 0.55 });
  const eyeball = new THREE.MeshStandardMaterial({ map: load(kit, `eye-${e.eye}.png`), roughness: 0.35 });
  const cornea = new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.04, metalness: 0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const parts: [THREE.BufferGeometry, THREE.Material | THREE.Material[]][] = [
    [kit.surfaceGeometry(body), skin],
    [kit.proxyGeometry(body, "eyes"), [eyeball, cornea]],
    [kit.proxyGeometry(body, e.brow), new THREE.MeshStandardMaterial({ map: load(kit, `${e.brow}.png`), color: "#ffffff", transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8 })],
    [kit.proxyGeometry(body, "lashes"), new THREE.MeshStandardMaterial({ map: load(kit, "lashes01.png"), color: "#ffffff", transparent: true, depthWrite: false, side: THREE.DoubleSide })],
    [kit.proxyGeometry(body, "teeth"), new THREE.MeshStandardMaterial({ map: load(kit, "teeth.jpg"), roughness: 0.3 })],
    [kit.proxyGeometry(body, "tongue"), new THREE.MeshStandardMaterial({ map: load(kit, "tongue.jpg"), roughness: 0.4 })],
  ];
  const hide = new URLSearchParams(location.search).get("hide")?.split(",") ?? [];
  const names = ["body", "eyes", "brow", "lashes", "teeth", "tongue"];
  for (const [i, [g, m]] of parts.entries()) {
    if (hide.includes(names[i])) continue;
    const mesh = new THREE.SkinnedMesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  if (new URLSearchParams(location.search).has("guides")) {
    const colors: Record<string, string> = { tights: "#3b6fd8", skirt: "#3bbf6a", hair: "#d8483b" };
    for (const gname of kit.meta.guides) {
      const m = new THREE.SkinnedMesh(kit.surfaceGeometry(body, gname), new THREE.MeshStandardMaterial({ color: colors[gname], transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      m.frustumCulled = false;
      group.add(m);
      m.bind(skeleton, new THREE.Matrix4());
    }
  }
  return { group, byName, body };
}

function pose(byName: Record<string, THREE.Bone>, name: string) {
  const d = THREE.MathUtils.degToRad;
  const set = (b: string, x: number, y: number, z: number) => byName[b]?.rotation.set(d(x), d(y), d(z));
  if (name === "tpose") {
    set("upperArmL", 0, 0, 84);
    set("upperArmR", 0, 0, -84);
  } else if (name === "bend") {
    set("upperArmL", -40, 0, 20);
    set("foreArmL", -110, 0, 0);
    set("upperArmR", -80, 0, -10);
    set("foreArmR", -60, 0, 0);
    set("thighL", -70, 0, 0);
    set("shinL", 90, 0, 0);
    set("spine", 10, 20, 0);
  } else if (name === "walk") {
    set("thighL", -30, 0, 0);
    set("shinL", 20, 0, 0);
    set("thighR", 20, 0, 0);
    set("shinR", 30, 0, 0);
    set("upperArmL", 25, 0, 0);
    set("upperArmR", -25, 0, 0);
    set("foreArmR", -30, 0, 0);
  }
  if (name === "fist" || name === "bend") {
    for (const s of ["L", "R"]) {
      const sign = s === "L" ? -1 : 1;
      for (const f of ["index", "middle", "ring", "pinky"]) {
        set(`${f}1${s}`, 0, 0, 80 * sign);
        set(`${f}2${s}`, 0, 0, 95 * sign);
        set(`${f}3${s}`, 0, 0, 60 * sign);
      }
    }
  }
}

export async function humanlab() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8d9296");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.02, 100);

  const key = new THREE.DirectionalLight("#fff4e8", 2.4);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4, bottom: -1 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#cfe3ff", 1.2);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: "#6f6a62", roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const kit = await loadHumanKit();
  const rosterIds = params.get("roster");
  const npcIds = params.get("npcs");
  let built: { group: THREE.Group; byName: Record<string, THREE.Bone> }[];
  let count: number;
  if (rosterIds !== null || npcIds !== null) {
    const assets = new Assets();
    await assets.load(() => {});
    setFabricAssets(assets);
    await preloadHumanTextures(kit, ALL_SKINS);
    const looks = rosterIds !== null
      ? ROSTER.filter((r) => !rosterIds || rosterIds.split(",").includes(r.id)).map((r) => ({ id: r.id, look: r.look }))
      : NPCS.filter((n) => !npcIds || npcIds.split(",").includes(n.id)).map((n) => ({ id: n.id, look: n.look }));
    count = looks.length;
    const spacing = Number(params.get("spacing") ?? 0.9);
    built = looks.map((e, i) => {
      const t0 = performance.now();
      const h = buildHuman(e.look, { skinSize: 2048 });
      const tris = h.meshes.reduce((n, m) => n + (m.geometry.index?.count ?? 0) / 3, 0);
      console.log(`[humanlab] ${e.id}: ${Math.round(performance.now() - t0)} ms, ${h.meshes.length} meshes, ${Math.round(tris)} tris`);
      const group = new THREE.Group();
      group.add(h.root);
      group.position.x = (i - (looks.length - 1) / 2) * spacing;
      group.rotation.y = Number(params.get("turn") ?? 0);
      pose(h.bones, params.get("pose") ?? "");
      scene.add(group);
      return { group, byName: h.bones };
    });
  } else {
    const pick = params.get("n")?.split(",").map(Number) ?? SPECS.map((_, i) => i);
    const people = pick.map((i) => SPECS[i]).filter(Boolean);
    count = people.length;
    const spacing = 0.85;
    built = people.map((e, i) => {
      const t0 = performance.now();
      const p = buildPerson(kit, e);
      console.log(`[humanlab] ${e.label}: ${Math.round(performance.now() - t0)} ms`);
      p.group.position.x = (i - (people.length - 1) / 2) * spacing;
      p.group.rotation.y = Number(params.get("turn") ?? 0);
      pose(p.byName, params.get("pose") ?? "");
      scene.add(p.group);
      return p;
    });
  }
  const people = { length: count };

  const controls = new OrbitControls(camera, canvas);
  const focus = params.get("focus");
  const first = built[0];
  if (focus === "face" || focus === "hand") {
    first.group.updateMatrixWorld(true);
    const bone = first.byName[focus === "face" ? "head" : "handR"];
    const at = bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, focus === "face" ? 0.08 : -0.08, 0));
    controls.target.copy(at);
    camera.position.copy(at).add(new THREE.Vector3(0.12, 0.02, focus === "face" ? 0.55 : 0.45));
  } else {
    controls.target.set(0, 0.95, 0);
    camera.position.set(0, 1.1, 4.2 + people.length * 0.55);
  }
  const cam = params.get("cam")?.split(",").map(Number);
  if (cam) {
    camera.position.set(cam[0], cam[1], cam[2]);
    controls.target.set(cam[3], cam[4], cam[5]);
  }
  controls.update();

  const loop = () => {
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  (window as unknown as { humanlab: unknown }).humanlab = { scene, camera, built, kit };
  document.body.dataset.boot = "ready";
}
