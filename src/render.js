// =============================================================
// RENDER — draws the world. Designed for clarity over realism:
//   • biomes get distinct base colors
//   • plants are layered (grass, bushes, trees)
//   • animals are drawn as simple species-specific bodies
//   • day/night is a global tint
//   • particle fx for kills, eating, mating
//   • follow-cam draws a halo around the selected agent
// =============================================================

import { CFG, PLANT_LIST } from './config.js';
import { BIOME } from './world.js';
import { clamp, lerp, smoothstep, hsl } from './utils.js';

const BIOME_COLOR = {
  [BIOME.WATER]:  [38, 78, 130],
  [BIOME.SAND]:   [196, 176, 120],
  [BIOME.PLAIN]:  [70, 100, 55],
  [BIOME.FOREST]: [40, 70, 35],
  [BIOME.ROCK]:   [110, 105, 100],
};

export class FX {
  constructor() { this.particles = []; }
  spawnDeath(x, y, species, size) {
    const n = species === 'wolf' || species === 'deer' ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * (0.4 + Math.random() * 0.8),
        vy: Math.sin(a) * (0.4 + Math.random() * 0.8),
        life: 30 + Math.random() * 30,
        max: 60,
        color: 'rgba(180,40,40,1)',
        size: 1 + Math.random() * 2 * size,
      });
    }
  }
  spawnGraze(x, y) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3,
        life: 16, max: 16,
        color: 'rgba(140,200,90,1)', size: 1,
      });
    }
  }
  spawnLove(x, y) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.4 - Math.random() * 0.3,
        life: 50, max: 50,
        color: 'rgba(255,120,180,1)', size: 1.4,
      });
    }
  }
  step() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    // camera
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.followId = null;
    // cached biome image for speed
    this.biomeImage = null;
    this.buildBiomeImage();
  }

  setWorld(world) {
    this.world = world;
    this.buildBiomeImage();
  }

  buildBiomeImage() {
    const w = this.world;
    const off = document.createElement('canvas');
    off.width = w.cols; off.height = w.rows;
    const octx = off.getContext('2d');
    const img = octx.createImageData(w.cols, w.rows);
    for (let y = 0; y < w.rows; y++) {
      for (let x = 0; x < w.cols; x++) {
        const i = y * w.cols + x;
        const b = w.biome[i];
        const c = BIOME_COLOR[b];
        const j = i * 4;
        const noise = ((x * 92821 + y * 689287) % 17) - 8;
        img.data[j  ] = clamp(c[0] + noise, 0, 255);
        img.data[j+1] = clamp(c[1] + noise, 0, 255);
        img.data[j+2] = clamp(c[2] + noise, 0, 255);
        img.data[j+3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this.biomeImage = off;
  }

  // World coords → screen coords
  toScreen(wx, wy) {
    const cell = this.world.cell * this.zoom;
    return [wx * cell + this.panX, wy * cell + this.panY];
  }
  fromScreen(sx, sy) {
    const cell = this.world.cell * this.zoom;
    return [(sx - this.panX) / cell, (sy - this.panY) / cell];
  }

  fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // -------- main draw --------
  draw(plants, agents, fx) {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const w = this.world;
    const cell = w.cell * this.zoom;

    // follow camera: keep selected agent centered
    if (this.followId !== null) {
      const target = agents.find(a => a.id === this.followId && a.alive);
      if (target) {
        this.panX = W * 0.5 - target.x * cell;
        this.panY = H * 0.5 - target.y * cell;
      } else {
        this.followId = null;
      }
    }

    // background
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, W, H);

    // biomes (scaled)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.biomeImage,
      this.panX, this.panY, w.cols * cell, w.rows * cell);

    // moisture overlay (subtle blue tint where wet, brown where dry)
    if (this.zoom >= 0.6) this._drawMoistureSubtle(ctx, cell);

    // plants
    this._drawPlants(ctx, plants, cell);

    // particles (under animals)
    this._drawParticles(ctx, fx, cell, false);

    // animals
    this._drawAnimals(ctx, agents, cell);

    // particles (over animals — death blood)
    this._drawParticles(ctx, fx, cell, true);

    // day/night tint
    this._drawDayNight(ctx, W, H);

    // weather
    this._drawWeather(ctx, W, H);

    // selected agent halo
    if (this.followId !== null) {
      const target = agents.find(a => a.id === this.followId && a.alive);
      if (target) {
        const [sx, sy] = this.toScreen(target.x, target.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // HUD: time/season/weather
    this._drawHud(ctx, W, H);
  }

  _drawMoistureSubtle(ctx, cell) {
    const w = this.world;
    if (w.weather !== 'drought' && w.weather !== 'rain') return;
    ctx.globalAlpha = w.weather === 'rain' ? 0.10 : 0.18;
    ctx.fillStyle = w.weather === 'rain' ? '#5b9bd5' : '#a87a3e';
    ctx.fillRect(this.panX, this.panY, w.cols * cell, w.rows * cell);
    ctx.globalAlpha = 1;
  }

  _drawPlants(ctx, plants, cell) {
    const w = this.world;
    // visible bounds in cell-space
    const x0 = Math.max(0, Math.floor(-this.panX / cell));
    const y0 = Math.max(0, Math.floor(-this.panY / cell));
    const x1 = Math.min(w.cols, Math.ceil((this.canvas.clientWidth - this.panX) / cell));
    const y1 = Math.min(w.rows, Math.ceil((this.canvas.clientHeight - this.panY) / cell));

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = w.idx(x, y);
        const k = plants.kind[i];
        if (!k) continue;
        const e = plants.energy[i];
        const def = CFG.plants[PLANT_LIST[k - 1]];
        const t = clamp(e / def.maxEnergy, 0.1, 1);
        const sx = x * cell + this.panX;
        const sy = y * cell + this.panY;
        if (k === 1) {
          // grass — small filled rect
          ctx.fillStyle = `rgba(${def.color[0]},${def.color[1]},${def.color[2]},${0.3 + 0.6 * t})`;
          ctx.fillRect(sx, sy + cell * 0.3, cell, cell * 0.7);
        } else if (k === 2) {
          // bush — circle
          ctx.fillStyle = `rgba(${def.color[0]},${def.color[1]},${def.color[2]},${0.5 + 0.5 * t})`;
          ctx.beginPath();
          ctx.arc(sx + cell * 0.5, sy + cell * 0.5, cell * 0.45 * (0.6 + 0.4 * t), 0, Math.PI * 2);
          ctx.fill();
        } else {
          // tree — small trunk + canopy
          const cs = cell * 0.65 * (0.5 + 0.5 * t);
          ctx.fillStyle = `rgba(70,45,25,0.9)`;
          ctx.fillRect(sx + cell * 0.42, sy + cell * 0.55, cell * 0.16, cell * 0.45);
          ctx.fillStyle = `rgba(${def.color[0]},${def.color[1]},${def.color[2]},${0.7 + 0.3 * t})`;
          ctx.beginPath();
          ctx.arc(sx + cell * 0.5, sy + cell * 0.45, cs * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawAnimals(ctx, agents, cell) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      const sx = a.x * cell + this.panX;
      const sy = a.y * cell + this.panY;
      // skip offscreen
      if (sx < -20 || sy < -20 || sx > this.canvas.clientWidth + 20 || sy > this.canvas.clientHeight + 20) continue;

      const angle = Math.atan2(a.vy, a.vx);
      const sz = (a.spec.kind === 'predator' ? 4 : 3) * a.size * this.zoom;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + sz * 0.7, sz * 0.9, sz * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // body, hue from genes
      const eAlpha = clamp(a.energy / 1.4, 0.3, 1);
      const baseHue = a.hue;
      const sat = a.species === 'rabbit' ? 12 :
                  a.species === 'deer'   ? 30 :
                  a.species === 'fox'    ? 80 :
                  60;
      const light = a.species === 'rabbit' ? 78 :
                    a.species === 'deer'   ? 38 :
                    a.species === 'fox'    ? 52 :
                    32;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);

      switch (a.species) {
        case 'rabbit':
          ctx.fillStyle = hsl(baseHue, sat, light, eAlpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, sz, sz * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          // ears
          ctx.fillStyle = hsl(baseHue, sat, light - 8, eAlpha);
          ctx.fillRect(-sz * 0.4, -sz * 1.1, sz * 0.2, sz * 0.7);
          ctx.fillRect(-sz * 0.05, -sz * 1.1, sz * 0.2, sz * 0.7);
          break;
        case 'deer':
          ctx.fillStyle = hsl(baseHue, sat, light, eAlpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, sz * 1.1, sz * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          // head
          ctx.beginPath();
          ctx.ellipse(sz * 0.9, -sz * 0.2, sz * 0.45, sz * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'fox':
          ctx.fillStyle = hsl(baseHue, sat, light, eAlpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, sz * 1.05, sz * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          // tail
          ctx.beginPath();
          ctx.ellipse(-sz * 1.1, 0, sz * 0.55, sz * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
          // tail tip
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(-sz * 1.55, 0, sz * 0.18, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'wolf':
          ctx.fillStyle = hsl(baseHue, sat, light, eAlpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, sz * 1.2, sz * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          // head
          ctx.beginPath();
          ctx.ellipse(sz * 1.1, -sz * 0.15, sz * 0.45, sz * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
          // tail
          ctx.beginPath();
          ctx.ellipse(-sz * 1.2, 0, sz * 0.5, sz * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.restore();

      // pregnancy tint
      if (a.pregnant > 0) {
        ctx.strokeStyle = 'rgba(255,160,200,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, sz + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  _drawParticles(ctx, fx, cell, blood) {
    for (let i = 0; i < fx.particles.length; i++) {
      const p = fx.particles[i];
      const isBlood = p.color.includes('180,40,40');
      if (blood !== isBlood) continue;
      const [sx, sy] = this.toScreen(p.x, p.y);
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * this.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawDayNight(ctx, W, H) {
    const w = this.world;
    const dl = w.daylight();
    if (dl >= 0.95) return;
    const nightAlpha = (1 - dl) * 0.55;
    // bluish tint at night, warmer at dawn/dusk
    const phase = w.dayPhase();
    let r = 8, g = 12, b = 30;
    if (phase < 0.3 || phase > 0.7) {
      // dawn/dusk
      const k = Math.min(Math.abs(phase - 0.3), Math.abs(phase - 0.7));
      if (k < 0.05) { r = 60; g = 30; b = 30; }
    }
    ctx.fillStyle = `rgba(${r},${g},${b},${nightAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  _drawWeather(ctx, W, H) {
    const w = this.world;
    if (w.weather === 'rain') {
      ctx.strokeStyle = 'rgba(150,180,220,0.5)';
      ctx.lineWidth = 1;
      // pseudo-random streaks based on tick
      ctx.beginPath();
      for (let i = 0; i < 80; i++) {
        const x = ((i * 73 + w.tick * 6) % W);
        const y = ((i * 137 + w.tick * 18) % H);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 8);
      }
      ctx.stroke();
    }
  }

  _drawHud(ctx, W, H) {
    const w = this.world;
    const dl = w.daylight();
    const phase = w.dayPhase();
    let timeName = 'night';
    if (phase >= 0.20 && phase < 0.32) timeName = 'dawn';
    else if (phase >= 0.32 && phase < 0.68) timeName = 'day';
    else if (phase >= 0.68 && phase < 0.80) timeName = 'dusk';
    const txt = `${w.seasonName().toUpperCase()}  ·  ${timeName}  ·  ${w.weather}  ·  ${w.temperature().toFixed(1)}°`;
    ctx.font = '11px ui-monospace, monospace';
    const tw = ctx.measureText(txt).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, tw, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, 16, 23);
  }
}
