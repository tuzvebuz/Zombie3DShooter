export type HitmarkerKind = 'hit' | 'kill';

/** DOM overlay. Values are cached so the DOM is only touched when something changes. */
export class HUD {
  private readonly crosshair = document.getElementById('crosshair')!;
  private readonly hitmarker = document.getElementById('hitmarker')!;
  private readonly ammoMag = document.getElementById('ammo-mag')!;
  private readonly ammoReserve = document.getElementById('ammo-reserve')!;
  private readonly weaponName = document.getElementById('weapon-name')!;
  private readonly weaponHint = document.getElementById('weapon-hint')!;

  private gap = -1;
  private crosshairVisible = true;
  private ammoKey = '';
  private hint = '';

  setCrosshair(gapPx: number, visible: boolean): void {
    const g = Math.round(gapPx);
    if (g !== this.gap) {
      this.gap = g;
      this.crosshair.style.setProperty('--gap', `${g}px`);
    }
    if (visible !== this.crosshairVisible) {
      this.crosshairVisible = visible;
      this.crosshair.classList.toggle('hidden-soft', !visible);
    }
  }

  hit(kind: HitmarkerKind, headshot: boolean): void {
    const el = this.hitmarker;
    el.classList.remove('show', 'kill', 'head');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
    if (kind === 'kill') el.classList.add('kill');
    if (headshot) el.classList.add('head');
  }

  setAmmo(name: string, mag: number, reserve: number | null, magSize: number): void {
    const key = `${name}|${mag}|${reserve}`;
    if (key === this.ammoKey) return;
    this.ammoKey = key;
    this.weaponName.textContent = name;
    this.ammoMag.textContent = String(mag);
    this.ammoMag.classList.toggle('low', mag <= Math.ceil(magSize * 0.25));
    this.ammoReserve.textContent = reserve === null ? '∞' : String(reserve);
  }

  setHint(text: string): void {
    if (text === this.hint) return;
    this.hint = text;
    this.weaponHint.textContent = text;
  }
}
