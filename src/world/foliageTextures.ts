// Canvas-painted alpha textures for foliage cards.

import * as THREE from "three";
import { makeRng } from "../core/math";

function tex(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, size, size);
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Radial mask so cards read as round clumps rather than squares. */
function inClump(x: number, y: number, size: number, rng: () => number) {
  const dx = x / size - 0.5;
  const dy = y / size - 0.5;
  return Math.hypot(dx, dy) < 0.42 + rng() * 0.08;
}

export function sakuraTexture(): THREE.CanvasTexture {
  const rng = makeRng(11);
  return tex(512, (g, s) => {
    // Twigs underneath.
    g.strokeStyle = "rgba(70,45,40,0.9)";
    for (let i = 0; i < 10; i++) {
      g.lineWidth = 2 + rng.next() * 2;
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      g.quadraticCurveTo(rng.range(0, s), rng.range(0, s), rng.range(40, s - 40), rng.range(40, s - 40));
      g.stroke();
    }
    const pinks = ["#f9d3dc", "#f6c1cf", "#fbe3e8", "#f3b4c4", "#fdeef1", "#efa9bb"];
    for (let i = 0; i < 380; i++) {
      const x = rng.range(20, s - 20);
      const y = rng.range(20, s - 20);
      if (!inClump(x, y, s, rng.next)) continue;
      const r = rng.range(7, 13);
      const rot = rng.range(0, Math.PI * 2);
      g.fillStyle = rng.pick(pinks);
      for (let p = 0; p < 5; p++) {
        const a = rot + (p * Math.PI * 2) / 5;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.38, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#c86a82";
      g.beginPath();
      g.arc(x, y, r * 0.18, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function leafTexture(palette: string[], seed: number, leafLen = 16): THREE.CanvasTexture {
  const rng = makeRng(seed);
  return tex(512, (g, s) => {
    g.strokeStyle = "rgba(60,48,32,0.85)";
    for (let i = 0; i < 8; i++) {
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      g.lineTo(rng.range(40, s - 40), rng.range(40, s - 40));
      g.stroke();
    }
    for (let i = 0; i < 700; i++) {
      const x = rng.range(10, s - 10);
      const y = rng.range(10, s - 10);
      if (!inClump(x, y, s, rng.next)) continue;
      const a = rng.range(0, Math.PI * 2);
      const l = rng.range(leafLen * 0.7, leafLen * 1.3);
      g.fillStyle = rng.pick(palette);
      g.beginPath();
      g.ellipse(x, y, l, l * 0.42, a, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function mapleTexture(): THREE.CanvasTexture {
  const rng = makeRng(23);
  const cols = ["#c8321e", "#d9481f", "#e0622a", "#b52618", "#e8883a", "#a8201a"];
  return tex(512, (g, s) => {
    for (let i = 0; i < 260; i++) {
      const x = rng.range(20, s - 20);
      const y = rng.range(20, s - 20);
      if (!inClump(x, y, s, rng.next)) continue;
      const r = rng.range(10, 17);
      const rot = rng.range(0, Math.PI * 2);
      g.fillStyle = rng.pick(cols);
      g.beginPath();
      for (let p = 0; p < 14; p++) {
        const a = rot + (p * Math.PI * 2) / 14;
        const rr = p % 2 === 0 ? r : r * 0.45;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  });
}

export function pineTexture(): THREE.CanvasTexture {
  const rng = makeRng(31);
  const cols = ["#2f4a2c", "#3b5a35", "#25402a", "#476a3e"];
  return tex(512, (g, s) => {
    for (let i = 0; i < 140; i++) {
      const x = rng.range(40, s - 40);
      const y = rng.range(40, s - 40);
      if (!inClump(x, y, s, rng.next)) continue;
      g.strokeStyle = rng.pick(cols);
      g.lineWidth = 1.6;
      const n = 22;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
        const l = rng.range(14, 26);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.7);
        g.stroke();
      }
    }
  });
}

export function willowTexture(): THREE.CanvasTexture {
  const rng = makeRng(41);
  const cols = ["#8fb05a", "#a3c26a", "#7ea04c", "#b4cf7c"];
  return tex(256, (g, s) => {
    for (let i = 0; i < 40; i++) {
      const x = rng.range(10, s - 10);
      g.strokeStyle = "rgba(80,90,50,0.8)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + rng.range(-6, 6), s);
      g.stroke();
      for (let y = 4; y < s; y += rng.range(5, 9)) {
        g.fillStyle = rng.pick(cols);
        g.beginPath();
        g.ellipse(x + rng.range(-5, 5), y, 2.4, 6, rng.range(-0.4, 0.4), 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function bambooLeafTexture(): THREE.CanvasTexture {
  const rng = makeRng(51);
  const cols = ["#6f9a45", "#86ad55", "#5c8639", "#9bbd67"];
  return tex(256, (g, s) => {
    for (let i = 0; i < 120; i++) {
      const x = rng.range(20, s - 20);
      const y = rng.range(20, s - 20);
      if (!inClump(x, y, s, rng.next)) continue;
      g.fillStyle = rng.pick(cols);
      g.beginPath();
      g.ellipse(x, y, 18, 3.2, rng.range(-0.6, 0.6) + Math.PI / 2 * rng.range(0.6, 1.4), 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function grassTexture(): THREE.CanvasTexture {
  const rng = makeRng(61);
  return tex(256, (g, s) => {
    for (let i = 0; i < 110; i++) {
      const x = rng.range(8, s - 8);
      const h = rng.range(s * 0.45, s * 0.98);
      const lean = rng.range(-18, 18);
      const grad = g.createLinearGradient(0, s, 0, s - h);
      grad.addColorStop(0, "#6f8a3e");
      grad.addColorStop(1, rng.chance(0.3) ? "#d2dc8e" : "#b4cc72");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - 3, s);
      g.quadraticCurveTo(x + lean * 0.4, s - h * 0.5, x + lean, s - h);
      g.quadraticCurveTo(x + lean * 0.4 + 2, s - h * 0.5, x + 3, s);
      g.fill();
    }
  });
}

export function flowerTexture(): THREE.CanvasTexture {
  const rng = makeRng(71);
  return tex(128, (g, s) => {
    for (let i = 0; i < 10; i++) {
      const x = rng.range(20, s - 20);
      const y = rng.range(40, s - 10);
      g.strokeStyle = "#4d6a2e";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, s);
      g.lineTo(x + rng.range(-5, 5), y);
      g.stroke();
      g.fillStyle = "#ffffff";
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 2.2, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#e8c440";
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  });
}
