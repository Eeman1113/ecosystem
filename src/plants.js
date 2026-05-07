// =============================================================
// PLANTS — three species (grass, bush, tree) layered on the same
// grid. Each cell has at most one plant. Growth is modulated by:
//   • biome bonus
//   • soil nutrients
//   • soil moisture (especially during droughts)
//   • daylight (no photosynthesis at night)
//   • season
// Mature plants drop seeds into nearby compatible cells.
// =============================================================

import { CFG, PLANT_LIST } from './config.js';
import { BIOME } from './world.js';
import { clamp, randi, rand } from './utils.js';

export class Plants {
  constructor(world) {
    this.world = world;
    const n = world.cols * world.rows;
    this.kind   = new Uint8Array(n); // 0 none, 1 grass, 2 bush, 3 tree
    this.energy = new Float32Array(n);

    this.seedInitial();
  }

  seedInitial() {
    const { world } = this;
    for (let i = 0; i < this.kind.length; i++) {
      const b = world.biome[i];
      if (b === BIOME.WATER) continue;
      const r = Math.random();
      if (b === BIOME.FOREST) {
        if (r < 0.25) this._set(i, 3, rand(0.5, 1.0));      // tree
        else if (r < 0.55) this._set(i, 2, rand(0.3, 1.0)); // bush
        else if (r < 0.85) this._set(i, 1, rand(0.2, 1.0)); // grass
      } else if (b === BIOME.PLAIN) {
        if (r < 0.55) this._set(i, 1, rand(0.2, 1.0));
        else if (r < 0.62) this._set(i, 2, rand(0.2, 1.0));
        else if (r < 0.64) this._set(i, 3, rand(0.3, 1.0));
      } else if (b === BIOME.SAND) {
        if (r < 0.05) this._set(i, 1, rand(0.1, 0.4));
      } else if (b === BIOME.ROCK) {
        if (r < 0.02) this._set(i, 1, rand(0.05, 0.2));
      }
    }
  }

  _set(i, kind, energy) {
    this.kind[i] = kind;
    this.energy[i] = energy;
  }

  kindNameAt(i) { return PLANT_LIST[this.kind[i] - 1]; }

  // Bite a plant at the cell. Returns gained energy (after species-
  // specific energy-per-bite). Plant dies if energy depleted.
  graze(cellIdx, requestedKinds) {
    const k = this.kind[cellIdx];
    if (!k) return 0;
    const name = PLANT_LIST[k - 1];
    if (!requestedKinds.includes(name)) return 0;
    const def = CFG.plants[name];
    const bite = Math.min(this.energy[cellIdx], def.bite);
    this.energy[cellIdx] -= bite;
    const gained = (bite / def.bite) * def.energyPerBite;
    if (this.energy[cellIdx] <= 0.02) {
      this.kind[cellIdx] = 0;
      this.energy[cellIdx] = 0;
    }
    return gained;
  }

  // Per-tick update. To save cycles, only update a fraction each tick
  // — but then growth is dialed up so the average rate is preserved.
  step() {
    const w = this.world;
    const { cols, rows } = w;
    const dlight = w.daylight();
    const season = w.seasonName();
    const isDrought = w.weather === 'drought';
    const isRain = w.weather === 'rain';

    // process about 1/4 of cells per tick at random
    const total = cols * rows;
    const slice = (total / 4) | 0;
    for (let s = 0; s < slice; s++) {
      const i = randi(total);
      const k = this.kind[i];
      const biome = w.biome[i];
      if (biome === BIOME.WATER) continue;
      const x = i % cols, y = (i / cols) | 0;

      // Empty cell: chance to colonize from a mature neighbor
      if (k === 0) {
        // pick a random neighbor
        const dx = randi(3) - 1, dy = randi(3) - 1;
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        const ni = w.idx(nx, ny);
        const nk = this.kind[ni];
        if (!nk) continue;
        const def = CFG.plants[PLANT_LIST[nk - 1]];
        const biomeBonus = def.biomeBonus[ ['water','sand','plain','forest','rock'][biome] ];
        if (biomeBonus <= 0) continue;
        if (this.energy[ni] < def.maxEnergy * 0.6) continue;
        const seasonMul = def.seasonal[season];
        const moisture = w.moist[i];
        const p = def.spread * 4 * biomeBonus * seasonMul * (0.4 + moisture);
        if (Math.random() < p) {
          this._set(i, nk, def.maxEnergy * 0.15);
        }
        continue;
      }

      // Burning plants lose energy fast and may die.
      if (w.fire[i] > 0.1) {
        const name0 = PLANT_LIST[k - 1];
        const def0 = CFG.plants[name0];
        this.energy[i] -= w.fire[i] * 0.04;
        if (this.energy[i] <= 0) {
          this.kind[i] = 0;
          this.energy[i] = 0;
        }
        continue;
      }

      // Existing plant: grow toward maxEnergy.
      const name = PLANT_LIST[k - 1];
      const def = CFG.plants[name];
      const biomeBonus = def.biomeBonus[ ['water','sand','plain','forest','rock'][biome] ];
      if (biomeBonus <= 0) {
        // unsuitable biome: slow decay
        this.energy[i] = Math.max(0, this.energy[i] - 0.002);
        if (this.energy[i] <= 0) this.kind[i] = 0;
        continue;
      }
      const seasonMul = def.seasonal[season];
      const moisture = w.moist[i];
      const droughtMul = isDrought ? 0.35 : isRain ? 1.2 : 1.0;
      const sun = 0.3 + 0.7 * dlight; // some growth at night via stored sugars
      const fertility = 0.5 + 0.5 * w.soil[i];
      const grow = def.growth * 4 * biomeBonus * seasonMul * sun * fertility * droughtMul * (0.3 + 0.7 * moisture);

      this.energy[i] += grow * (1 - this.energy[i] / def.maxEnergy);
      if (this.energy[i] > def.maxEnergy) this.energy[i] = def.maxEnergy;

      // soil consumption
      w.soil[i] = Math.max(0, w.soil[i] - grow * 0.4);
    }
  }

  // Drop nutrients from a corpse into a small radius.
  dropCorpse(x, y, mass) {
    const w = this.world;
    const cx = clamp(Math.floor(x), 0, w.cols - 1);
    const cy = clamp(Math.floor(y), 0, w.rows - 1);
    const r = 2;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inBounds(nx, ny)) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = w.idx(nx, ny);
        if (w.biome[i] === BIOME.WATER) continue;
        w.soil[i] = clamp(w.soil[i] + mass * 0.04 * (1 - d / r), 0, 1);
      }
    }
  }

  countByKind() {
    const c = [0, 0, 0, 0];
    for (let i = 0; i < this.kind.length; i++) c[this.kind[i]]++;
    return { grass: c[1], bush: c[2], tree: c[3] };
  }
}
