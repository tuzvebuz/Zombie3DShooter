export class Input {
  locked = false;

  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;

  constructor(private readonly canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const code = `Mouse${e.button}`;
      this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked && e.deltaY !== 0) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      onLockChange(this.locked);
    });
  }

  requestLock(): void {
    // Browsers reject re-locking for ~1 s after Esc; the user can simply click again.
    const result = this.canvas.requestPointerLock() as Promise<void> | undefined;
    result?.catch(() => {});
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once for each physical press; cleared after the simulation tick that saw it. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endTick(): void {
    this.pressed.clear();
  }

  /** Accumulated wheel notches since the last call (positive = scroll down). */
  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeMouse(out: { x: number; y: number }): void {
    out.x = this.mouseDx;
    out.y = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
  }
}
