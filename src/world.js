// World generation: the city grid, its blocks, lots and zoning.
// Pure data. No rendering, no three.js. The renderer and the sim both read this.

export const CONFIG = {
  GRID: 8,            // blocks per side
  BLOCK: 60,          // metres
  STREET: 18,         // metres
  LOT: 28,            // metres (2x2 lots per block)
  FLOOR_H: 3.6,       // metres per storey
  SF_PER_M2: 10.7639,
  MAX_COVERAGE: 0.85, // share of lot the footprint may cover
  MAX_FLOORS: 90,
};

CONFIG.PITCH = CONFIG.BLOCK + CONFIG.STREET;
CONFIG.EXTENT = CONFIG.GRID * CONFIG.PITCH;

// Zoning districts, outward from the centre. FAR is the whole economy in one number.
export const DISTRICTS = {
  core: { far: 15, landBase: 220, rentMul: 1.15, name: 'C6 Core' },
  mid:  { far: 10, landBase: 140, rentMul: 1.05, name: 'C5 Midtown' },
  edge: { far: 6,  landBase: 80,  rentMul: 0.95, name: 'C4 Edge' },
  res:  { far: 3,  landBase: 45,  rentMul: 0.85, name: 'R6 Residential' },
};

export const USES = {
  office:      { name: 'Office',      rent: 78, cost: 400, opex: 0.34 },
  residential: { name: 'Residential', rent: 62, cost: 360, opex: 0.30 },
  mixed:       { name: 'Mixed-use',   rent: 70, cost: 385, opex: 0.32 },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function districtFor(bx, by, grid) {
  const c = (grid - 1) / 2;
  const d = Math.max(Math.abs(bx - c), Math.abs(by - c));
  if (d < 1.2) return 'core';
  if (d < 2.2) return 'mid';
  if (d < 3.2) return 'edge';
  return 'res';
}

/** Buildable floor area a lot is entitled to, in square feet. */
export function buildableSf(lot) {
  return lot.areaSf * lot.far;
}

/** Smallest number of storeys that can hold the full entitlement at max coverage. */
export function minFloors(lot) {
  return Math.max(1, Math.ceil(lot.far / CONFIG.MAX_COVERAGE));
}

export function maxFloors(lot) {
  return Math.min(CONFIG.MAX_FLOORS, Math.max(minFloors(lot) + 24, Math.round(minFloors(lot) * 2.2)));
}

/**
 * The massing you get for a given storey count.
 * Going taller than the minimum doesn't buy more area — FAR caps that — but it
 * shrinks the footprint, which buys light, views and rent per square foot.
 */
export function massing(lot, floors) {
  const entitled = buildableSf(lot);
  const perFloorMax = lot.areaSf * CONFIG.MAX_COVERAGE;
  const gsf = Math.min(entitled, floors * perFloorMax);
  const footprintSf = gsf / floors;
  const coverage = footprintSf / lot.areaSf;
  const side = Math.sqrt(footprintSf / CONFIG.SF_PER_M2);
  return { gsf, footprintSf, coverage, side, height: floors * CONFIG.FLOOR_H, floors };
}

export function generateCity(seed = 7) {
  const rnd = mulberry32(seed);
  const { GRID, BLOCK, PITCH, LOT, SF_PER_M2 } = CONFIG;
  const origin = -CONFIG.EXTENT / 2 + PITCH / 2;

  const lots = [];
  const blocks = [];
  let id = 0;

  for (let by = 0; by < GRID; by++) {
    for (let bx = 0; bx < GRID; bx++) {
      const cx = origin + bx * PITCH;
      const cz = origin + by * PITCH;
      const district = districtFor(bx, by, GRID);
      // A couple of blocks are parks. They anchor value and can never be built on.
      const isPark = district !== 'core' && rnd() < 0.055;
      const block = { bx, by, cx, cz, district, isPark, lots: [] };
      blocks.push(block);
      if (isPark) continue;

      const off = (BLOCK / 2) - (LOT / 2) - 1;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lot = {
          id: id++,
          bx, by, block,
          x: cx + sx * off,
          z: cz + sz * off,
          w: LOT, d: LOT,
          district,
          far: DISTRICTS[district].far,
          areaSf: LOT * LOT * SF_PER_M2,
          owner: null,          // null = on the market, else 'player' or a rival id
          building: null,
          project: null,
          landPerSf: DISTRICTS[district].landBase * (0.82 + rnd() * 0.36),
          seed: Math.floor(rnd() * 1e6),
        };
        lots.push(lot);
        block.lots.push(lot);
      }
    }
  }

  // Seed the city with existing stock so it doesn't look like a parking lot.
  // Older, smaller buildings — the whole point is that they're under-built for
  // their zoning, which is where the money is.
  for (const lot of lots) {
    const r = rnd();
    const density = lot.district === 'core' ? 0.72 : lot.district === 'mid' ? 0.66 : 0.58;
    if (r < density) {
      const cap = Math.max(2, Math.round(minFloors(lot) * (0.15 + rnd() * 0.45)));
      const floors = Math.min(cap, 26);
      const m = massing(lot, floors);
      lot.owner = 'npc';
      lot.building = {
        floors,
        gsf: Math.min(m.gsf, floors * lot.areaSf * 0.8),
        side: Math.sqrt((lot.areaSf * (0.6 + rnd() * 0.25)) / SF_PER_M2),
        use: rnd() < 0.5 ? 'residential' : 'mixed',
        quality: 0.45 + rnd() * 0.3,
        age: Math.floor(20 + rnd() * 70),
        builtBy: 'npc',
      };
    }
  }

  return { lots, blocks, seed };
}

/** Lots within `radius` metres of a point. Used for land-value contagion. */
export function lotsNear(city, x, z, radius) {
  const r2 = radius * radius;
  return city.lots.filter((l) => {
    const dx = l.x - x, dz = l.z - z;
    return dx * dx + dz * dz <= r2;
  });
}

export function lotAt(city, x, z) {
  let best = null, bestD = Infinity;
  for (const l of city.lots) {
    const dx = Math.abs(l.x - x), dz = Math.abs(l.z - z);
    if (dx > l.w / 2 + 11 || dz > l.d / 2 + 11) continue;
    const d = dx + dz;
    if (d < bestD) { bestD = d; best = l; }
  }
  return best;
}
