// Dev page: all playable characters in a row under studio light.  ?lineup[&id=zoro][&cam=...]

import * as THREE from "three";
import { ROSTER } from "../../shared/roster";
import { NPCS } from "../../shared/npcs";
import { Assets } from "../core/assets";
import { buildCharacterMesh } from "../characters/builder";
import { setFabricNormal } from "../characters/material";
import { Renderer } from "../render/renderer";
import { Sky } from "../render/sky";
import { DayNight } from "../systems/time";

export async function lineup() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 500);
  const renderer = new Renderer(canvas, scene, camera);
  const time = new DayNight(Number(params.get("hour") ?? 14));
  const sky = new Sky(renderer.gl);
  scene.add(sky.mesh);
  const assets = new Assets();
  await assets.load(() => {});
  const cloth = assets.tex("terry_cloth").normalMap.clone();
  cloth.repeat.set(1.3, 1.3);
  cloth.needsUpdate = true;
  setFabricNormal(cloth);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: "#8a9a70", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const sun = new THREE.DirectionalLight("#fff3e0", 3);
  sun.position.set(4, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#cfe0ee", "#6a6450", 1.0));

  const which = params.get("id");
  const npc = params.get("npcs") !== null;
  let looks = npc ? NPCS.map((n) => ({ id: n.id, look: n.look })) : ROSTER.filter((r) => !which || r.id === which).map((r) => ({ id: r.id, look: r.look }));
  const profile = params.has("profile");
  if (profile) looks = [looks[0], looks[0]];
  const spacing = 1.15;
  looks.forEach((e, i) => {
    const t0 = performance.now();
    const built = buildCharacterMesh(e.look);
    console.log(`[lineup] ${e.id}: ${built.mesh.geometry.index!.count / 3} tris, ${Math.round(performance.now() - t0)} ms`);
    const holder = new THREE.Group();
    holder.add(built.mesh);
    holder.position.x = (i - (looks.length - 1) / 2) * spacing;
    const turn = Number(params.get("turn") ?? 0);
    holder.rotation.y = profile && i === 1 ? Math.PI / 2 : turn;
    if (profile) holder.position.x = (i - 0.5) * 0.42;
    // Relax the arms a touch.
    built.bones.upperArmL.rotation.z = -0.06;
    built.bones.upperArmR.rotation.z = 0.06;
    built.bones.fingersL.rotation.z = -0.35;
    built.bones.fingersR.rotation.z = 0.35;
    scene.add(holder);
  });
  const cam = (params.get("cam") ?? `0,1.2,${looks.length > 1 ? 9 : 3.2},0,0.95,0`).split(",").map(Number);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.lookAt(cam[3], cam[4], cam[5]);
  time.update(0);
  sky.update(time, 0);
  sky.refreshEnvironment(scene, time, true);
  scene.fog = new THREE.Fog(time.palette.fog, 30, 200);
  const loop = () => {
    renderer.render(0.016);
    requestAnimationFrame(loop);
  };
  loop();
  document.body.dataset.boot = "ready";
}
