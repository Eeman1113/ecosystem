// =============================================================
// AGENTS — animal entities. Four species share the same Animal
// class but specialize via their species spec and genome.
//
// Each animal has:
//   • genes (heritable, mutated at reproduction)
//   • energy (food)
//   • thirst (separate stat — water tiles refill it)
//   • age, generation, lineage id
//   • short-term memory of recent food/danger positions
//
// Behaviour is steered by weighted desires:
//   prey: graze + flee + drink + mate
//   predators: hunt + drink + mate + (wolves) pack-cohesion
// =============================================================

import { CFG, SPECIES_LIST } from './config.js';
import { BIOME } from './world.js';
import { rand, randi, clamp, gaussian, dist2, hsl } from './utils.js';
import { randomGenome, mutateGenome, crossover } from './genetics.js';

let _nextId = 1;

export class Animal {
  constructor(species, x, y, genome, generation = 0) {
    this.id = _nextId++;
    this.species = species;
    this.spec = CFG.species[species];
    this.x = x;
    this.y = y;
    this.vx = rand(-1, 1) * 0.1;
    this.vy = rand(-1, 1) * 0.1;
    this.genes = genome ?? randomGenome(this.spec);
    this.energy = this.spec.kind === 'predator' ? 1.2 : 0.7;
    this.thirst = 0.0; // 0 fine, 1 dying of thirst
    this.age = 0;
    this.generation = generation;
    this.alive = true;
    this.gestation = 0;     // ticks until ready to breed again
    this.lastSeenWater = null;
    this.lastSeenFood  = null;
    this.lastDanger    = null;
    this.lastDangerAge = 1e9;
    this.huntCooldown = 0;  // brief cooldown after a hunt attempt
    this.pregnant = 0;      // remaining ticks of pregnancy
    this.pregnancyMate = null;
    this.walkDist = Math.random() * 4; // accumulated motion for animation frames
    this.facing = 1;        // +1 right, -1 left
  }

  get speed()        { return this.genes.speed; }
  get vision()       { return this.genes.vision; }
  get metabolism()   { return this.genes.metabolism; }
  get size()         { return this.genes.size; }
  get reproThresh()  { return this.genes.reproThresh; }
  get aggression()   { return this.genes.aggression ?? 0.5; }
  get packRadius()   { return this.genes.packRadius ?? 0; }
  get hue()          { return this.genes.hue; }

  // -------- core update --------
  step(world, plants, hash, agents, fx) {
    this.age++;
    this.gestation = Math.max(0, this.gestation - 1);
    this.huntCooldown = Math.max(0, this.huntCooldown - 1);
    this.lastDangerAge++;

    // ----- sensing -----
    this._sense(world, plants, hash);

    // ----- decide motion -----
    let wantX = (Math.random() - 0.5) * 0.8;
    let wantY = (Math.random() - 0.5) * 0.8;
    let speedMul = 1.0;

    // Water seeking when thirsty
    if (this.thirst > 0.55 && this.lastSeenWater) {
      wantX = this.lastSeenWater.x - this.x;
      wantY = this.lastSeenWater.y - this.y;
      const d = Math.hypot(wantX, wantY) || 1;
      wantX /= d; wantY /= d;
    } else if (this.spec.kind === 'prey') {
      this._steerPrey(world, plants, agents);
      ({ wantX, wantY, speedMul } = this._lastSteer);
    } else {
      this._steerPredator(world, agents);
      ({ wantX, wantY, speedMul } = this._lastSteer);
    }

    // ----- locomotion -----
    const inertia = 0.85;
    this.vx = this.vx * inertia + wantX * 0.10;
    this.vy = this.vy * inertia + wantY * 0.10;

    // Don't walk into water (unless thirsty and at the edge)
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (world.isWater(nx, ny)) {
      // bounce
      this.vx *= -0.5; this.vy *= -0.5;
    }

    const sp = Math.hypot(this.vx, this.vy) || 1;
    const maxS = this.speed * speedMul * (this.thirst > 0.7 ? 0.7 : 1);
    if (sp > maxS) { this.vx = this.vx / sp * maxS; this.vy = this.vy / sp * maxS; }

    // Move with toroidal wrap
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0) this.x += world.cols; if (this.x >= world.cols) this.x -= world.cols;
    if (this.y < 0) this.y += world.rows; if (this.y >= world.rows) this.y -= world.rows;

    // Accumulate motion for sprite animation; lock facing direction
    const stepMag = Math.hypot(this.vx, this.vy);
    this.walkDist += stepMag;
    if (Math.abs(this.vx) > 0.05) this.facing = this.vx >= 0 ? 1 : -1;

    // ----- metabolism + thirst -----
    this.energy -= this.metabolism + Math.hypot(this.vx, this.vy) * this.spec.moveCost;
    this.thirst += this.spec.thirstRate;
    if (this.thirst > 1.2) this.energy -= 0.003; // dehydration damage

    // ----- drink if at water edge -----
    if (this._waterAdjacent(world)) {
      this.thirst = Math.max(0, this.thirst - 0.06);
    }

    // ----- graze if prey -----
    if (this.spec.kind === 'prey') {
      const cx = clamp(Math.floor(this.x), 0, world.cols - 1);
      const cy = clamp(Math.floor(this.y), 0, world.rows - 1);
      const i = world.idx(cx, cy);
      const gained = plants.graze(i, this.spec.diet);
      if (gained > 0) {
        this.energy = Math.min(this.spec.kind === 'prey' ? 2.2 : 2.6,
                               this.energy + gained * this.spec.eatGain);
      }
    }

    // ----- pregnancy -----
    if (this.pregnant > 0) {
      this.pregnant--;
      if (this.pregnant === 0) {
        // birth
        const partner = this.pregnancyMate;
        const childGenes = partner ? crossover(this.genes, partner, this.spec)
                                   : mutateGenome(this.genes, this.spec);
        const baby = new Animal(this.species, this.x, this.y, childGenes, this.generation + 1);
        baby.energy = this.spec.reproCost * 0.65;
        agents.push(baby);
        this.pregnancyMate = null;
      }
    }

    // ----- death -----
    if (this.energy <= 0 || this.age > this.spec.maxAge || this.thirst > 1.6) {
      this.alive = false;
      plants.dropCorpse(this.x, this.y, this.size * 0.7);
      fx.spawnDeath(this.x, this.y, this.species, this.size);
    }
  }

  _waterAdjacent(world) {
    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!world.inBounds(nx, ny)) continue;
        if (world.biome[world.idx(nx, ny)] === BIOME.WATER) return true;
      }
    }
    return false;
  }

  // ----- sense surroundings, fill memory slots -----
  _sense(world, plants, hash) {
    const VR = this.vision;
    const cx = Math.floor(this.x), cy = Math.floor(this.y);

    // Look for water in vision (sample sparsely)
    if (this.thirst > 0.4 && (!this.lastSeenWater || Math.random() < 0.05)) {
      let bestD = Infinity, best = null;
      for (let dy = -VR; dy <= VR; dy += 2) {
        for (let dx = -VR; dx <= VR; dx += 2) {
          const xx = cx + dx, yy = cy + dy;
          if (!world.inBounds(xx, yy)) continue;
          if (world.biome[world.idx(xx, yy)] !== BIOME.WATER) continue;
          const d = dx*dx + dy*dy;
          if (d < bestD) { bestD = d; best = { x: xx, y: yy }; }
        }
      }
      if (best) this.lastSeenWater = best;
    }
  }

  // ----- prey steering: graze + flee predators + mate -----
  _steerPrey(world, plants, agents) {
    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    const VR = this.vision;

    // Best food in sight
    let bestScore = 0, foodX = 0, foodY = 0;
    for (let dy = -VR; dy <= VR; dy += 2) {
      for (let dx = -VR; dx <= VR; dx += 2) {
        const xx = cx + dx, yy = cy + dy;
        if (!world.inBounds(xx, yy)) continue;
        const i = world.idx(xx, yy);
        const k = plants.kind[i];
        if (!k) continue;
        const name = ['grass','bush','tree'][k - 1];
        if (!this.spec.diet.includes(name)) continue;
        const e = plants.energy[i];
        const d2 = dx*dx + dy*dy + 1;
        const score = e / Math.sqrt(d2);
        if (score > bestScore) { bestScore = score; foodX = dx; foodY = dy; }
      }
    }

    // Flee predators
    let fearX = 0, fearY = 0, threatened = false;
    const threatRadius = this.spec.fearRadius + this.vision * 0.2;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a === this || !a.alive) continue;
      if (a.spec.kind !== 'predator') continue;
      // only fear if predator's diet includes our species
      if (!a.spec.diet.includes(this.species)) continue;
      const dx = this.x - a.x, dy = this.y - a.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < threatRadius * threatRadius && d2 > 0.01) {
        const w = 1 / d2;
        fearX += dx * w; fearY += dy * w;
        threatened = true;
        if (d2 < 25) { this.lastDanger = { x: a.x, y: a.y }; this.lastDangerAge = 0; }
      }
    }

    // Mate seek if ready and no threat
    let mateX = 0, mateY = 0, mating = false;
    if (!threatened && this.energy > this.reproThresh && this.gestation === 0 && this.pregnant === 0) {
      let bestD = Infinity;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a === this || !a.alive || a.species !== this.species) continue;
        if (a.energy < a.reproThresh) continue;
        if (a.gestation > 0 || a.pregnant > 0) continue;
        const d = dist2(this.x, this.y, a.x, a.y);
        if (d < bestD && d < this.vision * this.vision) { bestD = d; mateX = a.x - this.x; mateY = a.y - this.y; mating = true; }
      }
    }

    let wantX, wantY, speedMul = 1;
    if (threatened) {
      wantX = fearX; wantY = fearY;
      const m = Math.hypot(wantX, wantY) || 1;
      wantX = wantX / m * 2; wantY = wantY / m * 2;
      speedMul = 1.4;
    } else if (mating) {
      const m = Math.hypot(mateX, mateY) || 1;
      wantX = mateX / m; wantY = mateY / m;
    } else if (bestScore > 0) {
      wantX = foodX * 0.4; wantY = foodY * 0.4;
    } else {
      wantX = (Math.random() - 0.5) * 0.8;
      wantY = (Math.random() - 0.5) * 0.8;
    }
    this._lastSteer = { wantX, wantY, speedMul };
  }

  // ----- predator steering: hunt + (wolves) pack + mate -----
  _steerPredator(world, agents) {
    const VR = this.vision;
    let bestD = Infinity, target = null;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a === this || !a.alive) continue;
      if (!this.spec.diet.includes(a.species)) continue;
      const d = dist2(this.x, this.y, a.x, a.y);
      if (d < VR * VR && d < bestD) { bestD = d; target = a; }
    }

    // Pack cohesion (wolves)
    let packX = 0, packY = 0, packCount = 0;
    if (this.species === 'wolf' && this.packRadius > 0) {
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a === this || !a.alive || a.species !== 'wolf') continue;
        const dx = a.x - this.x, dy = a.y - this.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < this.packRadius * this.packRadius && d2 > 0.01) {
          packX += dx; packY += dy; packCount++;
        }
      }
      if (packCount > 0) { packX /= packCount; packY /= packCount; }
    }

    // Mate seek when sated
    let mateX = 0, mateY = 0, mating = false;
    if (this.energy > this.reproThresh && this.gestation === 0 && this.pregnant === 0) {
      let bd = Infinity;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a === this || !a.alive || a.species !== this.species) continue;
        if (a.energy < a.reproThresh) continue;
        if (a.gestation > 0 || a.pregnant > 0) continue;
        const d = dist2(this.x, this.y, a.x, a.y);
        if (d < bd && d < VR * VR) { bd = d; mateX = a.x - this.x; mateY = a.y - this.y; mating = true; }
      }
    }

    let wantX, wantY, speedMul = 1;
    if (target && this.huntCooldown === 0) {
      // hunt — bias by aggression: timid wolves disengage at distance
      const dx = target.x - this.x, dy = target.y - this.y;
      const d = Math.sqrt(bestD) || 1;
      const willHunt = this.aggression > rand(0, 1) || d < 6;
      if (willHunt) {
        wantX = dx / d; wantY = dy / d;
        speedMul = 1.25;
        // try to bite if in range
        const huntR = this.spec.huntRadius * (0.6 + 0.6 * this.size);
        if (d < huntR) this._tryHunt(target, packCount);
      } else {
        wantX = (Math.random() - 0.5) * 0.8;
        wantY = (Math.random() - 0.5) * 0.8;
      }
    } else if (mating) {
      const m = Math.hypot(mateX, mateY) || 1;
      wantX = mateX / m; wantY = mateY / m;
    } else if (packCount > 0 && Math.random() < 0.4) {
      const m = Math.hypot(packX, packY) || 1;
      wantX = packX / m * 0.5; wantY = packY / m * 0.5;
    } else {
      wantX = (Math.random() - 0.5) * 0.8;
      wantY = (Math.random() - 0.5) * 0.8;
    }
    this._lastSteer = { wantX, wantY, speedMul };
  }

  // resolve a hunt attempt against a prey animal
  _tryHunt(prey, packBonus) {
    const attacker = this.size * (0.6 + 0.6 * this.aggression);
    const defender = prey.size * (0.6 + 0.6 * prey.speed);
    // pack hunting: each wolf in pack range adds a small bonus
    const packMul = 1 + 0.15 * Math.min(packBonus, 4);
    const p = (attacker * packMul) / (attacker * packMul + defender);
    this.huntCooldown = 25;
    if (Math.random() < p) {
      // success
      const meal = clamp(prey.size * this.spec.eatGain, 0.5, 2.0);
      this.energy = Math.min(2.6, this.energy + meal);
      prey.alive = false;
      prey._killed = true;
    } else {
      // failed hunt costs both
      this.energy -= 0.04;
      prey.energy -= 0.02;
    }
  }
}

// -------- spatial hash for cheap nearest-neighbor lookups --------
export class SpatialHash {
  constructor(world, cellSize = 5) {
    this.world = world;
    this.cellSize = cellSize;
    this.cols = Math.ceil(world.cols / cellSize);
    this.rows = Math.ceil(world.rows / cellSize);
    this.buckets = new Array(this.cols * this.rows);
  }
  rebuild(agents) {
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = null;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (!a.alive) continue;
      const cx = clamp(Math.floor(a.x / this.cellSize), 0, this.cols - 1);
      const cy = clamp(Math.floor(a.y / this.cellSize), 0, this.rows - 1);
      const k = cy * this.cols + cx;
      if (!this.buckets[k]) this.buckets[k] = [];
      this.buckets[k].push(a);
    }
  }
  near(x, y, radius) {
    const out = [];
    const r = Math.ceil(radius / this.cellSize);
    const cx = clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const cy = clamp(Math.floor(y / this.cellSize), 0, this.rows - 1);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= this.cols || yy >= this.rows) continue;
        const b = this.buckets[yy * this.cols + xx];
        if (!b) continue;
        for (const a of b) out.push(a);
      }
    }
    return out;
  }
}

// -------- mating handler — invoked once per tick from main --------
export function processMating(agents) {
  // pair animals of same species standing close that are both ready
  const taken = new Set();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a.alive || taken.has(a.id)) continue;
    if (a.energy < a.reproThresh) continue;
    if (a.gestation > 0 || a.pregnant > 0) continue;
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j];
      if (!b.alive || taken.has(b.id)) continue;
      if (b.species !== a.species) continue;
      if (b.energy < b.reproThresh) continue;
      if (b.gestation > 0 || b.pregnant > 0) continue;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < 4) {
        // chance gates frequency
        if (Math.random() < a.spec.reproChance * 4) {
          a.pregnant = 80 + randi(50);
          a.pregnancyMate = b.genes;
          a.energy -= a.spec.reproCost * 0.5;
          b.energy -= a.spec.reproCost * 0.5;
          a.gestation = 200;
          b.gestation = 80;
          taken.add(a.id); taken.add(b.id);
          break;
        }
      }
    }
  }
}
