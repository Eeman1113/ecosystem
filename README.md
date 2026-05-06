# Ecosystem

A self-sustaining, evolving virtual world that runs entirely in the browser. Plants grow, herbivores graze, predators hunt, and over thousands of generations every species' genome drifts under selection. No libraries — vanilla JavaScript, HTML5 Canvas, and roughly 1,800 lines of code.

**[▶ Live demo](https://eeman1113.github.io/ecosystem/)**

---

## What's actually in here

A real (small-scale) ecology, not just a few sprites bouncing around. Energy is conserved end to end, populations cycle the way real predator–prey systems do, and the genetic code of every animal you see was inherited (with mutation) from a parent that survived long enough to reproduce.

### The food web

```
        sunlight
           │
           ▼
   ┌──────────────┐
   │ grass / bush │           soil ◄──────┐
   │   / tree     │             ▲         │
   └──────┬───────┘             │         │
          │                     │   corpses leak nutrients
          ▼                     │         │
   ┌──────────────┐  eats  ┌────┴───────┐ │
   │ rabbit / deer├───────►│ fox / wolf │─┘
   └──────────────┘        └────────────┘
```

Sunlight feeds plants. Plants feed herbivores. Herbivores feed predators. Every animal that dies — whether to old age, hunger, thirst, or teeth — leaves a corpse that decays back into soil, fertilizing the patch where the next generation of plants grows. Nothing leaves the system.

### Four species

| Species | Role | Diet | Notable trait |
|---|---|---|---|
| 🐇 Rabbit | Small herbivore | grass, bush | Fast, fearful, breeds quickly |
| 🦌 Deer | Large herbivore | bush, tree | Slow to breed, harder to kill, big payload |
| 🦊 Fox | Small predator | rabbit | Lone hunter, fast, modest size |
| 🐺 Wolf | Large predator | deer, rabbit | Pack-hunts — combined size beats lone wolves |

### Three plant species

- **Grass** — fast growth, low energy. Spreads aggressively across plains.
- **Bush** — medium growth, medium energy. Likes mixed terrain.
- **Tree** — slow growth, high energy, dominates forests. Takes multiple bites to deplete.

Each plant has its own preferred biome, season response, and growth rate.

### A world with weather and seasons

- **Day/night cycle** — about 1,500 ticks per day. Plants photosynthesize less at night. The world tints blue under moonlight, warm at dawn and dusk.
- **Seasons** — spring/summer/autumn/winter modulate plant growth (winter is harsh, spring is lush).
- **Weather** — random rain events boost moisture and plant growth; droughts dry the land and stress every layer of the food web.
- **Biomes** — water, sand, plain, forest, rock. Generated from value noise. Animals avoid water, drink at its edges, and prefer biomes their diet supports.

### Heritable genetics

Every animal carries a **genome** — an object of named, real-valued genes. Different species have different genes:

| Gene | Effect | Species |
|---|---|---|
| `speed` | Max movement speed | all |
| `vision` | Sense radius for food/threats | all |
| `metabolism` | Per-tick energy burn (lower is more efficient) | all |
| `size` | Body size (affects food yield + combat) | all |
| `reproThresh` | Energy required to attempt breeding | all |
| `hue` | Body color — visually shows lineage drift | all |
| `aggression` | Likelihood to commit to a hunt | predators |
| `packRadius` | How far the wolf cohesion drive reaches | wolves |

When two animals breed, the child inherits the **average of its parents' genes**, plus a small Gaussian mutation per gene (and an occasional larger jump). Asexual mutation occurs when a single animal gives birth without a partner.

The result is real evolution. Watch the **trait drift chart** in the right panel — under predation pressure, rabbit `speed` typically rises and `vision` widens. If foxes get sparse, rabbit `metabolism` often drifts downward (lazier rabbits survive). If you crank the `mutation` slider, populations diverge faster and crash more often.

### Behaviour

Animals aren't just particles. Each one runs a small behaviour loop every tick:

1. **Sense** — scan the local grid for food, water, and threats.
2. **Decide** — weighted desires:
   - flee predators (highest priority for prey)
   - drink if thirsty
   - hunt or graze if hungry
   - find a mate if well-fed and not pregnant
   - wander otherwise
3. **Move** — steer toward the chosen target with inertia and a per-individual speed cap.
4. **Eat / hunt / drink** — apply the action if in range. Hunts are probabilistic: success depends on the attacker's `size × aggression` vs. the defender's `size + speed`, with pack bonuses for nearby wolves.
5. **Reproduce** — animals mate when two of the same species stand next to each other and both meet the energy threshold. Pregnancy lasts ~80 ticks. The newborn inherits a mutated genome.
6. **Die** — when energy hits zero, age maxes out, or thirst is fatal. The body becomes a corpse that fertilizes soil.

### What you can do

- **Click an animal** to inspect its full genome and lineage (generation #).
- **Shift-click an animal** (or hit the *Follow camera* button in the inspector) to lock the camera onto it.
- **Click empty ground** to drop fertilizer (boosts soil + plants in a small radius).
- **Drag** to pan, **scroll** to zoom.
- **Sliders** scale plant growth, herbivore metabolism, predator metabolism, and mutation rate.
- **Save / Load** writes the whole world (terrain + plants + animals + genomes) to localStorage so you can return to a long-running run.
- **Snapshot** exports the current canvas as PNG.
- **Hotkeys**: `Space` pause, `+`/`-` zoom, `R` reset, `F` follow selected.

---

## How it's built

### File layout

```
ecosystem/
├── index.html          # shell + UI markup
├── styles.css          # full UI styling
└── src/
    ├── config.js       # every tunable parameter
    ├── utils.js        # math + helpers
    ├── genetics.js     # gene mutation & crossover
    ├── world.js        # grid, biomes, time-of-day, weather
    ├── plants.js       # multi-species plant growth
    ├── agents.js       # animal behaviour, hunting, mating
    ├── render.js       # canvas drawing, particles, follow-cam
    ├── charts.js       # population + trait-drift charts
    ├── ui.js           # control wiring, inspector, hover tip
    └── main.js         # bootstrap + main loop
```

### Performance

- The world grid is stored in `Uint8Array` / `Float32Array` typed arrays — no per-cell objects, no GC pressure.
- Plants update **¼ of cells per tick**, with growth rates pre-multiplied by 4 to preserve average rate. This keeps a 12,000-cell map smooth.
- Agents use a **spatial hash** (rebuilt once per tick) for `O(1)` nearest-neighbor lookups — no `O(n²)` scans.
- Particles, charts, and the biome layer are all rendered with cached buffers where possible.

### Why this is genuinely "self-sustaining"

The system has multiple negative feedback loops that prevent runaway growth and total collapse:

1. **Density-dependent reproduction** — when rabbits crowd a patch they breed less (carrying capacity emerges).
2. **Predator–prey cycle** — foxes overfeed → rabbits crash → foxes starve → rabbits recover → foxes recover.
3. **Soil nutrient cycle** — corpses fertilize the local soil, so a population crash leaves a windfall of plant growth in its wake.
4. **Diet specialization** — wolves can take down deer (rabbits aren't enough), foxes can't, so wolves don't simply outcompete foxes.
5. **Seasonal pressure** — winter slows plant regrowth, culling animals who can't budget their energy through the cold.

Run it long enough and you'll watch populations rise, oscillate, occasionally crash a single species — and recover.

---

## Running locally

ES modules require a server (won't run on `file://` due to browser CORS). Any static server works:

```sh
# python
python3 -m http.server 8000

# or node
npx serve

# then open
http://localhost:8000
```

## License

MIT — see `LICENSE`.

## Credits

Built by [Eeman Majumder](https://github.com/Eeman1113). Inspired by classic Lotka–Volterra dynamics, NEAT-style evolutionary simulations, and a lot of staring at ant colonies.
