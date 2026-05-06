// =============================================================
// MAIN — bootstraps everything and runs the loop.
// Holds the simulation `Sim` object that the UI reads & writes.
// =============================================================

import { CFG, SPECIES_LIST } from './config.js';
import { World, BIOME } from './world.js';
import { Plants } from './plants.js';
import { Animal, SpatialHash, processMating } from './agents.js';
import { Renderer, FX } from './render.js';
import { PopulationChart, TraitChart } from './charts.js';
import { populationMeans, randomGenome } from './genetics.js';
import { UI } from './ui.js';
import { rand, randi, clamp } from './utils.js';

class Sim {
  constructor() {
    this.canvas = document.getElementById('world');
    this.popCanvas = document.getElementById('popChart');
    this.traitCanvas = document.getElementById('traitChart');

    this.popChart = new PopulationChart(this.popCanvas);
    this.traitChart = new TraitChart(this.traitCanvas);
    this.traitChart.setSpecies('rabbit');

    this.tuning = { sPlant: 1, sRabbit: 1, sFox: 1, sMut: 1 };

    this.paused = false;
    this.speed = 1;
    this.selectedId = null;

    this._initWorld();
  }

  _initWorld() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const cell = CFG.world.cell;
    const cols = Math.max(40, Math.floor(r.width / cell));
    const rows = Math.max(30, Math.floor(r.height / cell));
    this.world = new World(cols, rows);
    this.plants = new Plants(this.world);
    this.fx = new FX();
    this.agents = [];
    this.hash = new SpatialHash(this.world, 5);

    if (this.renderer) this.renderer.setWorld(this.world);
    else this.renderer = new Renderer(this.canvas, this.world);
    this.renderer.fitCanvas();
    this.renderer.panX = 0;
    this.renderer.panY = 0;
    this.renderer.zoom = 1;

    this.popChart.fit();
    this.traitChart.fit();

    this._seedInitial();
    this._statsCache = {};
  }

  _seedInitial() {
    for (const sp of SPECIES_LIST) {
      const spec = CFG.species[sp];
      for (let i = 0; i < spec.startCount; i++) {
        this._spawnAt(sp);
      }
    }
  }

  _spawnAt(species) {
    const spec = CFG.species[species];
    let tries = 50;
    while (tries-- > 0) {
      const x = rand(0, this.world.cols);
      const y = rand(0, this.world.rows);
      if (this.world.isWater(x, y)) continue;
      const a = new Animal(species, x, y, randomGenome(spec), 0);
      this.agents.push(a);
      return a;
    }
    return null;
  }

  // ---------- public API used by UI ----------
  reset() { this._initWorld(); }
  resize() { this.renderer.fitCanvas(); this.popChart.fit(); this.traitChart.fit(); }
  zoomBy(f) {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, f);
  }
  zoomAt(sx, sy, factor) {
    const oldZoom = this.renderer.zoom;
    let newZoom = clamp(oldZoom * factor, 0.5, 4);
    factor = newZoom / oldZoom;
    // keep the world point under the cursor stable
    this.renderer.panX = sx - (sx - this.renderer.panX) * factor;
    this.renderer.panY = sy - (sy - this.renderer.panY) * factor;
    this.renderer.zoom = newZoom;
  }
  followSelected() {
    if (this.selectedId !== null) this.renderer.followId = this.selectedId;
  }
  seedSpecies(species, n) {
    for (let i = 0; i < n; i++) this._spawnAt(species);
  }
  handleClick(wx, wy, shift) {
    // first try selecting an animal
    let best = null, bestD = 4;
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) {
      this.selectedId = best.id;
      this.ui.showInspector(best);
      if (shift) this.renderer.followId = best.id;
      return;
    }
    // otherwise drop fertilizer
    const w = this.world;
    const cx = clamp(Math.floor(wx), 0, w.cols - 1);
    const cy = clamp(Math.floor(wy), 0, w.rows - 1);
    const r = 4;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inBounds(nx, ny)) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = w.idx(nx, ny);
        if (w.biome[i] === BIOME.WATER) continue;
        w.soil[i] = clamp(w.soil[i] + (1 - d / r) * 0.4, 0, 1);
      }
    }
  }

  save() {
    const data = {
      tick: this.world.tick,
      cols: this.world.cols, rows: this.world.rows,
      biome: Array.from(this.world.biome),
      soil: Array.from(this.world.soil),
      moist: Array.from(this.world.moist),
      pkind: Array.from(this.plants.kind),
      pen: Array.from(this.plants.energy),
      agents: this.agents.filter(a => a.alive).map(a => ({
        species: a.species, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
        genes: a.genes, energy: a.energy, thirst: a.thirst,
        age: a.age, generation: a.generation,
      })),
    };
    try {
      localStorage.setItem('ecosystem_save', JSON.stringify(data));
      alert('Saved.');
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }
  load() {
    const raw = localStorage.getItem('ecosystem_save');
    if (!raw) { alert('No save found.'); return; }
    try {
      const d = JSON.parse(raw);
      this.world = new World(d.cols, d.rows);
      this.world.tick = d.tick;
      this.world.biome.set(d.biome);
      this.world.soil.set(d.soil);
      this.world.moist.set(d.moist);
      this.plants = new Plants(this.world);
      this.plants.kind.set(d.pkind);
      this.plants.energy.set(d.pen);
      this.agents = d.agents.map(o => {
        const a = new Animal(o.species, o.x, o.y, o.genes, o.generation);
        a.vx = o.vx; a.vy = o.vy; a.energy = o.energy; a.thirst = o.thirst;
        a.age = o.age;
        return a;
      });
      this.fx = new FX();
      this.renderer.setWorld(this.world);
      alert('Loaded.');
    } catch (e) { alert('Load failed: ' + e.message); }
  }

  // ---------- main loop ----------
  step() {
    // multiplier sliders apply per-tick; we simply scale relevant rates here
    // by adjusting CFG before stepping is impractical (modules export consts);
    // instead we integrate them into per-step calculations directly.
    // For now: tuning.sMut influences mutation rate by scaling the species
    // gene 'mutate' fields in-place (cheap & reversible).
    this._applyMutationTuning();

    this.world.step();
    // plants step is somewhat expensive: throttle by tuning.sPlant
    const plantTicks = Math.max(1, Math.round(this.tuning.sPlant));
    for (let i = 0; i < plantTicks; i++) this.plants.step();

    // build hash before agents
    this.hash.rebuild(this.agents);

    // step agents (slot in metabolism multipliers via simple scaling)
    for (const a of this.agents) {
      if (!a.alive) continue;
      const oldMet = a.genes.metabolism;
      if (a.species === 'rabbit') a.genes.metabolism = oldMet * this.tuning.sRabbit;
      else if (a.species === 'fox' || a.species === 'wolf') a.genes.metabolism = oldMet * this.tuning.sFox;
      a.step(this.world, this.plants, this.hash, this.agents, this.fx);
      a.genes.metabolism = oldMet; // restore actual gene
    }

    // mating
    if (this.world.tick % 3 === 0) processMating(this.agents);

    // remove dead, drop corpses
    for (let i = this.agents.length - 1; i >= 0; i--) {
      if (!this.agents[i].alive) this.agents.splice(i, 1);
    }

    // particles
    this.fx.step();

    // periodic chart updates
    if (this.world.tick % 4 === 0) this._updateCharts();
  }

  _applyMutationTuning() {
    // scale mutate rates relative to defaults stored on first call
    if (!this._origMutate) {
      this._origMutate = {};
      for (const sp of SPECIES_LIST) {
        this._origMutate[sp] = {};
        for (const [name, def] of Object.entries(CFG.species[sp].genes)) {
          this._origMutate[sp][name] = def.mutate;
        }
      }
    }
    for (const sp of SPECIES_LIST) {
      for (const [name, def] of Object.entries(CFG.species[sp].genes)) {
        def.mutate = this._origMutate[sp][name] * this.tuning.sMut;
      }
    }
  }

  _updateCharts() {
    let plantSum = 0, plantCount = 0;
    for (let i = 0; i < this.plants.kind.length; i++) {
      if (this.plants.kind[i]) plantCount++;
    }
    const total = this.plants.kind.length;
    const cover = plantCount / total;

    const counts = { rabbit: 0, deer: 0, fox: 0, wolf: 0 };
    for (const a of this.agents) if (a.alive) counts[a.species]++;
    this.popChart.push(cover, counts);

    const sp = this.traitChart.species;
    const subset = this.agents.filter(a => a.alive && a.species === sp);
    const means = populationMeans(subset, CFG.species[sp]);
    this.traitChart.push(means);

    this._statsCache = { cover, counts };
  }

  _renderHud() {
    const w = this.world;
    document.getElementById('kTick').textContent = w.tick;
    document.getElementById('kDay').textContent = (w.tick / w.dayLength) | 0;
    document.getElementById('kYear').textContent = (w.tick / w.yearLength) | 0;
    document.getElementById('kSeason').textContent = w.seasonName();
    document.getElementById('kWeather').textContent = w.weather;
    document.getElementById('kTemp').textContent = w.temperature().toFixed(1) + '°';
    const c = this._statsCache;
    if (c) {
      document.getElementById('cPlants').textContent = ((c.cover || 0) * 100).toFixed(1) + '%';
      document.getElementById('cRabbit').textContent = c.counts?.rabbit ?? 0;
      document.getElementById('cDeer').textContent   = c.counts?.deer ?? 0;
      document.getElementById('cFox').textContent    = c.counts?.fox ?? 0;
      document.getElementById('cWolf').textContent   = c.counts?.wolf ?? 0;
    }
    // refresh inspector for selected agent
    if (this.selectedId !== null && this.world.tick % 10 === 0) {
      const a = this.agents.find(x => x.id === this.selectedId && x.alive);
      if (a) this.ui.showInspector(a);
      else { this.selectedId = null; this.ui.showInspector(null); }
    }
  }

  loop() {
    if (!this.paused) {
      for (let s = 0; s < this.speed; s++) this.step();
    }
    this.renderer.draw(this.plants, this.agents, this.fx);
    this.popChart.draw();
    this.traitChart.draw();
    this._renderHud();
    requestAnimationFrame(() => this.loop());
  }
}

// -------- bootstrap --------
const sim = new Sim();
sim.ui = new UI(sim);
window._sim = sim; // expose for debugging
sim.loop();
