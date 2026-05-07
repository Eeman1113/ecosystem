// =============================================================
// SPRITES — hand-crafted pixel-art for every animal and plant.
//
// Each sprite is drawn at its native resolution (e.g. 16x12 logical
// pixels) into an offscreen canvas at startup, then blitted at
// integer scale with imageSmoothingEnabled=false for crisp pixels.
//
// Conventions (per pixel-art research):
//   • 4-frame trot cycle (contact / passing / contact-mirror / passing)
//   • Body bobs ±1 px between contact and passing frames
//   • 3–4 colors per sprite + selective dark outline
//   • All sprites face RIGHT; renderer mirrors via ctx.scale(-1, 1)
//   • Plants have 3 growth stages (stored in same atlas)
// =============================================================

// ---------- helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Draw a single pixel rect.
const px = (ctx, color, x, y, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

// =============================================================
//                          ANIMALS
// =============================================================

// ---- RABBIT (16 × 12) ----
// Compact body, tall ears, white tail dot. Hops, body bobs 2px.
function drawRabbit(ctx, frame) {
  const O = '#1d130a';   // outline (warm dark)
  const B = '#d6c2a0';   // body cream
  const D = '#a8916b';   // body shadow
  const L = '#f1e6c6';   // belly highlight
  const E = '#000';      // eye
  const N = '#c46a82';   // nose / inner ear pink
  const W = '#ffffff';   // tail puff

  // Body bob: contact frames (0, 2) sit slightly higher than passing (1, 3)
  const bob = (frame === 1 || frame === 3) ? 1 : 0;

  // ---- ears (always up) ----
  // Left ear
  px(ctx, O, 4, 0 + bob); px(ctx, O, 4, 1 + bob); px(ctx, O, 4, 2 + bob); px(ctx, O, 4, 3 + bob);
  px(ctx, O, 5, 0 + bob); px(ctx, B, 5, 1 + bob); px(ctx, B, 5, 2 + bob); px(ctx, B, 5, 3 + bob);
  px(ctx, O, 6, 0 + bob); px(ctx, O, 6, 1 + bob); px(ctx, O, 6, 2 + bob); px(ctx, O, 6, 3 + bob);
  // Inner pink (left)
  px(ctx, N, 5, 2 + bob);
  // Right ear
  px(ctx, O, 8, 0 + bob); px(ctx, O, 8, 1 + bob); px(ctx, O, 8, 2 + bob); px(ctx, O, 8, 3 + bob);
  px(ctx, O, 9, 0 + bob); px(ctx, B, 9, 1 + bob); px(ctx, B, 9, 2 + bob); px(ctx, B, 9, 3 + bob);
  px(ctx, O, 10, 0 + bob); px(ctx, O, 10, 1 + bob); px(ctx, O, 10, 2 + bob); px(ctx, O, 10, 3 + bob);
  px(ctx, N, 9, 2 + bob);

  // ---- head + body (one rounded blob) ----
  // top outline
  px(ctx, O, 3, 4 + bob); px(ctx, O, 4, 4 + bob); px(ctx, O, 5, 4 + bob); px(ctx, O, 6, 4 + bob);
  px(ctx, O, 7, 4 + bob); px(ctx, O, 8, 4 + bob); px(ctx, O, 9, 4 + bob); px(ctx, O, 10, 4 + bob);
  px(ctx, O, 11, 4 + bob); px(ctx, O, 12, 4 + bob);
  // body sides
  px(ctx, O, 2, 5 + bob); px(ctx, O, 13, 5 + bob);
  px(ctx, O, 1, 6 + bob); px(ctx, O, 14, 6 + bob);
  px(ctx, O, 1, 7 + bob); px(ctx, O, 14, 7 + bob);
  px(ctx, O, 2, 8 + bob); px(ctx, O, 13, 8 + bob);
  // body fill
  px(ctx, B, 3, 5 + bob, 10, 1);
  px(ctx, B, 2, 6 + bob, 12, 1);
  px(ctx, B, 2, 7 + bob, 12, 1);
  px(ctx, B, 3, 8 + bob, 10, 1);
  // belly highlight
  px(ctx, L, 4, 7 + bob, 8, 1);
  px(ctx, L, 5, 8 + bob, 6, 1);
  // shadow strip under belly
  px(ctx, D, 3, 8 + bob); px(ctx, D, 12, 8 + bob);

  // ---- eye + nose ----
  px(ctx, E, 11, 5 + bob);
  px(ctx, N, 13, 6 + bob);

  // ---- tail puff (left side) ----
  px(ctx, O, 0, 6 + bob); px(ctx, O, 0, 7 + bob);
  px(ctx, W, 1, 5 + bob); px(ctx, W, 1, 6 + bob);

  // ---- legs (animated trot, 2 px tall) ----
  // back legs at x ~3-4, front legs at x ~10-11
  // y starts at 9 + bob
  const yL = 9 + bob;
  let backX, frontX;
  if (frame === 0)      { backX = 3; frontX = 11; }   // contact
  else if (frame === 1) { backX = 4; frontX = 10; }   // passing
  else if (frame === 2) { backX = 4; frontX = 11; }   // contact mirror
  else                  { backX = 3; frontX = 10; }   // passing
  px(ctx, O, backX, yL); px(ctx, D, backX, yL + 1);
  px(ctx, O, backX + 1, yL); px(ctx, D, backX + 1, yL + 1);
  px(ctx, O, frontX, yL); px(ctx, D, frontX, yL + 1);
  px(ctx, O, frontX + 1, yL); px(ctx, D, frontX + 1, yL + 1);
}

// ---- FOX (20 × 12) ----
// Pointed ears, bushy tail with white tip, dark socks.
function drawFox(ctx, frame) {
  const O = '#1c0c06';   // outline
  const B = '#d2632a';   // rust
  const D = '#9a4318';   // dark rust shadow
  const L = '#f3d8b8';   // chest/belly cream
  const W = '#ffffff';   // tail tip
  const E = '#000';      // eye

  const bob = (frame === 1 || frame === 3) ? 1 : 0;

  // ---- bushy tail (left, sweeping up) ----
  // outline
  px(ctx, O, 0, 4 + bob); px(ctx, O, 0, 5 + bob); px(ctx, O, 0, 6 + bob);
  px(ctx, O, 1, 3 + bob); px(ctx, O, 1, 7 + bob);
  px(ctx, O, 2, 3 + bob); px(ctx, O, 2, 7 + bob);
  px(ctx, O, 3, 4 + bob); px(ctx, O, 3, 7 + bob);
  // fill
  px(ctx, B, 1, 4 + bob, 2, 3);
  px(ctx, B, 3, 5 + bob, 1, 2);
  // white tip at far end
  px(ctx, W, 1, 5 + bob);
  px(ctx, O, 0, 5 + bob);

  // ---- body ----
  // top outline
  for (let x = 4; x <= 13; x++) px(ctx, O, x, 4 + bob);
  // bottom outline
  for (let x = 4; x <= 13; x++) px(ctx, O, x, 8 + bob);
  px(ctx, O, 4, 5 + bob); px(ctx, O, 4, 6 + bob); px(ctx, O, 4, 7 + bob);
  // body fill
  px(ctx, B, 5, 5 + bob, 9, 1);
  px(ctx, B, 5, 6 + bob, 9, 1);
  px(ctx, B, 5, 7 + bob, 9, 1);
  // belly cream stripe
  px(ctx, L, 6, 7 + bob, 7, 1);
  // shadow strip on back
  px(ctx, D, 5, 5 + bob, 9, 1);

  // ---- head (right side, with snout) ----
  // skull
  px(ctx, O, 14, 4 + bob); px(ctx, O, 15, 4 + bob); px(ctx, O, 16, 4 + bob);
  px(ctx, O, 14, 8 + bob); px(ctx, O, 15, 8 + bob); px(ctx, O, 16, 8 + bob);
  px(ctx, O, 17, 5 + bob); px(ctx, O, 17, 6 + bob); px(ctx, O, 17, 7 + bob);
  px(ctx, B, 14, 5 + bob, 3, 3);
  // snout (extends right)
  px(ctx, O, 18, 6 + bob); px(ctx, O, 18, 7 + bob);
  px(ctx, O, 19, 6 + bob);
  px(ctx, B, 18, 5 + bob);
  px(ctx, L, 17, 7 + bob);   // chin cream
  // nose (black tip)
  px(ctx, E, 19, 7 + bob);
  // eye
  px(ctx, E, 16, 6 + bob);

  // ---- ears (triangular, on top of head) ----
  px(ctx, O, 13, 2 + bob); px(ctx, O, 14, 1 + bob); px(ctx, O, 14, 3 + bob);
  px(ctx, B, 14, 2 + bob);
  px(ctx, O, 16, 2 + bob); px(ctx, O, 16, 3 + bob); px(ctx, O, 17, 1 + bob); px(ctx, O, 17, 2 + bob);
  px(ctx, B, 17, 3 + bob);

  // ---- legs (with dark "socks") ----
  const yL = 9 + bob;
  let backX, frontX;
  if (frame === 0)      { backX = 5;  frontX = 13; }
  else if (frame === 1) { backX = 6;  frontX = 12; }
  else if (frame === 2) { backX = 6;  frontX = 13; }
  else                  { backX = 5;  frontX = 12; }
  // back legs (darker)
  px(ctx, B, backX, yL);
  px(ctx, O, backX, yL + 1);
  px(ctx, B, backX + 2, yL);
  px(ctx, O, backX + 2, yL + 1);
  // front legs
  px(ctx, B, frontX, yL);
  px(ctx, O, frontX, yL + 1);
  px(ctx, B, frontX + 2, yL);
  px(ctx, O, frontX + 2, yL + 1);
}

// ---- WOLF (24 × 14) ----
// Bigger, longer, lower-slung silhouette. Cool greys. Shoulder hump.
function drawWolf(ctx, frame) {
  const O = '#0e0d10';   // outline (very dark)
  const B = '#7a8090';   // wolf grey
  const D = '#4a5060';   // dark grey
  const L = '#c4cad6';   // pale belly grey
  const E = '#0a0a0a';   // eye

  const bob = (frame === 1 || frame === 3) ? 1 : 0;

  // ---- tail (low, sweeping back) ----
  px(ctx, O, 0, 6 + bob); px(ctx, O, 0, 7 + bob);
  px(ctx, O, 1, 5 + bob); px(ctx, O, 1, 8 + bob);
  px(ctx, O, 2, 5 + bob); px(ctx, O, 2, 8 + bob);
  px(ctx, O, 3, 6 + bob); px(ctx, O, 3, 8 + bob);
  px(ctx, B, 1, 6 + bob, 3, 2);
  px(ctx, D, 1, 7 + bob, 3, 1);

  // ---- body ----
  // top with shoulder hump (rises 1 extra px around x=14)
  for (let x = 4; x <= 17; x++) px(ctx, O, x, 5 + bob);
  px(ctx, O, 13, 4 + bob); px(ctx, O, 14, 4 + bob); px(ctx, O, 15, 4 + bob);  // hump
  // bottom outline
  for (let x = 4; x <= 17; x++) px(ctx, O, x, 9 + bob);
  // sides
  px(ctx, O, 4, 6 + bob); px(ctx, O, 4, 7 + bob); px(ctx, O, 4, 8 + bob);
  // body fill
  px(ctx, B, 5, 6 + bob, 12, 1);
  px(ctx, B, 5, 7 + bob, 12, 1);
  px(ctx, B, 5, 8 + bob, 12, 1);
  // hump fill
  px(ctx, B, 13, 4 + bob, 3, 1); // wait this needs outline
  // back stripe (darker)
  px(ctx, D, 5, 6 + bob, 12, 1);
  // belly
  px(ctx, L, 6, 8 + bob, 10, 1);

  // ---- head (right) ----
  px(ctx, O, 17, 5 + bob); px(ctx, O, 17, 9 + bob);
  for (let x = 18; x <= 20; x++) { px(ctx, O, x, 5 + bob); px(ctx, O, x, 9 + bob); }
  px(ctx, O, 21, 6 + bob); px(ctx, O, 21, 7 + bob); px(ctx, O, 21, 8 + bob);
  px(ctx, B, 18, 6 + bob, 3, 3);
  // snout
  px(ctx, O, 22, 7 + bob); px(ctx, O, 22, 8 + bob);
  px(ctx, O, 23, 7 + bob);
  px(ctx, B, 22, 6 + bob); // top of snout
  // nose
  px(ctx, E, 23, 8 + bob);
  // eye
  px(ctx, E, 19, 7 + bob);

  // ---- ears (triangular) ----
  px(ctx, O, 18, 3 + bob); px(ctx, O, 17, 4 + bob); px(ctx, O, 18, 4 + bob);
  px(ctx, B, 18, 4 + bob);
  px(ctx, O, 20, 3 + bob); px(ctx, O, 20, 4 + bob); px(ctx, O, 21, 4 + bob);
  px(ctx, B, 20, 4 + bob);

  // ---- legs (4-5 px tall, low slung) ----
  const yL = 10 + bob;
  let backX, frontX;
  if (frame === 0)      { backX = 5;  frontX = 15; }
  else if (frame === 1) { backX = 6;  frontX = 14; }
  else if (frame === 2) { backX = 6;  frontX = 15; }
  else                  { backX = 5;  frontX = 14; }
  // back left+right
  px(ctx, B, backX, yL); px(ctx, O, backX, yL + 1);
  px(ctx, B, backX + 2, yL); px(ctx, O, backX + 2, yL + 1);
  // front
  px(ctx, B, frontX, yL); px(ctx, O, frontX, yL + 1);
  px(ctx, B, frontX + 2, yL); px(ctx, O, frontX + 2, yL + 1);
}

// ---- DEER (24 × 18) ----
// Tall thin legs (4 px), small head, branching antlers, white rump.
function drawDeer(ctx, frame, withAntlers = true) {
  const O = '#1d100a';
  const B = '#a3683a';   // tan
  const D = '#6e4422';   // shadow
  const L = '#e8c89a';   // belly cream
  const W = '#ffffff';   // rump flash
  const E = '#000';
  const A = '#5a4022';   // antler

  const bob = (frame === 1 || frame === 3) ? 1 : 0;

  // ---- body (slim, floats above tall legs) ----
  // top
  for (let x = 4; x <= 16; x++) px(ctx, O, x, 4 + bob);
  // bottom
  for (let x = 4; x <= 16; x++) px(ctx, O, x, 8 + bob);
  // sides
  px(ctx, O, 3, 5 + bob); px(ctx, O, 3, 6 + bob); px(ctx, O, 3, 7 + bob);
  // fill
  px(ctx, B, 4, 5 + bob, 13, 1);
  px(ctx, B, 4, 6 + bob, 13, 1);
  px(ctx, B, 4, 7 + bob, 13, 1);
  // back shadow
  px(ctx, D, 4, 5 + bob, 13, 1);
  // belly
  px(ctx, L, 5, 7 + bob, 11, 1);
  // white rump flash
  px(ctx, W, 3, 6 + bob); px(ctx, W, 3, 7 + bob);
  px(ctx, O, 2, 6 + bob); px(ctx, O, 2, 7 + bob);

  // tiny tail
  px(ctx, O, 1, 6 + bob); px(ctx, W, 1, 7 + bob);

  // ---- neck + head (front-right, raised) ----
  // neck
  px(ctx, O, 17, 4 + bob); px(ctx, O, 17, 5 + bob); px(ctx, O, 17, 6 + bob); px(ctx, O, 17, 7 + bob);
  px(ctx, O, 18, 3 + bob); px(ctx, O, 18, 4 + bob);
  px(ctx, B, 17, 4 + bob, 1, 4);   // (overdraw safe: outline got covered, redraw)
  px(ctx, B, 18, 4 + bob);
  // re-outline neck edges
  px(ctx, O, 18, 5 + bob);

  // head
  px(ctx, O, 18, 2 + bob); px(ctx, O, 19, 1 + bob); px(ctx, O, 20, 1 + bob); px(ctx, O, 21, 2 + bob);
  px(ctx, O, 19, 4 + bob); px(ctx, O, 20, 4 + bob); px(ctx, O, 21, 3 + bob);
  px(ctx, B, 19, 2 + bob, 2, 2);
  // snout
  px(ctx, O, 22, 3 + bob);
  px(ctx, B, 21, 3 + bob);
  // nose
  px(ctx, E, 22, 3 + bob);
  // eye
  px(ctx, E, 20, 2 + bob);

  // ---- ears ----
  px(ctx, O, 18, 0 + bob); px(ctx, O, 18, 1 + bob);
  px(ctx, B, 19, 0 + bob);
  px(ctx, O, 20, 0 + bob);

  // ---- antlers (only on big frames; small forks) ----
  if (withAntlers) {
    px(ctx, A, 19, 0 + bob);
    px(ctx, A, 18, 0 + bob);
    // left fork
    px(ctx, A, 17, 1 + bob);
    px(ctx, A, 17, 0 + bob);
    px(ctx, A, 16, 0 + bob);
    // right fork
    px(ctx, A, 21, 1 + bob);
    px(ctx, A, 22, 0 + bob);
    px(ctx, A, 22, 1 + bob);
  }

  // ---- legs (4 px tall, thin) ----
  const yL = 9 + bob;
  let backX, frontX;
  if (frame === 0)      { backX = 4;  frontX = 14; }
  else if (frame === 1) { backX = 5;  frontX = 13; }
  else if (frame === 2) { backX = 5;  frontX = 14; }
  else                  { backX = 4;  frontX = 13; }
  // back
  px(ctx, B, backX, yL); px(ctx, B, backX, yL + 1); px(ctx, B, backX, yL + 2); px(ctx, O, backX, yL + 3);
  px(ctx, B, backX + 2, yL); px(ctx, B, backX + 2, yL + 1); px(ctx, B, backX + 2, yL + 2); px(ctx, O, backX + 2, yL + 3);
  // front
  px(ctx, B, frontX, yL); px(ctx, B, frontX, yL + 1); px(ctx, B, frontX, yL + 2); px(ctx, O, frontX, yL + 3);
  px(ctx, B, frontX + 2, yL); px(ctx, B, frontX + 2, yL + 1); px(ctx, B, frontX + 2, yL + 2); px(ctx, O, frontX + 2, yL + 3);
}

// =============================================================
//                          PLANTS
// =============================================================

// Each plant has 3 growth stages.

// ---- GRASS (8 × 8) ----
function drawGrass(ctx, stage, season) {
  const palette = {
    spring: { B: '#4a9a3e', D: '#2e5e25' },
    summer: { B: '#5fb547', D: '#3a7029' },
    autumn: { B: '#9c8a3a', D: '#5e5020' },
    winter: { B: '#7a7060', D: '#4a4538' },
  };
  const C = palette[season] || palette.summer;
  const blades = stage === 0 ? 2 : stage === 1 ? 4 : 6;
  const heights = [3, 4, 5];
  const h = heights[stage];

  for (let i = 0; i < blades; i++) {
    const x = (i * 7 + 1) % 8;
    const bh = h + ((i * 13) % 3) - 1; // varied
    // shadow
    px(ctx, C.D, x, 8 - bh, 1, bh);
    // highlight on top
    if (bh > 1) px(ctx, C.B, x, 8 - bh, 1, 1);
  }
}

// ---- BUSH (12 × 12) ----
function drawBush(ctx, stage, season) {
  const palette = {
    spring: { B: '#3e8a4a', D: '#1f5028', L: '#6cbe6e' },
    summer: { B: '#3a7d44', D: '#1d4624', L: '#62b066' },
    autumn: { B: '#a35a2a', D: '#6c3818', L: '#d27a3e' },
    winter: { B: '#666058', D: '#3e3a35', L: '#8a8278' },
  };
  const C = palette[season] || palette.summer;
  const O = '#1a1108';

  if (stage === 0) {
    // small sprout
    px(ctx, O, 5, 8); px(ctx, O, 6, 8);
    px(ctx, C.B, 5, 7); px(ctx, C.B, 6, 7);
    px(ctx, C.L, 5, 6);
    return;
  }

  // base shape — multi-blob foliage
  const blobs = stage === 1
    ? [[5, 7, 2], [4, 8, 2], [7, 8, 2]]
    : [[5, 5, 3], [3, 7, 3], [8, 7, 3], [6, 9, 3]];

  // shadow under
  px(ctx, '#0008', 4, 11, 5, 1);

  for (const [bx, by, br] of blobs) {
    // outline
    for (let dy = -br; dy <= br; dy++) {
      for (let dx = -br; dx <= br; dx++) {
        const d = dx*dx + dy*dy;
        if (d > br*br) continue;
        if (d > (br - 1)*(br - 1)) px(ctx, O, bx + dx, by + dy);
      }
    }
    // fill
    for (let dy = -br + 1; dy <= br - 1; dy++) {
      for (let dx = -br + 1; dx <= br - 1; dx++) {
        const d = dx*dx + dy*dy;
        if (d <= (br - 1)*(br - 1)) {
          // top-light, bottom-dark
          const c = dy <= 0 ? C.B : C.D;
          px(ctx, c, bx + dx, by + dy);
        }
      }
    }
    // single highlight pixel
    px(ctx, C.L, bx - 1, by - br + 1);
  }

  // berries on full bush in summer/autumn
  if (stage === 2 && (season === 'summer' || season === 'autumn')) {
    const berry = season === 'summer' ? '#d04848' : '#a82820';
    px(ctx, berry, 4, 6); px(ctx, berry, 8, 8);
  }
}

// ---- TREE (16 × 22) ----
function drawTree(ctx, stage, season) {
  const palette = {
    spring: { B: '#3a8048', D: '#1d4528', L: '#6cbe6e' },
    summer: { B: '#347040', D: '#194022', L: '#62b066' },
    autumn: { B: '#c45a26', D: '#7a3414', L: '#e88e3e' },
    winter: { B: '#605850', D: '#383028', L: '#7e7368' },
  };
  const C = palette[season] || palette.summer;
  const O = '#1a1108';
  const T = '#3a2614';   // trunk
  const TS = '#231408';  // trunk shadow

  if (stage === 0) {
    // sapling — small
    // trunk
    px(ctx, T, 7, 18, 1, 4); px(ctx, TS, 7, 18, 1, 1);
    // canopy
    px(ctx, O, 6, 16); px(ctx, O, 7, 15); px(ctx, O, 8, 16); px(ctx, O, 8, 17); px(ctx, O, 6, 17);
    px(ctx, C.B, 7, 16); px(ctx, C.B, 7, 17);
    px(ctx, C.L, 7, 16);
    return;
  }

  if (stage === 1) {
    // medium tree
    // trunk
    px(ctx, O, 6, 16, 1, 6); px(ctx, O, 9, 16, 1, 6);
    px(ctx, T, 7, 15, 2, 7);
    px(ctx, TS, 7, 15, 1, 7);
    // canopy
    const blobs = [[7, 11, 3], [4, 13, 3], [10, 13, 3], [7, 14, 3]];
    drawCanopy(ctx, blobs, O, C);
    return;
  }

  // Stage 2 — large
  // trunk
  px(ctx, O, 5, 14, 1, 8); px(ctx, O, 10, 14, 1, 8);
  px(ctx, T, 6, 14, 4, 8);
  px(ctx, TS, 6, 14, 1, 8);
  // bark texture
  px(ctx, TS, 8, 16); px(ctx, TS, 7, 18); px(ctx, TS, 9, 20);
  // canopy — larger cluster
  const blobs = [[5, 8, 3], [10, 8, 3], [3, 11, 3], [12, 11, 3], [7, 6, 3], [8, 11, 4]];
  drawCanopy(ctx, blobs, O, C);
}

function drawCanopy(ctx, blobs, O, C) {
  // outline pass first
  for (const [bx, by, br] of blobs) {
    for (let dy = -br; dy <= br; dy++) {
      for (let dx = -br; dx <= br; dx++) {
        const d = dx*dx + dy*dy;
        if (d > br*br) continue;
        if (d > (br - 1)*(br - 1)) px(ctx, O, bx + dx, by + dy);
      }
    }
  }
  // fill pass
  for (const [bx, by, br] of blobs) {
    for (let dy = -br + 1; dy <= br - 1; dy++) {
      for (let dx = -br + 1; dx <= br - 1; dx++) {
        const d = dx*dx + dy*dy;
        if (d <= (br - 1)*(br - 1)) {
          const c = dy <= -1 ? C.B : (dy >= 1 ? C.D : C.B);
          px(ctx, c, bx + dx, by + dy);
        }
      }
    }
    // highlight
    px(ctx, C.L, bx - 1, by - br + 1);
  }
}

// =============================================================
//                       SPRITE ATLAS
// =============================================================

export class SpriteAtlas {
  constructor() {
    this.animals = {};
    this.plants = {};
    this.build();
  }

  build() {
    // 4-frame walk cycle per animal
    this.animals.rabbit = this._buildAnimal(16, 12, drawRabbit);
    this.animals.fox    = this._buildAnimal(20, 12, drawFox);
    this.animals.wolf   = this._buildAnimal(24, 14, drawWolf);
    // Two deer atlases: with and without antlers
    this.animals.deer        = this._buildAnimal(24, 18, (ctx, f) => drawDeer(ctx, f, false));
    this.animals.deerAntlers = this._buildAnimal(24, 18, (ctx, f) => drawDeer(ctx, f, true));

    // 3 stages × 4 seasons per plant
    this.plants.grass = this._buildPlant(8, 8, 3, drawGrass);
    this.plants.bush  = this._buildPlant(12, 12, 3, drawBush);
    this.plants.tree  = this._buildPlant(16, 22, 3, drawTree);
  }

  _buildAnimal(w, h, draw) {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      draw(ctx, f);
      frames.push(c);
    }
    return { w, h, frames };
  }

  _buildPlant(w, h, stages, draw) {
    const seasons = ['spring','summer','autumn','winter'];
    const out = { w, h, stages: [] };
    for (let s = 0; s < stages; s++) {
      const bySeason = {};
      for (const season of seasons) {
        const c = makeCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        draw(ctx, s, season);
        bySeason[season] = c;
      }
      out.stages.push(bySeason);
    }
    return out;
  }

  getAnimal(species, frame, isLargeDeer = false) {
    const key = (species === 'deer' && isLargeDeer) ? 'deerAntlers' : species;
    const atlas = this.animals[key];
    return atlas.frames[frame % 4];
  }

  getPlant(name, stage, season) {
    const atlas = this.plants[name];
    const s = Math.min(stage, atlas.stages.length - 1);
    return atlas.stages[s][season] || atlas.stages[s].summer;
  }
}
