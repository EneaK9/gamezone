// Bespoke costume pieces for the playable characters, built from photo/official
// references (see the research notes): the parts generic garments can't express —
// Luffy's bell-cuffed cardigan, Zoro's robe and belly band, Naruto's panelled jacket,
// crests and emblems, belts, pouches, holsters.

import * as THREE from "three";
import type { Look } from "../../../shared/look";
import { SIDES, type Side, sx } from "./anatomy";
import { torsoW } from "./accessories";
import { cut, inflate, renormal, smooth, strip, tube, wMix, wOne } from "./cloth";
import { fabricTile, type ClothLook } from "./fabric";
import { appendGeometry, band, bellCuff, decal, kimonoSleeve, limbBand, Outfit, shade, studs, tail, TH, top, topField, zoned } from "./garments";
import { SkinSurface } from "./marks";
import type { SkinStroke } from "./skin";

/** Costume pieces worn under the generic garments (built first). */
export function buildCostumeUnder(o: Outfit, look: Look): SkinStroke[] {
  if (look.costume === "sasuke") return sasuke(o);
  return [];
}

export function buildCostume(o: Outfit, look: Look): SkinStroke[] {
  switch (look.costume) {
    case "luffy":
      return luffy(o);
    case "zoro":
      return zoro(o);
    case "naruto":
      return naruto(o);
    case "ichigo":
      return ichigo(o);
    case "byakuya":
      return byakuya(o);
    case "shelly":
      return shelly(o);
    case "elprimo":
      return elprimo(o);
    case "samurai":
      return samurai(o);
  }
  return [];
}

const dome = () => {
  const g = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
};

// ——— One Piece ———————————————————————————————————————————————————————————————————————————

function luffy(o: Outfit): SkinStroke[] {
  const a = o.a;
  const red: ClothLook = { color: "#a8202b", fabric: "cotton" };
  // Yellow sash over the shorts, knotted on the LEFT hip, one long twisted tail.
  const sash: ClothLook = { color: "#ddb53a", fabric: "cotton" };
  const yc = a.hipY + 0.075;
  band(o, sash, yc - 0.068, yc + 0.068, TH.sash + 0.004);
  const knot = o.ringPoint(yc, 1.35, TH.sash + 0.03);
  appendGeometry(o.acc(sash), lumpy(0.035), new THREE.Matrix4().makeTranslation(knot.x, knot.y, knot.z), wOne(o.bone("hips")));
  tail(o, sash, knot.clone().add(new THREE.Vector3(0.012, -0.01, 0)), 0.46, 0.12, new THREE.Vector3(1, 0, 0.15).normalize(), new THREE.Vector3(0, 0, 1), ["hips", "thighL"], 0.5);
  // The open red cardigan over it: flounce hem at the upper hip, 3/4 sleeves, bell cuffs.
  const bottom = a.hipY + 0.035;
  top(o, { look: red, bottom, neck: "open", vBottom: bottom - 0.05, vHalfTop: 0.085, openFront: 0.085, sleeve: 0.66, thick: TH.shirt + 0.004, drape: 0.85, flounce: { amp: 0.013, count: 13, depth: 0.07 }, hem: 0.004 });
  for (const s of SIDES) bellCuff(o, s, 0.66, 0.1, 0.05, red);
  // Four domed brass buttons down his right front panel.
  const btn = [];
  for (let k = 0; k < 4; k++) {
    const y = THREE.MathUtils.lerp(a.chestY - 0.02, a.navelY + 0.01, k / 3);
    const p = o.ringPoint(y, Math.atan2(-0.105, 0.12), TH.shirt + 0.02);
    btn.push({ p, n: p.clone().sub(new THREE.Vector3(0, y, o.axisZ(y))).setY(0), bone: "chest", scale: 0.0075 });
  }
  studs(o, { color: "#c9a24a", fabric: "metal" }, dome(), btn);
  // Knee-length denim shorts with fluffy white cuffs.
  for (const s of SIDES) limbBand(o, s, "leg", 0.5, 0.575, { color: "#eee7d8", fabric: "fur" }, TH.shirt + 0.016);
  // Leather chin cord from the hat, hanging in a loop at the collarbones.
  const cord: THREE.Vector3[] = [];
  const hatY = a.headCentre.y + a.headRadii.y * 0.42;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = -Math.PI / 2 + t * Math.PI;
    const side = Math.sin(ang);
    const x = side * THREE.MathUtils.lerp(a.headRadii.x + 0.01, 0.06, Math.abs(Math.cos(ang)) < 0.2 ? 1 : 1 - Math.abs(side) * 0);
    const y = THREE.MathUtils.lerp(hatY, a.neckY - 0.05, Math.cos(ang) ** 0.6);
    cord.push(new THREE.Vector3(x, y, a.headCentre.z + 0.02 + Math.cos(ang) * 0.07));
  }
  const cw = (t: number) => wMix([[wOne(o.bone("head")), Math.abs(t - 0.5) * 2], [wOne(o.bone("neck")), 1 - Math.abs(t - 0.5) * 2]]);
  tube(o.acc({ color: "#8c5e40", fabric: "leather" }), cord, (i) => frameAlong(cord, i), () => 0.0016, cw, { segments: 5 });
  return [];
}

function zoro(o: Outfit): SkinStroke[] {
  const a = o.a;
  // Ribbed knit belly band, visible in the robe's deep V.
  band(o, { color: "#7c9a4e", fabric: "knit", pattern: "stripes", accent: "#4f6332", patternTile: 0.03 }, a.waistY - 0.02, a.chestY - 0.06, TH.shirt + 0.006);
  // Long wrap coat: deep V to the belly band, closed by the sash, skirt to mid-calf.
  const robe: ClothLook = { color: "#4f5f4a", fabric: "canvas" };
  top(o, { look: robe, bottom: a.waistY - 0.04, neck: "v", vBottom: a.navelY + 0.02, vHalfTop: 0.085, sleeve: 0.1, thick: TH.coat, drape: 0.7, skirtTo: a.kneeY - 0.19, skirtFlare: 0.1, hem: 0.01 });
  for (const s of SIDES) kimonoSleeve(o, s, robe, 0.45, 0.56);
  for (const s of SIDES) limbBand(o, s, "arm", 0.5, 0.58, { color: shade(robe.color, 0.9), fabric: "canvas" }, 0.042);
  // Crimson sash at the natural waist; flat knot at the right hip.
  const sash: ClothLook = { color: "#7e2233", fabric: "silk" };
  const yc = a.waistY - 0.02;
  band(o, sash, yc - 0.08, yc + 0.08, TH.sash);
  const knot = o.ringPoint(yc, -1.7, TH.sash + 0.035);
  appendGeometry(o.acc(sash), lumpy(0.03), new THREE.Matrix4().makeTranslation(knot.x, knot.y, knot.z), wOne(o.bone("hips")));
  tail(o, sash, knot, 0.14, 0.07, new THREE.Vector3(-1, 0, -0.3).normalize(), new THREE.Vector3(0, 0, 1), ["hips", "thighR"]);
  // Four wooden toggles down the overlapping front edge (his right) below the sash.
  const tg = [];
  for (let k = 0; k < 4; k++) {
    const y = THREE.MathUtils.lerp(yc - 0.11, a.hipY - 0.2, k / 3);
    const p = o.ringPoint(Math.max(y, a.hipY - 0.1), -0.25, TH.coat + 0.03).setY(y);
    tg.push({ p, n: new THREE.Vector3(-0.2, 0, 1), bone: y > a.hipY - 0.05 ? "hips" : "thighR", scale: 1, spin: Math.PI / 2 });
  }
  studs(o, { color: "#b98a55", fabric: "wood" }, new THREE.CapsuleGeometry(0.005, 0.03, 3, 6).rotateZ(Math.PI / 2), tg);
  // Black bandana tied round the LEFT bicep, over the sleeve.
  const c = a.arm.L;
  const path: THREE.Vector3[] = [];
  const mid = c.pts[0].clone().lerp(c.pts[1], 0.45);
  const dir = c.pts[1].clone().sub(c.pts[0]).normalize();
  const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
  const out = new THREE.Vector3().crossVectors(dir, fwd).multiplyScalar(-1);
  for (let i = 0; i <= 3; i++) path.push(mid.clone().addScaledVector(dir, (i / 3 - 0.5) * 0.045));
  tube(o.acc({ color: "#1e1f1e", fabric: "cotton" }), path, () => ({ x: out, y: fwd }), (t, ang) => Math.hypot(Math.cos(ang) * 0.072, Math.sin(ang) * 0.1), () => wOne(o.bone("upperArmL")), { segments: 20 });
  const knotP = mid.clone().addScaledVector(out, 0.075);
  appendGeometry(o.acc({ color: "#1e1f1e", fabric: "cotton" }), lumpy(0.014), new THREE.Matrix4().makeTranslation(knotP.x, knotP.y, knotP.z), wOne(o.bone("upperArmL")));
  for (const k of [-1, 1]) tail(o, { color: "#1e1f1e", fabric: "cotton" }, knotP, 0.09, 0.028, out, new THREE.Vector3(0, 0, k), ["upperArmL", "upperArmL"], 0.8);
  // Diagonal chest scar from the LEFT shoulder across the sternum to the RIGHT ribs,
  // crossed by short stitch marks (shows in the V).
  const chest = new SkinSurface(a, (p) => p.y > a.navelY - 0.05 && p.y < a.neckY && p.z > 0);
  const z = a.faceZ + 0.15;
  const p0 = new THREE.Vector3(0.13, a.chestY + 0.08, z);
  const p1 = new THREE.Vector3(-0.1, a.navelY + 0.01, z);
  const scarLine: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) scarLine.push(p0.clone().lerp(p1, i / 20));
  const strokes: SkinStroke[] = [{ kind: "line", points: chest.path(scarLine), color: "#c79a89", width: 0.0028, alpha: 0.85, soft: 0.001 }];
  const sd = p1.clone().sub(p0).normalize();
  const perp = new THREE.Vector3(-sd.y, sd.x, 0);
  for (let k = 1; k < 16; k++) {
    const c = p0.clone().lerp(p1, k / 16);
    strokes.push({ kind: "line", points: chest.path([c.clone().addScaledVector(perp, -0.0075), c.clone().addScaledVector(perp, 0.0075)]), color: "#7a4e40", width: 0.0011, alpha: 0.8 });
  }
  return strokes;
}

// ——— Naruto ————————————————————————————————————————————————————————————————————————————————

function naruto(o: Outfit): SkinStroke[] {
  const a = o.a;
  const orange: ClothLook = { color: "#e8691e", fabric: "cotton" };
  const black: ClothLook = { color: "#22211d", fabric: "cotton" };
  const knit: ClothLook = { color: "#1e1d1a", fabric: "knit" };
  // Right thigh bandage, strap and kunai holster; pants are built by the generic pants.
  limbBand(o, "R", "leg", 0.08, 0.2, { color: "#e6e1d8", fabric: "cotton" }, TH.shirt + 0.008);
  limbBand(o, "R", "leg", 0.12, 0.16, { color: "#2a2c2c", fabric: "leather" }, TH.shirt + 0.013);
  const thigh = a.leg.R.pts[0].clone().lerp(a.leg.R.pts[1], 0.14);
  const holster = new THREE.BoxGeometry(0.03, 0.12, 0.06);
  appendGeometry(o.acc({ color: "#2e3232", fabric: "leather" }), holster, new THREE.Matrix4().makeTranslation(thigh.x - 0.085, thigh.y, thigh.z + 0.01), wOne(o.bone("thighR")));
  // Canvas tool pouch on the waistband over the left buttock.
  const pouchP = o.ringPoint(a.hipY + 0.02, Math.PI - 0.55, 0.05);
  appendGeometry(o.acc({ color: "#a9a393", fabric: "canvas" }), new THREE.BoxGeometry(0.12, 0.1, 0.05, 2, 2, 1), new THREE.Matrix4().compose(pouchP, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI - 0.55, 0)), new THREE.Vector3(1, 1, 1)), wOne(o.bone("hips")));
  // The jacket: black sleeves, shoulders/yoke, collar, centre band, side panels and hem
  // band; orange front and back panels.
  const nk = a.joint("neck");
  const f = topField(a, a.hipY + 0.015, 0.99, (p) => nk.y + 0.085 - p.y);
  const sh = cutTop(o, f, TH.jacket);
  // The funnel collar stands off the neck.
  for (const v of sh.verts) if (v.p.y > nk.y - 0.01 && v.region === 0) v.p.addScaledVector(v.n, 0.006 + (v.p.y - nk.y) * 0.08);
  const zones = [
    { look: knit, test: (p: THREE.Vector3, r: number) => r === 0 && (p.y > nk.y - 0.012 || p.y < a.hipY + 0.075) },
    { look: black, test: (p: THREE.Vector3, r: number) => r >= 2 && r <= 5 },
    {
      look: black,
      test: (p: THREE.Vector3) => {
        const c = o.axisZ(p.y);
        const ang = Math.atan2(p.x, p.z - c);
        const front = Math.abs(ang) < Math.PI / 2;
        if (front && Math.abs(p.x) < 0.04) return true; // centre band
        if (Math.abs(Math.abs(ang) - Math.PI / 2) < 0.32) return true; // side panels
        if (front) return p.y > a.chestY + 0.035; // shoulders
        return p.y > a.chestY + 0.01; // back yoke
      },
    },
  ];
  zoned(o, sh, zones, orange, 0.006);
  o.cover(f, 0.03);
  // Silver zip down the centre band.
  const zip: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) zip.push(o.ringPoint(THREE.MathUtils.lerp(a.hipY + 0.02, nk.y + 0.06, i / 20), 0, TH.jacket + 0.0035));
  strip(o.acc({ color: "#a9adb2", fabric: "metal" }), zip, zip.map(() => new THREE.Vector3(1, 0, 0)), zip.map(() => new THREE.Vector3(0, 0, 1)), () => 0.006, (t) => torsoW(o, THREE.MathUtils.lerp(a.hipY, nk.y, t)));
  // Red Uzumaki crest straddling the yoke line on the back; sleeve emblem on the left.
  const crestY = a.chestY + 0.01;
  decal(o, o.ringPoint(crestY, Math.PI, TH.jacket + 0.004), Math.PI, 0.14, spiralTexture("#b3262e", "#6e1520"), "chest");
  const sleeve = a.arm.L.pts[0].clone().lerp(a.arm.L.pts[1], 0.35).add(new THREE.Vector3(0.056, 0, 0));
  decalN(o, sleeve, new THREE.Vector3(1, 0, 0), 0.08, spiralTexture("#d6d5d8", "#f4f4f4", true), "upperArmL");
  return [];
}

// ——— Sasuke ————————————————————————————————————————————————————————————————————————————————

function sasuke(o: Outfit): SkinStroke[] {
  const a = o.a;
  const white: ClothLook = { color: "#eae8e2", fabric: "linen" };
  top(o, { look: white, bottom: a.waistY - 0.05, neck: "open", vBottom: a.navelY - 0.01, vHalfTop: 0.075, sleeve: 0.1, thick: TH.kimono, drape: 0.6, hem: 0.006 });
  for (const s of SIDES) kimonoSleeve(o, s, white, 0.15, 0.97);
  // Standing collar at the back of the neck.
  const nk = a.joint("neck");
  const back: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const ang = Math.PI / 2 + (i / 14) * Math.PI;
    back.push(new THREE.Vector3(Math.sin(ang) * 0.075, nk.y + 0.005, nk.z + Math.cos(ang) * 0.07));
  }
  strip(o.acc(white), back, back.map(() => new THREE.Vector3(0, 1, 0)), back.map((p) => p.clone().sub(new THREE.Vector3(0, p.y, nk.z)).setY(0).normalize()), () => 0.04, () => wMix([[wOne(o.bone("neck")), 0.5], [wOne(o.bone("chest")), 0.5]]), { centred: false });
  decal(o, o.ringPoint(a.chestY + 0.075, Math.PI, TH.kimono + 0.006), Math.PI, 0.065, uchihaTexture(), "chest");
  // Fingerless arm guards to just below the elbow.
  for (const s of SIDES) {
    limbBand(o, s, "arm", 0.56, 1.02, { color: "#26262a", fabric: "cotton" }, 0.006);
  }
  // Trousers gathered below the knee; leg guards down into the sandals.
  for (const s of SIDES) {
    limbBand(o, s, "leg", 0.5, 0.56, { color: "#252833", fabric: "canvas" }, TH.jacket);
    limbBand(o, s, "leg", 0.55, 0.96, { color: "#4f4d3e", fabric: "canvas" }, TH.shirt + 0.006);
  }
  return [];
}

// ——— Bleach ————————————————————————————————————————————————————————————————————————————————

function ichigo(o: Outfit): SkinStroke[] {
  const a = o.a;
  // White obi (the generic sash is narrow): front knot slightly left of centre, two tails.
  const obi: ClothLook = { color: "#f0eee6", fabric: "cotton" };
  const yc = a.navelY - 0.005;
  const knot = o.ringPoint(yc, 0.25, TH.sash + 0.03);
  appendGeometry(o.acc(obi), lumpy(0.026), new THREE.Matrix4().makeTranslation(knot.x, knot.y, knot.z), wOne(o.bone("hips")));
  for (const k of [-1, 1]) tail(o, obi, knot.clone().add(new THREE.Vector3(k * 0.012, -0.012, 0)), k > 0 ? 0.3 : 0.26, 0.055, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), ["hips", k > 0 ? "thighL" : "thighR"]);
  return [];
}

function byakuya(o: Outfit): SkinStroke[] {
  const a = o.a;
  const white: ClothLook = { color: "#f4f4f1", fabric: "wool" };
  // Captain's haori: open front, straight edges, hem ~15 cm above the floor, short wide
  // sleeves to the elbow.
  top(o, { look: white, bottom: a.waistY - 0.03, neck: "open", vBottom: a.waistY - 0.03, vHalfTop: 0.09, openFront: 0.09, sleeve: 0.1, thick: TH.coat + 0.008, drape: 1, skirtTo: 0.16, skirtFlare: 0.1, hem: 0.01 });
  for (const s of SIDES) kimonoSleeve(o, s, white, 0.95, 0.5);
  // The 6th Division mark on the back: a rhombus with 六.
  decal(o, o.ringPoint(a.chestY - 0.02, Math.PI, TH.coat + 0.03), Math.PI, 0.26, divisionTexture(), "chest");
  // Front bow of the sash with ~30 cm tails.
  const sash: ClothLook = { color: "#dcdce2", fabric: "silk" };
  const bow = o.ringPoint(a.waistY - 0.005, 0.12, TH.sash + 0.03);
  appendGeometry(o.acc(sash), lumpy(0.028), new THREE.Matrix4().makeTranslation(bow.x, bow.y, bow.z), wOne(o.bone("hips")));
  for (const k of [-1, 1]) tail(o, sash, bow.clone().add(new THREE.Vector3(k * 0.015, -0.01, 0)), 0.3, 0.05, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), ["hips", k > 0 ? "thighL" : "thighR"]);
  // The scarf: a bulky cowl high round the neck, both ends thrown back to the knees.
  const silk: ClothLook = { color: "#e4ece8", fabric: "silk" };
  const nk = a.joint("neck");
  const cowl: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const ang = (i / 32) * Math.PI * 2;
    cowl.push(new THREE.Vector3(Math.sin(ang) * 0.1, nk.y + 0.02 - Math.cos(ang) * 0.02, nk.z + Math.cos(ang) * 0.095));
  }
  tube(o.acc(silk), cowl, (i) => ({ x: new THREE.Vector3(0, 1, 0), y: cowl[i].clone().sub(new THREE.Vector3(0, cowl[i].y, nk.z)).setY(0).normalize() }), (t, ang) => 0.034 + 0.008 * Math.sin(t * 20 + ang), () => wMix([[wOne(o.bone("neck")), 0.55], [wOne(o.bone("chest")), 0.45]]), { segments: 10, tile: fabricTile("silk") });
  for (const s of [-1, 1]) {
    const from = new THREE.Vector3(s * 0.085, nk.y + 0.01, nk.z - 0.07);
    const path: THREE.Vector3[] = [];
    const side: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const y = THREE.MathUtils.lerp(from.y, a.kneeY - 0.02, t);
      const backZ = Math.min(o.ringPoint(Math.max(y, a.hipY - 0.1), Math.PI + s * 0.3, TH.coat + 0.05).z, from.z);
      path.push(new THREE.Vector3(THREE.MathUtils.lerp(from.x, s * 0.12, t) + Math.sin(t * 6) * 0.01, y, backZ - 0.012 - t * 0.03));
      side.push(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 5) * 0.2));
      nrm.push(new THREE.Vector3(0, 0, -1));
    }
    strip(o.acc(silk), path, side, nrm, (t) => 0.2 - 0.05 * t, (t) => wMix([[wOne(o.bone("chest")), 1 - t * 0.7], [wOne(o.bone("spine")), t * 0.7]]), { tile: fabricTile("silk") });
  }
  return [];
}

// ——— Brawl Stars ———————————————————————————————————————————————————————————————————————————

function shelly(o: Outfit): SkinStroke[] {
  const a = o.a;
  // Rolled cuffs above the elbow, lilac buttons on the placket.
  for (const s of SIDES) limbBand(o, s, "arm", 0.4, 0.47, { color: "#d8c3f2", fabric: "cotton" }, TH.shirt + 0.012);
  const btn = [];
  for (let k = 0; k < 3; k++) {
    const y = THREE.MathUtils.lerp(a.chestY - 0.05, a.navelY, k / 2);
    const p = o.ringPoint(y, 0, TH.shirt + 0.004);
    btn.push({ p, n: new THREE.Vector3(0, 0, 1), bone: "chest", scale: 0.0055 });
  }
  studs(o, { color: "#dfc4d8", fabric: "bone" }, dome(), btn);
  // Steel plate buckle on her right front hip.
  const bk = o.ringPoint(a.hipY + 0.085, -0.3, TH.jacket + 0.006);
  appendGeometry(o.acc({ color: "#9aa6b8", fabric: "metal" }), new THREE.BoxGeometry(0.055, 0.045, 0.006), new THREE.Matrix4().compose(bk, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.3, 0)), new THREE.Vector3(1, 1, 1)), wOne(o.bone("hips")));
  // Boots: padded turned-down collar and two grey strap bars across the outer instep.
  for (const s of SIDES) {
    limbBand(o, s, "leg", 0.74, 0.8, { color: "#1a1d36", fabric: "leather" }, 0.018);
    const foot = a.joint(`foot${s}`);
    for (const k of [0, 1]) {
      const p = foot.clone().add(new THREE.Vector3(sx(s) * 0.045, -0.035 - k * 0.018, 0.035 + k * 0.02));
      appendGeometry(o.acc({ color: "#9a9792", fabric: "leather" }), new THREE.BoxGeometry(0.006, 0.012, 0.05), new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), wOne(o.bone(`foot${s}`)));
    }
  }
  // Athletic tape on the left hand.
  limbBand(o, "L", "arm", 0.93, 1.06, { color: "#f3ebdd", fabric: "cotton" }, 0.004);
  return [];
}

function elprimo(o: Outfit): SkinStroke[] {
  const a = o.a;
  // Championship belt: padded crimson strap with rolled borders, the medallion, side plates.
  const strap: ClothLook = { color: "#b8323e", fabric: "leather" };
  const yc = a.navelY - 0.02;
  band(o, strap, yc - 0.06, yc + 0.06, TH.jacket + 0.01);
  band(o, { color: "#7e1a25", fabric: "leather" }, yc + 0.048, yc + 0.064, TH.jacket + 0.016);
  band(o, { color: "#7e1a25", fabric: "leather" }, yc - 0.064, yc - 0.048, TH.jacket + 0.016);
  const front = o.ringPoint(yc, 0, TH.jacket + 0.02);
  appendGeometry(o.acc({ color: "#f2a516", fabric: "metal" }), new THREE.TorusGeometry(0.1, 0.012, 8, 40), new THREE.Matrix4().makeTranslation(front.x, front.y, front.z + 0.004), wOne(o.bone("hips")));
  appendGeometry(o.acc({ color: "#7e2a16", fabric: "lacquer" }), new THREE.CylinderGeometry(0.094, 0.094, 0.01, 40).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(front.x, front.y, front.z), wOne(o.bone("hips")));
  decal(o, front.clone().add(new THREE.Vector3(0, 0, 0.0065)), 0, 0.19, medallionTexture(), "hips");
  for (const s of [-1, 1]) {
    const p = o.ringPoint(yc, s * 0.62, TH.jacket + 0.02);
    appendGeometry(o.acc({ color: "#f2a516", fabric: "metal" }), new THREE.SphereGeometry(1, 16, 8).scale(0.04, 0.03, 0.008), new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.62, 0)), new THREE.Vector3(1, 1, 1)), wOne(o.bone("hips")));
    appendGeometry(o.acc({ color: "#b83a22", fabric: "lacquer" }), new THREE.SphereGeometry(0.009, 10, 6), new THREE.Matrix4().makeTranslation(p.x + Math.sin(s * 0.62) * 0.008, p.y, p.z + Math.cos(s * 0.62) * 0.008), wOne(o.bone("hips")));
  }
  // Faded Latin cross tattoo on the solar plexus, just above the medallion.
  const chest = new SkinSurface(a, (p) => p.y > a.navelY - 0.05 && p.y < a.neckY && p.z > 0);
  const zc = a.faceZ + 0.2;
  const cy = yc + 0.15;
  const ink = { color: "#7f3a1e", width: 0.009, alpha: 0.5, soft: 0.002 };
  return [
    { kind: "line", points: chest.path([new THREE.Vector3(0, cy + 0.06, zc), new THREE.Vector3(0, cy - 0.035, zc)]), ...ink },
    { kind: "line", points: chest.path([new THREE.Vector3(-0.03, cy + 0.025, zc), new THREE.Vector3(0.03, cy + 0.025, zc)]), ...ink },
  ];
}

function samurai(o: Outfit): SkinStroke[] {
  const a = o.a;
  // Off-white braided cords tying the haori at the chest.
  const y = a.chestY - 0.06;
  const pts = [o.ringPoint(y, -0.42, TH.coat + 0.02), o.ringPoint(y - 0.035, -0.05, TH.coat + 0.04), o.ringPoint(y - 0.035, 0.05, TH.coat + 0.04), o.ringPoint(y, 0.42, TH.coat + 0.02)];
  const path: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) path.push(pts[i].clone().lerp(pts[i + 1], k / 6));
  path.push(pts[pts.length - 1]);
  tube(o.acc({ color: "#d8d0be", fabric: "rope" }), path, (i) => frameAlong(path, i), () => 0.0045, () => wOne(o.bone("chest")), { segments: 6 });
  appendGeometry(o.acc({ color: "#d8d0be", fabric: "rope" }), lumpy(0.012), new THREE.Matrix4().makeTranslation(path[9].x, path[9].y - 0.004, path[9].z + 0.004), wOne(o.bone("chest")));
  return [];
}

// ——— helpers ————————————————————————————————————————————————————————————————————————————————

function frameAlong(path: THREE.Vector3[], i: number) {
  const d = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(d);
  if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
  x.normalize();
  return { x, y: new THREE.Vector3().crossVectors(d, x).normalize() };
}

/** A soft, irregular knot of cloth. */
function lumpy(r: number) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = 1 + 0.18 * Math.sin(v.x * 90) * Math.cos(v.y * 70) + 0.1 * Math.sin(v.z * 120);
    pos.setXYZ(i, v.x * k * 1.3, v.y * k, v.z * k * 0.8);
  }
  g.computeVertexNormals();
  return g;
}

/** Tights-fitted top shell (for zoned jackets). */
function cutTop(o: Outfit, f: (s: number) => number, thick: number) {
  const sh = cut(o.a, "tights", f);
  smooth(sh, 3, 0.5);
  inflate(sh, thick);
  renormal(sh);
  return sh;
}

/** A decal with an explicit normal (sleeves, thighs). */
function decalN(o: Outfit, at: THREE.Vector3, n: THREE.Vector3, size: number, tex: THREE.Texture, bone: string) {
  const ang = Math.atan2(n.x, n.z);
  decal(o, at, ang, size, tex, bone);
}

const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Uzumaki crest (red disc with a dark spiral) or the sleeve emblem (grey, white spiral). */
function spiralTexture(fill: string, line: string, sleeve = false) {
  return canvasTex(`spiral:${fill}:${line}:${sleeve}`, 256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = sleeve ? "#2a2a2a" : line;
    g.lineWidth = s * (sleeve ? 0.05 : 0.06);
    g.lineCap = "round";
    g.beginPath();
    const turns = sleeve ? 2.5 : 2.2;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const ang = t * Math.PI * 2 * turns;
      const r = s * 0.04 + t * s * 0.36;
      const x = s / 2 + Math.cos(ang) * r;
      const y = s / 2 + Math.sin(ang) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    if (sleeve) {
      g.strokeStyle = line;
      g.lineWidth = s * 0.025;
      g.stroke();
    }
  });
}

function uchihaTexture() {
  return canvasTex("uchiha", 256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.lineWidth = s * 0.03;
    g.strokeStyle = "#2a2a2a";
    // A round paper fan: red top, white bottom, small handle.
    g.fillStyle = "#b3262e";
    g.beginPath();
    g.arc(s / 2, s * 0.44, s * 0.34, Math.PI, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#f2f2f2";
    g.beginPath();
    g.arc(s / 2, s * 0.44, s * 0.34, 0, Math.PI);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#f2f2f2";
    g.fillRect(s * 0.46, s * 0.78, s * 0.08, s * 0.18);
    g.strokeRect(s * 0.46, s * 0.78, s * 0.08, s * 0.18);
  });
}

function divisionTexture() {
  return canvasTex("gotei6", 512, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = "#111";
    g.lineWidth = s * 0.045;
    g.beginPath();
    g.moveTo(s / 2, s * 0.06);
    g.lineTo(s * 0.94, s / 2);
    g.lineTo(s / 2, s * 0.94);
    g.lineTo(s * 0.06, s / 2);
    g.closePath();
    g.stroke();
    g.fillStyle = "#111";
    g.font = `bold ${Math.round(s * 0.42)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("六", s / 2, s * 0.52);
  });
}

function medallionTexture() {
  return canvasTex("medallion", 512, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.36);
    grd.addColorStop(0, "#c5601a");
    grd.addColorStop(1, "#7e2a16");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.37, 0, Math.PI * 2);
    g.fill();
    // Raised gold star with rounded points.
    g.fillStyle = "#f2a516";
    g.strokeStyle = "#b8600e";
    g.lineWidth = s * 0.012;
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.11 : s * 0.26;
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const x = s / 2 + Math.cos(ang) * r;
      const y = s / 2 + Math.sin(ang) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
  });
}

export type { Side };
