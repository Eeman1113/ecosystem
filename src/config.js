// =============================================================
// CONFIG — every tunable lives here. Changing these reshapes the
// dynamics of the entire ecosystem; keep them in one place so the
// system can be reasoned about as a whole.
// =============================================================

export const CFG = {
  world: {
    cell: 7,                  // pixel size of one grid cell
    dayLength: 1500,          // ticks per full day/night cycle
    yearLength: 1500 * 16,    // ticks per year (16 days/year for visible seasons)
    rainChance: 0.0006,       // per tick chance to start rain
    rainDuration: [400, 1200],
    droughtChance: 0.00012,
    droughtDuration: [800, 2400],
    waterFraction: 0.05,      // approximate fraction of map that is water
    forestFraction: 0.18,
    rockFraction: 0.04,
  },

  plants: {
    grass: {
      maxEnergy: 1.0,
      growth: 0.012,
      spread: 0.04,
      bite: 0.18,
      energyPerBite: 0.20,
      seasonal: { spring: 1.4, summer: 1.0, autumn: 0.7, winter: 0.25 },
      biomeBonus: { plain: 1.0, forest: 0.4, sand: 0.3, rock: 0.05, water: 0 },
      color: [60, 150, 70],
    },
    bush: {
      maxEnergy: 1.6,
      growth: 0.005,
      spread: 0.012,
      bite: 0.22,
      energyPerBite: 0.32,
      seasonal: { spring: 1.3, summer: 1.0, autumn: 0.9, winter: 0.4 },
      biomeBonus: { plain: 0.7, forest: 1.2, sand: 0.5, rock: 0.2, water: 0 },
      color: [40, 110, 55],
    },
    tree: {
      maxEnergy: 3.0,
      growth: 0.0018,
      spread: 0.004,
      bite: 0.25,
      energyPerBite: 0.45,
      seasonal: { spring: 1.2, summer: 1.0, autumn: 1.0, winter: 0.6 },
      biomeBonus: { plain: 0.4, forest: 1.4, sand: 0.1, rock: 0.05, water: 0 },
      color: [30, 85, 40],
    },
  },

  // ----------- species defaults -----------
  // per-species defaults; individual animals deviate from these via genes.
  species: {
    rabbit: {
      diet: ['grass', 'bush'],
      kind: 'prey',
      startCount: 50,
      genes: {
        speed:        { mean: 0.42, min: 0.20, max: 0.85, mutate: 0.04 },
        vision:       { mean: 7,    min: 3,    max: 14,   mutate: 0.06 },
        metabolism:   { mean: 0.014,min: 0.007,max: 0.030,mutate: 0.05 },
        size:         { mean: 0.85, min: 0.55, max: 1.35, mutate: 0.04 },
        reproThresh:  { mean: 1.30, min: 0.95, max: 1.70, mutate: 0.04 },
        hue:          { mean: 36,   min: 0,    max: 60,   mutate: 0.10 },
      },
      maxAge: 1100,
      reproChance: 0.013,
      reproCost: 0.65,
      moveCost: 0.0012,
      thirstRate: 0.0009,
      fearRadius: 9,
      eatGain: 1.0,        // multiplier on plant energy
      bodyShape: 'oval',
    },
    deer: {
      diet: ['bush', 'tree'],
      kind: 'prey',
      startCount: 14,
      genes: {
        speed:        { mean: 0.55, min: 0.30, max: 0.90, mutate: 0.04 },
        vision:       { mean: 10,   min: 5,    max: 16,   mutate: 0.05 },
        metabolism:   { mean: 0.011,min: 0.006,max: 0.022,mutate: 0.05 },
        size:         { mean: 1.40, min: 1.00, max: 2.00, mutate: 0.04 },
        reproThresh:  { mean: 2.10, min: 1.50, max: 2.80, mutate: 0.04 },
        hue:          { mean: 22,   min: 10,   max: 38,   mutate: 0.08 },
      },
      maxAge: 1800,
      reproChance: 0.005,
      reproCost: 1.20,
      moveCost: 0.0015,
      thirstRate: 0.0011,
      fearRadius: 11,
      eatGain: 1.6,
      bodyShape: 'deer',
    },
    fox: {
      diet: ['rabbit'],
      kind: 'predator',
      startCount: 14,
      genes: {
        speed:        { mean: 0.58, min: 0.30, max: 1.00, mutate: 0.04 },
        vision:       { mean: 13,   min: 6,    max: 22,   mutate: 0.05 },
        metabolism:   { mean: 0.0075,min: 0.004,max: 0.018,mutate: 0.05 },
        size:         { mean: 1.00, min: 0.70, max: 1.50, mutate: 0.04 },
        reproThresh:  { mean: 1.55, min: 1.10, max: 2.20, mutate: 0.04 },
        aggression:   { mean: 0.55, min: 0.10, max: 1.00, mutate: 0.05 },
        hue:          { mean: 18,   min: 5,    max: 30,   mutate: 0.06 },
      },
      maxAge: 2000,
      reproChance: 0.022,
      reproCost: 0.80,
      moveCost: 0.0010,
      thirstRate: 0.0008,
      huntRadius: 1.4,
      eatGain: 0.85,
      bodyShape: 'fox',
    },
    wolf: {
      diet: ['deer', 'rabbit'],
      kind: 'predator',
      startCount: 5,
      genes: {
        speed:        { mean: 0.65, min: 0.30, max: 1.10, mutate: 0.04 },
        vision:       { mean: 16,   min: 8,    max: 26,   mutate: 0.05 },
        metabolism:   { mean: 0.0085,min: 0.005,max: 0.020,mutate: 0.05 },
        size:         { mean: 1.45, min: 1.00, max: 2.30, mutate: 0.04 },
        reproThresh:  { mean: 1.95, min: 1.40, max: 2.80, mutate: 0.04 },
        aggression:   { mean: 0.70, min: 0.25, max: 1.00, mutate: 0.05 },
        packRadius:   { mean: 12,   min: 4,    max: 22,   mutate: 0.04 },
        hue:          { mean: 220,  min: 200,  max: 250,  mutate: 0.04 },
      },
      maxAge: 2400,
      reproChance: 0.012,
      reproCost: 1.10,
      moveCost: 0.0011,
      thirstRate: 0.0009,
      huntRadius: 1.6,
      eatGain: 1.2,
      bodyShape: 'wolf',
    },
  },

  ui: {
    chartHistory: 480,
    traitHistory: 480,
  },
};

export const SPECIES_LIST = ['rabbit', 'deer', 'fox', 'wolf'];
export const PLANT_LIST = ['grass', 'bush', 'tree'];
