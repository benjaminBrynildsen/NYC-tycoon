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
  MAX_FLOORS: 150,
};

// You cannot build a tower one broom closet wide. Below this, a floor can't
// hold a lift core, stairs, risers and anything worth renting.
export const MIN_PLATE_SF = 4200;

// Zoning height limits by district. Supertall is a core privilege — which is
// what makes getting into the core worth doing.
export const HEIGHT_CAP = { res: 25, edge: 50, mid: 90, core: 150 };

// The harbour wraps the south and east edges. Waterfront land is the scarcest
// thing on the map and the game should make you feel that.
export const WATER = { southZ: 0, eastX: 0 };

CONFIG.PITCH = CONFIG.BLOCK + CONFIG.STREET;
CONFIG.EXTENT = CONFIG.GRID * CONFIG.PITCH;
WATER.southZ = CONFIG.EXTENT / 2 + 4;
WATER.eastX = CONFIG.EXTENT / 2 + 4;

export function waterDistance(x, z) {
  return Math.min(WATER.southZ - z, WATER.eastX - x);
}
export function isWater(x, z) {
  return z > WATER.southZ || x > WATER.eastX;
}

// Avenues run north-south, streets run east-west. Every lot gets a real address.
export const AVENUE_NAMES = [
  'Harrow Ave', 'Kestrel Ave', 'Dutch Ave', 'Pell Ave', 'Vandam Ave',
  'Orchard Ave', 'Bowery Ave', 'Meridian Ave', 'Harbor Ave',
];
export function streetName(i) {
  const n = i + 1;
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th';
  return `${n}${s} St`;
}

// Zoning districts, outward from the centre. FAR is the whole economy in one number.
export const DISTRICTS = {
  core: { far: 15, landBase: 220, rentMul: 1.15, name: 'C6 Core' },
  mid:  { far: 10, landBase: 140, rentMul: 1.05, name: 'C5 Midtown' },
  edge: { far: 6,  landBase: 80,  rentMul: 0.95, name: 'C4 Edge' },
  res:  { far: 3,  landBase: 45,  rentMul: 0.85, name: 'R6 Residential' },
};

// Facade systems you can choose when you build. Each trades cost against the
// rent it can command.
export const STYLES = {
  brick:   { name: 'Brick',        type: 'brownstone', cost: 0.90, rent: 0.95 },
  loft:    { name: 'Industrial',   type: 'loft',       cost: 0.95, rent: 0.99 },
  masonry: { name: 'Masonry',      type: 'prewar',     cost: 1.00, rent: 1.02 },
  deco:    { name: 'Deco stone',   type: 'deco',       cost: 1.09, rent: 1.07 },
  curtain: { name: 'Curtain wall', type: 'midcentury', cost: 1.05, rent: 1.05 },
  glass:   { name: 'Glass',        type: 'glass',      cost: 1.20, rent: 1.15 },
};

// The shape of the mass. A point tower costs more per foot and rents for more.
export const FORMS = {
  slab:    { name: 'Slab',    cost: 0.95, rent: 0.96 },
  stepped: { name: 'Stepped', cost: 1.04, rent: 1.04 },
  point:   { name: 'Point',   cost: 1.13, rent: 1.10 },
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
  return Math.max(minFloors(lot) + 2, HEIGHT_CAP[lot.district]);
}

/** Storeys you can reach on your own entitlement, before buying air rights. */
export function floorsWithoutAir(lot) {
  return Math.max(1, Math.floor(buildableSf(lot) / MIN_PLATE_SF));
}

/**
 * The massing you get for a given storey count.
 * Going taller than the minimum doesn't buy more area — FAR caps that — but it
 * shrinks the footprint, which buys light, views and rent per square foot.
 */
export function massing(lot, floors) {
  const entitled = buildableSf(lot);
  const perFloorMax = lot.areaSf * CONFIG.MAX_COVERAGE;
  let gsf = Math.min(entitled, floors * perFloorMax);
  let airSf = 0;

  // Past a certain height your entitlement no longer spreads across enough
  // floors to make any of them usable, so the extra area has to be bought from
  // the neighbours. That is how supertall actually gets built.
  if (gsf / floors < MIN_PLATE_SF) {
    const need = Math.min(floors * MIN_PLATE_SF, floors * perFloorMax);
    airSf = Math.max(0, need - entitled);
    gsf = entitled + airSf;
  }

  const footprintSf = gsf / floors;
  const coverage = footprintSf / lot.areaSf;
  const side = Math.sqrt(footprintSf / CONFIG.SF_PER_M2);
  return { gsf, airSf, footprintSf, coverage, side, height: floors * CONFIG.FLOOR_H, floors };
}

export function generateCity(seed = 7) {
  const rnd = mulberry32(seed);
  const { GRID, BLOCK, PITCH, LOT, SF_PER_M2 } = CONFIG;
  const origin = -CONFIG.EXTENT / 2 + PITCH / 2;

  const lots = [];
  const blocks = [];
  // One corridor per avenue and per cross street. Retail accumulates on them and
  // a corridor that collects enough of it becomes a destination.
  const corridors = [];
  for (let i = 0; i <= GRID; i++) {
    corridors.push({ id: `av${i}`, axis: 'ns', index: i, name: AVENUE_NAMES[i % AVENUE_NAMES.length],
                     retail: 0, fame: 0, famous: false, lots: [] });
    corridors.push({ id: `st${i}`, axis: 'ew', index: i, name: streetName(i),
                     retail: 0, fame: 0, famous: false, lots: [] });
  }
  const corridorBy = new Map(corridors.map((c) => [c.id, c]));
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
          name: null,
        };
        // The corridors this lot fronts: the nearer avenue and the nearer street.
        lot.avenue = corridorBy.get(`av${sx < 0 ? bx : bx + 1}`);
        lot.street = corridorBy.get(`st${sz < 0 ? by : by + 1}`);
        lot.avenue.lots.push(lot);
        lot.street.lots.push(lot);
        const num = 100 + by * 100 + (sz < 0 ? 0 : 50) + (sx < 0 ? 1 : 3) + (bx % 10) * 4;
        lot.address = `${num} ${lot.avenue.name}`;
        lot.crossStreet = lot.street.name;
        lot.waterDist = waterDistance(lot.x, lot.z);
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
        condition: 0.45 + rnd() * 0.45,
      };
    }
  }

  // Park frontage: a lot is park-front if a park block sits across the street.
  const parkBlocks = blocks.filter((b) => b.isPark);
  for (const lot of lots) {
    lot.parkFront = parkBlocks.some((b) =>
      Math.abs(b.cx - lot.x) < CONFIG.PITCH * 1.05 && Math.abs(b.cz - lot.z) < CONFIG.PITCH * 1.05);
  }

  return { lots, blocks, corridors, seed };
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
