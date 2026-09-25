// Builds and owns the whole village: terrain, river, buildings, props, vegetation,
// colliders, and the pool of warm point lights that follow the camera at night.

import * as THREE from "three";
import type { Assets, ModelId } from "../core/assets";
import type { Materials } from "../render/materials";
import type { DayNight } from "../systems/time";
import { buildPlot, type BuildingOut } from "./buildings";
import { CollisionWorld } from "./collision";
import { Batch, trs } from "./geo";
import { HeightGrid, riverWaterY } from "./heightfield";
import { BANDIT_CAMP, DOJO_YARD, PLOTS, SHRINE_TOP, SQUARE, plotRect, rectContains, riverQuery, roadQuery, type Plot, type Rect } from "./layout";
import { PropBuilder, type PropsOut } from "./props";
import { buildTerrain } from "./terrain";
import { Vegetation, curatedTrees } from "./vegetation";
import { Water } from "./water";

export class World {
  readonly group = new THREE.Group();
  readonly grid: HeightGrid;
  readonly collision = new CollisionWorld();
  readonly water: Water;
  vegetation!: Vegetation;
  props!: PropsOut;
  readonly buildings = new Map<Plot, BuildingOut>();
  readonly footprints: Rect[] = [];
  private lightSpots: THREE.Vector3[] = [];
  private pool: THREE.PointLight[] = [];
  private poolTimer = 0;
  private fires: { light: THREE.PointLight; base: number }[] = [];

  constructor(private assets: Assets, private materials: Materials, onStep?: (label: string) => void) {
    const t0 = performance.now();
    this.grid = new HeightGrid(1);
    onStep?.("Raising the hills");
    this.group.add(buildTerrain(this.grid, assets));
    this.water = new Water(this.grid);
    this.group.add(this.water.group);
    onStep?.("Filling the river");

    // Buildings.
    const batch = new Batch(materials);
    const models: [ModelId, THREE.Matrix4][] = [];
    const placeModel = (id: ModelId, m: THREE.Matrix4) => models.push([id, m]);
    const propRequests: [string, THREE.Matrix4][] = [];
    for (const plot of PLOTS) {
      const r = plotRect(plot);
      // Build on the lowest corner so nothing floats.
      plot.y = Math.min(
        this.grid.height(r.x0, r.z0),
        this.grid.height(r.x1, r.z0),
        this.grid.height(r.x0, r.z1),
        this.grid.height(r.x1, r.z1),
        this.grid.height(plot.x, plot.z),
      );
      const out = buildPlot(batch, plot, { prop: (id, m) => propRequests.push([id, m]) });
      this.buildings.set(plot, out);
      this.lightSpots.push(...out.lights);
      this.footprints.push(r);
      const pad = plot.kind === "dojo" || plot.kind === "shrine" ? 1.5 : plot.kind === "pagoda" ? 1.4 : 0.1;
      const top = plot.y + (plot.kind === "yatai" ? 2.5 : plot.kind === "pagoda" ? 30 : 7);
      this.collision.addBox({ x0: r.x0 - pad, z0: r.z0 - pad, x1: r.x1 + pad, z1: r.z1 + pad, top });
    }
    onStep?.("Raising the rooftops");

    const props = new PropBuilder(batch, this.collision, this.grid, assets, placeModel);
    this.props = props.buildAll();
    for (const [id, m] of propRequests) this.requestedProp(batch, props, id, m);
    this.lightSpots.push(...this.props.lights);
    this.group.add(batch.build());
    for (const [id, m] of models) this.addModel(id, m);
    onStep?.("Hanging the lanterns");

    this.vegetation = new Vegetation(this.grid, materials, this.collision, (x, z, c) => this.isFree(x, z, c), curatedTrees((x, z, c) => this.isFree(x, z, c)));
    this.group.add(this.vegetation.group);
    onStep?.("Planting the cherry trees");

    // Night lights.
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight("#ffb46b", 0, 16, 1.6);
      this.pool.push(l);
      this.group.add(l);
    }
    for (const f of this.props.fires) {
      const l = new THREE.PointLight("#ff8a3a", 6, 14, 1.8);
      l.position.copy(f);
      this.fires.push({ light: l, base: 6 });
      this.group.add(l);
    }
    console.info(`[world] built in ${Math.round(performance.now() - t0)} ms — ${PLOTS.length} buildings, ${this.lightSpots.length} lanterns`);
  }

  private requestedProp(batch: Batch, props: PropBuilder, id: string, m: THREE.Matrix4) {
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    if (id === "umbrella") {
      // Nodate-gasa: tall red parasol.
      const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6);
      pole.translate(0, 1.3, 0);
      batch.add("darkWood", pole, m);
      const shade = new THREE.ConeGeometry(1.6, 0.55, 20, 1, true);
      shade.translate(0, 2.55, 0);
      batch.add("clothRed", shade, m);
      this.collision.addCircle({ x: p.x, z: p.z, r: 0.12, top: p.y + 2.6 });
    } else if (id === "bale") {
      const bale = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 12);
      bale.rotateZ(Math.PI / 2);
      bale.translate(0, 0.28, 0);
      batch.add("straw", bale, m);
    }
    void props;
  }

  private addModel(id: ModelId, m: THREE.Matrix4) {
    const obj = this.assets.model(id);
    if (!obj) return;
    obj.applyMatrix4(m);
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.group.add(obj);
  }

  /** Can vegetation go here? */
  isFree(x: number, z: number, clearance: number): boolean {
    if (roadQuery(x, z).edgeDist < clearance * 0.8 + 0.6) return false;
    for (const r of this.footprints) if (rectContains(r, x, z, clearance + 1.2)) return false;
    if (rectContains(SQUARE, x, z, 1)) return false;
    if (rectContains(DOJO_YARD, x, z, 0.5)) return false;
    if (Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z) < BANDIT_CAMP.r * 0.55) return false;
    if (Math.hypot(x - SHRINE_TOP.x, z - SHRINE_TOP.z) < SHRINE_TOP.r - 3) return false;
    const rv = riverQuery(x, z);
    if (rv.dist < rv.hw + 1.5 + clearance * 0.5) return false;
    if (this.collision.blocked(x, z, clearance * 0.6)) return false;
    return true;
  }

  /** Height of whatever you'd stand on at (x, z). */
  groundHeight(x: number, z: number): number {
    const t = this.grid.height(x, z);
    const d = this.collision.deckHeight(x, z);
    return d !== null && d > t - 0.3 ? Math.max(t, d) : t;
  }

  /** Water depth at a point (0 on dry land). */
  waterDepth(x: number, z: number): number {
    const rv = riverQuery(x, z);
    if (rv.dist > rv.hw + 4) return 0;
    const wy = riverWaterY(rv.cz);
    return Math.max(0, wy - this.grid.height(x, z));
  }

  /** Walkable = not deep water, unless on a deck. */
  walkable(x: number, z: number): boolean {
    if (this.collision.deckHeight(x, z) !== null) return true;
    return this.waterDepth(x, z) < 0.62;
  }

  update(dt: number, time: DayNight, cam: THREE.Vector3, seconds: number) {
    this.water.update(time, seconds);
    this.vegetation.update(seconds, cam, time.isNight ? 0.6 : 1);
    this.materials.updateNight(time.palette.night);

    // Re-assign the light pool to the lanterns nearest the camera.
    this.poolTimer -= dt;
    const night = time.palette.night;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.4;
      const near = this.lightSpots
        .map((p) => ({ p, d: p.distanceToSquared(cam) }))
        .filter((e) => e.d < 60 * 60)
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length);
      this.pool.forEach((l, i) => {
        const e = near[i];
        if (e) {
          l.position.copy(e.p);
          l.position.y -= 0.1;
          l.userData.target = 5.5 * night;
        } else l.userData.target = 0;
      });
    }
    for (const l of this.pool) l.intensity += ((l.userData.target ?? 0) - l.intensity) * Math.min(1, dt * 4);
    for (const f of this.fires) {
      f.light.intensity = f.base * (0.8 + Math.sin(seconds * 13.1) * 0.08 + Math.sin(seconds * 7.3 + 1) * 0.1) * (0.5 + night * 0.9);
    }
  }
}

export { trs };
