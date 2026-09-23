// World generation: the island, its neighbourhoods, blocks and lots.
// Pure data. No rendering, no three.js. The renderer and the sim both read this.

export const CONFIG = {
  COLS: 13,
  ROWS: 20,
  BLOCK: 60,          // metres
  STREET: 18,         // metres
  LOT: 28,            // metres (2x2 lots per block)
  FLOOR_H: 3.6,       // metres per storey
  SF_PER_M2: 10.7639,
  MAX_COVERAGE: 0.85,
  MAX_FLOORS: 300,
};
CONFIG.PITCH = CONFIG.BLOCK + CONFIG.STREET;
CONFIG.WIDTH = CONFIG.COLS * CONFIG.PITCH;
CONFIG.DEPTH = CONFIG.ROWS * CONFIG.PITCH;
CONFIG.EXTENT = Math.max(CONFIG.WIDTH, CONFIG.DEPTH);

/** Centre of a grid cell in world space. Row 0 is the southern tip. */
export function cellCenter(col, row) {
  return {
    x: -CONFIG.WIDTH / 2 + CONFIG.PITCH / 2 + col * CONFIG.PITCH,
    z: CONFIG.DEPTH / 2 - CONFIG.PITCH / 2 - row * CONFIG.PITCH,
  };
}

// You cannot build a tower one broom closet wide.
export const MIN_PLATE_SF = 4200;

// ---------------------------------------------------------------- the island

/**
 * Manhattan, compressed. The block count has to stay playable, so this is the
 * silhouette rather than the survey: a narrow tip at the Battery, widening
 * through the middle, Central Park punched out of the upper third, tapering
 * again towards Harlem. Each entry is the [first, last] column of that row.
 */
const MANHATTAN_ROWS = [
  [3, 4], [3, 5], [2, 5], [2, 6], [2, 6], [1, 6], [1, 6], [1, 6], [1, 6], [0, 6],
  [0, 6], [0, 6], [0, 6], [0, 6], [1, 6], [1, 6], [1, 6], [1, 5], [2, 5], [2, 4],
];
const CENTRAL_PARK = { rows: [14, 16], cols: [2, 4] };
const BROOKLYN = { rows: [1, 5], cols: [8, 11] };
const QUEENS = { rows: [9, 12], cols: [8, 10] };

const inBox = (b, col, row) =>
  row >= b.rows[0] && row <= b.rows[1] && col >= b.cols[0] && col <= b.cols[1];

/** Which landmass a cell belongs to, or null for river. */
export function regionAt(col, row) {
  if (inBox(BROOKLYN, col, row)) return 'brooklyn';
  if (inBox(QUEENS, col, row)) return 'queens';
  const span = MANHATTAN_ROWS[row];
  if (span && col >= span[0] && col <= span[1]) return 'manhattan';
  return null;
}
export const isParkCell = (col, row) => inBox(CENTRAL_PARK, col, row);

export const REGIONS = {
  manhattan: { name: 'Manhattan', unlockAt: 0 },
  brooklyn: { name: 'Brooklyn', unlockAt: 1_000_000_000 },
  queens: { name: 'Queens', unlockAt: 1_000_000_000 },
};

// Neighbourhoods carry the name you read; the tier carries the economics.
export const HOODS = {
  financial: { name: 'Financial District', tier: 'core' },
  tribeca:   { name: 'Tribeca',            tier: 'mid' },
  village:   { name: 'The Village',        tier: 'edge' },
  chelsea:   { name: 'Chelsea',            tier: 'mid' },
  midtown:   { name: 'Midtown',            tier: 'core' },
  upperWest: { name: 'Upper West Side',    tier: 'mid' },
  upperEast: { name: 'Upper East Side',    tier: 'mid' },
  harlem:    { name: 'Harlem',             tier: 'res' },
  landfill:  { name: 'Reclaimed Land',     tier: 'mid' },
  heights:   { name: 'Brooklyn Heights',   tier: 'edge' },
  lic:       { name: 'Long Island City',   tier: 'res' },
};

function hoodAt(col, row, region) {
  if (region === 'brooklyn') return 'heights';
  if (region === 'queens') return 'lic';
  if (row <= 1) return 'financial';
  if (row <= 3) return 'tribeca';
  if (row <= 6) return 'village';
  if (row <= 9) return 'chelsea';
  if (row <= 13) return 'midtown';
  if (row <= 17) return col <= 2 ? 'upperWest' : 'upperEast';
  return 'harlem';
}

// Tiers, and what each is worth. FAR is the whole economy in one number.
export const DISTRICTS = {
  core: { far: 15, landBase: 220, rentMul: 1.15, name: 'C6' },
  mid:  { far: 10, landBase: 140, rentMul: 1.05, name: 'C5' },
  edge: { far: 6,  landBase: 80,  rentMul: 0.95, name: 'C4' },
  res:  { far: 3,  landBase: 45,  rentMul: 0.85, name: 'R6' },
};

/**
 * What the city knows how to build, and when. This is close to the real
 * sequence: load-bearing masonry until the steel skeleton and the safety
 * elevator, the 1916 zoning resolution that forced towers to step back for
 * light and air, the Deco race to the top with its mooring masts, curtain
 * wall after the war, and structural engineering without limits after that.
 */
export const ERAS = [
  { from: 1870, name: 'The Gilded Age', maxFloors: 12,
    styles: ['brick', 'loft'],
    note: 'Load-bearing masonry and cast iron. Six storeys is a walk-up; ten is a statement.' },
  { from: 1892, name: 'The Steel Frame', maxFloors: 30,
    styles: ['brick', 'loft', 'masonry'],
    note: 'Steel skeletons and safe elevators. The city discovers it can climb.' },
  { from: 1916, name: 'Setback Zoning', maxFloors: 70,
    styles: ['brick', 'loft', 'masonry', 'deco'],
    note: 'The 1916 resolution: a tower must step back for the light it takes.' },
  { from: 1931, name: 'The Deco Peak', maxFloors: 102,
    styles: ['loft', 'masonry', 'deco'], airships: true,
    note: 'A race to the top — observation decks, spires, and masts for the airships.' },
  { from: 1952, name: 'Glass and Steel', maxFloors: 110,
    styles: ['masonry', 'deco', 'curtain'], airships: true,
    note: 'Curtain wall, the plaza, and the tower in the park.' },
  { from: 1985, name: 'The Modern City', maxFloors: 150,
    styles: ['masonry', 'deco', 'curtain', 'glass'], airships: true,
    note: 'Floor-to-ceiling glass and engineering that stopped saying no.' },
  { from: 2005, name: 'Supertall', maxFloors: 300,
    styles: ['curtain', 'glass', 'deco'], airships: true,
    note: 'Slender towers on assembled blocks, priced on the view.' },
];

export function eraAt(year) {
  let era = ERAS[0];
  for (const e of ERAS) if (year >= e.from) era = e;
  return era;
}

/** Storeys above which a building carries a mooring mast. */
export const MAST_FLOORS = 50;

// Height is no longer capped by district. Past this you need the whole block:
// one owner, four lots, and the development rights that come with them.
export const BLOCK_ASSEMBLY_FLOORS = 150;
export const ABSOLUTE_MAX_FLOORS = 300;

export function ownsWholeBlock(lot, actorId) {
  return !!actorId && lot.block.lots.length > 1
    && lot.block.lots.every((l) => l.owner === actorId);
}

// --------------------------------------------------------------- street names

const AVENUES = {
  manhattan: ['West St', '10th Ave', '8th Ave', 'Broadway', '5th Ave', 'Park Ave', '2nd Ave'],
  brooklyn:  ['Furman St', 'Henry St', 'Clinton St', 'Court St'],
  queens:    ['Vernon Blvd', 'Jackson Ave', '21st St'],
};
const CROSS = {
  brooklyn: ['Atlantic Ave', 'Pacific St', 'Dean St', 'Bergen St', 'Wyckoff St'],
  queens:   ['Borden Ave', '44th Dr', 'Queens Plaza', '41st Ave'],
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th';
  return `${n}${s}`;
}
function avenueName(col, region) {
  const list = AVENUES[region];
  const base = region === 'manhattan' ? 0 : region === 'brooklyn' ? BROOKLYN.cols[0] : QUEENS.cols[0];
  return list[Math.min(col - base, list.length - 1)] ?? list[list.length - 1];
}
function crossName(row, region) {
  if (region === 'manhattan') return `${ordinal(1 + row * 5)} St`;
  const list = CROSS[region];
  const base = region === 'brooklyn' ? BROOKLYN.rows[0] : QUEENS.rows[0];
  return list[Math.min(row - base, list.length - 1)] ?? list[list.length - 1];
}

// ---------------------------------------------------------------------- maths

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Floor area a lot is entitled to — nothing, once its rights are transferred. */
export function buildableSf(lot) { return lot.airSpent ? 0 : lot.areaSf * lot.far; }
export function minFloors(lot) { return Math.max(1, Math.ceil(lot.far / CONFIG.MAX_COVERAGE)); }
export function maxFloors(lot, actorId, year = 9999) {
  const structural = ownsWholeBlock(lot, actorId) ? ABSOLUTE_MAX_FLOORS : BLOCK_ASSEMBLY_FLOORS;
  return Math.min(structural, eraAt(year).maxFloors);
}
export function floorsWithoutAir(lot) {
  return Math.max(1, Math.floor(buildableSf(lot) / MIN_PLATE_SF));
}

export function massing(lot, floors) {
  const entitled = buildableSf(lot);
  const perFloorMax = lot.areaSf * CONFIG.MAX_COVERAGE;
  let gsf = Math.min(entitled, floors * perFloorMax);
  let airSf = 0;

  // Past a certain height your entitlement no longer spreads across enough
  // floors to leave a usable plate, so the rest has to be bought from the
  // neighbours. That is how supertall actually gets built.
  if (gsf / floors < MIN_PLATE_SF) {
    const need = Math.min(floors * MIN_PLATE_SF, floors * perFloorMax);
    airSf = Math.max(0, need - entitled);
    gsf = entitled + airSf;
  }
  const footprintSf = gsf / floors;
  return {
    gsf, airSf, footprintSf,
    coverage: footprintSf / lot.areaSf,
    side: Math.sqrt(footprintSf / CONFIG.SF_PER_M2),
    height: floors * CONFIG.FLOOR_H,
    floors,
  };
}

// ------------------------------------------------------------------- the city

export function generateCity(seed = 7, startYear = 1998) {
  const rnd = mulberry32(seed);
  const era = eraAt(startYear);
  const { COLS, ROWS, BLOCK, PITCH, LOT, SF_PER_M2 } = CONFIG;

  // Which cells are dry land, so water distance and the renderer agree.
  const land = new Map();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const region = regionAt(col, row);
      if (region) land.set(`${col},${row}`, region);
    }
  }
  const isLand = (col, row) => land.has(`${col},${row}`);

  /** Metres from a point to the nearest water. Everything here is an island. */
  function waterDist(x, z, col, row) {
    let best = Infinity;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        const c = col + dc, r = row + dr;
        if (isLand(c, r)) continue;
        const p = cellCenter(c, r);
        // Distance to that cell's near edge, not its middle.
        const dx = Math.max(0, Math.abs(p.x - x) - PITCH / 2);
        const dz = Math.max(0, Math.abs(p.z - z) - PITCH / 2);
        best = Math.min(best, Math.hypot(dx, dz));
      }
    }
    return best;
  }

  const lots = [];
  const blocks = [];
  const corridors = [];
  const corridorBy = new Map();
  let nextId = 0;
  const corridor = (id, name, axis, index, region) => {
    if (!corridorBy.has(id)) {
      const c = { id, name, axis, index, region, retail: 0, fame: 0, famous: false, lots: [] };
      corridorBy.set(id, c);
      corridors.push(c);
    }
    return corridorBy.get(id);
  };

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const region = regionAt(col, row);
      if (!region) continue;
      const { x: cx, z: cz } = cellCenter(col, row);
      const isPark = isParkCell(col, row);
      const hoodKey = hoodAt(col, row, region);
      const block = { col, row, bx: col, by: row, cx, cz, region, isPark, hood: hoodKey, lots: [] };
      blocks.push(block);
      if (isPark) continue;

      const tier = HOODS[hoodKey].tier;
      const off = (BLOCK / 2) - (LOT / 2) - 1;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + sx * off, z = cz + sz * off;
        const lot = {
          id: nextId++,
          col, row, bx: col, by: row, block,
          x, z, w: LOT, d: LOT,
          region, hood: hoodKey, tier,
          district: tier,                       // the economics still key off tier
          far: DISTRICTS[tier].far,
          areaSf: LOT * LOT * SF_PER_M2,
          owner: null,
          building: null,
          project: null,
          landPerSf: DISTRICTS[tier].landBase * (0.82 + rnd() * 0.36),
          seed: Math.floor(rnd() * 1e6),
          name: null,
        };
        lot.avenue = corridor(`${region}_av${col}`, avenueName(col, region), 'ns', col, region);
        lot.street = corridor(`${region}_st${row}`, crossName(row, region), 'ew', row, region);
        lot.avenue.lots.push(lot);
        lot.street.lots.push(lot);
        const num = 40 + row * 40 + (sz < 0 ? 0 : 20) + (sx < 0 ? 1 : 3);
        lot.address = `${num} ${lot.avenue.name}`;
        lot.crossStreet = lot.street.name;
        lot.waterDist = waterDist(x, z, col, row);
        lots.push(lot);
        block.lots.push(lot);
      }
    }
  }

  // Existing stock, deliberately under-built for its zoning — that gap is the game.
  for (const lot of lots) {
    const density = lot.tier === 'core' ? 0.72 : lot.tier === 'mid' ? 0.66 : 0.58;
    if (rnd() >= density) continue;
    const cap = Math.max(2, Math.round(minFloors(lot) * (0.15 + rnd() * 0.45)));
    // The stock that is already standing belongs to the era you start in.
    const floors = Math.min(cap, 26, Math.max(2, Math.round(era.maxFloors * 0.62)));
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


  // Lane spans: how far traffic can run down each avenue and along each street
  // before it would drive into the river.
  const lanes = { ns: new Map(), ew: new Map() };
  for (let col = 0; col < COLS; col++) {
    let lo = null, hi = null;
    for (let row = 0; row < ROWS; row++) if (isLand(col, row)) { if (lo === null) lo = row; hi = row; }
    if (lo !== null) lanes.ns.set(col, [cellCenter(col, hi).z - PITCH / 2, cellCenter(col, lo).z + PITCH / 2]);
  }
  for (let row = 0; row < ROWS; row++) {
    let lo = null, hi = null;
    for (let col = 0; col < COLS; col++) if (isLand(col, row)) { if (lo === null) lo = col; hi = col; }
    if (lo !== null) lanes.ew.set(row, [cellCenter(lo, row).x - PITCH / 2, cellCenter(hi, row).x + PITCH / 2]);
  }

  const city = { lots, blocks, corridors, lanes, land, isLand, seed };
  recomputeParkFront(city);

  city.rebuildLanes = () => {
    lanes.ns.clear(); lanes.ew.clear();
    for (let col = 0; col < COLS; col++) {
      let lo = null, hi = null;
      for (let row = 0; row < ROWS; row++) if (isLand(col, row)) { if (lo === null) lo = row; hi = row; }
      if (lo !== null) lanes.ns.set(col, [cellCenter(col, hi).z - PITCH / 2, cellCenter(col, lo).z + PITCH / 2]);
    }
    for (let row = 0; row < ROWS; row++) {
      let lo = null, hi = null;
      for (let col = 0; col < COLS; col++) if (isLand(col, row)) { if (lo === null) lo = col; hi = col; }
      if (lo !== null) lanes.ew.set(row, [cellCenter(lo, row).x - PITCH / 2, cellCenter(hi, row).x + PITCH / 2]);
    }
  };

  /**
   * Fill a water cell and lay four lots on it. New land is zoned generously and
   * is waterfront by definition, which is most of why anyone bothers.
   */
  city.addLandCell = (col, row, ownerId) => {
    if (land.has(`${col},${row}`)) return [];
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dc, dr]) => land.get(`${col + dc},${row + dr}`)).find(Boolean);
    const region = near || 'manhattan';
    land.set(`${col},${row}`, region);

    const { x: cx, z: cz } = cellCenter(col, row);
    const block = { col, row, bx: col, by: row, cx, cz, region, isPark: false,
                    hood: 'landfill', reclaimed: true, lots: [] };
    blocks.push(block);

    const tier = HOODS.landfill.tier;
    const off = (BLOCK / 2) - (LOT / 2) - 1;
    const made = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * off, z = cz + sz * off;
      const lot = {
        id: nextId++, col, row, bx: col, by: row, block,
        x, z, w: LOT, d: LOT,
        region, hood: 'landfill', tier, district: tier,
        far: DISTRICTS[tier].far,
        areaSf: LOT * LOT * SF_PER_M2,
        owner: ownerId || null, building: null, project: null,
        landPerSf: DISTRICTS[tier].landBase,
        seed: Math.floor(Math.random() * 1e6),
        name: null, reclaimed: true, parkFront: false,
      };
      lot.avenue = corridor(`${region}_av${col}`, avenueName(col, region), 'ns', col, region);
      lot.street = corridor(`${region}_st${row}`, crossName(row, region), 'ew', row, region);
      lot.avenue.lots.push(lot);
      lot.street.lots.push(lot);
      const num = 40 + row * 40 + (sz < 0 ? 0 : 20) + (sx < 0 ? 1 : 3);
      lot.address = `${num} ${lot.avenue.name}`;
      lot.crossStreet = lot.street.name;
      lots.push(lot);
      block.lots.push(lot);
      made.push(lot);
    }

    // Anything near the new shoreline is a different piece of land now.
    for (const l of lots) {
      if (Math.abs(l.col - col) <= 4 && Math.abs(l.row - row) <= 4) {
        l.waterDist = waterDist(l.x, l.z, l.col, l.row);
      }
    }
    city.rebuildLanes();
    return made;
  };

  return city;
}

/** Grid cell containing a world position. */
/**
 * Which lots look onto a park. Recomputed rather than fixed at generation,
 * because the city can buy a block off you and make a new one.
 */
export function recomputeParkFront(city) {
  const parks = city.blocks.filter((b) => b.isPark);
  for (const lot of city.lots) {
    lot.parkFront = parks.some((b) => Math.abs(b.cx - lot.x) < CONFIG.PITCH * 1.05
                                   && Math.abs(b.cz - lot.z) < CONFIG.PITCH * 1.05);
  }
}

export function cellOf(x, z) {
  return {
    col: Math.round((x + CONFIG.WIDTH / 2 - CONFIG.PITCH / 2) / CONFIG.PITCH),
    row: Math.round((CONFIG.DEPTH / 2 - CONFIG.PITCH / 2 - z) / CONFIG.PITCH),
  };
}

/** A water cell can be filled if it touches land you can already reach. */
export function canReclaim(city, col, row) {
  if (col < 0 || row < 0 || col >= CONFIG.COLS || row >= CONFIG.ROWS) return false;
  if (city.isLand(col, row)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => city.isLand(col + dc, row + dr));
}

/** How much shoreline the cell touches. More contact, cheaper fill. */
export function shoreContact(city, col, row) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([dc, dr]) => city.isLand(col + dc, row + dr)).length;
}

export function isWater(city, x, z) {
  const { col, row } = cellOf(x, z);
  return !city.isLand(col, row);
}

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

// Facade systems you can choose when you build.
export const STYLES = {
  brick:   { name: 'Brick',        type: 'brownstone', cost: 0.90, rent: 0.95 },
  loft:    { name: 'Industrial',   type: 'loft',       cost: 0.95, rent: 0.99 },
  masonry: { name: 'Masonry',      type: 'prewar',     cost: 1.00, rent: 1.02 },
  deco:    { name: 'Deco stone',   type: 'deco',       cost: 1.09, rent: 1.07 },
  curtain: { name: 'Curtain wall', type: 'midcentury', cost: 1.05, rent: 1.05 },
  glass:   { name: 'Glass',        type: 'glass',      cost: 1.20, rent: 1.15 },
};
export const FORMS = {
  slab:    { name: 'Slab',    cost: 0.95, rent: 0.96 },
  stepped: { name: 'Stepped', cost: 1.04, rent: 1.04 },
  point:   { name: 'Point',   cost: 1.13, rent: 1.10 },
};
// Construction used to be so cheap against the rents that a finished building
// was worth 2.6x what it cost and yielded 14% on it — against money at 5-7%.
// A spread that wide makes gearing free: there is no level of borrowing that
// is not obviously correct, and no downturn deep enough to punish it. At these
// costs the yield lands near 9.5%, which is still a good business in the good
// years and falls under the interest rate in the bad ones — which is the only
// thing that makes an ungeared builder the better builder.
export const USES = {
  office:      { name: 'Office',      rent: 78, cost: 700, opex: 0.34 },
  residential: { name: 'Residential', rent: 62, cost: 630, opex: 0.30 },
  mixed:       { name: 'Mixed-use',   rent: 70, cost: 675, opex: 0.32 },
};
