export type HitmarkerKind = 'hit' | 'kill';

/** DOM overlay. Values are cached so the DOM is only touched when something changes. */
export class HUD {
  private readonly crosshair = document.getElementById('crosshair')!;
  private readonly hitmarker = document.getElementById('hitmarker')!;
  private readonly ammoMag = document.getElementById('ammo-mag')!;
  private readonly ammoReserve = document.getElementById('ammo-reserve')!;
  private readonly weaponName = document.getElementById('weapon-name')!;
  private readonly weaponHint = document.getElementById('weapon-hint')!;
  private readonly damageFlash = document.getElementById('damage-flash')!;
  private readonly notice = document.getElementById('notice')!;
  private readonly healthText = document.getElementById('health-text')!;
  private noticeTimer = 0;
  private healthShown = -1;

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

  /** Red edge flash when hurt. (A directional indicator and low-health vignette come in milestone 4.) */
  flashDamage(): void {
    const el = this.damageFlash;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  showNotice(text: string, seconds: number): void {
    this.notice.textContent = text;
    this.notice.classList.remove('hidden');
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.classList.add('hidden'), seconds * 1000);
  }

  /** Temporary numeric health readout until the health bar exists (milestone 4). */
  setHealth(hp: number): void {
    const v = Math.ceil(hp);
    if (v === this.healthShown) return;
    this.healthShown = v;
    this.healthText.textContent = `HP ${v}`;
    this.healthText.classList.toggle('low', v <= 30);
  }

  setHint(text: string): void {
    if (text === this.hint) return;
    this.hint = text;
    this.weaponHint.textContent = text;
  }
}
