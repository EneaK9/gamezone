// Painted loading screen: layered mountains, a pagoda, torii and a lone samurai,
// with petals drifting across and rotating tips.

import { el } from "./dom";

const VERSES = [
  "WASD to walk. Shift to run. Space to jump.",
  "Press E to talk. You can type anything — the villagers understand you.",
  "Click to strike. Hold and release for a heavy blow. Right-click to block.",
  "Q draws or sheathes your blade. Some fights are better with fists.",
  "F unleashes your character's special technique.",
  "Mon buy swords, armor, noodles, and a room at the Sakura Inn.",
  "Be polite to merchants and they might lower their prices.",
  "M opens the map. J opens your journal and bag.",
];

const SCENE = `
<svg class="scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9cc6d8"/><stop offset="0.45" stop-color="#cfe2e4"/><stop offset="0.7" stop-color="#f1e9d8"/><stop offset="1" stop-color="#f4ecdc"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.68" cy="0.3" r="0.25"><stop offset="0" stop-color="#fff7e0" stop-opacity="0.95"/><stop offset="1" stop-color="#fff7e0" stop-opacity="0"/></radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2ea" stop-opacity="0"/><stop offset="1" stop-color="#eef2ea" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="riv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6dcd3"/><stop offset="1" stop-color="#3a9fa2"/></linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sk)"/>
  <rect width="1600" height="900" fill="url(#sun)"/>
  <g fill="#fbf8f0" opacity="0.8">
    <ellipse cx="1120" cy="170" rx="90" ry="18"/><ellipse cx="1080" cy="158" rx="48" ry="22"/><ellipse cx="1170" cy="152" rx="55" ry="26"/>
    <ellipse cx="560" cy="230" rx="110" ry="15"/><ellipse cx="530" cy="219" rx="50" ry="18"/>
  </g>
  <path d="M0 520 L0 390 C90 360 170 330 260 350 C340 368 420 300 520 280 C610 262 680 330 780 345 C880 360 960 290 1060 272 C1160 256 1230 320 1330 330 C1430 340 1520 300 1600 290 L1600 520 Z" fill="#b6cdd3"/>
  <path d="M0 560 L0 440 C120 420 210 390 320 400 C420 410 500 380 600 388 C720 398 800 430 920 420 C1030 410 1100 380 1220 384 C1330 388 1420 414 1600 400 L1600 560 Z" fill="#9dbcc2"/>
  <rect x="0" y="380" width="1600" height="200" fill="url(#haze)"/>
  <path d="M0 620 L0 500 C80 490 160 470 260 482 C360 494 430 520 520 530 C600 540 690 560 760 600 L760 620 Z" fill="#7fa56f"/>
  <path d="M900 620 C980 590 1050 540 1120 500 C1190 460 1260 430 1340 410 C1420 392 1500 380 1600 376 L1600 620 Z" fill="#6c9562"/>
  <g fill="#4e7a52">
    <path d="M40 505 l12 -46 l12 46 z"/><path d="M80 500 l14 -56 l14 56 z"/><path d="M128 498 l11 -40 l11 40 z"/><path d="M1180 470 l14 -52 l14 52 z"/><path d="M1230 452 l16 -64 l16 64 z"/><path d="M1290 436 l18 -70 l18 70 z"/><path d="M1350 424 l15 -58 l15 58 z"/><path d="M1480 404 l18 -72 l18 72 z"/><path d="M1540 398 l16 -62 l16 62 z"/>
  </g>
  <!-- pagoda -->
  <g transform="translate(1250 452)" fill="#3a3e46">
    <rect x="-2" y="-230" width="4" height="70"/>
    <g fill="#47494f">
      <path d="M-60 -8 Q0 -26 60 -8 L52 -2 Q0 -14 -52 -2 Z"/><path d="M-52 -56 Q0 -72 52 -56 L45 -50 Q0 -62 -45 -50 Z"/><path d="M-45 -100 Q0 -114 45 -100 L39 -95 Q0 -106 -39 -95 Z"/><path d="M-39 -140 Q0 -152 39 -140 L33 -135 Q0 -145 -33 -135 Z"/><path d="M-33 -176 Q0 -186 33 -176 L28 -171 Q0 -180 -28 -171 Z"/>
    </g>
    <g fill="#e9dfcc"><rect x="-38" y="-2" width="76" height="20"/><rect x="-33" y="-50" width="66" height="18"/><rect x="-28" y="-95" width="56" height="16"/><rect x="-24" y="-135" width="48" height="14"/><rect x="-20" y="-171" width="40" height="12"/></g>
    <g fill="#c9492f"><rect x="-38" y="6" width="76" height="3"/><rect x="-33" y="-42" width="66" height="3"/><rect x="-28" y="-88" width="56" height="3"/><rect x="-24" y="-129" width="48" height="3"/><rect x="-20" y="-166" width="40" height="3"/></g>
  </g>
  <!-- torii on the hill -->
  <g transform="translate(1420 400)" fill="#d24a2e"><rect x="-22" y="-60" width="5" height="60"/><rect x="17" y="-60" width="5" height="60"/><rect x="-28" y="-50" width="56" height="4"/><path d="M-34 -60 Q0 -64 34 -60 L37 -66 Q0 -71 -37 -66 Z" fill="#2e2927"/></g>
  <!-- river and town -->
  <path d="M0 900 L0 640 C200 630 420 660 640 650 C840 640 1000 620 1160 630 C1320 640 1460 660 1600 650 L1600 900 Z" fill="url(#riv)"/>
  <path d="M0 640 C200 630 420 660 640 650 C840 640 1000 620 1160 630 C1320 640 1460 660 1600 650 L1600 660 C1460 670 1320 650 1160 640 C1000 630 840 650 640 660 C420 670 200 640 0 650 Z" fill="#e8f4f0" opacity="0.6"/>
  <g fill="#3c3f47">
    <path d="M40 596 L70 578 L130 578 L160 596 Z"/><path d="M150 600 L182 580 L246 580 L278 600 Z"/><path d="M270 602 L300 584 L356 584 L386 602 Z"/><path d="M380 604 L408 588 L460 588 L488 604 Z"/>
  </g>
  <g fill="#ece2cf"><rect x="52" y="596" width="96" height="28"/><rect x="162" y="600" width="104" height="26"/><rect x="282" y="602" width="92" height="26"/><rect x="392" y="604" width="86" height="24"/></g>
  <g fill="#6b4a33"><rect x="52" y="612" width="96" height="12"/><rect x="162" y="614" width="104" height="12"/><rect x="282" y="616" width="92" height="12"/><rect x="392" y="616" width="86" height="12"/></g>
  <g fill="#dc5a3c"><circle cx="100" cy="606" r="4"/><circle cx="214" cy="610" r="4"/><circle cx="328" cy="612" r="4"/><circle cx="436" cy="612" r="4"/></g>
  <!-- vermilion bridge -->
  <path d="M520 648 Q720 560 920 640 L920 648 Q720 570 520 656 Z" fill="#c9442b"/>
  <path d="M520 628 Q720 540 920 620" stroke="#d65a3a" stroke-width="4" fill="none"/>
  <g stroke="#c9442b" stroke-width="3"><path d="M560 632 V612"/><path d="M620 604 V584"/><path d="M680 586 V566"/><path d="M740 582 V562"/><path d="M800 590 V570"/><path d="M860 608 V588"/></g>
  <!-- the samurai on the near hill -->
  <path d="M1000 900 C1080 820 1180 780 1300 772 C1420 764 1520 790 1600 810 L1600 900 Z" fill="#48683f"/>
  <g transform="translate(1310 772)" fill="#1d1a16">
    <path d="M-34 -118 Q0 -140 34 -118 L30 -112 Q0 -126 -30 -112 Z"/>
    <path d="M-7 -112 Q0 -120 7 -112 L9 -98 Q0 -92 -9 -98 Z"/>
    <path d="M-20 -96 Q0 -104 20 -96 L28 -56 L22 -54 L26 -8 L10 0 L4 -40 L-4 -40 L-10 0 L-26 -8 L-22 -54 L-28 -56 Z"/>
    <path d="M18 -60 L72 -86 L74 -82 L20 -54 Z"/>
    <path d="M-30 -58 Q-44 -30 -38 -4 L-30 -4 Q-34 -30 -22 -56 Z"/>
  </g>
  <!-- sakura branch -->
  <g transform="translate(1600 0) scale(-1 1)">
    <path d="M0 40 C80 70 170 100 250 150 C310 188 360 220 420 290 C360 240 300 206 240 172 C160 126 80 96 0 70 Z" fill="#5a3d31"/>
    <g fill="#f4c6d0"><circle cx="250" cy="150" r="16"/><circle cx="280" cy="168" r="13"/><circle cx="330" cy="200" r="15"/><circle cx="410" cy="285" r="14"/><circle cx="180" cy="118" r="12"/><circle cx="120" cy="94" r="14"/><circle cx="60" cy="72" r="11"/><circle cx="370" cy="240" r="12"/></g>
    <g fill="#fbe3e8"><circle cx="258" cy="142" r="8"/><circle cx="338" cy="194" r="7"/><circle cx="128" cy="88" r="7"/><circle cx="416" cy="280" r="6"/></g>
  </g>
</svg>`;

export class LoadingScreen {
  readonly root: HTMLDivElement;
  private phase: HTMLParagraphElement;
  private bar: HTMLElement;
  private verse: HTMLParagraphElement;
  private vi = 0;
  private timer: number;

  constructor() {
    this.root = el("div", "loading");
    const petals = Array.from({ length: 14 }, (_, i) => `<i class="petal" style="--x:${40 + ((i * 37) % 60)}%;--d:${11 + (i % 5) * 2}s;--t:-${(i * 1.7) % 12}s;--s:${8 + (i % 4) * 2}px"></i>`).join("");
    this.root.innerHTML = `${SCENE}${petals}
      <div class="inner">
        <p class="eyebrow">A samurai village</p>
        <div class="title">Kazemura<span class="seal" aria-hidden="true">風村</span></div>
        <p class="phase" role="status">Unrolling the map</p>
        <div class="bar"><i></i></div>
        <p class="verse"></p>
      </div>`;
    document.body.appendChild(this.root);
    this.phase = this.root.querySelector(".phase")!;
    this.bar = this.root.querySelector(".bar i")!;
    this.verse = this.root.querySelector(".verse")!;
    this.verse.textContent = VERSES[0];
    this.timer = window.setInterval(() => {
      this.vi = (this.vi + 1) % VERSES.length;
      this.verse.style.opacity = "0";
      setTimeout(() => {
        this.verse.textContent = VERSES[this.vi];
        this.verse.style.opacity = "1";
      }, 500);
    }, 4200);
  }

  progress(fraction: number, label?: string) {
    this.bar.style.width = `${Math.round(fraction * 100)}%`;
    if (label) this.phase.textContent = label;
  }

  hide() {
    clearInterval(this.timer);
    this.root.classList.add("fade");
    setTimeout(() => this.root.remove(), 1200);
  }
}
