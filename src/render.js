// =============================================================
// RENDER — visual layer.
//
// Pass order each frame (back → front):
//   1. sky gradient (color depends on time of day)
//   2. biome base image (cached, baked once at world build)
//   3. animated water ripples (trig offset over biome layer)
//   4. plants (grass tufts, bushes with shading, trees w/ canopy)
//   5. corpse/under-animal particles
//   6. animals (with eyes, shadows, hue-driven coloring)
//   7. over-animal particles (blood, love hearts, dust)
//   8. weather (rain streaks)
//   9. seasonal overlay (snow falling, autumn leaves)
//  10. day/night tint (smooth gradient, not flat)
//  11. stars (at night)
//  12. sun / moon
//  13. vignette
//  14. selected-agent halo
//  15. HUD text
// =============================================================

import { CFG, PLANT_LIST } from './config.js';
import { BIOME } from './world.js';
import { clamp, lerp, smoothstep, hsl, rand } from './utils.js';
import { SpriteAtlas } from './sprites.js';

// Biome palette — each biome is two colors (low/high) the renderer
// blends between using a stable per-cell noise value. This gives an
// organic, painterly look instead of minecraft-flat fills.
const BIOME_PALETTE = {
  [BIOME.WATER]:  [[26, 58, 100], [42, 92, 146]],
  [BIOME.SAND]:   [[208, 188, 132], [184, 162, 102]],
  [BIOME.PLAIN]:  [[78, 116, 60],  [60, 96, 44]],
  [BIOME.FOREST]: [[44, 78, 38],   [28, 58, 26]],
  [BIOME.ROCK]:   [[120, 116, 110], [88, 84, 80]],
};

// Cheap deterministic 2D hash → [0, 1)
function hash2(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffffff) / 0xffffff;
}

export class FX {
  constructor() { this.particles = []; }

  spawnDeath(x, y, species, size) {
    const n = species === 'wolf' || species === 'deer' ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        kind: 'blood',
        x, y,
        vx: Math.cos(a) * (0.4 + Math.random() * 0.8),
        vy: Math.sin(a) * (0.4 + Math.random() * 0.8),
        life: 30 + Math.random() * 30,
        max: 60,
        size: 1 + Math.random() * 2 * size,
      });
    }
  }
  spawnGraze(x, y) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        kind: 'graze',
        x, y,
        vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3,
        life: 16, max: 16, size: 1,
      });
    }
  }
  spawnLove(x, y) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        kind: 'heart',
        x, y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.4 - Math.random() * 0.3,
        life: 50, max: 50, size: 1.4,
      });
    }
  }
  spawnLeaf(x, y) {
    this.particles.push({
      kind: 'leaf',
      x, y,
      vx: -0.2 - Math.random() * 0.3,
      vy: 0.15 + Math.random() * 0.25,
      life: 240, max: 240,
      size: 1.4 + Math.random() * 0.8,
      hue: 18 + Math.random() * 30,
      spin: Math.random() * Math.PI * 2,
      spinV: (Math.random() - 0.5) * 0.05,
    });
  }
  spawnSnow(x, y) {
    this.particles.push({
      kind: 'snow',
      x, y,
      vx: (Math.random() - 0.5) * 0.15,
      vy: 0.12 + Math.random() * 0.18,
      life: 360, max: 360,
      size: 0.8 + Math.random() * 0.7,
    });
  }

  step() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'blood' || p.kind === 'graze') {
        p.vx *= 0.96; p.vy *= 0.96;
      } else if (p.kind === 'leaf') {
        p.vx += Math.sin(p.life * 0.05) * 0.01;
        if (p.spinV) p.spin += p.spinV;
      } else if (p.kind === 'heart') {
        p.vy *= 0.98;
      }
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
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.followId = null;
    this.biomeImage = null;
    this.starField = null;
    this._lastSeason = null;
    this.atlas = new SpriteAtlas();
    this.buildBiomeImage();
    this.buildStarField();
  }

  setWorld(world) {
    this.world = world;
    this.buildBiomeImage();
    this.buildStarField();
  }

  // ---------- baked biome image ----------
  buildBiomeImage() {
    const w = this.world;
    const off = document.createElement('canvas');
    // Render biome at higher resolution so the per-cell noise looks
    // smoother once scaled up by the cell size.
    const SCALE = 2;
    off.width = w.cols * SCALE;
    off.height = w.rows * SCALE;
    const octx = off.getContext('2d');
    const img = octx.createImageData(off.width, off.height);

    for (let py = 0; py < off.height; py++) {
      for (let px = 0; px < off.width; px++) {
        const cx = (px / SCALE) | 0;
        const cy = (py / SCALE) | 0;
        const i = cy * w.cols + cx;
        const b = w.biome[i];
        const pal = BIOME_PALETTE[b];

        // Two-octave noise: cell-scale + sub-cell-scale for organic feel.
        const n1 = hash2(cx, cy);
        const n2 = hash2(px, py);
        const n  = n1 * 0.7 + n2 * 0.3;

        let r = lerp(pal[0][0], pal[1][0], n);
        let g = lerp(pal[0][1], pal[1][1], n);
        let bl= lerp(pal[0][2], pal[1][2], n);

        // Soften biome edges by blending toward neighbor's palette.
        if (px % SCALE === 0 || py % SCALE === 0) {
          const nbr = (cx > 0)         && w.biome[i - 1];
          const nbu = (cy > 0)         && w.biome[i - w.cols];
          const blend = (otherBiome) => {
            if (otherBiome === b || otherBiome === false) return;
            const op = BIOME_PALETTE[otherBiome];
            const m = 0.25;
            r  = r  * (1 - m) + lerp(op[0][0], op[1][0], n) * m;
            g  = g  * (1 - m) + lerp(op[0][1], op[1][1], n) * m;
            bl = bl * (1 - m) + lerp(op[0][2], op[1][2], n) * m;
          };
          blend(nbr); blend(nbu);
        }

        // Soil-darken: richer soil → slightly darker, more saturated land.
        if (b !== BIOME.WATER) {
          const soil = w.soil[i];
          const dark = soil * 18;
          r -= dark; g -= dark * 0.5; bl -= dark;
        }

        const j = (py * off.width + px) * 4;
        img.data[j  ] = clamp(r | 0, 0, 255);
        img.data[j+1] = clamp(g | 0, 0, 255);
        img.data[j+2] = clamp(bl | 0, 0, 255);
        img.data[j+3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this.biomeImage = off;
  }

  // Pre-compute a star field for night rendering.
  buildStarField() {
    const stars = [];
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.7,
        size: Math.random() < 0.85 ? 0.6 : 1.4,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    this.starField = stars;
  }

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
    this.buildStarField();
  }

  // ============================================================
  //                          MAIN DRAW
  // ============================================================
  draw(plants, agents, fx) {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const w = this.world;
    const cell = w.cell * this.zoom;

    // Follow-cam
    if (this.followId !== null) {
      const target = agents.find(a => a.id === this.followId && a.alive);
      if (target) {
        this.panX = W * 0.5 - target.x * cell;
        this.panY = H * 0.5 - target.y * cell;
      } else this.followId = null;
    }

    // 1. Sky background (visible where world doesn't reach)
    this._drawSky(ctx, W, H);

    // 2. Biome base
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.biomeImage,
      this.panX, this.panY, w.cols * cell, w.rows * cell);

    // 3. Animated water ripples
    this._drawWaterRipples(ctx, cell);

    // 4. Plants
    this._drawPlants(ctx, plants, cell);

    // 5. Under-animal particles
    this._drawParticles(ctx, fx, cell, 'under');

    // 6. Animals
    this._drawAnimals(ctx, agents, cell);

    // 7. Over-animal particles
    this._drawParticles(ctx, fx, cell, 'over');

    // 8. Weather
    this._drawWeather(ctx, W, H);

    // 9. Seasonal particles (drifting snow / leaves)
    this._spawnSeasonal(fx);
    this._drawParticles(ctx, fx, cell, 'seasonal');

    // 10. Day/night tint (smooth gradient)
    this._drawDayNight(ctx, W, H);

    // 11. Stars
    this._drawStars(ctx, W, H);

    // 12. Sun / moon
    this._drawCelestial(ctx, W, H);

    // 13. Vignette
    this._drawVignette(ctx, W, H);

    // 14. Selected halo
    if (this.followId !== null) {
      const target = agents.find(a => a.id === this.followId && a.alive);
      if (target) {
        const [sx, sy] = this.toScreen(target.x, target.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 15. HUD
    this._drawHud(ctx, W, H);
  }

  // ---------- sky gradient backdrop ----------
  _drawSky(ctx, W, H) {
    const w = this.world;
    const phase = w.dayPhase();
    // pick three keyframes by phase
    let topColor, botColor;
    if (phase < 0.20) {              // late night
      topColor = [10, 14, 30]; botColor = [20, 26, 48];
    } else if (phase < 0.30) {       // dawn
      const t = (phase - 0.20) / 0.10;
      topColor = lerp3([10,14,30], [80,60,90], t);
      botColor = lerp3([20,26,48], [240,150,90], t);
    } else if (phase < 0.45) {       // morning
      const t = (phase - 0.30) / 0.15;
      topColor = lerp3([80,60,90], [120,170,220], t);
      botColor = lerp3([240,150,90], [200,220,230], t);
    } else if (phase < 0.55) {       // noon
      topColor = [120, 170, 220]; botColor = [200, 220, 230];
    } else if (phase < 0.70) {       // afternoon
      const t = (phase - 0.55) / 0.15;
      topColor = lerp3([120,170,220], [180,110,80], t);
      botColor = lerp3([200,220,230], [255,180,110], t);
    } else if (phase < 0.80) {       // dusk
      const t = (phase - 0.70) / 0.10;
      topColor = lerp3([180,110,80], [40,30,60], t);
      botColor = lerp3([255,180,110], [80,40,80], t);
    } else {                          // night
      const t = (phase - 0.80) / 0.20;
      topColor = lerp3([40,30,60], [10,14,30], t);
      botColor = lerp3([80,40,80], [20,26,48], t);
    }
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgb(${topColor.map(v=>v|0).join(',')})`);
    grad.addColorStop(1, `rgb(${botColor.map(v=>v|0).join(',')})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- animated water ripples ----------
  _drawWaterRipples(ctx, cell) {
    const w = this.world;
    if (cell < 4) return; // skip on extreme zoom-out
    const x0 = Math.max(0, Math.floor(-this.panX / cell));
    const y0 = Math.max(0, Math.floor(-this.panY / cell));
    const x1 = Math.min(w.cols, Math.ceil((this.canvas.clientWidth - this.panX) / cell));
    const y1 = Math.min(w.rows, Math.ceil((this.canvas.clientHeight - this.panY) / cell));
    const t = w.tick * 0.05;

    ctx.save();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = w.idx(x, y);
        if (w.biome[i] !== BIOME.WATER) continue;
        const sx = x * cell + this.panX;
        const sy = y * cell + this.panY;
        // Sinusoidal brightness variation
        const ripple = Math.sin(x * 0.7 + y * 0.5 + t) * 0.5 + 0.5;
        const alpha = 0.08 + 0.10 * ripple;
        ctx.fillStyle = `rgba(180,220,240,${alpha})`;
        ctx.fillRect(sx, sy, cell, cell);

        // Tiny highlight streak
        if ((x + y + (t|0)) % 17 === 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx + cell * 0.2, sy + cell * 0.5);
          ctx.lineTo(sx + cell * 0.7, sy + cell * 0.5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // ---------- plants (sprite-based) ----------
  _drawPlants(ctx, plants, cell) {
    const w = this.world;
    const x0 = Math.max(0, Math.floor(-this.panX / cell));
    const y0 = Math.max(0, Math.floor(-this.panY / cell));
    const x1 = Math.min(w.cols, Math.ceil((this.canvas.clientWidth - this.panX) / cell));
    const y1 = Math.min(w.rows, Math.ceil((this.canvas.clientHeight - this.panY) / cell));
    const seasonName = w.seasonName();

    ctx.imageSmoothingEnabled = false;

    // Two passes so taller plants (trees) sort above shorter ones in
    // the same row band — gives a sense of depth.
    for (let pass = 0; pass < 2; pass++) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = w.idx(x, y);
          const k = plants.kind[i];
          if (!k) continue;
          const isTall = k === 3;
          if (pass === 0 && isTall) continue;     // trees on pass 1
          if (pass === 1 && !isTall) continue;
          const e = plants.energy[i];
          const def = CFG.plants[PLANT_LIST[k - 1]];
          const t = clamp(e / def.maxEnergy, 0.1, 1);
          const stage = t > 0.7 ? 2 : t > 0.35 ? 1 : 0;

          const name = PLANT_LIST[k - 1];
          const sprite = this.atlas.getPlant(name, stage, seasonName);
          // each "sprite pixel" maps to (cell / 8) world pixels for grass, etc.
          // Render so the sprite sits on its cell:
          //   grass: 8x8  → 1×1 cell
          //   bush:  12x12 → roughly 1.5×1.5 cells (centered)
          //   tree:  16x22 → ~2×2.7 cells (rooted at bottom of cell)
          let scale = (cell * (k === 1 ? 1.0 : k === 2 ? 1.4 : 1.7)) / sprite.width;
          // crisp scaling: snap to nearest 0.5 multiple at high zoom
          if (scale > 1) scale = Math.round(scale * 2) / 2;
          const dw = sprite.width * scale;
          const dh = sprite.height * scale;
          const sx = x * cell + this.panX + (cell - dw) / 2;
          const sy = y * cell + this.panY + (cell - dh) +
                     (k === 1 ? 0 : k === 2 ? cell * 0.1 : 0); // root tree/bush at cell base

          // soft ground shadow under tall plants
          if (k >= 2) {
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            ctx.beginPath();
            ctx.ellipse(sx + dw / 2, y * cell + this.panY + cell * 0.95,
                        dw * 0.30, cell * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.drawImage(sprite, sx, sy, dw, dh);
        }
      }
    }
  }

  // ---------- animals (sprite-based) ----------
  _drawAnimals(ctx, agents, cell) {
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      const sx = a.x * cell + this.panX;
      const sy = a.y * cell + this.panY;
      if (sx < -40 || sy < -40 || sx > this.canvas.clientWidth + 40 || sy > this.canvas.clientHeight + 40) continue;

      const isLargeDeer = a.species === 'deer' && a.size > 1.4;
      const sprite = this.atlas.getAnimal(a.species, Math.floor(a.walkDist * 0.7), isLargeDeer);

      // Choose pixel scale per-species so sprites read at game scale.
      // Aim for sprite to be roughly (size * 4 cells) wide on screen.
      const desiredW = a.size * 4 * cell;
      let scale = desiredW / sprite.width;
      // Snap to integer (or half-integer) scales for crispness
      if (scale >= 2) scale = Math.round(scale);
      else if (scale >= 1) scale = Math.round(scale * 2) / 2;
      else scale = 0.5; // never shrink below half-scale
      const dw = sprite.width * scale;
      const dh = sprite.height * scale;

      // Soft drop shadow under sprite
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + dh * 0.45, dw * 0.42, dh * 0.10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Energy → alpha (low-energy animals look faded)
      const eAlpha = clamp(a.energy / 1.4, 0.55, 1);
      ctx.globalAlpha = eAlpha;

      // Mirror by facing direction
      ctx.save();
      ctx.translate(sx, sy);
      if (a.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();

      ctx.globalAlpha = 1;

      // Subtle hue tint for genetic drift visualization
      if (a.hue !== undefined) {
        const baseHue = CFG.species[a.species].genes.hue.mean;
        const drift = a.hue - baseHue;
        if (Math.abs(drift) > 6) {
          ctx.save();
          ctx.translate(sx, sy);
          if (a.facing < 0) ctx.scale(-1, 1);
          ctx.globalCompositeOperation = 'source-atop';
          // draw the sprite again, then tint
          ctx.fillStyle = `hsla(${a.hue},60%,50%,${0.10 + Math.min(0.20, Math.abs(drift) / 60)})`;
          ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
          ctx.restore();
        }
      }

      // Pregnancy glow ring
      if (a.pregnant > 0) {
        ctx.strokeStyle = 'rgba(255,160,200,0.85)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(sx, sy, dw * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hunting indicator: predator with prey close
      if (a.huntCooldown > 18) {
        ctx.strokeStyle = 'rgba(255,60,60,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, dw * 0.50, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ---------- particles ----------
  _drawParticles(ctx, fx, cell, layer) {
    for (let i = 0; i < fx.particles.length; i++) {
      const p = fx.particles[i];
      let inLayer;
      if (layer === 'under')    inLayer = p.kind === 'graze';
      else if (layer === 'over') inLayer = p.kind === 'blood' || p.kind === 'heart';
      else                       inLayer = p.kind === 'leaf' || p.kind === 'snow';
      if (!inLayer) continue;
      const [sx, sy] = this.toScreen(p.x, p.y);
      const a = p.life / p.max;

      if (p.kind === 'snow') {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * this.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'leaf') {
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.spin || 0);
        ctx.fillStyle = `hsl(${p.hue}, 70%, 50%)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * this.zoom * 1.2, p.size * this.zoom * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'blood') {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#a02525';
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * this.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'graze') {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#9ed27a';
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * this.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'heart') {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ff85b3';
        // mini heart
        const r = p.size * this.zoom;
        ctx.beginPath();
        ctx.arc(sx - r * 0.4, sy, r * 0.5, 0, Math.PI * 2);
        ctx.arc(sx + r * 0.4, sy, r * 0.5, 0, Math.PI * 2);
        ctx.moveTo(sx - r, sy + r * 0.2);
        ctx.lineTo(sx, sy + r * 1.1);
        ctx.lineTo(sx + r, sy + r * 0.2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _spawnSeasonal(fx) {
    const w = this.world;
    const season = w.seasonName();
    if (season !== this._lastSeason) {
      // light reset of seasonal-only particles to avoid wrong-season carryover
      this._lastSeason = season;
    }
    const isSnowing = season === 'winter';
    const isLeafing = season === 'autumn';
    if (!isSnowing && !isLeafing) return;
    const rate = isSnowing ? 0.25 : 0.10;
    if (Math.random() < rate) {
      const x = Math.random() * w.cols;
      const y = Math.random() * 0.4 * w.rows; // start near top
      if (isSnowing) fx.spawnSnow(x, y);
      else           fx.spawnLeaf(x, y);
    }
  }

  // ---------- weather ----------
  _drawWeather(ctx, W, H) {
    const w = this.world;
    if (w.weather !== 'rain') return;
    ctx.strokeStyle = 'rgba(170,200,230,0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 100; i++) {
      const x = ((i * 73 + w.tick * 6) % (W + 30)) - 15;
      const y = ((i * 137 + w.tick * 22) % (H + 40)) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 12);
    }
    ctx.stroke();
  }

  // ---------- day/night gradient overlay ----------
  _drawDayNight(ctx, W, H) {
    const w = this.world;
    const dl = w.daylight();
    if (dl >= 0.97) return;
    const phase = w.dayPhase();
    let r = 8, g = 12, b = 30, alpha = (1 - dl) * 0.50;
    // Warmer dusk/dawn
    if (phase > 0.65 && phase < 0.78) { r = 50; g = 25; b = 35; alpha *= 0.85; }
    if (phase > 0.20 && phase < 0.32) { r = 40; g = 30; b = 50; alpha *= 0.85; }
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${alpha * 0.6})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- stars ----------
  _drawStars(ctx, W, H) {
    const w = this.world;
    const dl = w.daylight();
    if (dl > 0.5) return;
    const a = (0.5 - dl) * 2;
    for (const s of this.starField) {
      if (s.x > W || s.y > H) continue;
      const tw = 0.5 + 0.5 * Math.sin(w.tick * 0.04 + s.twinkle);
      ctx.globalAlpha = a * (0.4 + 0.6 * tw);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- sun / moon ----------
  _drawCelestial(ctx, W, H) {
    const w = this.world;
    const phase = w.dayPhase();
    // Sun arcs across the top during 0.20..0.80
    const inDay = phase > 0.20 && phase < 0.80;
    const t = inDay ? (phase - 0.20) / 0.60 : (phase < 0.20 ? phase + 0.20 : phase - 0.80) / 0.40;
    const sunX = lerp(W * 0.05, W * 0.95, inDay ? t : t);
    const sunY = inDay
      ? H * (0.05 + 0.55 * Math.pow(2 * t - 1, 2))   // parabolic arc
      : H * (0.10 + 0.50 * Math.pow(2 * t - 1, 2));

    if (inDay) {
      // sun glow
      const grad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
      grad.addColorStop(0, 'rgba(255,240,200,0.8)');
      grad.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sunX - 70, sunY - 70, 140, 140);
      ctx.fillStyle = 'rgba(255,235,170,0.95)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // moon
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 50);
      glow.addColorStop(0, 'rgba(220,230,255,0.5)');
      glow.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
      ctx.fillStyle = 'rgba(230,235,255,0.95)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
      ctx.fill();
      // moon shadow
      ctx.fillStyle = 'rgba(40,50,80,0.45)';
      ctx.beginPath();
      ctx.arc(sunX + 4, sunY - 1, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- vignette ----------
  _drawVignette(ctx, W, H) {
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.45, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- HUD ----------
  _drawHud(ctx, W, H) {
    const w = this.world;
    const phase = w.dayPhase();
    let timeName = 'night';
    if (phase >= 0.20 && phase < 0.32) timeName = 'dawn';
    else if (phase >= 0.32 && phase < 0.68) timeName = 'day';
    else if (phase >= 0.68 && phase < 0.80) timeName = 'dusk';
    const txt = `${w.seasonName().toUpperCase()}  ·  ${timeName}  ·  ${w.weather}  ·  ${w.temperature().toFixed(1)}°`;
    ctx.font = '11px ui-monospace, monospace';
    const tw = ctx.measureText(txt).width + 18;
    ctx.fillStyle = 'rgba(8,12,20,0.7)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, 10, 10, tw, 24, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8eef6';
    ctx.fillText(txt, 19, 26);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// helper: linear interpolation of 3-vectors
function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
