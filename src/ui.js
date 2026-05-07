// =============================================================
// UI — wires DOM controls to the simulation. Owns:
//   • slider state
//   • species tabs (drives the trait-drift chart)
//   • inspector panel showing the selected agent's full genome
//   • hover tooltip
// =============================================================

import { CFG, SPECIES_LIST } from './config.js';
import { TOOLS } from './tools.js';

export class UI {
  constructor(sim) {
    this.sim = sim;
    this.tipEl = document.getElementById('hover-tip');
    this.bind();
  }

  bind() {
    const sim = this.sim;
    this._buildToolbar();
    this._bindZoom();

    // top buttons
    document.getElementById('btnPause').onclick = () => {
      sim.paused = !sim.paused;
      document.getElementById('btnPause').textContent = sim.paused ? 'Resume' : 'Pause';
    };
    document.getElementById('btnSpeed').onclick = () => {
      const speeds = [1, 2, 4, 8, 20];
      const i = (speeds.indexOf(sim.speed) + 1) % speeds.length;
      sim.speed = speeds[i];
      document.getElementById('btnSpeed').textContent = `${sim.speed}×`;
    };
    document.getElementById('btnReset').onclick = () => sim.reset();

    // seed buttons
    for (const btn of document.querySelectorAll('[data-seed]')) {
      btn.onclick = () => {
        const sp = btn.dataset.seed;
        const counts = { rabbit: 10, deer: 5, fox: 5, wolf: 3 };
        sim.seedSpecies(sp, counts[sp]);
      };
    }

    // sliders
    for (const id of ['sPlant','sRabbit','sFox','sMut']) {
      const el = document.getElementById(id);
      const v = document.getElementById('v' + id.slice(1));
      const apply = () => {
        v.textContent = parseFloat(el.value).toFixed(2);
        sim.tuning[id] = parseFloat(el.value);
      };
      el.addEventListener('input', apply);
      apply();
    }

    // save / load
    document.getElementById('btnSave').onclick = () => sim.save();
    document.getElementById('btnLoad').onclick = () => sim.load();
    document.getElementById('btnSnap').onclick = () => {
      const link = document.createElement('a');
      link.download = `ecosystem-${Date.now()}.png`;
      link.href = sim.renderer.canvas.toDataURL('image/png');
      link.click();
    };

    // species tabs
    for (const tab of document.querySelectorAll('#speciesTabs .tab')) {
      tab.onclick = () => {
        for (const t of document.querySelectorAll('#speciesTabs .tab')) t.classList.remove('active');
        tab.classList.add('active');
        sim.traitChart.setSpecies(tab.dataset.species);
        this._updateTraitLegend(tab.dataset.species);
      };
    }
    this._updateTraitLegend('rabbit');

    // hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); document.getElementById('btnPause').click(); }
      else if (e.key === '+' || e.key === '=') sim.zoomBy(1.2);
      else if (e.key === '-' || e.key === '_') sim.zoomBy(1/1.2);
      else if (e.key.toLowerCase() === 'r') sim.reset();
      else if (e.key.toLowerCase() === 'f') sim.followSelected();
    });

    // canvas interactions: pan/zoom/click/hover/brush
    const canvas = sim.renderer.canvas;
    let dragging = false, dragStart = null, painting = false;

    // Right-click is reserved for panning regardless of tool.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const isPanGesture = (e) => e.button === 2 || e.altKey || e.metaKey || sim.tools.current === 'cursor';

    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      dragStart = { sx, sy, panX: sim.renderer.panX, panY: sim.renderer.panY };
      dragging = false;
      painting = false;

      // If a non-cursor tool, apply on mousedown (and start paint).
      if (!isPanGesture(e)) {
        const [wx, wy] = sim.renderer.fromScreen(sx, sy);
        sim.tools.apply(wx, wy, false);
        painting = sim.tools.spec().paint;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      this.mouseScreen = { x: sx, y: sy };
      this._hover(sx, sy);

      if (dragStart) {
        const dx = sx - dragStart.sx, dy = sy - dragStart.sy;
        if (painting) {
          const [wx, wy] = sim.renderer.fromScreen(sx, sy);
          sim.tools.apply(wx, wy, true);
        } else if (Math.hypot(dx, dy) > 4) {
          // Pan only with cursor tool, alt/meta, or right-click
          if (isPanGesture(e) || e.buttons === 2) {
            dragging = true;
            sim.renderer.panX = dragStart.panX + dx;
            sim.renderer.panY = dragStart.panY + dy;
            sim.renderer.followId = null;
          }
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (!dragging && !painting && sim.tools.current === 'cursor') {
        const [wx, wy] = sim.renderer.fromScreen(sx, sy);
        sim.handleClick(wx, wy, e.shiftKey);
      }
      dragStart = null;
      dragging = false;
      painting = false;
    });
    canvas.addEventListener('mouseleave', () => {
      this.tipEl.style.display = 'none';
      dragStart = null;
      dragging = false;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
      sim.zoomAt(sx, sy, factor);
    }, { passive: false });

    window.addEventListener('resize', () => sim.resize());
  }

  // -------- toolbar --------
  _buildToolbar() {
    const sim = this.sim;
    const groups = {
      cursor: ['cursor'],
      life:   ['spawnRabbit', 'spawnDeer', 'spawnFox', 'spawnWolf'],
      boon:   ['rain', 'fertilize', 'heal', 'plantGrass', 'plantBush', 'plantTree'],
      doom:   ['lightning', 'fire', 'drought', 'smite'],
      terra:  ['terraWater', 'terraSand', 'terraPlain', 'terraForest', 'terraRock'],
    };
    for (const [cat, ids] of Object.entries(groups)) {
      const groupEl = document.querySelector(`.tool-group[data-cat="${cat}"]`);
      if (!groupEl) continue;
      groupEl.innerHTML = '';
      for (const id of ids) {
        const t = TOOLS[id];
        const btn = document.createElement('button');
        btn.className = `tool-btn cat-${cat}`;
        btn.dataset.tool = id;
        btn.innerHTML = `${t.label}<span class="label-tip">${t.name}</span>`;
        btn.onclick = () => {
          sim.tools.current = id;
          this._refreshToolbar();
          // Update brush slider to tool default
          const slider = document.getElementById('brushSize');
          slider.value = t.size;
          document.getElementById('brushSizeLabel').textContent = t.size;
          sim.tools.brushSize = null;
        };
        groupEl.appendChild(btn);
      }
    }
    // brush size
    const slider = document.getElementById('brushSize');
    const label  = document.getElementById('brushSizeLabel');
    slider.addEventListener('input', () => {
      sim.tools.brushSize = parseInt(slider.value, 10);
      label.textContent = slider.value;
    });
    this._refreshToolbar();
  }

  _refreshToolbar() {
    const cur = this.sim.tools.current;
    for (const btn of document.querySelectorAll('.tool-btn')) {
      btn.classList.toggle('active', btn.dataset.tool === cur);
    }
    // Update cursor
    const canvas = this.sim.renderer.canvas;
    canvas.style.cursor = cur === 'cursor' ? 'grab' : 'crosshair';
  }

  // -------- zoom buttons --------
  _bindZoom() {
    const sim = this.sim;
    document.getElementById('zIn').onclick    = () => sim.zoomBy(1.25);
    document.getElementById('zOut').onclick   = () => sim.zoomBy(1 / 1.25);
    document.getElementById('zReset').onclick = () => sim.resetZoom();
  }

  refreshZoomLabel() {
    const z = this.sim.renderer.zoom;
    document.getElementById('zoomLabel').textContent = (z * 100 | 0) + '%';
  }

  _hover(sx, sy) {
    const sim = this.sim;
    const [wx, wy] = sim.renderer.fromScreen(sx, sy);
    let best = null, bestD = 6;
    for (const a of sim.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!best) { this.tipEl.style.display = 'none'; return; }
    this.tipEl.style.display = 'block';
    this.tipEl.style.left = (sx + 14) + 'px';
    this.tipEl.style.top  = (sy - 30) + 'px';
    this.tipEl.textContent =
      `${best.species}  gen ${best.generation}\n` +
      `E ${best.energy.toFixed(2)}  thirst ${best.thirst.toFixed(2)}\n` +
      `age ${best.age}  speed ${best.speed.toFixed(2)}  vis ${best.vision.toFixed(0)}`;
  }

  _updateTraitLegend(species) {
    const spec = CFG.species[species];
    const colors = {
      speed:       'hsl(20,80%,60%)',
      vision:      'hsl(180,70%,60%)',
      metabolism:  'hsl(290,60%,65%)',
      size:        'hsl(50,80%,60%)',
      reproThresh: 'hsl(330,70%,65%)',
      hue:         'hsl(120,50%,60%)',
      aggression:  'hsl(0,70%,60%)',
      packRadius:  'hsl(220,70%,65%)',
    };
    const el = document.getElementById('traitLegend');
    el.innerHTML = '';
    for (const name of Object.keys(spec.genes)) {
      const div = document.createElement('div');
      div.innerHTML = `<span class="swatch" style="background:${colors[name] || '#fff'}"></span>${name}`;
      el.appendChild(div);
    }
  }

  // -------- inspector --------
  showInspector(agent) {
    const root = document.getElementById('inspectorBody');
    if (!agent) {
      root.innerHTML = '<div class="small">Click any animal to inspect its genome and lineage.</div>';
      return;
    }
    const spec = CFG.species[agent.species];
    let html = '';
    html += `<div class="stat"><span class="label">species</span><span class="val">${agent.species}</span></div>`;
    html += `<div class="stat"><span class="label">generation</span><span class="val">${agent.generation}</span></div>`;
    html += `<div class="stat"><span class="label">id</span><span class="val">#${agent.id}</span></div>`;
    html += `<div class="stat"><span class="label">age</span><span class="val">${agent.age} / ${agent.spec.maxAge}</span></div>`;
    html += `<div class="stat"><span class="label">energy</span><span class="val">${agent.energy.toFixed(2)}</span></div>`;
    html += `<div class="stat"><span class="label">thirst</span><span class="val">${agent.thirst.toFixed(2)}</span></div>`;
    if (agent.pregnant > 0) html += `<div class="stat"><span class="label">pregnant</span><span class="val">${agent.pregnant} ticks</span></div>`;
    html += `<h3>Genome</h3>`;
    for (const [name, def] of Object.entries(spec.genes)) {
      const v = agent.genes[name];
      const t = (v - def.min) / (def.max - def.min);
      html += `<div class="gene"><span>${name}</span><b>${v.toFixed(2)}</b></div>`;
      html += `<div class="gene-bar"><i style="width:${(t * 100).toFixed(1)}%"></i></div>`;
    }
    html += `<button id="btnFollow" class="primary" style="margin-top:8px;width:100%">Follow camera</button>`;
    root.innerHTML = html;
    document.getElementById('btnFollow').onclick = () => this.sim.renderer.followId = agent.id;
  }
}
