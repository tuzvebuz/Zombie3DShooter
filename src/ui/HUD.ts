import { HEALTH, HUD_FX } from '../config';
import { Stats } from '../core/Stats';

export type HitmarkerKind = 'hit' | 'kill';
export type FeedKind = 'kill' | 'headshot' | 'info';

interface DamageIndicator {
  el: HTMLElement;
  x: number;
  z: number;
  timer: number;
}

const byId = (id: string) => document.getElementById(id)!;

/** DOM overlay. Values are cached so the DOM is only touched when something changes. */
export class HUD {
  private readonly crosshair = byId('crosshair');
  private readonly hitmarker = byId('hitmarker');
  private readonly ammoMag = byId('ammo-mag');
  private readonly ammoReserve = byId('ammo-reserve');
  private readonly weaponName = byId('weapon-name');
  private readonly weaponHint = byId('weapon-hint');
  private readonly damageFlash = byId('damage-flash');
  private readonly vignette = byId('vignette');
  private readonly notice = byId('notice');
  private readonly healthFill = byId('health-fill');
  private readonly healthNum = byId('health-num');
  private readonly staminaFill = byId('stamina-fill');
  private readonly staminaBar = byId('stamina-bar');
  private readonly feed = byId('feed');
  private readonly gameOver = byId('gameover');

  private readonly indicators: DamageIndicator[];
  private nextIndicator = 0;
  private noticeTimer = 0;

  private gap = -1;
  private crosshairVisible = true;
  private ammoKey = '';
  private hint = '';
  private healthShown = -1;
  private staminaShown = -1;
  private exhaustedShown = false;
  private vignetteShown = -1;

  constructor() {
    const dirs = byId('damage-dirs');
    this.indicators = Array.from({ length: HUD_FX.damageIndicators }, () => {
      const el = document.createElement('i');
      dirs.appendChild(el);
      return { el, x: 0, z: 0, timer: 0 };
    });
    byId('regen-cap').style.left = `${HEALTH.regenCap * 100}%`;
  }

  // ------------------------------------------------------------------ crosshair & weapon

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

  // ------------------------------------------------------------------ vitals & damage

  setVitals(hp: number, hpFraction: number, staminaFraction: number, exhausted: boolean): void {
    const h = Math.ceil(hp);
    if (h !== this.healthShown) {
      this.healthShown = h;
      this.healthNum.textContent = String(h);
      this.healthFill.style.width = `${hpFraction * 100}%`;
      this.healthFill.classList.toggle('low', hpFraction <= 0.3);
    }
    const s = Math.round(staminaFraction * 200) / 2;
    if (s !== this.staminaShown) {
      this.staminaShown = s;
      this.staminaFill.style.width = `${s}%`;
    }
    if (exhausted !== this.exhaustedShown) {
      this.exhaustedShown = exhausted;
      this.staminaBar.classList.toggle('exhausted', exhausted);
    }

    // Persistent red edges that deepen as health drops below lowHealthStart.
    const low = Math.max(0, 1 - hpFraction / HUD_FX.lowHealthStart);
    const v = Math.round(low * 100) / 100;
    if (v !== this.vignetteShown) {
      this.vignetteShown = v;
      this.vignette.style.opacity = String(v);
    }
  }

  /** Red flash (stronger for bigger hits) and an arc around the crosshair pointing at the source. */
  damage(amount: number, sourceX: number, sourceZ: number): void {
    const el = this.damageFlash;
    el.style.setProperty('--strength', String(Math.min(1, 0.35 + amount / HUD_FX.damageFlashFull)));
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');

    // Reuse an indicator already pointing roughly at this source, otherwise take the next slot.
    let ind = this.indicators.find((i) => i.timer > 0 && Math.hypot(i.x - sourceX, i.z - sourceZ) < 1.5);
    if (!ind) {
      ind = this.indicators[this.nextIndicator];
      this.nextIndicator = (this.nextIndicator + 1) % this.indicators.length;
    }
    ind.x = sourceX;
    ind.z = sourceZ;
    ind.timer = HUD_FX.damageIndicatorTime;
  }

  /** Per frame: keeps damage indicators pointing at their sources as the player turns. */
  update(dt: number, px: number, pz: number, yaw: number): void {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    for (const ind of this.indicators) {
      if (ind.timer <= 0) continue;
      ind.timer -= dt;
      if (ind.timer <= 0) {
        ind.el.style.opacity = '0';
        continue;
      }
      const dx = ind.x - px;
      const dz = ind.z - pz;
      // Screen angle: 0 = straight ahead (arc above the crosshair), positive = clockwise.
      const angle = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      ind.el.style.transform = `rotate(${angle}rad)`;
      ind.el.style.opacity = String(Math.min(1, ind.timer / (HUD_FX.damageIndicatorTime * 0.5)));
    }
  }

  clearDamage(): void {
    for (const ind of this.indicators) {
      ind.timer = 0;
      ind.el.style.opacity = '0';
    }
    this.damageFlash.classList.remove('show');
  }

  // ------------------------------------------------------------------ messages

  /** Kill feed / notifications on the right; entries fade out on their own. */
  pushFeed(text: string, kind: FeedKind): void {
    const el = document.createElement('div');
    el.className = `feed-item ${kind}`;
    el.textContent = text;
    el.style.animationDuration = `${HUD_FX.feedTime}s`;
    el.addEventListener('animationend', () => el.remove());
    this.feed.appendChild(el);
    while (this.feed.childElementCount > HUD_FX.feedMax) this.feed.firstElementChild!.remove();
  }

  showNotice(text: string, seconds: number): void {
    this.notice.textContent = text;
    this.notice.classList.remove('hidden');
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.classList.add('hidden'), seconds * 1000);
  }

  showGameOver(stats: Stats): void {
    byId('go-waves').textContent = String(stats.wavesSurvived);
    byId('go-kills').textContent = String(stats.kills);
    byId('go-headshots').textContent = String(stats.headshots);
    byId('go-outposts').textContent = String(stats.outpostsHeld);
    byId('go-score').textContent = String(stats.score);
    this.gameOver.classList.remove('hidden');
  }

  hideGameOver(): void {
    this.gameOver.classList.add('hidden');
  }
}
