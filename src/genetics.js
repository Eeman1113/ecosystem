// =============================================================
// GENETICS — every animal carries a Genome made of named genes.
// Genes are heritable (with mutation) and drive behaviour & visuals.
// This is what produces *evolution* in the simulation: animals whose
// gene combinations survive better leave more offspring, and the
// population's mean trait values drift over generations.
// =============================================================

import { gaussian, clamp, rand } from './utils.js';

// Build a fresh genome from the species spec, drawing each gene from
// a normal distribution around its mean. This is used for the
// initial population.
export function randomGenome(speciesSpec) {
  const g = {};
  for (const [name, def] of Object.entries(speciesSpec.genes)) {
    const std = (def.max - def.min) * 0.18;
    g[name] = clamp(gaussian(def.mean, std), def.min, def.max);
  }
  return g;
}

// Sexual-style mutation from a single parent (asexual reproduction
// with mutation — a common simplification in evolutionary sims).
// Each gene independently has a chance to drift.
export function mutateGenome(parent, speciesSpec) {
  const child = {};
  for (const [name, def] of Object.entries(speciesSpec.genes)) {
    let v = parent[name];
    // Always apply small Gaussian drift; mutate-rate scales the std.
    const std = (def.max - def.min) * def.mutate;
    v = v + gaussian(0, std);
    // Occasional larger jumps to occasionally escape local optima.
    if (Math.random() < 0.02) {
      v = v + gaussian(0, std * 4);
    }
    child[name] = clamp(v, def.min, def.max);
  }
  return child;
}

// Cross two parents (used when same-species mating happens). Each
// gene is averaged + mutated. This produces gentler convergence.
export function crossover(a, b, speciesSpec) {
  const child = {};
  for (const [name, def] of Object.entries(speciesSpec.genes)) {
    let v = (a[name] + b[name]) * 0.5;
    const std = (def.max - def.min) * def.mutate;
    v = v + gaussian(0, std);
    if (Math.random() < 0.02) v = v + gaussian(0, std * 4);
    child[name] = clamp(v, def.min, def.max);
  }
  return child;
}

// Compute population mean for each gene across an array of agents.
// Returned object maps gene name → mean. Used by the trait-drift chart.
export function populationMeans(agents, speciesSpec) {
  if (agents.length === 0) return null;
  const means = {};
  for (const name of Object.keys(speciesSpec.genes)) means[name] = 0;
  for (const a of agents) {
    for (const name of Object.keys(speciesSpec.genes)) means[name] += a.genes[name];
  }
  for (const name of Object.keys(speciesSpec.genes)) means[name] /= agents.length;
  return means;
}
