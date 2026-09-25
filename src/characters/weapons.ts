// Procedural weapons. Every weapon is built with its grip at the origin and the business
// end along +z, matching the hand sockets. Each weapon knows where it rests when sheathed.

import * as THREE from "three";
import type { BuiltCharacter, SocketName } from "./builder";

const mats = {
  steel: new THREE.MeshStandardMaterial({ color: "#cfd4da", metalness: 1, roughness: 0.28 }),
  steelDark: new THREE.MeshStandardMaterial({ color: "#5a5e64", metalness: 0.9, roughness: 0.35 }),
  gold: new THREE.MeshStandardMaterial({ color: "#b8923f", metalness: 0.85, roughness: 0.5 }),
  lacquer: new THREE.MeshStandardMaterial({ color: "#141212", metalness: 0.1, roughness: 0.18 }),
  lacquerRed: new THREE.MeshStandardMaterial({ color: "#7a1f1a", metalness: 0.1, roughness: 0.22 }),
  lacquerWhite: new THREE.MeshStandardMaterial({ color: "#ece8de", metalness: 0.05, roughness: 0.25 }),
  wrapBlack: new THREE.MeshStandardMaterial({ color: "#1c1a1a", roughness: 0.85 }),
  wrapWhite: new THREE.MeshStandardMaterial({ color: "#e8e4da", roughness: 0.9 }),
  wrapPurple: new THREE.MeshStandardMaterial({ color: "#4a3a6a", roughness: 0.85 }),
  wrapRed: new THREE.MeshStandardMaterial({ color: "#6e1f1a", roughness: 0.85 }),
  oak: new THREE.MeshStandardMaterial({ color: "#c9a37a", roughness: 0.7 }),
  walnut: new THREE.MeshStandardMaterial({ color: "#6a4228", roughness: 0.6 }),
  moon: new THREE.MeshStandardMaterial({ color: "#dfe9ff", metalness: 0.6, roughness: 0.18, emissive: new THREE.Color("#8fb6ff"), emissiveIntensity: 0.9 }),
  iron: new THREE.MeshStandardMaterial({ color: "#2e2e30", metalness: 0.7, roughness: 0.55 }),
  cord: new THREE.MeshStandardMaterial({ color: "#3a4a78", roughness: 0.9 }),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, pos?: THREE.Vector3, rot?: THREE.Euler): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  if (pos) o.position.copy(pos);
  if (rot) o.rotation.copy(rot);
  o.castShadow = true;
  return o;
}

/** A curved single-edged blade along +z with a hamon, length L, curvature sori (m). */
function bladeGeometry(L: number, width: number, sori: number, straight = false): THREE.BufferGeometry {
  const seg = 16;
  const pos: number[] = [];
  const idx: number[] = [];
  const col: number[] = [];
  const t = 0.0065;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const z = u * L;
    const y = straight ? 0 : sori * Math.sin(Math.PI * u * 0.6) * u;
    // Width tapers slightly, then the kissaki (tip) closes it.
    const w = width * (1 - 0.3 * u) * (u > 0.9 ? Math.max(0.05, (1 - u) / 0.1) : 1);
    // Cross-section: spine (top) thick, edge (bottom) sharp.
    const ring = [
      [0, y + w * 0.5, t],
      [0, y + w * 0.5, -t],
      [0, y - w * 0.5, 0],
    ];
    for (const [x, yy, zz] of ring) {
      pos.push(zz, yy, z + x);
    }
    for (const k of [0, 1, 2]) {
      const hamon = k === 2 ? 1 : 0.86;
      col.push(hamon, hamon, hamon);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1); // spine
    idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    idx.push(a + 2, b + 2, a, a, b + 2, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function sayaGeometry(L: number, width: number, sori: number, straight = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 6 }, (_, i) => {
      const u = i / 5;
      return new THREE.Vector3(0, straight ? 0 : sori * Math.sin(Math.PI * u * 0.6) * u, u * L);
    }),
  );
  const g = new THREE.TubeGeometry(curve, 16, width * 0.5, 8, false);
  g.scale(0.55, 1, 1);
  return g;
}

interface Sword {
  drawn: THREE.Object3D;
  sheathed: THREE.Object3D;
}

function katanaParts(opts: { L?: number; hilt?: number; saya?: THREE.Material; wrap?: THREE.Material; guard?: THREE.Material; blade?: THREE.Material; straight?: boolean; guardShape?: "round" | "square" | "none" }): Sword {
  const L = opts.L ?? 0.7;
  const hilt = opts.hilt ?? 0.26;
  const bladeMat = (opts.blade ?? mats.steel).clone() as THREE.MeshStandardMaterial;
  bladeMat.vertexColors = true;
  const build = (withBlade: boolean) => {
    const g = new THREE.Group();
    // Handle: the grip socket is at the middle of the hands, so the tsuba sits ahead of it.
    const guardZ = hilt * 0.45;
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.016, hilt, 8).rotateX(Math.PI / 2), opts.wrap ?? mats.wrapBlack, new THREE.Vector3(0, 0, guardZ - hilt / 2)));
    // Diamond wrap highlights.
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.TorusGeometry(0.0172, 0.0025, 4, 10), mats.gold, new THREE.Vector3(0, 0, guardZ - hilt + 0.02 + i * (hilt / 6.5))));
    g.add(mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10).rotateX(Math.PI / 2), mats.gold, new THREE.Vector3(0, 0, guardZ - hilt)));
    if (opts.guardShape !== "none") {
      const tsuba = opts.guardShape === "square" ? new THREE.BoxGeometry(0.07, 0.07, 0.008) : new THREE.CylinderGeometry(0.042, 0.042, 0.008, 18).rotateX(Math.PI / 2);
      g.add(mesh(tsuba, opts.guard ?? mats.iron, new THREE.Vector3(0, 0, guardZ + 0.004)));
    }
    g.add(mesh(new THREE.BoxGeometry(0.012, 0.03, 0.03), mats.gold, new THREE.Vector3(0, 0, guardZ + 0.022)));
    if (withBlade) {
      const b = mesh(bladeGeometry(L, 0.031, 0.022, opts.straight), bladeMat, new THREE.Vector3(0, 0, guardZ + 0.03));
      g.add(b);
    }
    return g;
  };
  const drawn = build(true);
  const sheathed = build(false);
  const saya = mesh(sayaGeometry(L + 0.04, 0.036, 0.022, opts.straight), opts.saya ?? mats.lacquer, new THREE.Vector3(0, 0, hilt * 0.45 + 0.012));
  sheathed.add(saya);
  sheathed.add(mesh(new THREE.TorusGeometry(0.022, 0.004, 5, 12), mats.cord, new THREE.Vector3(0, 0, hilt * 0.45 + 0.1)));
  return { drawn, sheathed };
}

function bokkenParts(): Sword {
  const build = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.28, 8).rotateX(Math.PI / 2), mats.oak, new THREE.Vector3(0, 0, -0.02)));
    const b = mesh(bladeGeometry(0.72, 0.034, 0.02), mats.oak, new THREE.Vector3(0, 0, 0.12));
    g.add(b);
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 14).rotateX(Math.PI / 2), mats.walnut, new THREE.Vector3(0, 0, 0.12)));
    return g;
  };
  return { drawn: build(), sheathed: build() };
}

function zangetsuParts(): Sword {
  const build = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8).rotateX(Math.PI / 2), mats.wrapWhite, new THREE.Vector3(0, 0, -0.02)));
    // Cleaver blade: long, wide and flat, with an angled tip and a dark spine.
    const bg2 = new THREE.BoxGeometry(0.014, 0.22, 1.4);
    const bl = mesh(bg2, mats.steel, new THREE.Vector3(0, -0.07, 0.86));
    g.add(bl);
    const tip = new THREE.BufferGeometry();
    tip.setAttribute("position", new THREE.Float32BufferAttribute([0.007, 0.04, 1.56, 0.007, -0.18, 1.56, 0.007, 0.04, 1.72, -0.007, 0.04, 1.56, -0.007, 0.04, 1.72, -0.007, -0.18, 1.56], 3));
    tip.setIndex([0, 1, 2, 3, 4, 5, 0, 2, 4, 0, 4, 3, 1, 5, 4, 1, 4, 2]);
    tip.computeVertexNormals();
    g.add(mesh(tip, mats.steel));
    g.add(mesh(new THREE.BoxGeometry(0.018, 0.03, 1.4), mats.steelDark, new THREE.Vector3(0, 0.035, 0.86)));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.26, 0.05), mats.steelDark, new THREE.Vector3(0, -0.07, 0.16)));
    // Cloth tail from the pommel.
    g.add(mesh(new THREE.BoxGeometry(0.004, 0.03, 0.35), mats.wrapWhite, new THREE.Vector3(0, -0.03, -0.35), new THREE.Euler(0.4, 0, 0)));
    return g;
  };
  return { drawn: build(), sheathed: build() };
}

function kanaboParts(): Sword {
  const build = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8).rotateX(Math.PI / 2), mats.wrapRed, new THREE.Vector3(0, 0, 0)));
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.045, 1.0, 8).rotateX(Math.PI / 2), mats.iron, new THREE.Vector3(0, 0, 0.7)));
    for (let i = 0; i < 24; i++) {
      const a = (i % 8) * (Math.PI / 4);
      const z = 0.4 + Math.floor(i / 8) * 0.28;
      const r = 0.05 + (z - 0.2) * 0.022;
      g.add(mesh(new THREE.ConeGeometry(0.012, 0.035, 5).rotateZ(-Math.PI / 2).rotateY(0), mats.steelDark, new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z), new THREE.Euler(0, 0, a)));
    }
    return g;
  };
  return { drawn: build(), sheathed: build() };
}

function kunaiParts(): Sword {
  const build = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 6).rotateX(Math.PI / 2), mats.wrapBlack, new THREE.Vector3(0, 0, 0)));
    g.add(mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), mats.iron, new THREE.Vector3(0, 0, -0.068), new THREE.Euler(0, Math.PI / 2, 0)));
    const blade = new THREE.ConeGeometry(0.02, 0.12, 4);
    blade.rotateX(Math.PI / 2);
    blade.scale(1, 0.3, 1);
    g.add(mesh(blade, mats.steelDark, new THREE.Vector3(0, 0, 0.11)));
    return g;
  };
  const sheathed = new THREE.Group();
  sheathed.add(mesh(new THREE.BoxGeometry(0.07, 0.09, 0.04), mats.wrapBlack, new THREE.Vector3(0, 0, 0)));
  sheathed.add(build());
  return { drawn: build(), sheathed };
}

function shotgunParts(): Sword {
  const build = () => {
    const g = new THREE.Group();
    // Grip at the origin; barrels forward, stock back.
    g.add(mesh(new THREE.BoxGeometry(0.035, 0.06, 0.16), mats.walnut, new THREE.Vector3(0, -0.01, 0.02)));
    const stock = new THREE.BoxGeometry(0.04, 0.09, 0.3);
    g.add(mesh(stock, mats.walnut, new THREE.Vector3(0, -0.03, -0.2), new THREE.Euler(0.18, 0, 0)));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), mats.steelDark, new THREE.Vector3(0, 0.02, 0.12)));
    for (const x of [-0.013, 0.013]) g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 10).rotateX(Math.PI / 2), mats.steelDark, new THREE.Vector3(x, 0.03, 0.48)));
    g.add(mesh(new THREE.BoxGeometry(0.045, 0.03, 0.22), mats.walnut, new THREE.Vector3(0, 0.005, 0.32)));
    return g;
  };
  return { drawn: build(), sheathed: build() };
}

// ——— visuals attached to a character ————————————————————————————————————

interface Slot {
  obj: THREE.Object3D;
  drawnAt: SocketName | null;
  sheathedAt: SocketName;
  sheathOnly?: boolean;
  /** Extra local rotation when drawn. */
  drawnRot?: THREE.Euler;
}

export class WeaponVisual {
  private slots: Slot[] = [];
  private drawnParts: THREE.Object3D[] = [];
  drawn = false;

  constructor(private built: BuiltCharacter, readonly id: string) {
    const add = (s: Sword, drawnAt: SocketName | null, sheathedAt: SocketName, drawnRot?: THREE.Euler) => {
      // The sheathed group stays at the hip; the drawn blade moves to the hand.
      this.slots.push({ obj: s.sheathed, drawnAt: null, sheathedAt, sheathOnly: true });
      if (drawnAt) this.slots.push({ obj: s.drawn, drawnAt, sheathedAt, drawnRot });
    };
    switch (id) {
      case "katana":
      case "bandit_katana":
        add(katanaParts({}), "gripR", "hipL");
        add(katanaParts({ L: 0.45, hilt: 0.18 }), null, "hipL2"); // wakizashi, worn only
        break;
      case "bokken":
        add(bokkenParts(), "gripR", "hipL");
        break;
      case "nodachi":
        add(katanaParts({ L: 1.05, hilt: 0.38, saya: mats.lacquerRed }), "gripR", "back");
        break;
      case "tsukikage":
        add(katanaParts({ L: 0.76, blade: mats.moon, guard: mats.gold, wrap: mats.wrapWhite, saya: mats.lacquerWhite }), "gripR", "hipL");
        break;
      case "santoryu":
        add(katanaParts({ saya: mats.lacquerWhite, wrap: mats.wrapWhite, guard: mats.gold }), "gripR", "hipL");
        add(katanaParts({ saya: mats.lacquerRed, wrap: mats.wrapRed }), "gripL", "hipL2");
        add(katanaParts({ saya: mats.lacquer, wrap: mats.wrapBlack }), "mouth", "hipL3", new THREE.Euler(0, 0, 0));
        break;
      case "senbonzakura":
        add(katanaParts({ guard: mats.gold, guardShape: "square" }), "gripR", "hipL");
        break;
      case "kusanagi":
        add(katanaParts({ straight: true, guardShape: "square", wrap: mats.wrapPurple, L: 0.72 }), "gripR", "backWaist");
        break;
      case "zangetsu":
        this.slots.push({ obj: zangetsuParts().drawn, drawnAt: "gripR", sheathedAt: "back" });
        break;
      case "kanabo":
        this.slots.push({ obj: kanaboParts().drawn, drawnAt: "gripR", sheathedAt: "back" });
        break;
      case "kunai":
        add(kunaiParts(), "gripR", "thighR");
        break;
      case "boomstick":
        this.slots.push({ obj: shotgunParts().drawn, drawnAt: "gripR", sheathedAt: "back" });
        break;
      default:
        break; // fists
    }
    this.apply();
  }

  get hasBlade() {
    return this.slots.some((s) => s.drawnAt);
  }

  setDrawn(d: boolean) {
    if (d === this.drawn) return;
    this.drawn = d;
    this.apply();
  }

  private apply() {
    for (const s of this.slots) {
      const socketName = this.drawn && s.drawnAt ? s.drawnAt : s.sheathedAt;
      const sock = this.built.sockets[socketName];
      if (s.sheathOnly) {
        sock.add(s.obj);
        s.obj.visible = true;
        // Hide the blade part inside the saya when it's in the hand.
        continue;
      }
      if (this.drawn && s.drawnAt) {
        this.built.sockets[s.drawnAt].add(s.obj);
        s.obj.visible = true;
        s.obj.rotation.copy(s.drawnRot ?? new THREE.Euler());
        s.obj.position.set(0, 0, 0);
      } else {
        // Sheathed: the drawn copy is hidden (the sheathed group shows the hilt).
        const sheathOnlyExists = this.slots.some((o) => o.sheathOnly && o.sheathedAt === s.sheathedAt);
        if (sheathOnlyExists) {
          s.obj.visible = false;
        } else {
          this.built.sockets[s.sheathedAt].add(s.obj);
          s.obj.visible = true;
          s.obj.rotation.set(0, 0, 0);
          s.obj.position.set(0, 0, 0);
        }
      }
    }
    // When a blade is drawn, its own sheathed hilt should disappear, leaving the empty saya.
    for (const s of this.slots) {
      if (!s.sheathOnly) continue;
      const pair = this.slots.find((o) => !o.sheathOnly && o.sheathedAt === s.sheathedAt);
      const hiltParts = s.obj.children.slice(0, s.obj.children.length - 2);
      for (const h of hiltParts) h.visible = !(this.drawn && pair?.drawnAt);
    }
    void this.drawnParts;
  }

  dispose() {
    for (const s of this.slots) s.obj.removeFromParent();
  }
}

export function stanceFor(weaponId: string, drawn: boolean): import("./animation").Stance {
  if (!drawn) return "relaxed";
  switch (weaponId) {
    case "fists":
      return "unarmed";
    case "santoryu":
      return "triple";
    case "zangetsu":
    case "nodachi":
    case "kanabo":
      return "greatsword";
    case "boomstick":
      return "shotgun";
    case "kunai":
      return "kunai";
    default:
      return "sword";
  }
}
