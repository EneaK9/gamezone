// Dev page for tuning poses:  ?poselab&id=samurai&weapon=katana&stance=sword&clips=slash1:0.12,slash1:0.22
// Renders one character per entry: "stance" or "clip:time".

import * as THREE from "three";
import { ROSTER_BY_ID } from "../../shared/roster";
import { Assets } from "../core/assets";
import { Character } from "../characters/Character";
import { setFabricNormal } from "../characters/material";
import { Renderer } from "../render/renderer";
import { Sky } from "../render/sky";
import { DayNight } from "../systems/time";

export async function poselab() {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 500);
  const renderer = new Renderer(canvas, scene, camera);
  const time = new DayNight(14);
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
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight("#cfe0ee", "#6a6450", 1.0));

  const id = params.get("id") ?? "samurai";
  const entry = ROSTER_BY_ID[id];
  const weapon = params.get("weapon") ?? entry.weapon;
  const items = (params.get("clips") ?? "stance").split(",");
  const turn = Number(params.get("turn") ?? 0.5);
  const chars: { c: Character; clip?: string; t?: number }[] = [];
  items.forEach((it, i) => {
    const c = new Character(entry.look, weapon);
    c.setDrawn(params.get("drawn") !== "0");
    const stance = params.get("stance");
    if (stance) c.anim.setStance(stance as never);
    c.root.position.x = (i - (items.length - 1) / 2) * 1.6;
    c.root.rotation.y = turn;
    scene.add(c.root);
    if (it !== "stance") {
      const [clip, t] = it.split(":");
      chars.push({ c, clip, t: Number(t ?? 0) });
    } else chars.push({ c });
  });
  // Advance each to its sample time.
  for (const e of chars) {
    if (e.clip) {
      e.c.anim.play(e.clip, { restart: true });
      const steps = Math.ceil((e.t ?? 0) / 0.01);
      for (let k = 0; k < 60; k++) e.c.update(0.016); // settle stance
      e.c.anim.play(e.clip, { restart: true });
      for (let k = 0; k < steps; k++) e.c.update(0.01);
    } else {
      e.c.anim.speed = Number(params.get("speed") ?? 0);
      for (let k = 0; k < 90; k++) e.c.update(0.016);
    }
  }
  const dist = Math.max(3.5, items.length * 1.6);
  const cam = (params.get("cam") ?? `0,1.3,${dist},0,1.0,0`).split(",").map(Number);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.lookAt(cam[3], cam[4], cam[5]);
  time.update(0);
  sky.update(time, 0);
  sky.refreshEnvironment(scene, time, true);
  const loop = () => {
    renderer.render(0.016);
    requestAnimationFrame(loop);
  };
  loop();
  document.body.dataset.boot = "ready";
}
