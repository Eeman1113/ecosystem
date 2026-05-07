// =============================================================
// TOOLS — WorldBox-style brush palette. The currently selected tool
// is applied wherever the user clicks/drags on the world.
//
// Tools are grouped:
//   • Cursor   — inspect / pan / select
//   • Boons    — rain, fertilize, heal, plant flora
//   • Disasters— lightning, fire, drought, smite, kill-radius
//   • Lifeforms— spawn rabbit / deer / fox / wolf
//   • Terrain  — paint biome
//
// Each tool has a brushSize (cells) and a continuous-paint flag.
// =============================================================

import { BIOME } from './world.js';
import { Animal } from './agents.js';
import { CFG } from './config.js';
import { randomGenome } from './genetics.js';
import { clamp, randi, rand } from './utils.js';

export const TOOLS = {
  cursor:        { label: '✋',  name: 'Inspect',    cat: 'cursor', size: 0,  paint: false },

  // boons (green)
  rain:          { label: '🌧',  name: 'Rain',       cat: 'boon',   size: 6,  paint: true  },
  fertilize:     { label: '✨',  name: 'Fertilize',  cat: 'boon',   size: 4,  paint: true  },
  heal:          { label: '💗',  name: 'Heal',       cat: 'boon',   size: 4,  paint: true  },
  plantGrass:    { label: '🌱',  name: 'Plant Grass',cat: 'boon',   size: 3,  paint: true  },
  plantBush:     { label: '🌿',  name: 'Plant Bush', cat: 'boon',   size: 3,  paint: true  },
  plantTree:     { label: '🌳',  name: 'Plant Tree', cat: 'boon',   size: 3,  paint: true  },

  // disasters (red)
  lightning:     { label: '⚡',  name: 'Lightning',  cat: 'doom',   size: 0,  paint: false },
  fire:          { label: '🔥',  name: 'Fire',       cat: 'doom',   size: 3,  paint: true  },
  drought:       { label: '☀️', name: 'Drought',    cat: 'doom',   size: 5,  paint: true  },
  smite:         { label: '💥',  name: 'Smite',      cat: 'doom',   size: 3,  paint: true  },

  // lifeforms (cream)
  spawnRabbit:   { label: '🐇',  name: 'Spawn Rabbit', cat: 'life', size: 1, paint: false, mult: 3 },
  spawnDeer:     { label: '🦌',  name: 'Spawn Deer',   cat: 'life', size: 1, paint: false, mult: 2 },
  spawnFox:      { label: '🦊',  name: 'Spawn Fox',    cat: 'life', size: 1, paint: false, mult: 2 },
  spawnWolf:     { label: '🐺',  name: 'Spawn Wolf',   cat: 'life', size: 1, paint: false, mult: 1 },

  // terrain (brown)
  terraWater:    { label: '🌊',  name: 'Water',     cat: 'terra',  size: 3,  paint: true  },
  terraSand:     { label: '🏖',  name: 'Sand',      cat: 'terra',  size: 3,  paint: true  },
  terraPlain:    { label: '🟩',  name: 'Plain',     cat: 'terra',  size: 3,  paint: true  },
  terraForest:   { label: '🌲',  name: 'Forest',    cat: 'terra',  size: 3,  paint: true  },
  terraRock:     { label: '🪨',  name: 'Rock',      cat: 'terra',  size: 3,  paint: true  },
};

export class ToolSystem {
  constructor(sim) {
    this.sim = sim;
    this.current = 'cursor';
    this.brushSize = null; // null = use tool default
    this.lightningQueue = []; // pending lightning visuals
  }

  spec() { return TOOLS[this.current]; }
  size() { return this.brushSize ?? this.spec().size; }

  // applied at mouse-down + every drag tick (if paint). Cursor handles
  // its own click semantics in main.js.
  apply(wx, wy, isDrag) {
    const t = this.current;
    const spec = TOOLS[t];
    if (!spec.paint && isDrag) return; // one-shot tools only fire on initial click

    switch (t) {
      case 'rain':         return this._splat(wx, wy, (i, w, plants) => { w.moist[i] = clamp(w.moist[i] + 0.06, 0, 1); w.fire[i] *= 0.85; });
      case 'fertilize':    return this._splat(wx, wy, (i, w) => { w.soil[i] = clamp(w.soil[i] + 0.30, 0, 1); });
      case 'heal':         return this._healArea(wx, wy);
      case 'plantGrass':   return this._plantArea(wx, wy, 1);
      case 'plantBush':    return this._plantArea(wx, wy, 2);
      case 'plantTree':    return this._plantArea(wx, wy, 3);
      case 'lightning':    return this._lightning(wx, wy);
      case 'fire':         return this._splat(wx, wy, (i, w) => { if (w.biome[i] !== BIOME.WATER) w.fire[i] = Math.max(w.fire[i], 0.85); });
      case 'drought':      return this._splat(wx, wy, (i, w) => { w.moist[i] = Math.max(0, w.moist[i] - 0.15); });
      case 'smite':        return this._smiteArea(wx, wy);
      case 'spawnRabbit':  return this._spawnAnimals(wx, wy, 'rabbit', spec.mult);
      case 'spawnDeer':    return this._spawnAnimals(wx, wy, 'deer',   spec.mult);
      case 'spawnFox':     return this._spawnAnimals(wx, wy, 'fox',    spec.mult);
      case 'spawnWolf':    return this._spawnAnimals(wx, wy, 'wolf',   spec.mult);
      case 'terraWater':   return this._terraform(wx, wy, BIOME.WATER);
      case 'terraSand':    return this._terraform(wx, wy, BIOME.SAND);
      case 'terraPlain':   return this._terraform(wx, wy, BIOME.PLAIN);
      case 'terraForest':  return this._terraform(wx, wy, BIOME.FOREST);
      case 'terraRock':    return this._terraform(wx, wy, BIOME.ROCK);
    }
  }

  // ---- helpers ----
  _eachCellInRadius(wx, wy, fn) {
    const w = this.sim.world;
    const r = this.size();
    const cx = Math.floor(wx), cy = Math.floor(wy);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inBounds(nx, ny)) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = w.idx(nx, ny);
        fn(i, w, d, nx, ny);
      }
    }
  }

  _splat(wx, wy, fn) {
    this._eachCellInRadius(wx, wy, (i, w, d, nx, ny) => fn(i, w, this.sim.plants, d, nx, ny));
  }

  _plantArea(wx, wy, kind) {
    this._eachCellInRadius(wx, wy, (i, w, d) => {
      if (w.biome[i] === BIOME.WATER || w.biome[i] === BIOME.ROCK) return;
      if (Math.random() < 0.55 - d * 0.05) {
        const def = CFG.plants[ ['grass','bush','tree'][kind - 1] ];
        this.sim.plants.kind[i] = kind;
        this.sim.plants.energy[i] = def.maxEnergy * (0.5 + Math.random() * 0.5);
      }
    });
  }

  _healArea(wx, wy) {
    const sim = this.sim;
    const r = this.size();
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const dx = a.x - wx, dy = a.y - wy;
      if (dx*dx + dy*dy > r * r) continue;
      a.energy = Math.min(2.5, a.energy + 0.6);
      a.thirst = 0;
    }
  }

  _smiteArea(wx, wy) {
    const sim = this.sim;
    const r = this.size();
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const dx = a.x - wx, dy = a.y - wy;
      if (dx*dx + dy*dy > r * r) continue;
      a.alive = false;
      sim.plants.dropCorpse(a.x, a.y, a.size * 0.7);
      sim.fx.spawnDeath(a.x, a.y, a.species, a.size);
    }
  }

  _spawnAnimals(wx, wy, species, count) {
    const sim = this.sim;
    const w = sim.world;
    const spec = CFG.species[species];
    for (let k = 0; k < count; k++) {
      let tries = 16;
      while (tries-- > 0) {
        const x = wx + (Math.random() - 0.5) * 4;
        const y = wy + (Math.random() - 0.5) * 4;
        if (x < 0 || y < 0 || x >= w.cols || y >= w.rows) continue;
        if (w.isWater(x, y)) continue;
        const a = new Animal(species, x, y, randomGenome(spec), 0);
        sim.agents.push(a);
        break;
      }
    }
  }

  _lightning(wx, wy) {
    const sim = this.sim;
    // visual flash
    sim.lightningFlash = 1.0;
    // stamp the strike point
    this.lightningQueue.push({ x: wx, y: wy, life: 14, max: 14 });
    // ignite a few cells
    sim.world.ignite(wx, wy, 1.0);
    for (let i = 0; i < 8; i++) {
      const ox = wx + (Math.random() - 0.5) * 4;
      const oy = wy + (Math.random() - 0.5) * 4;
      if (sim.world.inBounds(ox, oy) && !sim.world.isWater(ox, oy)) {
        sim.world.ignite(ox, oy, 0.7 + Math.random() * 0.3);
      }
    }
    // smite any animal at the strike point
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const dx = a.x - wx, dy = a.y - wy;
      if (dx*dx + dy*dy < 4) {
        a.alive = false;
        sim.plants.dropCorpse(a.x, a.y, a.size * 0.7);
        sim.fx.spawnDeath(a.x, a.y, a.species, a.size);
      }
    }
  }

  _terraform(wx, wy, biome) {
    const w = this.sim.world;
    this._eachCellInRadius(wx, wy, (i, _, d) => {
      if (Math.random() > 1 - d * 0.15) return;
      w.biome[i] = biome;
      // re-set baseline soil/moisture for the new biome
      if (biome === BIOME.WATER) {
        w.soil[i] = 0; w.moist[i] = 1;
        // wipe anything growing here
        this.sim.plants.kind[i] = 0;
        this.sim.plants.energy[i] = 0;
      } else if (biome === BIOME.SAND) { w.moist[i] = 0.15; w.soil[i] = 0.1; }
      else if (biome === BIOME.PLAIN) { w.moist[i] = 0.45; w.soil[i] = 0.35; }
      else if (biome === BIOME.FOREST){ w.moist[i] = 0.65; w.soil[i] = 0.5; }
      else if (biome === BIOME.ROCK)  { w.moist[i] = 0.05; w.soil[i] = 0.02;
                                       this.sim.plants.kind[i] = 0; this.sim.plants.energy[i] = 0; }
    });
    // mark biome image dirty so the renderer regenerates it
    this.sim._biomeDirty = true;
  }

  // Tick lightning fades (called by main loop)
  step() {
    for (let i = this.lightningQueue.length - 1; i >= 0; i--) {
      this.lightningQueue[i].life--;
      if (this.lightningQueue[i].life <= 0) this.lightningQueue.splice(i, 1);
    }
    if (this.sim.lightningFlash > 0) this.sim.lightningFlash *= 0.85;
  }
}
