import { BUILDABLE, Cost, ITEMS, ItemId, STRUCTURES } from '../config';

const byId = (id: string) => document.getElementById(id)!;

export function costText(cost: Cost): string {
  return (Object.entries(cost) as [ItemId, number][]).map(([id, n]) => `${n} ${ITEMS[id].name.split(' ')[0]}`).join(' + ');
}

/** Bottom bar in build mode (replaces the hotbar): pieces, costs, selection and a status line. */
export class BuildMenu {
  private readonly bar = byId('buildbar');
  private readonly hotbar = byId('hotbar');
  private readonly status = byId('build-status');
  private readonly items: HTMLElement[] = [];
  private shownKey = '';
  private statusShown = '';

  constructor() {
    const list = byId('build-items');
    BUILDABLE.forEach((type, i) => {
      const def = STRUCTURES[type];
      const el = document.createElement('div');
      el.className = 'hb-slot build-item';
      el.innerHTML = `<span class="hb-key">${i + 1}</span><span class="hb-name">${def.name}</span><span class="build-cost">${costText(def.cost)}</span>`;
      list.appendChild(el);
      this.items.push(el);
    });
  }

  setVisible(on: boolean): void {
    this.bar.classList.toggle('hidden', !on);
    this.hotbar.classList.toggle('hidden', on);
  }

  /** `affordable[i]` per piece in BUILDABLE order. */
  update(selected: number, affordable: boolean[], status: string, ok: boolean): void {
    const key = `${selected}|${affordable.join()}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.items.forEach((el, i) => {
        el.classList.toggle('active', i === selected);
        el.classList.toggle('empty', !affordable[i]);
      });
    }
    const s = `${ok ? 1 : 0}${status}`;
    if (s !== this.statusShown) {
      this.statusShown = s;
      this.status.textContent = status;
      this.status.classList.toggle('bad', !ok);
    }
  }
}
