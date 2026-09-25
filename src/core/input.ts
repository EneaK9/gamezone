// Keyboard + mouse input with pointer lock for the third-person camera.

export type Action =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "run"
  | "walk"
  | "jump"
  | "interact"
  | "attack"
  | "heavy"
  | "block"
  | "dodge"
  | "special"
  | "draw"
  | "map"
  | "journal"
  | "menu"
  | "item1"
  | "item2"
  | "item3"
  | "camera";

const KEYMAP: Record<string, Action> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  KeyZ: "walk",
  ControlLeft: "walk",
  Space: "jump",
  KeyE: "interact",
  KeyF: "special",
  KeyQ: "draw",
  KeyM: "map",
  KeyJ: "journal",
  KeyI: "journal",
  Escape: "menu",
  KeyC: "dodge",
  AltLeft: "dodge",
  Digit1: "item1",
  Digit2: "item2",
  Digit3: "item3",
  KeyV: "camera",
};

export class Input {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** When false (dialogue, menus) gameplay keys are ignored. */
  gameplay = true;
  private mouseButtons = new Set<number>();
  private holdStart = new Map<Action, number>();
  lastHeldMs = new Map<Action, number>();
  /** Called when the pointer lock is lost (Esc, alt-tab) so the game can pause. */
  onUnlock: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a !== "menu" && !this.gameplay && a !== "map" && a !== "journal") return;
      if (!this.down.has(a)) {
        this.pressed.add(a);
        this.holdStart.set(a, performance.now());
      }
      this.down.add(a);
      if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      this.down.delete(a);
      const s = this.holdStart.get(a);
      if (s !== undefined) this.lastHeldMs.set(a, performance.now() - s);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
      this.mouseButtons.clear();
    });
    canvas.addEventListener("mousedown", (e) => {
      if (!this.gameplay) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      this.mouseButtons.add(e.button);
      if (e.button === 0) {
        this.pressed.add("attack");
        this.holdStart.set("attack", performance.now());
        this.down.add("attack");
      }
      if (e.button === 2) {
        this.down.add("block");
        this.pressed.add("block");
      }
    });
    window.addEventListener("mouseup", (e) => {
      const wasDown = this.mouseButtons.has(e.button);
      this.mouseButtons.delete(e.button);
      if (e.button === 0) {
        this.down.delete("attack");
        const s = this.holdStart.get("attack");
        // Only a press that started in gameplay counts as an attack.
        if (s !== undefined && wasDown && this.gameplay) this.lastHeldMs.set("attack", performance.now() - s);
        this.holdStart.delete("attack");
      }
      if (e.button === 2) this.down.delete("block");
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      "wheel",
      (e) => {
        if (this.gameplay) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener("pointerlockchange", () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.down.clear();
        this.mouseButtons.clear();
        this.lastHeldMs.clear();
        if (was) this.onUnlock();
      }
    });
  }

  requestLock() {
    if (this.locked) return;
    const r = this.canvas.requestPointerLock?.() as unknown;
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(a: Action) {
    return this.gameplay && this.down.has(a);
  }

  wasPressed(a: Action) {
    return this.pressed.has(a) && (this.gameplay || a === "menu" || a === "map" || a === "journal");
  }

  /** How long an action has been held right now (ms), or 0. */
  heldFor(a: Action) {
    const s = this.holdStart.get(a);
    return this.down.has(a) && s !== undefined ? performance.now() - s : 0;
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
    this.lastHeldMs.clear();
    this.holdStart.clear();
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
