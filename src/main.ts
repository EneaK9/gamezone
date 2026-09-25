import "./styles.css";
import * as THREE from "three";
import { Assets } from "./core/assets";
import { Renderer } from "./render/renderer";
import { Sky } from "./render/sky";
import { DayNight } from "./systems/time";
import { Materials } from "./render/materials";
import { World } from "./world/World";

async function preview() {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
  const renderer = new Renderer(canvas, scene, camera);
  const params = new URLSearchParams(location.search);
  const time = new DayNight(Number(params.get("hour") ?? 15.2));
  const sky = new Sky(renderer.gl);
  scene.add(sky.mesh);

  const assets = new Assets();
  await assets.load(() => {});
  const materials = new Materials(assets);
  const world = new World(assets, materials);
  scene.add(world.group);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 400;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xffffff, 0.002);

  const cam = (params.get("cam") ?? "95,22,40,20,2,0").split(",").map(Number);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.lookAt(cam[3], cam[4], cam[5]);

  const clock = new THREE.Clock();
  let elapsed = 0;
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    time.update(0);
    const p = time.palette;
    sky.update(time, elapsed);
    sky.refreshEnvironment(scene, time);
    world.update(dt, time, camera.position, elapsed);
    sun.color.copy(p.sun);
    sun.intensity = p.sunIntensity;
    sun.position.copy(camera.position).addScaledVector(time.lightDir, 150);
    sun.target.position.copy(camera.position);
    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    hemi.intensity = p.hemiIntensity;
    (scene.fog as THREE.FogExp2).color.copy(p.fog);
    (scene.fog as THREE.FogExp2).density = p.fogDensity;
    renderer.gl.toneMappingExposure = p.exposure;
    renderer.render(dt);
    requestAnimationFrame(loop);
  };
  loop();
  document.body.dataset.boot = "ready";
}

const params = new URLSearchParams(location.search);
if (params.has("lineup")) {
  import("./dev/lineup").then((m) => m.lineup());
} else if (params.has("poselab")) {
  import("./dev/poselab").then((m) => m.poselab());
} else if (params.has("preview")) {
  preview();
} else {
  import("./game/Game").then((m) => m.startGame());
}
