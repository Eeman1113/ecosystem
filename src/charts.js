// =============================================================
// CHARTS — two charts:
//   1) Population over time (per species + total plants)
//   2) Trait drift over time for the focused species (mean of each
//      gene normalized to its [min, max] range, so all traits share
//      a 0..1 axis).
// Both are ring-buffer-backed for cheap appending.
// =============================================================

import { CFG } from './config.js';

const COLORS = {
  plants:  'rgba(80,170,80,0.85)',
  rabbit:  'rgba(220,210,190,0.95)',
  deer:    'rgba(180,130,70,0.95)',
  fox:     'rgba(220,90,50,0.95)',
  wolf:    'rgba(150,170,220,0.95)',
};

class Ring {
  constructor(size) { this.size = size; this.data = []; }
  push(v) { this.data.push(v); if (this.data.length > this.size) this.data.shift(); }
}

export class PopulationChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = CFG.ui.chartHistory;
    this.series = {
      plants: new Ring(this.size),
      rabbit: new Ring(this.size),
      deer:   new Ring(this.size),
      fox:    new Ring(this.size),
      wolf:   new Ring(this.size),
    };
  }
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  push(plantPct, counts) {
    this.series.plants.push(plantPct);
    this.series.rabbit.push(counts.rabbit || 0);
    this.series.deer.push(counts.deer || 0);
    this.series.fox.push(counts.fox || 0);
    this.series.wolf.push(counts.wolf || 0);
  }
  draw() {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    ctx.fillStyle = '#070a0d';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 4) * i);
      ctx.lineTo(W, (H / 4) * i);
      ctx.stroke();
    }

    // plants axis: 0..1
    this._drawLine(this.series.plants.data, COLORS.plants, 1.0);

    // animals share a max
    let maxAnim = 10;
    for (const k of ['rabbit','deer','fox','wolf']) {
      for (const v of this.series[k].data) if (v > maxAnim) maxAnim = v;
    }
    for (const k of ['rabbit','deer','fox','wolf']) {
      this._drawLine(this.series[k].data, COLORS[k], maxAnim, k === 'fox' || k === 'wolf' ? 1.6 : 1.2);
    }
  }
  _drawLine(data, color, max, lw = 1.4) {
    if (data.length < 2) return;
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (this.size - 1)) * W;
      const y = H - (data[i] / max) * (H - 4) - 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export class TraitChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = CFG.ui.traitHistory;
    this.species = 'rabbit';
    this.series = {}; // gene -> Ring
  }
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setSpecies(s) {
    this.species = s;
    this.series = {};
    const spec = CFG.species[s];
    for (const name of Object.keys(spec.genes)) this.series[name] = new Ring(this.size);
  }
  push(means) {
    if (!means) {
      // null entry preserves time alignment but not drawn
      for (const name of Object.keys(this.series)) this.series[name].push(null);
      return;
    }
    const spec = CFG.species[this.species];
    for (const name of Object.keys(this.series)) {
      const def = spec.genes[name];
      const v = means[name];
      const norm = (v - def.min) / (def.max - def.min);
      this.series[name].push(norm);
    }
  }
  draw() {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    ctx.fillStyle = '#070a0d';
    ctx.fillRect(0, 0, W, H);

    const traitColors = {
      speed:       'hsl(20,80%,60%)',
      vision:      'hsl(180,70%,60%)',
      metabolism:  'hsl(290,60%,65%)',
      size:        'hsl(50,80%,60%)',
      reproThresh: 'hsl(330,70%,65%)',
      hue:         'hsl(120,50%,60%)',
      aggression:  'hsl(0,70%,60%)',
      packRadius:  'hsl(220,70%,65%)',
    };

    for (const [name, ring] of Object.entries(this.series)) {
      const data = ring.data;
      if (data.length < 2) continue;
      ctx.strokeStyle = traitColors[name] || 'white';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v == null) { started = false; continue; }
        const x = (i / (this.size - 1)) * W;
        const y = H - v * (H - 4) - 2;
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }
  }
  legend() {
    return Object.keys(this.series);
  }
}
