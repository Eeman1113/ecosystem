// =============================================================
// WORLD — terrain, time-of-day, seasons, and weather.
// The world owns the grid: biomes, soil nutrients, water, weather
// state, and the master tick counter. Plants and agents read from
// this state every step.
// =============================================================

import { CFG } from './config.js';
import { rand, randi, clamp } from './utils.js';

// Biome ids — these are stored in a single Uint8Array for speed.
export const BIOME = {
  WATER:  0,
  SAND:   1,
  PLAIN:  2,
  FOREST: 3,
  ROCK:   4,
};

export const BIOME_NAME = ['water','sand','plain','forest','rock'];

export class World {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cell = CFG.world.cell;

    this.biome = new Uint8Array(cols * rows);
    this.soil  = new Float32Array(cols * rows); // nutrients 0..1
    this.moist = new Float32Array(cols * rows); // moisture 0..1
    this.fire  = new Float32Array(cols * rows); // 0 idle, >0 burning intensity

    // time
    this.tick = 0;
    this.dayLength = CFG.world.dayLength;
    this.yearLength = CFG.world.yearLength;

    // weather
    this.weather = 'clear';
    this.weatherTimer = 0;

    this.generate();
  }

  // ------- terrain generation (multi-octave value noise) -------
  // Multi-octave noise gives a wide spread of values; we then renormalize
  // to [0,1] so biome thresholds split the map into actually-diverse regions
  // (the previous single-octave + heavy-blur version collapsed everything
  // toward 0.5, producing a 100%-PLAIN map).
  generate() {
    const { cols, rows } = this;

    const buildOctave = (cellSize) => {
      const ncols = Math.ceil(cols / cellSize) + 1;
      const nrows = Math.ceil(rows / cellSize) + 1;
      const grid = new Float32Array(ncols * nrows);
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
      // Sample with bilinear interpolation
      const out = new Float32Array(cols * rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const fx = x / cellSize, fy = y / cellSize;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          const tx = fx - ix, ty = fy - iy;
          // smooth interp
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const a = grid[iy * ncols + ix];
          const b = grid[iy * ncols + ix + 1];
          const c = grid[(iy + 1) * ncols + ix];
          const d = grid[(iy + 1) * ncols + ix + 1];
          out[y * cols + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
        }
      }
      return out;
    };

    // sum 3 octaves for fractal-noise look
    const o1 = buildOctave(18);
    const o2 = buildOctave(8);
    const o3 = buildOctave(3);
    const noiseFull = new Float32Array(cols * rows);
    let nMin = Infinity, nMax = -Infinity;
    for (let i = 0; i < noiseFull.length; i++) {
      const v = o1[i] * 0.6 + o2[i] * 0.3 + o3[i] * 0.1;
      noiseFull[i] = v;
      if (v < nMin) nMin = v;
      if (v > nMax) nMax = v;
    }
    // Renormalize to [0, 1]
    const span = (nMax - nMin) || 1;
    for (let i = 0; i < noiseFull.length; i++) {
      noiseFull[i] = (noiseFull[i] - nMin) / span;
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = noiseFull[y * cols + x];

        let biome;
        if (v < 0.18) biome = BIOME.WATER;
        else if (v < 0.24) biome = BIOME.SAND;
        else if (v < 0.58) biome = BIOME.PLAIN;
        else if (v < 0.85) biome = BIOME.FOREST;
        else biome = BIOME.ROCK;

        this.biome[y * cols + x] = biome;
        this.soil[y * cols + x] = biome === BIOME.WATER ? 0 :
                                   biome === BIOME.SAND  ? rand(0.05, 0.15) :
                                   biome === BIOME.ROCK  ? rand(0.0, 0.05) :
                                   rand(0.25, 0.55);
        this.moist[y * cols + x] = biome === BIOME.WATER ? 1 :
                                   biome === BIOME.FOREST ? rand(0.5, 0.8) :
                                   biome === BIOME.SAND ? rand(0.05, 0.2) :
                                   biome === BIOME.ROCK ? rand(0, 0.1) :
                                   rand(0.3, 0.6);
      }
    }
  }

  idx(x, y) { return y * this.cols + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
  biomeAt(x, y) {
    const cx = clamp(Math.floor(x), 0, this.cols - 1);
    const cy = clamp(Math.floor(y), 0, this.rows - 1);
    return this.biome[cy * this.cols + cx];
  }
  isWater(x, y) { return this.biomeAt(x, y) === BIOME.WATER; }

  // -------- time --------
  // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  dayPhase() { return (this.tick % this.dayLength) / this.dayLength; }
  // 0..1 daylight intensity (smooth curve over the day)
  daylight() {
    const t = this.dayPhase();
    // sun is up roughly between 0.20 and 0.80
    const x = Math.sin((t - 0.25) * Math.PI * 2);
    return clamp(x, 0, 1);
  }
  // 0..3 spring/summer/autumn/winter
  seasonIndex() {
    return Math.floor(((this.tick % this.yearLength) / this.yearLength) * 4) % 4;
  }
  seasonName() {
    return ['spring','summer','autumn','winter'][this.seasonIndex()];
  }
  seasonProgress() {
    return ((this.tick % this.yearLength) / this.yearLength) * 4 % 1;
  }

  temperature() {
    // base on season + small daily wobble
    const s = this.seasonIndex();
    const base = [16, 24, 12, 0][s];
    const t = this.dayPhase();
    const dayWobble = Math.sin((t - 0.25) * Math.PI * 2) * 4;
    let temp = base + dayWobble;
    if (this.weather === 'rain') temp -= 2;
    if (this.weather === 'drought') temp += 5;
    return temp;
  }

  // -------- weather --------
  stepWeather() {
    if (this.weatherTimer > 0) {
      this.weatherTimer--;
      // moisture effects
      if (this.weather === 'rain') {
        // raise moisture across the map slightly
        if (this.tick % 4 === 0) {
          for (let i = 0; i < this.moist.length; i++) {
            this.moist[i] = clamp(this.moist[i] + 0.001, 0, 1);
          }
        }
      } else if (this.weather === 'drought') {
        if (this.tick % 8 === 0) {
          for (let i = 0; i < this.moist.length; i++) {
            this.moist[i] = clamp(this.moist[i] - 0.0008, 0, 1);
          }
        }
      }
      if (this.weatherTimer === 0) this.weather = 'clear';
      return;
    }
    if (Math.random() < CFG.world.rainChance) {
      this.weather = 'rain';
      const [a, b] = CFG.world.rainDuration;
      this.weatherTimer = a + randi(b - a);
    } else if (Math.random() < CFG.world.droughtChance) {
      this.weather = 'drought';
      const [a, b] = CFG.world.droughtDuration;
      this.weatherTimer = a + randi(b - a);
    }
  }

  // -------- per-tick update --------
  step() {
    this.tick++;
    this.stepWeather();
    this.stepFire();
    // gentle moisture diffusion every few ticks (so water tiles
    // gradually wet their neighbors and droughts dry rock first).
    if (this.tick % 30 === 0) this.diffuseMoisture();
  }

  // -------- fire spread --------
  // Fire intensity decays each tick; spreads to dry plant cells with a
  // probability that scales with intensity and inverse moisture. Rain
  // extinguishes faster. Burning increases soil afterward (ash).
  stepFire() {
    const { cols, rows } = this;
    const isRain = this.weather === 'rain';
    const decay = isRain ? 0.04 : 0.012;
    for (let i = 0; i < this.fire.length; i++) {
      if (this.fire[i] <= 0) continue;
      // intensity decay
      this.fire[i] -= decay;
      if (this.fire[i] < 0.02) {
        // ash → soil
        if (this.biome[i] !== BIOME.WATER) {
          this.soil[i] = Math.min(1, this.soil[i] + 0.15);
        }
        this.fire[i] = 0;
      }
    }
    // spread pass — process some random cells
    const spreadCount = (cols * rows) / 60 | 0;
    for (let s = 0; s < spreadCount; s++) {
      const i = ((Math.random() * cols * rows) | 0);
      const f = this.fire[i];
      if (f <= 0.15) continue;
      const x = i % cols, y = (i / cols) | 0;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      const [dx, dy] = dirs[(Math.random() * 4) | 0];
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      if (this.biome[ni] === BIOME.WATER) continue;
      if (this.fire[ni] > 0.1) continue;
      const dryness = 1 - this.moist[ni];
      const p = f * dryness * (isRain ? 0.05 : 0.55);
      if (Math.random() < p) {
        this.fire[ni] = Math.max(this.fire[ni], 0.55 + Math.random() * 0.4);
      }
    }
  }

  // Public API for tools — ignite a cell or radius.
  ignite(x, y, intensity = 1.0) {
    const cx = Math.max(0, Math.min(this.cols - 1, Math.floor(x)));
    const cy = Math.max(0, Math.min(this.rows - 1, Math.floor(y)));
    const i = this.idx(cx, cy);
    if (this.biome[i] === BIOME.WATER) return;
    this.fire[i] = Math.max(this.fire[i], intensity);
  }

  diffuseMoisture() {
    const out = new Float32Array(this.moist.length);
    const { cols, rows } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (this.biome[i] === BIOME.WATER) { out[i] = 1; continue; }
        let s = this.moist[i] * 4, c = 4;
        if (x > 0)        { s += this.moist[i - 1]; c++; }
        if (x < cols - 1) { s += this.moist[i + 1]; c++; }
        if (y > 0)        { s += this.moist[i - cols]; c++; }
        if (y < rows - 1) { s += this.moist[i + cols]; c++; }
        out[i] = (s / c) * 0.999; // tiny global decay
      }
    }
    this.moist = out;
  }
}
