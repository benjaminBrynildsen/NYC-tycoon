// The simulation: money, land value, construction, the market cycle, and the
// rival developers you're racing. Runs on a day tick. No rendering in here.

import { CONFIG, DISTRICTS, USES, STYLES, FORMS, REGIONS, HOODS, ERAS, eraAt, buildableSf,
         massing, minFloors, maxFloors, ownsWholeBlock, BLOCK_ASSEMBLY_FLOORS, canReclaim,
         shoreContact, mulberry32, recomputeParkFront, SIGNAGE_YEAR } from './world.js';
import { landmarkById, landmarkStatus, LANDMARKS } from './landmarks.js';
import { tickContracts, contractBias, titleFor, rankFor, nextRank } from './contracts.js';

export const START_CASH = 100_000_000;
export const RACE_YEARS = 70;         // however long a career is
export const CAP_RATE = 0.055;        // what a stabilised building is worth per $ of NOI
export const INTEREST = 0.065;        // annual, interest-only
export const MAX_LTC = 0.75;          // the most anyone can borrow, at the top rank

/** What this developer's standing has earned them at the bank. */
export function termsFor(state, actorId) {
  return rankFor(state.actors[actorId]?.standing ?? 0);
}
export function maxLtcFor(state, actorId) { return termsFor(state, actorId).ltc; }
export function interestFor(state, actorId) { return termsFor(state, actorId).interest; }

export const RIVALS = [
  { id: 'r1', name: 'Halvorsen Estates', color: 0xd4664a, strategy: 'institution',
    blurb: 'Old money. Patient, unlevered, prime sites only.' },
  { id: 'r2', name: 'Vance Bros. Capital', color: 0xe0b341, strategy: 'cowboy',
    blurb: 'Maximum leverage, maximum speed. Always over-extended.' },
  { id: 'r3', name: 'Kestrel Holdings', color: 0x6fa8c7, strategy: 'grinder',
    blurb: 'Cheap lots, high volume, thin margins. Grinds you down.' },
];

// --------------------------------------------------------------- the band
//
// A tycoon game with three competent rivals and no handicap has exactly one
// difficulty, and it is the difficulty of whoever tuned it. Somebody on their
// first building is playing the same race as somebody on their fifth, against
// firms that compound whether or not you understood the air-rights market.
//
// So the city leans on you in proportion to how you are actually doing. Heat
// is one number. Below 1 the rivals are slower to commit, fussier about what
// pencils, and the bank is patient with a small book. Above 1 they move on
// less, spend more of their cash, and your lender stops being sentimental.
//
// Two things drive it, and both are things you can see: the rank you have
// climbed to, and where your balance sheet stands against the best of theirs.
// Nothing is hidden and nothing is random — a beginner is left alone because
// they are behind, not because a difficulty slider said so.

export const LEVELS = {
  quiet: {
    id: 'quiet', name: 'Learning the trade', base: 0.52, swing: 0.72, cap: 1.08,
    note: 'The three of them work their own patch and leave you alone until you are '
        + 'worth noticing. The bank is patient. Recommended for a first city.',
  },
  even: {
    id: 'even', name: 'A working developer', base: 0.70, swing: 0.95, cap: 1.55,
    note: 'They match you. Fall behind and they ease off; get ahead and every site '
        + 'you want has somebody else bidding on it.',
  },
  hard: {
    id: 'hard', name: 'They know your name', base: 0.98, swing: 0.88, cap: 1.90,
    note: 'No mercy at the bottom and no ceiling at the top. The city is trying to '
        + 'take the block off you from the first year.',
  },
  flat: {
    id: 'flat', name: 'No handicap', base: 1, swing: 0, cap: 1,
    note: 'The old race. Everyone plays the same game from the first day to the last, '
        + 'whether or not you can keep up.',
  },
};

export const DEFAULT_LEVEL = 'even';

/** How long the city takes to start pricing against you at all. */
export const GRACE_YEARS = 5;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * How hard the city is leaning on you, and why. Read quarterly and cached on
 * the state, because it walks every lot once per developer.
 */
export function heatFor(state) {
  const level = LEVELS[state.level] ?? LEVELS[DEFAULT_LEVEL];
  if (!level.swing) return { heat: level.base, level, rankShare: 0, lead: 0.5 };

  const you = netWorth(state, 'player');
  let best = 0;
  for (const id in state.actors) {
    if (id === 'player' || state.actors[id].retired) continue;
    best = Math.max(best, netWorth(state, id));
  }
  // Doubling in on them, or halving against them, is what moves the needle —
  // so the ratio is read in octaves rather than straight. Level pegs at 0.5.
  const ratio = you / Math.max(best, 1);
  const lead = clamp01(0.5 + Math.log2(Math.max(ratio, 1e-6)) / 4);
  const rankShare = clamp01((state.actors.player.standing ?? 0) / 21);
  // Nobody is worth pricing against in their first few years, and on day one
  // the comparison is nonsense anyway: you hold a building and they hold cash
  // they have not spent yet. So the band opens at its floor and comes on over
  // five years, which is also the stretch a beginner most needs left alone.
  const settling = clamp01(state.day / (GRACE_YEARS * 360));
  const push = (0.4 * rankShare + 0.6 * lead) * settling;
  const heat = Math.min(level.cap, level.base + level.swing * push);
  return { heat, level, rankShare, lead, ratio, settling };
}

/** What to call the pressure, for the panel and for the paper. */
export function heatLabel(heat) {
  if (heat < 0.78) return 'They have not noticed you';
  if (heat < 1.02) return 'They are working their own patch';
  if (heat < 1.30) return 'They have noticed you';
  if (heat < 1.60) return 'They are building against you';
  return 'The whole city wants your block';
}

/**
 * What an owner asks when there is somebody else in the room. Nobody holds out
 * against a developer with one building; everybody holds out against the house
 * that is buying the whole district. Centred on 1 at an even race, so it costs
 * a beginner a few per cent less to get started and a dominant player more.
 */
export function contested(state) {
  return 1 + ((state.heat ?? 1) - 1) * 0.09;
}

/** Multipliers the rest of the sim reads, so nothing else knows about heat. */
export function pressure(state) {
  const heat = state.heat ?? 1;
  return {
    heat,
    // Mercy comes off the bar, pressure does not go back on it. A house that
    // has noticed you does not get *worse* at picking schemes — dropping their
    // return bar far below par made them take marginal deals, tie up their
    // capital in them and compound slower, so leaning harder on the player
    // quietly made the rivals weaker. Below par they are fussier; above par
    // the bar barely moves and the pressure comes from speed and cash instead.
    threshold: Math.max(0.92, 1 / heat),
    // Higher heat, deeper pockets: they put more of their cash on the table.
    commit: Math.min(1.25, heat),
    // Higher heat, less waiting between schemes.
    patience: Math.max(0.35, 2 - heat),
    // Below 1 the bank is patient with a small book; above it, less so.
    callLtv: CALL_LTV + (1 - heat) * 0.07,
    callMonths: Math.max(3, Math.round(CALL_MONTHS + (1 - heat) * 14)),
  };
}

export function createState(city, seed = 11, startYear = 1998, level = DEFAULT_LEVEL) {
  const rnd = mulberry32(seed + 99);

  const actors = {
    player: {
      id: 'player', name: 'You', color: 0x4ade80,
      cash: START_CASH, debt: 0, gsfBuilt: 0, isPlayer: true, history: [],
      regions: new Set(['manhattan']),
    },
  };
  for (const r of RIVALS) {
    actors[r.id] = {
      ...r, cash: START_CASH, debt: 0, gsfBuilt: 0, isPlayer: false,
      regions: new Set(['manhattan']),
      patience: r.strategy === 'institution' ? 3 : r.strategy === 'cowboy' ? 0 : 1,
      ltc: r.strategy === 'cowboy' ? 0.65 : r.strategy === 'institution' ? 0.3 : 0.5,
      cooldown: 0,
    };
  }

  return {
    city,
    actors,
    day: 0,
    startYear,
    endYear: startYear + RACE_YEARS,
    era: eraAt(startYear).name,
    cycle: 1.0,          // market multiplier on rents and land
    cyclePhase: rnd() * Math.PI * 2,
    projects: [],
    fills: [],
    landmarks: {},        // signature designs, one of each, ever
    level: LEVELS[level] ? level : DEFAULT_LEVEL,
    heat: LEVELS[level] ? LEVELS[level].base : LEVELS[DEFAULT_LEVEL].base,
    contracts: [],
    contractsPostedAt: -999,
    log: [],
    news: [],
    mood: 'steady',
    rnd,
    monthOfLastTick: -1,
  };
}

export const DAY_MS = 1;
export function dateOf(state) {
  const d = new Date(Date.UTC(state.startYear, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(state.day));
  return d;
}
export function currentYear(state) { return dateOf(state).getUTCFullYear(); }
export function currentEra(state) { return eraAt(currentYear(state)); }

export function formatDate(state) {
  const d = dateOf(state);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function money(n) {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function sf(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M sf`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K sf`;
  return `${Math.round(n)} sf`;
}

// ---------------------------------------------------------------- valuation

/** How built-up the neighbourhood is. Development pulls land value up around it. */
/**
 * Lots bucketed by grid cell, so a neighbourhood query does not have to walk
 * the whole city. Rebuilt whenever the lot count changes — which now happens
 * every time a fill lands, and can happen a great many times in a game where
 * making ground costs nine million a cell.
 */
export function lotIndex(city) {
  if (city._lotIndex && city._lotIndexAt === city.lots.length) return city._lotIndex;
  const m = new Map();
  for (const l of city.lots) {
    const key = `${l.col},${l.row}`;
    let bucket = m.get(key);
    if (!bucket) m.set(key, bucket = []);
    bucket.push(l);
  }
  city._lotIndex = m;
  city._lotIndexAt = city.lots.length;
  return m;
}

/**
 * How built-up a lot's surroundings are, 0 to 1. This is what makes land
 * appreciate as the city grows around it.
 *
 * It used to walk every lot in the city for every lot in the city, once a
 * month — fine at five hundred lots and quadratic thereafter. Reclamation can
 * now double the lot count in a decade, so it reads a bucket index instead
 * and only looks at the cells the radius can actually reach.
 */
export function localIntensity(state, lot, radius = 150) {
  const index = lotIndex(state.city);
  const span = Math.ceil(radius / CONFIG.PITCH);
  const r2 = radius * radius;
  let built = 0, capacity = 0;
  for (let dr = -span; dr <= span; dr++) {
    for (let dc = -span; dc <= span; dc++) {
      const bucket = index.get(`${lot.col + dc},${lot.row + dr}`);
      if (!bucket) continue;
      for (const l of bucket) {
        const dx = l.x - lot.x, dz = l.z - lot.z;
        if (dx * dx + dz * dz > r2) continue;
        capacity += buildableSf(l);
        if (l.building) built += l.building.gsf;
      }
    }
  }
  return capacity > 0 ? built / capacity : 0;
}

/**
 * Everything about a lot that isn't its size or its zoning: the water, the park
 * across the street, the corridor it fronts, and the state of its neighbours.
 * Returned as separate factors so the UI can show you *why* a lot is worth what
 * it's worth.
 */
export function premiums(state, lot) {
  const water = lot.waterDist < 120 ? 1 + 0.42 * (1 - lot.waterDist / 120) : 1;
  const park = lot.parkFront ? 1.24 : 1;
  const corridorFame = Math.max(lot.avenue.fame, lot.street.fame);
  const corridor = 1 + corridorFame * 0.38;
  const blight = 1 - (lot._blight ?? 0) * 0.34;
  const intensity = 0.65 + (lot._intensity ?? 0.35) * 0.9;
  // Ground you made is worth what stands on it. Refreshed monthly by
  // updateMadeGround; 1 on land that was always there.
  const made = lot.reclaimed ? (lot.block._madeMul ?? 1) : 1;
  return { water, park, corridor, blight, intensity, made,
           total: water * park * corridor * blight * intensity * made };
}

/**
 * Which buildings may carry signs.
 *
 * Two gates, both of them rules the city already has: the sign code only
 * changed in 1980, and only a designated subdistrict may light a flank wall.
 * Midtown is the one the map starts with — and made ground that has become a
 * destination is granted the same rights, because that is precisely the case
 * the code was written for.
 */
function updateSignage(state) {
  if (currentYear(state) < SIGNAGE_YEAR) return;
  let changed = false;
  for (const lot of state.city.lots) {
    const zoned = HOODS[lot.hood]?.signage || lot.block.destination;
    const want = !!(zoned && lot.building && lot.building.floors >= 6);
    if (want !== !!lot._signs) { lot._signs = want; changed = true; }
  }
  // The boards are geometry, so the buildings that gained them have to be
  // rebuilt — otherwise the code changes and nothing on the street does.
  if (changed) state._dirtyGeometry = true;
}

/** How much a landmass has to have on it before the ferries start running. */
const DESTINATION_GSF = 1_400_000;

/**
 * What made ground is worth.
 *
 * Fill is cheap and four lots arrive with every cell, so if made ground were
 * priced like the rest of the city then the whole game would be to run a
 * causeway out to the edge of the harbour and stop. It is priced as what it
 * is instead — spoil and rock, worth about what the barges cost — and the
 * value comes from what gets built on it. Sink a tower into an island and the
 * ground under the whole island follows; leave it bare and it stays bare.
 *
 * Landmass-wide on purpose. One good building lifts its neighbours, which is
 * how a district happens, and it means a causeway with nothing on it is worth
 * nothing however long it is.
 */
export function updateMadeGround(state) {
  const made = new Map();
  for (const b of state.city.blocks) if (b.reclaimed) made.set(`${b.col},${b.row}`, b);
  if (!made.size) return;

  const seen = new Set();
  for (const [key, start] of made) {
    if (seen.has(key)) continue;
    // Flood the landmass this block belongs to.
    const group = [];
    const queue = [key];
    seen.add(key);
    while (queue.length) {
      const k = queue.pop();
      const block = made.get(k);
      if (!block) continue;
      group.push(block);
      const [c, r] = k.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = `${c + dc},${r + dr}`;
        if (seen.has(n) || !made.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }

    let invested = 0, lots = 0, gsf = 0, tallest = 0, landmark = false;
    for (const block of group) {
      for (const lot of block.lots) {
        lots++;
        const b = lot.building;
        if (!b) continue;
        invested += buildingValue(state, lot);
        gsf += b.gsf;
        tallest = Math.max(tallest, b.floors);
        if (b.landmark) landmark = true;
      }
    }
    const perLot = invested / Math.max(1, lots);
    // Calibrated against a fully built island: towers on every lot put about
    // $300M of building on each one, which is where the ceiling bites. Bare
    // ground sits at 1, and the neighbourhood-intensity term in premiums()
    // already carries some of this — the two together take a made lot from
    // about $1.5M of spoil to $25-30M of address.
    const mul = 1 + Math.min(3.5, perLot / 86e6);
    // Somewhere worth crossing the water for. A skyline of its own, or one
    // building people have heard of.
    const destination = gsf >= DESTINATION_GSF && (tallest >= 25 || landmark);
    for (const block of group) {
      block._madeMul = mul * (destination ? 1.18 : 1);
      block._madeLots = lots;
      block._madeInvested = invested;
      if (destination && !block.destination) block.destination = true;
    }
    // Any block in the landmass remembering the story is enough: a cell that
    // joins later must not run it again.
    if (destination && !group.some((b) => b._destinationSaid)) {
      for (const block of group) block._destinationSaid = true;
      const where = group[0].lots[0];
      pushNews(state, 'reclaim', 'THE FERRIES START RUNNING TO THE NEW GROUND',
        `${sf(gsf)} now stands on ground that was open water, and the city has put a `
        + `${tallest}-storey skyline on it. People are crossing the harbour to look at it, `
        + `which is worth more to the land than the buildings are: everything on this `
        + `landmass is reassessed.`, where);
    }
  }
}

export function landValue(state, lot) {
  // A lot whose rights have been transferred is still land, just not a site.
  const rights = buildableSf(lot);
  const priced = rights > 0 ? rights : lot.areaSf * 0.6;
  return lot.landPerSf * priced * premiums(state, lot).total * state.cycle;
}

/**
 * Unused entitlement sitting on the rest of a block you already own. Moving it
 * onto one lot costs paperwork, not money — which is exactly why assembling a
 * whole block is worth doing.
 */
export function blockSpareSf(lot, actorId) {
  if (!ownsWholeBlock(lot, actorId)) return 0;
  let spare = 0;
  for (const other of lot.block.lots) {
    if (other === lot || other.airSpent) continue;
    spare += Math.max(0, buildableSf(other) - (other.building ? other.building.gsf : 0));
  }
  return spare;
}

/**
 * What the anonymous owner of a lot will take for it.
 *
 * This used to be priced off the land alone with a flat markup for anything
 * standing on it, which meant a well-let eleven-storey building cost the same
 * as a derelict walk-up on the identical plot — and about 60% less than the
 * asset was worth the moment you signed. Buying out the npc pool was simply
 * the best business in the game, and it made nonsense of the premise, which is
 * that the bargain is the *under-built* lot, not any lot.
 *
 * You buy the site and whatever stands on it, so the price is the whole of it.
 * An owner with no house behind them has less staying power than a rival firm:
 * a modest premium when the market is with them, and a real discount when it
 * is not, which is what makes buying in a slump worth waiting for.
 */
export function askPrice(state, lot) {
  const land = landValue(state, lot);
  if (!lot.building) return land * 1.06 * contested(state);
  const intrinsic = land + buildingValue(state, lot);
  const mood = state.cycle > 1.15 ? 1.14 : state.cycle < 0.85 ? 0.92 : 1.04;
  return intrinsic * mood * contested(state);
}

/**
 * Height is the most expensive thing in construction. Hoisting, concrete
 * pumping, lift banks, wind engineering and a longer schedule all compound, so
 * cost per square foot runs away rather than creeping.
 */
/**
 * What a floor costs, as you pile them up. Steel, wind, lifts and the time it
 * all takes.
 *
 * This used to rise so much faster than the view premium that height was a
 * pure loss at every level — a 150-floor tower earned 59% less on its cost
 * than a squat one, so no rational builder ever went up and the rivals put up
 * 652 buildings without one of them passing thirty floors. It is a gentler
 * curve now, and paired with a stronger premium on the view it crosses over
 * around forty floors: a tall building is a premium play rather than a
 * mistake, and what actually limits it is air rights, which is where the
 * limit belongs.
 */
export function heightCostMul(floors) {
  return 1 + 0.007 * floors + 0.00004 * floors * floors;
}

/** Lifts and structure eat a growing share of every floor as you go up. */
export function coreEfficiency(floors) {
  return Math.max(0.62, 0.88 - floors * 0.0011);
}

export function rentPerSf(state, lot, use, floors, quality = 1) {
  const u = USES[use];
  // Views are worth money and trophy height is worth disproportionately more,
  // but efficiency losses claw some of it back.
  // Height sells. The top of a tower is worth disproportionately more than
  // the middle of it, and this is the term that pays for going up at all.
  const view = 1 + floors / 150 + Math.pow(floors / 105, 2) * 1.0;
  const eff = coreEfficiency(floors) / coreEfficiency(10);
  const p = premiums(state, lot);
  // Intensity and the made-ground premium are land terms, not rent terms, so
  // they stay out of this — otherwise the value of a building would feed the
  // value of its own ground and back again.
  const place = p.water * p.park * p.corridor * p.blight
    // Somewhere people cross the water to see rents better than somewhere
    // they do not. This is what the ferries are worth.
    * (lot.block.destination ? 1.15 : 1);
  return u.rent * DISTRICTS[lot.district].rentMul * view * eff * quality * place * state.cycle;
}

export function costPerSf(lot, use, floors) {
  return USES[use].cost * heightCostMul(floors);
}

export function occupancyFor(state, lot) {
  const glut = Math.max(0, (lot._intensity ?? 0.35) - 0.72) * 1.1;
  return Math.max(0.55, Math.min(0.97, 0.94 * state.cycle - glut));
}

export function buildingNOI(state, lot) {
  const b = lot.building;
  if (!b) return 0;
  const cond = 0.55 + (b.condition ?? 1) * 0.45;
  const gross = b.gsf * rentPerSf(state, lot, b.use, b.floors, (b.quality ?? 1) * cond)
                * (b.designRent ?? 1);
  const occ = occupancyFor(state, lot);
  return gross * occ * (1 - USES[b.use].opex);
}

export function buildingValue(state, lot) {
  // A signature building is worth more than its rent roll says, because the
  // next buyer is buying the address as well as the income. This is the whole
  // of what the architect's fee bought.
  return (buildingNOI(state, lot) / CAP_RATE) * (lot.building?.prestige ?? 1);
}

/** Storeys above which a finished building is part of the skyline for good. */
export const LANDMARK_FLOORS = 50;

/**
 * You can trade a tower, but you cannot simply erase one. Anything this tall
 * is somebody's address, and knocking it down to rebuild slightly bigger is
 * not a move the city allows.
 */
export function demolitionBlock(lot) {
  const b = lot.building;
  // There is one of each signature design ever. Knocking one down to put up
  // something slightly bigger would take it out of the city for good.
  const L = landmarkById(b?.landmark);
  if (L) {
    return `${L.name} stands at ${lot.address}. There is one of these, and it does not come down.`;
  }
  if (!b || b.floors < LANDMARK_FLOORS) return null;
  return `${lot.name || lot.address} is ${b.floors} storeys. Nothing over `
       + `${LANDMARK_FLOORS} comes down — it can change hands, but not be cleared.`;
}

export const DEFAULT_DESIGN = { style: 'masonry', form: 'stepped', variant: 1 };

export function designMul(design = DEFAULT_DESIGN) {
  const st = STYLES[design.style] || STYLES.masonry;
  const fm = FORMS[design.form] || FORMS.stepped;
  // A signature design overrides the form entirely — its silhouette is drawn,
  // not chosen off a list — and the architect's fee is on top of everything.
  const L = landmarkById(design.landmark);
  if (L) return { cost: st.cost * L.fee, rent: L.rent, prestige: L.prestige };
  return { cost: st.cost * fm.cost, rent: st.rent * fm.rent, prestige: 1 };
}

export function quote(state, lot, floors, use, ltc, design = DEFAULT_DESIGN, owner = 'player') {
  const m = massing(lot, floors);
  const dm = designMul(design);
  const land = lot.owner === owner ? 0 : askPrice(state, lot);
  // Floor area beyond your entitlement has to be bought from the neighbours,
  // and they know exactly why you want it.
  const airRate = landValue(state, lot) / Math.max(1, buildableSf(lot) || lot.areaSf * lot.far);
  const spare = blockSpareSf(lot, owner);
  const freeAir = Math.min(m.airSf || 0, spare);         // moved from your own block
  const paidAir = (m.airSf || 0) - freeAir;              // bought from the neighbours
  const air = paidAir * airRate * 1.45;
  const hard = m.gsf * costPerSf(lot, use, floors) * dm.cost;
  const soft = hard * 0.14;
  const total = land + air + hard + soft;
  const loan = Math.min(total * ltc, total * maxLtcFor(state, owner));
  const equity = total - loan;
  const gross = m.gsf * rentPerSf(state, lot, use, floors, 1) * dm.rent;
  const noi = gross * occupancyFor(state, lot) * (1 - USES[use].opex);
  const debtService = loan * interestFor(state, owner);
  const months = Math.round(8 + floors * 0.42 + Math.pow(floors / 34, 2));
  return { ...m, land, air, freeAir, paidAir, spare, hard, soft, total, loan, equity, gross, noi,
           debtService, cashflow: noi - debtService,
           yieldOnCost: noi / Math.max(total, 1),
           // A signature address is worth more than its income; see buildingValue.
           value: (noi / CAP_RATE) * (dm.prestige ?? 1), months };
}

export function netWorth(state, actorId) {
  const a = state.actors[actorId];
  let assets = 0;
  for (const lot of state.city.lots) {
    if (lot.owner !== actorId) continue;
    assets += landValue(state, lot);
    if (lot.building) assets += buildingValue(state, lot);
  }
  for (const p of state.projects) {
    if (p.owner === actorId) assets += p.spent;   // work in place has value
  }
  return a.cash + assets - a.debt;
}

export function leaderboard(state) {
  return Object.values(state.actors)
    .filter((a) => !a.retired)
    .map((a) => ({ ...a, worth: netWorth(state, a.id),
                   standing: a.standing ?? 0, title: titleFor(a.standing ?? 0) }))
    .sort((x, y) => y.worth - x.worth);
}

// ---------------------------------------------------------- where you may work

/**
 * The outer boroughs need a balance sheet Manhattan alone doesn't. Until a
 * developer is worth a billion, the river is a wall.
 */
export function canWorkIn(state, actorId, region) {
  const a = state.actors[actorId];
  return !!a && a.regions.has(region);
}

export function regionGate(state, actorId, lot) {
  if (canWorkIn(state, actorId, lot.region)) return null;
  const need = REGIONS[lot.region].unlockAt;
  const have = netWorth(state, actorId);
  return `${REGIONS[lot.region].name} opens at ${money(need)} net worth — you're at ${money(have)}.`;
}

/** The city learns to build differently, and the paper notices. */
function checkEra(state) {
  const era = currentEra(state);
  if (era.name === state.era) return;
  state.era = era.name;
  pushNews(state, 'era', era.name.toUpperCase(),
    `${era.note} ${era.styles.length} facade system${era.styles.length > 1 ? 's' : ''} are now `
    + `available, and nothing taller than ${era.maxFloors} storeys can be engineered yet.`);
  logEvent(state, 'player', `— the city enters ${era.name}`);
}

/** Crossing a billion opens the rest of the city. */
// -------------------------------------------------------------- green space

// What share of a district the city would like to see left open. Below this it
// will pay well for a block; above it, it has better things to do with public
// money. Roughly what a real planning department aims at.
export const PARK_TARGET = 0.14;

/**
 * How badly the city wants a park on this block: how far short the district
 * is of its open-space target, weighted by how built-up the area actually is.
 * Empty blocks on the edge of Harlem are not a parks crisis.
 */
export function parkAppetite(state, block) {
  const near = state.city.blocks.filter(
    (b) => Math.abs(b.col - block.col) <= 3 && Math.abs(b.row - block.row) <= 3);
  if (!near.length) return 0;
  const ratio = near.filter((b) => b.isPark).length / near.length;
  const shortfall = Math.max(0, (PARK_TARGET - ratio) / PARK_TARGET);
  const density = Math.min(1, block.lots.reduce(
    (n, l) => n + (l._intensity ?? 0.3), 0) / Math.max(1, block.lots.length));
  return Math.max(0, Math.min(1, shortfall * (0.35 + density * 0.9)));
}

/**
 * What the city will pay for a block to turn into a park, and why not.
 *
 * It buys blocks rather than lots because a park is a block here — which also
 * means this is the other thing an assembled block is good for, and the land
 * you kept around it goes up by the park premium the moment the deal closes.
 */
export function parkOffer(state, block, actorId = 'player') {
  if (block.isPark) return { ok: false, why: 'Already a park.' };
  if (!block.lots.length) return { ok: false, why: 'Nothing here to buy.' };
  if (!block.lots.every((l) => l.owner === actorId)) {
    const held = block.lots.filter((l) => l.owner === actorId).length;
    return { ok: false, why: `The city buys whole blocks. You hold ${held} of ${block.lots.length}.` };
  }
  if (block.lots.some((l) => l.project)) {
    return { ok: false, why: 'Not while something is under construction.' };
  }
  if (block.lots.some((l) => l.building && l.building.floors >= LANDMARK_FLOORS)) {
    return { ok: false, why: `Nothing ${LANDMARK_FLOORS} floors or over comes down for a lawn.` };
  }
  const sig = block.lots.find((l) => l.building?.landmark);
  if (sig) {
    return { ok: false,
             why: `${landmarkById(sig.building.landmark).name} stands on this block. The city is `
                + 'not clearing it for grass.' };
  }

  const appetite = parkAppetite(state, block);
  const land = block.lots.reduce((n, l) => n + landValue(state, l), 0);
  const loans = block.lots.reduce((n, l) => n + (l.loan ?? 0), 0);
  if (appetite < 0.12) {
    return { ok: false, appetite, why: 'This district has all the green space the city thinks it needs.',
             price: 0 };
  }
  // A park-starved, built-up district pays over the odds for the land; a
  // comfortable one barely covers it. The buildings are not paid for — the
  // city is buying ground, and it will clear whatever is on it.
  const price = land * (0.75 + appetite * 0.85);
  return { ok: true, appetite, price, land, loans, net: price - loans };
}

/** Sell it, and watch everything you kept around it get better. */
export function sellBlockToCity(state, block, actorId = 'player') {
  const offer = parkOffer(state, block, actorId);
  if (!offer.ok) return offer;
  const a = state.actors[actorId];

  let proceeds = offer.price;
  for (const lot of block.lots) {
    const share = proceeds / block.lots.length;
    const { net } = settleLoan(state, lot, actorId, share);
    a.cash += net;
    lot.owner = 'city';
    lot.building = null;
    block.soldBy = actorId;
    lot.project = null;
    lot.name = null;
  }
  block.isPark = true;
  recomputeParkFront(state.city);
  a.standing = (a.standing ?? 0) + 1;
  state._dirtyTerrain = true;
  state._dirtyGeometry = true;

  const where = block.lots[0];
  logEvent(state, actorId, `sold the block at ${where.crossStreet} to the city for a park`);
  pushNews(state, 'park', `A PARK FOR ${where.crossStreet.toUpperCase()}`,
    `${a.name === 'You' ? 'You have' : `${a.name} has`} sold the whole block at `
    + `${where.crossStreet} and ${where.avenue.name} to the city for ${money(offer.price)}, `
    + `and it comes down for open ground. Every lot that now looks onto it is worth more than `
    + `it was this morning — including the ones nobody sold.`, where);
  return { ok: true, price: offer.price };
}

// ------------------------------------------------------------- margin calls

export const CALL_LTV = 0.80;      // where the bank stops being relaxed
export const CALL_MONTHS = 6;      // how long you get to put it right

/** Loan to value on one lot, which is what the bank actually looks at. */
export function ltvOf(state, lot) {
  const loan = lot.loan ?? 0;
  if (loan <= 0) return 0;
  const value = landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0);
  return value > 0 ? loan / value : 99;
}

/**
 * Debt used to be free money: you could borrow to the hilt, watch values fall
 * through the floor and nothing whatever would happen. Now the bank is
 * watching, and the market cycle has something to bite on.
 *
 * A loan worth more than 85% of the asset is called. You get six months to
 * sell it, pay it down or wait for values to recover. Miss that and the bank
 * takes the asset and puts it on the market, where whoever is holding cash at
 * the bottom of a cycle gets a very good price — which is the other half of
 * why a slump matters.
 */
function checkMargin(state) {
  // Running out of money is the other way a loan goes bad, and in this game it
  // is by far the likelier one: a finished building is usually worth more than
  // it cost, so values rarely fall through the loan, but a developer who has
  // borrowed more than the rents can service bleeds out steadily.
  for (const id in state.actors) {
    const a = state.actors[id];
    if (a.retired) continue;
    // The clock only runs while there is something the bank could actually
    // take. Warning a developer whose whole position is still a hole in the
    // ground gives them six months they cannot use.
    const p = pressure(state);
    const seizable = state.city.lots.filter(
      (l) => l.owner === id && !l.project && l.loan > 0);
    const broke = a.cash < 0 && a.debt > 0 && seizable.length > 0;
    if (!broke) { a.insolventSince = null; continue; }
    if (!a.insolventSince) {
      a.insolventSince = state.day;
      logEvent(state, id, `cannot service ${money(a.debt)} of debt`);
      if (a.isPlayer) {
        pushNews(state, 'margin', 'YOUR BANKERS WANT A WORD',
          `You are ${money(-a.cash)} overdrawn against ${money(a.debt)} of debt, and the rents are `
          + `not covering it. Sell something within ${p.callMonths} months or the bank will choose `
          + `for you — and it will not choose well.`);
      }
    }
    // Past the grace period the bank takes the weakest asset, every month,
    // until the bleeding stops.
    if (state.day - a.insolventSince < p.callMonths * 30) continue;
    seizable.sort((x, y) => ltvOf(state, y) - ltvOf(state, x));
    foreclose(state, seizable[0], a);
  }

  const band = pressure(state);
  for (const lot of state.city.lots) {
    const owner = lot.owner && state.actors[lot.owner];
    if (!owner || lot.project) { lot.calledOn = null; continue; }
    if (!(lot.loan > 0)) { lot.calledOn = null; continue; }

    const ltv = ltvOf(state, lot);
    // A lender is patient with a small book and impatient with a big one, so
    // the covenant itself moves with the band.
    if (ltv <= band.callLtv) {
      if (lot.calledOn && owner.isPlayer) {
        pushNews(state, 'margin', `${lot.address.toUpperCase()} IS OUT OF DANGER`,
          `Values have come back far enough that the loan on ${lot.address} sits inside its `
          + `covenant again. The bank has withdrawn the demand.`, lot);
      }
      lot.calledOn = null;
      continue;
    }

    if (!lot.calledOn) {
      lot.calledOn = state.day;
      logEvent(state, owner.id, `margin call on ${lot.address} — ${Math.round(ltv * 100)}% LTV`);
      if (owner.isPlayer) {
        pushNews(state, 'margin', `THE BANK CALLS THE LOAN ON ${lot.address.toUpperCase()}`,
          `${money(lot.loan)} is lent against a building the market now says is worth `
          + `${money(landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0))}. `
          + `You have ${band.callMonths} months to sell it, pay it down, or see the value come back. `
          + `After that the bank sells it for you.`, lot);
      }
      continue;
    }

    if (state.day - lot.calledOn < band.callMonths * 30) continue;
    foreclose(state, lot, owner);
  }
}

/** The bank sells it, badly, and somebody with cash gets a bargain. */
function foreclose(state, lot, owner) {
  const gross = (landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0)) * 0.7;
  const { shortfall } = settleLoan(state, lot, owner.id, gross);
  owner.cash -= shortfall;                 // you still owe whatever it did not cover
  lot.calledOn = null;

  // Whoever has the deepest pockets picks it up at the forced price.
  const buyer = Object.values(state.actors)
    .filter((x) => x.id !== owner.id && !x.retired && x.cash > gross * 1.3
            && x.regions.has(lot.region))
    .sort((x, y) => y.cash - x.cash)[0];
  if (buyer) {
    buyer.cash -= gross;
    lot.owner = buyer.id;
    logEvent(state, buyer.id, `bought ${lot.address} out of foreclosure for ${money(gross)}`);
  } else {
    lot.owner = 'npc';
  }
  logEvent(state, owner.id, `lost ${lot.address} to the bank`);
  // "YOU LOSES 41 BROADWAY" is not a headline.
  const you = !!owner.isPlayer;
  pushNews(state, 'margin',
    you ? `THE BANK TAKES ${lot.address.toUpperCase()} FROM YOU`
        : `${owner.name.toUpperCase()} LOSES ${lot.address.toUpperCase()}`,
    `The bank has taken ${lot.address} ${you ? 'off you' : `from ${owner.name}`} `
    + `and sold it for ${money(gross)}`
    + `${buyer ? ` to ${buyer.name}` : ' into a thin market'}. `
    + (shortfall > 0 ? `${money(shortfall)} of the loan is still outstanding and follows `
                       + `${you ? 'you' : 'the borrower'}. ` : '')
    + `A building bought at the bottom of a cycle is the cheapest floor area anybody will see for years.`,
    lot);
}

/** Moving up the trade's own ranking is worth saying out loud. */
function checkRank(state) {
  for (const id in state.actors) {
    const a = state.actors[id];
    const rank = rankFor(a.standing ?? 0);
    if (a._rank === rank.title) continue;
    const first = a._rank === undefined;
    a._rank = rank.title;
    if (first || rank.at === 0) continue;
    if (a.isPlayer) {
      logEvent(state, id, `— the trade now calls you a ${rank.title}`);
      pushNews(state, 'unlock', `THE TRADE CALLS YOU A ${rank.title.toUpperCase()}`,
        `${rank.at} pieces of delivered work and the city has stopped treating you as a `
        + `newcomer. ${rank.perk}`);
    } else {
      logEvent(state, id, `— is now rated a ${rank.title}`);
    }
  }
}

function checkUnlocks(state) {
  for (const id in state.actors) {
    const a = state.actors[id];
    if (a.regions.size > 1) continue;
    if (netWorth(state, id) < REGIONS.brooklyn.unlockAt) continue;
    a.regions.add('brooklyn');
    a.regions.add('queens');
    if (a.isPlayer) {
      logEvent(state, id, '— crossed $1B; Brooklyn and Queens are open');
      pushNews(state, 'unlock', 'THE RIVER IS NO LONGER A WALL',
        `With a balance sheet past ${money(REGIONS.brooklyn.unlockAt)}, you can now buy and build `
        + `across the East River. Brooklyn Heights and Long Island City are cheap, under-built and `
        + `closer to Midtown than anything left on the island.`);
    } else {
      logEvent(state, id, '— crossed $1B and is looking at the boroughs');
    }
  }
}

// ------------------------------------------------------- taking over a firm

/** A firm's books, for the screen where you choose which one to become. */
export function firmSummary(state, id) {
  const a = state.actors[id];
  const b = worthBreakdown(state, id);
  let flagship = null;
  for (const lot of state.city.lots) {
    if (lot.owner !== id || !lot.building) continue;
    if (!flagship || lot.building.floors > flagship.building.floors) flagship = lot;
  }
  const building = state.projects.filter((p) => p.owner === id).length;
  return { id, name: a.name, color: a.color, blurb: a.blurb, strategy: a.strategy,
           ...b, flagship, building, regions: [...a.regions] };
}

export function takeableFirms(state) {
  return RIVALS.filter((r) => !state.actors[r.id].retired).map((r) => firmSummary(state, r.id));
}

/**
 * Step into an existing firm rather than starting from nothing: its land, its
 * cash, its debt, its unlocks and its name. Nothing is created — the position
 * already existed, which is why this keeps a running game balanced.
 */
export function takeOverFirm(state, targetId, actorId = 'player') {
  const target = state.actors[targetId];
  const me = state.actors[actorId];
  if (!target || target.isPlayer || target.retired) return { ok: false, why: 'That firm is not available.' };

  let lots = 0;
  for (const lot of state.city.lots) {
    if (lot.owner !== targetId) continue;
    lot.owner = actorId;
    lots++;
  }
  for (const p of state.projects) if (p.owner === targetId) p.owner = actorId;
  for (const f of state.fills) if (f.owner === targetId) f.owner = actorId;
  for (const lot of state.city.lots) {
    if (lot.building && lot.building.builtBy === targetId) lot.building.builtBy = actorId;
  }

  me.cash = target.cash;
  me.debt = target.debt;
  me.gsfBuilt = target.gsfBuilt;
  me.regions = new Set(target.regions);
  me.name = target.name;
  me.firm = targetId;
  target.retired = true;
  target.cash = 0; target.debt = 0; target.gsfBuilt = 0;

  logEvent(state, actorId, `took control of ${target.name} — ${lots} lots, ${money(me.debt)} of debt`);
  pushNews(state, 'takeover', `${target.name.toUpperCase()} CHANGES HANDS`,
    `New ownership has taken control of ${target.name}, inheriting ${lots} lots, `
    + `${sf(me.gsfBuilt)} of built floor area and ${money(me.debt)} of debt. The firm keeps its `
    + `name, its buildings and its obligations.`);
  state._dirtyGeometry = true;
  return { ok: true, lots, cash: me.cash, debt: me.debt };
}

// ------------------------------------------------------------- making land

/**
 * What a cell of harbour costs to turn into ground.
 *
 * This has come down a long way on purpose. Fill used to be a late-game
 * set piece at $185M a cell; the point of it now is that you can lay out a
 * causeway in an afternoon and go and build on it. The money is not meant to
 * be made by owning the dirt — see `madeGround`, which starts reclaimed land
 * at almost nothing and lets what you build on it pull the value up.
 */
export const RECLAIM_BASE = 9_000_000;

/** Cells already paid for, which count as shore for the next one. */
export function pendingFills(state) {
  return new Set(state.fills.map((f) => `${f.col},${f.row}`));
}

/**
 * Less shoreline to build off means more fill, more cofferdam, more money.
 * Standing takes a slice off the top: a house the harbour commission trusts
 * gets its licences faster and its barges cheaper.
 */
export function reclaimCost(state, col, row, actorId = 'player', pending = null) {
  // Open water costs a little more than a sheltered corner and that is all.
  // It was a wall at 0.42 a side, a surcharge at 0.18, and at 0.10 it is a
  // rounding difference — reaching out is the interesting move, so it should
  // not be the punished one.
  const contact = shoreContact(state.city, col, row, pending ?? pendingFills(state));
  const discount = 1 - (termsFor(state, actorId).fillDiscount ?? 0);
  return RECLAIM_BASE * (1 + (4 - contact) * 0.10) * state.cycle * discount;
}

export function canReclaimHere(state, actorId, col, row, pending = null) {
  const a = state.actors[actorId];
  if (!a) return 'Unknown developer.';
  // Making new ground is licensed on reputation, not on the size of your
  // balance sheet: the harbour commission wants to see delivered work.
  if (!termsFor(state, actorId).fill) {
    const need = nextRank(a.standing ?? 0);
    return `The harbour commission licences fill to a Developer and above. `
         + `You are a ${termsFor(state, actorId).title} on ${a.standing ?? 0} standing`
         + `${need ? ` — ${need.at - (a.standing ?? 0)} more earns ${need.title}` : ''}.`;
  }
  const booked = pending ?? pendingFills(state);
  if (booked.has(`${col},${row}`)) return 'Already being filled.';
  if (!canReclaim(state.city, col, row, booked)) {
    return 'Nothing to build off here — pick water beside the shore, or beside ground you have already booked.';
  }
  return null;
}

/** Buy the water. Two years of barges later, it is land, and it is yours. */
export function startReclaim(state, col, row, actorId) {
  const why = canReclaimHere(state, actorId, col, row);
  if (why) return { ok: false, why };
  const a = state.actors[actorId];
  const cost = reclaimCost(state, col, row, actorId);
  if (a.cash < cost) return { ok: false, why: `Filling this costs ${money(cost)}.` };
  a.cash -= cost;
  const fill = { col, row, owner: actorId, cost, startDay: state.day, endDay: state.day + 24 * 30 };
  state.fills.push(fill);
  logEvent(state, actorId, `began filling the water at ${col},${row} (${money(cost)})`);
  pushNews(state, 'reclaim', 'BARGES MOVE IN: NEW LAND PLANNED OFF THE SHORE',
    `${a.name} has committed ${money(cost)} to filling open water and zoning it for development. `
    + `Two years of rock and fill, and there will be four new lots where there is currently a river.`);
  return { ok: true, fill, cost };
}

/**
 * The moment a run of made ground becomes an island, the city rezones the
 * whole of it as waterfront rather than spoil heap — a third more floor area
 * and a quarter more on the land under it. Everyone who owns a piece of it
 * wakes up richer, which is exactly the point of reaching out into the water.
 */
function announceIsland(state, ownerId, island) {
  for (const id of island.owners) {
    const a = state.actors[id];
    if (a) a.standing = (a.standing ?? 0) + 3;
  }
  const maker = state.actors[ownerId];
  logEvent(state, ownerId, `made ground enough for an island — ${island.cells} cells rezoned C6`);
  pushNews(state, 'reclaim', 'THE CITY REZONES THE NEW ISLAND',
    `${island.cells} cells of made ground off the shore are now one landmass, and the commission `
    + `has zoned the whole of it ${DISTRICTS.island.name} — FAR ${DISTRICTS.island.far}, up from `
    + `${DISTRICTS.mid.far}, with water on every side. ${maker ? maker.name : 'The builder'} put in the `
    + `cell that joined it up. ${island.lots.length} lots of new land, and none of it existed ten years ago.`,
    island.lots[0]);
}

/**
 * Cells of made ground this developer owns, indexed by cell. Built once for a
 * whole sweep — the linear scan this replaced ran over every block in the city
 * four times for every candidate cell in the harbour.
 */
function ownedGroundIndex(city, actorId) {
  const own = new Set();
  for (const b of city.blocks) {
    if (b.reclaimed && b.lots.some((l) => l.owner === actorId)) own.add(`${b.col},${b.row}`);
  }
  return own;
}

function ownGroundNear(own, col, row) {
  let n = 0;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (own.has(`${col + dc},${row + dr}`)) n++;
  }
  return n;
}

// ---------------------------------------------------------------- actions

/**
 * A loan is secured on the thing it paid for. Selling that thing repays it
 * out of the proceeds, and if the proceeds fall short the owner still owes
 * the difference — which is the whole of what a bank is for.
 *
 * Before this, debt was a single pooled number that only ever went up: you
 * could sell every building you owned, keep the entire loan book, and go on
 * paying interest on assets belonging to somebody else.
 */
function settleLoan(state, lot, actorId, proceeds) {
  const a = state.actors[actorId];
  const owed = lot.loan ?? 0;
  const repaid = Math.min(owed, Math.max(0, proceeds));
  const shortfall = owed - repaid;
  a.debt = Math.max(0, a.debt - owed);
  lot.loan = 0;
  return { net: proceeds - repaid - shortfall, repaid, shortfall };
}

/** What a lot is worth to its owner once the bank has been paid. */
export function lotEquity(state, lot) {
  const gross = landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0);
  return gross - (lot.loan ?? 0);
}

export function buyLot(state, lot, actorId) {
  const a = state.actors[actorId];
  const price = askPrice(state, lot);
  if (lot.owner === actorId) return { ok: false, why: 'You already own this lot.' };
  if (lot.owner && lot.owner !== 'npc') return { ok: false, why: 'Not for sale — a rival owns it.' };
  const gate = regionGate(state, actorId, lot);
  if (gate) return { ok: false, why: gate };
  if (a.cash < price) return { ok: false, why: 'Not enough cash.' };
  a.cash -= price;
  lot.owner = actorId;
  if (lot.building) lot.building.builtBy = lot.building.builtBy || 'npc';
  logEvent(state, actorId, `bought ${lot.district.toUpperCase()} lot #${lot.id} for ${money(price)}`);
  return { ok: true, price };
}

export function startProject(state, lot, actorId, floors, use, ltc, design = DEFAULT_DESIGN) {
  const a = state.actors[actorId];
  if (lot.owner !== actorId) return { ok: false, why: 'You do not own this lot.' };
  if (lot.project) return { ok: false, why: 'Already under construction.' };
  const gate = regionGate(state, actorId, lot);
  if (gate) return { ok: false, why: gate };
  const standing = demolitionBlock(lot);
  if (standing) return { ok: false, why: standing };
  const era = currentEra(state);
  const L = landmarkById(design.landmark);
  if (L) {
    // The architect's date is the gate for a signature design; it comes with
    // its own facade, so the era's list of styles has nothing to say about it.
    const st = landmarkStatus(state, L, floors);
    if (!st.ok) return { ok: false, why: st.why };
  } else if (!era.styles.includes(design.style)) {
    return { ok: false, why: `${STYLES[design.style].name} has not been invented yet — this is ${era.name}.` };
  }
  if (floors > era.maxFloors) {
    return { ok: false, why: `${floors} storeys cannot be engineered in ${era.name}. The limit is ${era.maxFloors}.` };
  }
  // The UI caps the slider, but the rule belongs here — a command must not be
  // able to route around it.
  const ceiling = maxFloors(lot, actorId, currentYear(state));
  if (floors > ceiling) {
    return { ok: false, why: floors > BLOCK_ASSEMBLY_FLOORS
      ? `Past ${BLOCK_ASSEMBLY_FLOORS} floors you need every lot on the block.`
      : `The limit here is ${ceiling} floors.` };
  }
  const q = quote(state, lot, floors, use, ltc, design, actorId);
  if (a.cash < q.equity) return { ok: false, why: `Need ${money(q.equity)} equity.` };

  // Rights moved off the rest of the block are gone for good.
  let toConsume = q.freeAir;
  if (toConsume > 0) {
    for (const other of lot.block.lots) {
      if (toConsume <= 0) break;
      if (other === lot || other.airSpent) continue;
      const avail = Math.max(0, buildableSf(other) - (other.building ? other.building.gsf : 0));
      if (avail <= 0) continue;
      other.airSpent = true;
      toConsume -= avail;
    }
  }

  a.cash -= q.equity;
  a.debt += q.loan;
  const project = {
    lot, owner: actorId, floors, use, ltc,
    style: design.style, form: design.form, variant: design.variant,
    landmark: L ? L.id : null,
    designRent: designMul(design).rent,
    prestige: designMul(design).prestige ?? 1,
    // Redeveloping your own site rolls whatever is still owed on it into the
    // new loan, so nothing falls out of the ledger while the site is a hole.
    cost: q.total, loan: q.loan + (lot.loan ?? 0), spent: q.equity,
    side: q.side, gsf: q.gsf,
    startDay: state.day,
    endDay: state.day + q.months * 30,
    baseMonths: q.months,
    projectedNOI: q.noi,
    demolished: !!lot.building,
  };
  lot.project = project;
  // One of each, ever. Reserved the day ground is broken, not the day it tops
  // out — otherwise two developers race to the same drawing and one of them
  // has spent four years building something that cannot exist.
  if (L) {
    state.landmarks[L.id] = { by: actorId, lotId: lot.id, day: state.day, done: false };
    if (!lot.name) nameBuilding(state, lot, L.name);
    pushNews(state, 'groundbreaking', `${L.name.toUpperCase()} IS COMMISSIONED`,
      `${a.name} has retained ${L.architect} for ${lot.address}. ${L.blurb} `
      + `The drawing is exclusive: there will be one of these in New York and no more.`, lot);
  }
  lot.loan = 0;                            // it is the project's while it is a site
  lot.building = null;                     // demolition is instant; this is a game
  state.projects.push(project);
  logEvent(state, actorId, `broke ground on ${floors} floors at #${lot.id} (${money(q.total)})`);
  if (floors >= 16 || q.total > 55e6) {
    const who = a.name === 'You' ? 'CITY DEVELOPER' : a.name.toUpperCase();
    pushNews(state, 'groundbreaking',
      floors >= 80 ? `${floors} STOREYS PLANNED FOR ${lot.avenue.name.toUpperCase()}`
                   : `GROUND BROKEN ON ${floors}-STOREY ${use === 'residential' ? 'RESIDENCE' : 'TOWER'}`,
      `${a.name} has committed ${money(q.total)} to a ${floors}-floor scheme at ${lot.address}, `
      + `on a site zoned FAR ${lot.far}. ${q.airSf > 0
          ? `The plan leans on ${sf(q.airSf)} of purchased air rights.`
          : 'The scheme sits within its as-of-right envelope.'} `
      + `Completion is projected in ${q.months} months.`,
      lot);
  }
  return { ok: true, project, quote: q };
}

/**
 * What an owner would take for a property today. Rivals are attached to what
 * they own, and how attached depends on who they are and how their year is
 * going — a leveraged developer running out of cash will take less.
 */
export function reservePrice(state, lot) {
  const intrinsic = landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0);
  const owner = state.actors[lot.owner];
  if (!owner) return intrinsic * 1.12;            // an ordinary owner wants a premium
  const attachment = { institution: 1.42, grinder: 1.24, cowboy: 1.14 }[owner.strategy] ?? 1.25;
  // Distress discounts: low cash, heavy debt, a soft market.
  const strain = (owner.cash < 0 ? 0.16 : owner.cash < 1e7 ? 0.08 : 0)
               + (owner.debt > intrinsic * 2 ? 0.08 : 0)
               + (state.cycle < 0.85 ? 0.07 : 0);
  return intrinsic * Math.max(1.0, attachment - strain);
}

/** Put a number in front of an owner and see what they say. */
export function makeOffer(state, lot, actorId, amount) {
  const a = state.actors[actorId];
  if (lot.owner === actorId) return { ok: false, why: 'You already own this.' };
  if (lot.project) return { ok: false, why: 'Not while it is under construction.' };
  const gate = regionGate(state, actorId, lot);
  if (gate) return { ok: false, why: gate };
  if (lot.offerBlockedUntil && state.day < lot.offerBlockedUntil) {
    const days = Math.ceil(lot.offerBlockedUntil - state.day);
    return { ok: false, why: `They won't revisit it for another ${days} days.` };
  }
  if (a.cash < amount) return { ok: false, why: 'You do not have the cash.' };

  const reserve = reservePrice(state, lot);
  const owner = state.actors[lot.owner];
  const name = owner ? owner.name : 'The owner';

  if (amount >= reserve) {
    a.cash -= amount;
    if (owner) {
      // The seller's bank is paid before the seller is.
      const { net } = settleLoan(state, lot, lot.owner, amount);
      owner.cash += net;
    }
    const from = lot.owner;
    lot.owner = actorId;
    lot.offerBlockedUntil = 0;
    logEvent(state, actorId, `bought ${lot.address} from ${name} for ${money(amount)}`);
    pushNews(state, 'deal', `${lot.address.toUpperCase()} CHANGES HANDS`,
      `${a.name} has bought ${lot.address} from ${name} for ${money(amount)} in an off-market deal. `
      + `The site carries ${sf(buildableSf(lot))} of development rights.`, lot);
    return { ok: true, accepted: true, price: amount, from, seller: name };
  }

  // Too low to be worth a conversation, or close enough to get a number back.
  const ratio = amount / reserve;
  lot.offerBlockedUntil = state.day + (ratio < 0.7 ? 120 : 45);
  return {
    ok: true, accepted: false, seller: name, reserve,
    insulting: ratio < 0.7,
    why: ratio < 0.7
      ? `${name} did not dignify that with a counter.`
      : `${name} won't go below ${money(reserve)}.`,
  };
}

export function sellLot(state, lot, actorId) {
  const a = state.actors[actorId];
  if (lot.owner !== actorId || lot.project) return { ok: false, why: 'Cannot sell right now.' };
  const price = landValue(state, lot) + (lot.building ? buildingValue(state, lot) : 0);
  const gross = price * 0.97;              // brokerage
  const { net, repaid, shortfall } = settleLoan(state, lot, actorId, gross);
  a.cash += net;
  lot.owner = 'npc';
  logEvent(state, actorId, repaid
    ? `sold #${lot.id} for ${money(gross)} — ${money(repaid)} to the bank`
      + (shortfall ? `, still ${money(shortfall)} short` : '')
    : `sold #${lot.id} for ${money(gross)}`);
  return { ok: true, price, net, repaid, shortfall };
}

/** Cost to pull a project's completion forward. Getting steep fast is the point. */
export function rushQuote(state, project, months) {
  const remaining = (project.endDay - state.day) / 30;
  const max = Math.max(0, remaining * 0.45);
  const m = Math.max(0, Math.min(months, max));
  // Overtime, extra crews, expedited materials — the last month costs the most.
  const cost = project.cost * (0.035 * m + 0.012 * m * m);
  return { months: m, maxMonths: max, cost, remaining };
}

export function rushProject(state, lot, actorId, months) {
  const p = lot.project;
  if (!p || p.owner !== actorId) return { ok: false, why: 'Not your site.' };
  const q = rushQuote(state, p, months);
  if (q.months <= 0.05) return { ok: false, why: 'Nothing left to pull forward.' };
  const a = state.actors[actorId];
  if (a.cash < q.cost) return { ok: false, why: `Need ${money(q.cost)}.` };
  a.cash -= q.cost;
  p.endDay -= q.months * 30;
  p.cost += q.cost;
  p.spent += q.cost;
  p.rushed = (p.rushed ?? 0) + q.months;
  logEvent(state, actorId, `paid ${money(q.cost)} to pull #${lot.id} forward ${q.months.toFixed(1)} months`);
  return { ok: true, ...q };
}

export function nameBuilding(state, lot, name) {
  lot.name = (name || '').trim().slice(0, 40) || null;
  return lot.name;
}

/** Net worth, itemised — what you own, what it earns, what you owe. */
export function worthBreakdown(state, actorId = 'player') {
  const a = state.actors[actorId];
  let land = 0, buildings = 0, wip = 0, noi = 0, tax = 0, lots = 0, built = 0, gsf = 0;
  for (const lot of state.city.lots) {
    if (lot.owner !== actorId) continue;
    lots++;
    land += landValue(state, lot);
    tax += landValue(state, lot) * 0.012;
    if (lot.building) {
      built++;
      gsf += lot.building.gsf;
      buildings += buildingValue(state, lot);
      noi += buildingNOI(state, lot);
    }
  }
  for (const p of state.projects) if (p.owner === actorId) wip += p.spent;
  const debtService = a.debt * interestFor(state, actorId);
  return {
    cash: a.cash, land, buildings, wip, debt: a.debt,
    total: a.cash + land + buildings + wip - a.debt,
    noi, tax, debtService, netIncome: noi - tax - debtService,
    lots, built, gsf,
  };
}

/**
 * The city's paper of record. Stories carry a snapshot of the building as it
 * was when the story ran, so the illustration stays true even after the
 * building changes hands or gets redeveloped.
 */
export function pushNews(state, kind, headline, dek, lot = null) {
  const b = lot ? (lot.project || lot.building) : null;
  state.news.unshift({
    day: state.day, date: formatDate(state), kind, headline, dek,
    lotId: lot ? lot.id : null,
    address: lot ? lot.address : null,
    snapshot: b ? { floors: b.floors, form: b.form, style: b.style,
                    variant: b.variant, use: b.use, side: b.side } : null,
  });
  if (state.news.length > 60) state.news.pop();
}

/**
 * Everything you own, priced the way the holdings list needs it: what it would
 * fetch, what the bank takes out of that, and what actually reaches your cash.
 * Sorted by what you would walk away with, because that is the order you make
 * the decision in.
 */
export function holdings(state, actorId) {
  const out = [];
  for (const lot of state.city.lots) {
    if (lot.owner !== actorId) continue;
    const land = landValue(state, lot);
    const building = lot.building ? buildingValue(state, lot) : 0;
    const gross = (land + building) * 0.97;          // brokerage
    const loan = lot.loan ?? 0;
    out.push({
      lot, land, building, loan,
      value: land + building,
      gross,
      net: gross - loan,                             // a shortfall still follows you
      noi: lot.building ? buildingNOI(state, lot) : 0,
      building_: lot.building,
      underwater: loan > land + building,
      busy: !!lot.project,
    });
  }
  out.sort((a, b) => b.net - a.net);
  return out;
}

/**
 * Sell a chosen set rather than one lot or the whole book. Anything still a
 * hole in the ground is skipped rather than refused, so picking a district and
 * selling it does not fail because one site is mid-construction.
 */
export function sellLots(state, lots, actorId) {
  let count = 0, gross = 0, net = 0, repaid = 0, shortfall = 0, held = 0;
  for (const lot of lots) {
    if (lot.owner !== actorId) continue;
    if (lot.project) { held++; continue; }
    const r = sellLot(state, lot, actorId);
    if (!r.ok) continue;
    count++;
    gross += r.price * 0.97;
    net += r.net;
    repaid += r.repaid;
    shortfall += r.shortfall;
  }
  return { count, gross, net, repaid, shortfall, held };
}

/** Liquidate. Sites under construction can't be walked away from. */
export function sellAll(state, actorId) {
  let count = 0, total = 0, held = 0;
  for (const lot of state.city.lots) {
    if (lot.owner !== actorId) continue;
    if (lot.project) { held++; continue; }
    const r = sellLot(state, lot, actorId);
    if (r.ok) { count++; total += r.price * 0.97; }
  }
  return { count, total, held };
}

export function logEvent(state, actorId, text) {
  const who = state.actors[actorId];
  state.log.unshift({ day: state.day, actor: actorId, name: who ? who.name : actorId, text });
  if (state.log.length > 60) state.log.pop();
}

// ---------------------------------------------------------------- the tick

export function advance(state, days) {
  if (state.finished) return;
  const target = state.day + days;
  while (state.day < target) {
    const step = Math.min(1, target - state.day);
    state.day += step;
    if (Math.floor(state.day) !== Math.floor(state.day - step)) dayTick(state);
    // The bell stops the clock where it rings, rather than letting the rest of
    // the call run on and bury the result under another year of headlines.
    if (state.finished) return;
  }
}

function dayTick(state) {
  const d = dateOf(state);

  // Market cycle: roughly seven years, with noise. Booms end.
  state.cyclePhase += (Math.PI * 2) / (365 * 7);
  const noise = (state.rnd() - 0.5) * 0.004;
  state.cycle = Math.max(0.55, Math.min(1.5,
    1.0 + Math.sin(state.cyclePhase) * 0.28 + noise * 40));

  // Construction progresses; finished projects become buildings.
  for (let i = state.projects.length - 1; i >= 0; i--) {
    const p = state.projects[i];
    if (state.day >= p.endDay) {
      p.lot.building = {
        floors: p.floors, gsf: p.gsf, side: p.side, use: p.use,
        quality: 1, age: 0, builtBy: p.owner, condition: 1,
        style: p.style, form: p.form, variant: p.variant, designRent: p.designRent,
        landmark: p.landmark, prestige: p.prestige ?? 1,
      };
      p.lot.project = null;
      p.lot.loan = p.loan;                 // the loan is secured on what it built
      state.actors[p.owner].gsfBuilt += p.gsf;
      state.projects.splice(i, 1);
      logEvent(state, p.owner, `topped out ${p.floors} floors at #${p.lot.id} — ${sf(p.gsf)}`);
      if (p.floors >= 12) {
        const nm = p.lot.name || p.lot.address;
        pushNews(state, 'topout', `${nm.toUpperCase()} TOPS OUT`,
          `${state.actors[p.owner].name} has completed ${sf(p.gsf)} across ${p.floors} floors at `
          + `${p.lot.address}. The building is expected to earn ${money(buildingNOI(state, p.lot))} a year `
          + `at ${Math.round(occupancyFor(state, p.lot) * 100)}% occupancy.`,
          p.lot);
      }
      if (p.landmark) topOutLandmark(state, p);
      state._dirtyGeometry = true;
    }
  }

  // Finished landfill becomes real ground.
  for (let i = state.fills.length - 1; i >= 0; i--) {
    const f = state.fills[i];
    if (state.day < f.endDay) continue;
    const { made, island } = state.city.addLandCell(f.col, f.row, f.owner);
    state.fills.splice(i, 1);
    state._dirtyTerrain = true;
    state._dirtyGeometry = true;
    if (made.length) {
      const maker = state.actors[f.owner];
      if (maker) maker.standing = (maker.standing ?? 0) + 1;
      logEvent(state, f.owner, `finished ${made.length} new lots on reclaimed land`);
      pushNews(state, 'reclaim', 'THE SHORELINE MOVES',
        `${state.actors[f.owner].name} has made ${made.length} lots of new ground where there was `
        + `water. Zoned FAR ${made[0].far} and waterfront on three sides, it is the best-positioned `
        + `land to come onto the market in years — and it belongs to whoever paid for the fill.`,
        made[0]);
    }
    if (island && island.fresh) announceIsland(state, f.owner, island);
  }

  if (d.getUTCDate() === 1 && state.monthOfLastTick !== d.getUTCMonth()) {
    state.monthOfLastTick = d.getUTCMonth();
    monthTick(state);
  }
}

/** A signature design is finished, and the city has one of a thing forever. */
function topOutLandmark(state, p) {
  const L = landmarkById(p.landmark);
  if (!L) return;
  const a = state.actors[p.owner];
  if (a) a.standing = (a.standing ?? 0) + L.standing;
  if (state.landmarks?.[L.id]) state.landmarks[L.id].done = true;
  pushNews(state, 'topout', `${L.name.toUpperCase()} IS FINISHED`,
    `${L.architect}'s ${L.name} is complete at ${p.lot.address} — ${p.floors} floors for `
    + `${a ? a.name : 'its owner'}. ${L.blurb} The building is assessed at a premium to its `
    + `income: an address of this kind is worth more than the rent roll says it is.`,
    p.lot);
  logEvent(state, p.owner, `topped out ${L.name} — ${L.standing} standing`);
}

/** What the contract system is allowed to reach back into. */
const CONTRACT_API = {
  pushNews, logEvent,
  floorCap: (state) => currentEra(state).maxFloors,
  dateIn: (state, days) => {
    const d = new Date(Date.UTC(state.startYear, 0, 1));
    d.setUTCDate(d.getUTCDate() + Math.round(state.day + days));
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  },
};

function monthTick(state) {
  // Refresh neighbourhood intensity — this is what makes land appreciate.
  for (const lot of state.city.lots) lot._intensity = localIntensity(state, lot);
  updateCorridors(state);
  updateCondition(state);
  updateBlight(state);

  for (const id in state.actors) {
    const a = state.actors[id];
    let noi = 0, tax = 0;
    for (const lot of state.city.lots) {
      if (lot.owner !== id) continue;
      noi += buildingNOI(state, lot) / 12;
      // A civic contract can buy a building years free of property tax.
      if (!(lot.abatedUntil > state.day)) tax += landValue(state, lot) * 0.012 / 12;
    }
    a.cash += noi - tax - (a.debt * interestFor(state, id)) / 12;
    a.lastNOI = noi;
  }

  updateMadeGround(state);
  updateSignage(state);
  checkEra(state);
  checkUnlocks(state);
  checkRank(state);
  checkHeat(state);
  checkMargin(state);
  for (const r of RIVALS) {
    const a = state.actors[r.id];
    if (!a.retired) rivalTurn(state, a);
  }
  tickContracts(state, CONTRACT_API);
  annualReview(state);
  marketStory(state);
  checkFinish(state);
}

/**
 * Recompute how hard the city is leaning, and say so when it changes band.
 * A handicap you cannot see reads as the game cheating the moment you notice
 * it, so the paper reports the turn the same as it reports anything else.
 */
function checkHeat(state) {
  const was = heatLabel(state.heat ?? 1);
  // Working out where you stand walks every lot four times, and the answer is
  // eased over two years anyway — so it is read quarterly and leaned towards
  // monthly, which is indistinguishable and three times cheaper.
  if (state.heatTarget === undefined || state.day - (state.heatAt ?? -999) >= 90) {
    state.heatTarget = heatFor(state).heat;
    state.heatAt = state.day;
  }
  const heat = state.heatTarget;
  // Eased towards rather than snapped to: one good year should not flip the
  // whole city's attention, and one bad one should not switch it off.
  state.heat = (state.heat ?? heat) * 0.88 + heat * 0.12;
  const now = heatLabel(state.heat);
  if (now === was || state.day < 360) return;
  // The eased value can sit on a boundary for a while, and a target that
  // wanders across one would put the same story in the paper every month.
  if (state.day - (state.heatSaidAt ?? -9999) < 3 * 360) return;
  state.heatSaidAt = state.day;
  const up = state.heat > (state.heatWas ?? 1);
  state.heatWas = state.heat;
  pushNews(state, 'heat', up ? 'THE TRADE TURNS ITS ATTENTION TO YOU'
                             : 'THE TRADE LOOKS ELSEWHERE',
    up ? `${now}. Your name is on enough buildings that the other houses have started `
       + `pricing against you — expect them to bid on the sites you want and to move `
       + `faster on the ones you hesitate over.`
       : `${now}. You are small enough at the moment that the other houses are working `
       + `their own patch and the bank is in no hurry. It will not last.`);
}

/**
 * Once a year the paper runs the trade's numbers side by side. This is the
 * only place you see your rent roll against theirs rather than a single
 * net-worth figure, and it is what gives a long game a beat.
 *
 * Annual rather than quarterly on purpose: at a month a second a quarterly
 * lands every three seconds, which is not a beat, it is a metronome.
 */
function annualReview(state) {
  const year = dateOf(state).getUTCFullYear();
  if (state.lastReview === year) return;
  const first = state.lastReview === undefined;
  state.lastReview = year;
  if (first) return;                       // nothing to compare against yet

  const rows = Object.values(state.actors)
    .filter((a) => !a.retired)
    .map((a) => {
      let noi = 0, lots = 0, built = 0;
      for (const lot of state.city.lots) {
        if (lot.owner !== a.id) continue;
        lots++;
        if (lot.building) { built++; noi += buildingNOI(state, lot); }
      }
      const under = state.projects.filter((p) => p.owner === a.id).length;
      return { id: a.id, name: a.name, isPlayer: !!a.isPlayer, noi, lots, built, under,
               worth: netWorth(state, a.id), debt: a.debt, standing: a.standing ?? 0 };
    })
    .sort((x, y) => y.noi - x.noi);

  const me = rows.find((r) => r.isPlayer);
  const top = rows[0];
  const rank = rows.indexOf(me) + 1;

  const line = (r) => `${r.name} — ${money(r.noi)} a year from ${r.built} building`
    + `${r.built === 1 ? '' : 's'}${r.under ? `, ${r.under} under way` : ''}`
    + `${r.debt > 0 ? `, ${money(r.debt)} owed` : ', unlevered'}`;

  pushNews(state, 'review',
    `${year - 1} IN REVIEW: ${top.name.toUpperCase()} LEADS ON RENTS`,
    `The year's rent rolls, side by side. ${rows.map(line).join('. ')}. `
    + (me
      ? (rank === 1
        ? `You collect more rent than anyone in this city.`
        : `You are ${rank}${['st', 'nd', 'rd', 'th'][Math.min(rank - 1, 3)]} on income, `
          + `${money(top.noi - me.noi)} a year behind ${top.name}.`)
      : ''));
}

/** Years left in the race, and whether it is over. */
export function yearsLeft(state) {
  return Math.max(0, state.endYear - currentYear(state));
}
export function raceOver(state) {
  return currentYear(state) >= state.endYear;
}

/**
 * The bell. Seventy years is one career: you start with a hundred million and
 * whatever the age can build, and you finish with whatever you made of it.
 * Without an end there is no race, only an accumulation.
 */
function checkFinish(state) {
  if (state.finished || !raceOver(state)) return;
  const board = leaderboard(state);
  state.finished = {
    year: state.endYear,
    board: board.map((a) => ({
      id: a.id, name: a.name, worth: a.worth, standing: a.standing ?? 0,
      title: a.title, gsf: a.gsfBuilt,
      lots: state.city.lots.filter((l) => l.owner === a.id).length,
      tallest: state.city.lots.reduce(
        (n, l) => (l.owner === a.id ? Math.max(n, l.building?.floors ?? 0) : n), 0),
    })),
    contracts: (state.contracts ?? []).filter((c) => c.claimedBy === 'player').length,
    parks: state.city.blocks.filter((b) => b.isPark && b.soldBy).length,
  };
  const win = board[0];
  pushNews(state, 'finish', `${state.endYear}: ${win.name.toUpperCase()} ENDS THE CENTURY ON TOP`,
    `Seventy years of building, and the ledger closes. ${board.map(
      (a, i) => `${i + 1}. ${a.name}, ${money(a.worth)}`).join('. ')}. `
    + `The city that stands now is the one these four made.`);
}

/** The paper notices when the market turns. */
function marketStory(state) {
  // Hysteresis and a cooling-off period: the cycle wobbles across any single
  // threshold, and a paper that cries boom every other month is noise.
  const c = state.cycle;
  let mood = state.mood;
  if (c > 1.18) mood = 'boom';
  else if (c < 0.84) mood = 'slump';
  else if (c > 0.94 && c < 1.08) mood = 'steady';
  if (mood === state.mood) return;
  if (state.moodLockUntil && state.day < state.moodLockUntil) return;
  const was = state.mood;
  state.mood = mood;
  state.moodLockUntil = state.day + 300;
  if (mood === 'boom') {
    pushNews(state, 'market', 'CAPITAL FLOODS IN AS VALUES RUN AHEAD OF RENTS',
      `Land is trading at levels the income cannot yet justify. Lenders are competing on terms `
      + `and every site in the core has three bidders. Developers who remember the last cycle are selling.`);
  } else if (mood === 'slump') {
    pushNews(state, 'market', 'THE MUSIC STOPS: LENDERS PULL BACK',
      `Values are sliding and refinancing has gone quiet. Schemes that penciled at the top of the `
      + `market are now short, and the over-levered are looking for buyers. Whoever holds cash sets the price.`);
  } else {
    pushNews(state, 'market', was === 'slump' ? 'MARKET FINDS ITS FOOTING' : 'FEVER BREAKS',
      `Values and rents have come back into line. Ordinary deals pencil again.`);
  }
}

// ------------------------------------------------- neighbourhood character

/**
 * Corridors earn a reputation. Ground-floor retail accrues along an avenue, and
 * once enough of it is there the street becomes a destination — which pulls up
 * every lot fronting it, including the ones you don't own.
 */
function updateCorridors(state) {
  for (const c of state.city.corridors) {
    let retail = 0, quality = 0, n = 0;
    for (const lot of c.lots) {
      const b = lot.building;
      if (!b) continue;
      // Every building contributes its ground floor; mixed-use contributes more.
      const share = b.use === 'mixed' ? 0.30 : b.use === 'residential' ? 0.08 : 0.14;
      retail += b.gsf * share * (b.condition ?? 1);
      quality += (b.condition ?? 1);
      n++;
    }
    c.retail = retail;
    const density = n / Math.max(1, c.lots.length);
    const avgQuality = n ? quality / n : 0;
    // Fame builds slowly and decays slowly. A street's reputation has inertia.
    const target = Math.max(0, Math.min(1,
      (retail / 400_000) * 0.5 + density * 0.3 + avgQuality * 0.3 - 0.25));
    c.fame += (target - c.fame) * 0.05;
    const wasFamous = c.famous;
    c.famous = c.fame > 0.45;
    if (c.famous && !wasFamous) {
      logEvent(state, 'player', `— ${c.name} has become a destination retail strip`);
      pushNews(state, 'corridor', `${c.name.toUpperCase()} IS THE CITY'S NEW HIGH STREET`,
        `Ground-floor trade along ${c.name} has reached ${sf(c.retail)}, enough to draw shoppers `
        + `from outside the district. Landlords on the strip can expect rents to follow.`);
    } else if (!c.famous && wasFamous) {
      logEvent(state, 'player', `— ${c.name} has lost its draw`);
      pushNews(state, 'corridor', `${c.name.toUpperCase()} LOSES ITS DRAW`,
        `Vacancies and neglect have hollowed out what was one of the city's busier strips.`);
    }
  }
}

/** Buildings age. Owners who can't afford upkeep stop paying for it. */
function updateCondition(state) {
  for (const lot of state.city.lots) {
    const b = lot.building;
    if (!b) continue;
    b.age = (b.age ?? 0) + 1 / 12;
    if (b.condition === undefined) b.condition = 1;

    const owner = state.actors[lot.owner];
    const noi = buildingNOI(state, lot);
    // Upkeep is affordable when the asset earns; distressed owners defer it.
    // Upkeep is funded when the asset earns and the owner can pay. Where it
    // isn't — weak submarkets, broke owners, a long slump — buildings slide.
    const funded = owner
      ? (owner.cash > 0 && noi > 0)
      : (state.cycle > 0.85 && (lot._intensity ?? 0.3) > 0.22);
    const drift = funded ? 0.005 : -0.0045;
    b.condition = Math.max(0.12, Math.min(1, b.condition + drift - 0.0008));
  }
}

/** Decay is contagious. A block of neglected buildings drags its neighbours. */
function updateBlight(state) {
  for (const lot of state.city.lots) {
    let sum = 0, n = 0;
    for (const other of lot.block.lots) {
      if (!other.building) continue;
      sum += 1 - (other.building.condition ?? 1);
      n++;
    }
    const blockBlight = n ? sum / n : 0.25;
    lot._blight = (lot._blight ?? blockBlight) * 0.85 + blockBlight * 0.15;
  }
}

/** A one-word read on what a block has become. Shown on the board and in panels. */
export function blockCharacter(state, block) {
  const built = block.lots.filter((l) => l.building);
  if (block.isPark) return 'Park';
  if (!built.length) return 'Vacant';
  const blight = built.reduce((a, l) => a + (1 - (l.building.condition ?? 1)), 0) / built.length;
  if (blight > 0.55) return 'Distressed';
  const famous = block.lots.some((l) => l.avenue.famous || l.street.famous);
  if (famous) return 'Retail row';
  const gsf = built.reduce((a, l) => a + l.building.gsf, 0);
  const capacity = block.lots.reduce((a, l) => a + buildableSf(l), 0);
  const office = built.filter((l) => l.building.use === 'office').length / built.length;
  if (gsf / capacity > 0.6 && office > 0.5) return 'Business district';
  if (gsf / capacity > 0.55) return 'Dense mixed';
  if (office > 0.5) return 'Commercial';
  return 'Residential';
}

// ---------------------------------------------------------------- rival AI

function rivalTurn(state, a) {
  if (a.cooldown > 0) { a.cooldown--; return; }
  // How hard this house is leaning on you this month. Read once — it walks
  // every lot in the city to work out where you stand.
  const band = pressure(state);

  // Distress: a leveraged developer in a downturn has to sell something.
  if (a.cash < 0) {
    const owned = state.city.lots.filter((l) => l.owner === a.id && !l.project);
    if (owned.length) {
      owned.sort((x, y) => buildingValue(state, x) - buildingValue(state, y));
      const lot = owned[0];
      const price = (landValue(state, lot) + buildingValue(state, lot)) * 0.82;
      const { net } = settleLoan(state, lot, a.id, price);
      a.cash += net;
      lot.owner = 'npc';
      logEvent(state, a.id, `sold #${lot.id} under pressure for ${money(price)}`);
      pushNews(state, 'distress', `${a.name.toUpperCase()} SELLS UNDER PRESSURE`,
        `${a.name} has offloaded ${lot.address} for ${money(price)}, well below what the asset `
        + `earned at the top of the market. The firm is carrying ${money(a.debt)} of debt.`, lot);
    }
    a.cooldown = 2;
    return;
  }

  // Assembling a block is buying, not building, and the site scoring below
  // only ever considers schemes that pencil. Without this a rival could never
  // chase an assemblage contract, and the one kind of job that is pure
  // land-grabbing would always be handed to the player unopposed.
  if (chaseAssemblage(state, a)) return;

  const wants = {
    institution: (l) => (l.tier === 'core' ? 3 : l.tier === 'island' ? 2.6 : l.tier === 'mid' ? 2 : 0.3),
    cowboy:      (l) => 1 + (l._intensity ?? 0.3) * 2,
    // The grinder is the one who actually wants the boroughs.
    grinder:     (l) => (l.region !== 'manhattan' ? 3 : l.tier === 'edge' || l.tier === 'res' ? 2.5 : 0.5),
  }[a.strategy];

  const use = a.strategy === 'grinder' ? 'residential' : 'office';
  let best = null, bestScore = -Infinity;
  for (const lot of state.city.lots) {
    if (lot.owner === a.id || lot.project) continue;
    if (lot.owner && lot.owner !== 'npc') continue;
    if (!a.regions.has(lot.region)) continue;
    if (demolitionBlock(lot)) continue;
    // Cheap rejection before the expensive part: if the site alone is out of
    // reach there is no scheme on it worth pricing.
    if (lot.owner === 'npc' && askPrice(state, lot) > a.cash) continue;

    for (const floors of heightOptions(lot, a, state)) {
      const q = quote(state, lot, floors, use, a.ltc, rivalDesign(a, lot, floors, state), a.id);
      // How much of the war chest a firm will put into one scheme. At a flat
      // six-tenths nobody could ever fund a tower in the core — the equity on
      // one runs to nearly a hundred million — so they ground away on cheap
      // edge land for seventy years instead.
      // Never past 95% of the cash they hold, whatever the band says. Letting
      // this run over 1 put the rivals into negative cash at high pressure,
      // which forced distress sales — so leaning harder on the player made
      // them build *fewer* buildings, which is the opposite of the point.
      if (q.equity > a.cash * Math.min(0.95, COMMIT[a.strategy] * band.commit)) continue;
      // A house that has grown does not keep putting up walk-ups. Without a
      // floor on the size of a scheme the rivals compounded quietly on cheap
      // edge land for seventy years and never once entered the core.
      if (q.total < smallestWorthDoing(state, a)) continue;
      // Profit on the money they actually put in, rather than yield on total
      // cost. Yield on cost quietly favours the smallest, cheapest scheme on
      // the worst dirt — which is precisely what all three of them built.
      const roe = (q.value - q.total) / Math.max(q.equity, 1);
      // A rival who can see an open contract leans towards the sites that
      // would win it. This is the whole of their competitive behaviour: they
      // are not told to beat you, they just want the same jobs you do.
      const score = roe * 100 * wants(lot) * contractBias(state, a.id, lot)
        - (a.strategy === 'institution' ? q.equity / 9e7 : 0);
      if (score > bestScore) { bestScore = score; best = { lot, floors, q }; }
    }
  }

  // A rival with money to spare will just make more city. They lean towards
  // extending ground they already made, because four joined cells is an
  // island and an island is rezoned C6 — the rivals are chasing that for the
  // same reason you are, and they will race you to the fourth cell.
  if (state.rnd() < 0.15 * band.heat) {
    const city = state.city;
    // Built once for the whole sweep. Rebuilding it per cell walked the fill
    // list a thousand times a turn and was most of a month tick on its own.
    const booked = pendingFills(state);
    const own = ownedGroundIndex(city, a.id);
    let spot = null, bestV = -Infinity;
    for (let row = 0; row < CONFIG.ROWS; row++) {
      for (let col = 0; col < CONFIG.COLS; col++) {
        if (canReclaimHere(state, a.id, col, row, booked)) continue;  // a reason, or null
        const cost = reclaimCost(state, col, row, a.id, booked);
        if (cost > a.cash * 0.35) continue;
        const near = ownGroundNear(own, col, row);
        const v = near * 1.2e8 - cost;
        if (v > bestV) { bestV = v; spot = { col, row, cost, own: near }; }
      }
    }
    // Extending their own made ground is the cheap half of an island, so they
    // will do it out of working capital. A first cell into open water is a
    // speculation, and they want to be flush before they start one. The old
    // gate wanted $900M in cash, which no rival in seventy years ever held —
    // so no rival ever filled so much as a single cell.
    if (spot && (spot.own > 0 ? a.cash > spot.cost * 1.8 : a.cash > spot.cost * 3)
        && startReclaim(state, spot.col, spot.row, a.id).ok) {
      a.cooldown = Math.max(1, Math.round(3 * band.patience));
      return;
    }
  }

  // These are read against a score built from yield on cost, and construction
  // costs half again as much as it used to — which halved every yield in the
  // city and, left alone, quietly stopped the rivals building at all.
  // The bar a scheme has to clear. The band moves it: a house that has noticed
  // you will take a deal it would otherwise have passed on, and one that has
  // not is fussy.
  const threshold = { institution: 18, cowboy: 13, grinder: 20 }[a.strategy] * band.threshold;
  if (best && bestScore > threshold) {
    if (best.lot.owner === 'npc' || best.lot.owner === null) {
      const price = askPrice(state, best.lot);
      if (a.cash < price + best.q.equity * 0.5) { a.cooldown = 1; return; }
      a.cash -= price;
      best.lot.owner = a.id;
    }
    let design = rivalDesign(a, best.lot, best.floors, state);
    // The architect's fee is on top of everything, so the famous drawing has
    // to pay for itself against the ordinary scheme on the same site — and
    // they have to be able to write the cheque. They price it, like you do.
    if (design.landmark) {
      const lq = quote(state, best.lot, best.floors, use, a.ltc, design, a.id);
      const roeOf = (q) => (q.value - q.total) / Math.max(q.equity, 1);
      if (lq.equity > a.cash || roeOf(lq) < roeOf(best.q) * 0.7) design = { ...design, landmark: null };
    }
    const r = startProject(state, best.lot, a.id, best.floors, use, a.ltc, design);
    if (!r.ok && design.landmark) {
      startProject(state, best.lot, a.id, best.floors, use, a.ltc, { ...design, landmark: null });
    }
    a.cooldown = Math.round(a.patience * band.patience);
    state._dirtyGeometry = true;
  }
}

/** Each rival has a house style, which you can read off the skyline. */
/**
 * Buy the next lot on a block somebody is paying to have assembled. A rival
 * only commits once it already holds a foot on the block or the block is cheap
 * enough to start on, and never spends more than a third of its cash.
 */
function chaseAssemblage(state, a) {
  return chaseContractBlocks(state, a) || chaseAirRights(state, a);
}

/**
 * Buy the rest of a block you have a foot on, to get at its air rights.
 *
 * Past about thirty floors on a core lot a scheme needs more development
 * rights than the lot carries, and buying them in the open market is dear —
 * but the rights on the other lots of a block you own move across for nothing.
 * This is the only route to a genuinely tall building, and without it the
 * rivals topped out around fifty floors no matter how good the economics of
 * height were. A firm with money and a foothold now goes and gets the rest.
 */
function chaseAirRights(state, a) {
  if (a.strategy === 'grinder') return false;          // volume, not monuments
  const era = currentEra(state);
  if (era.maxFloors < 40) return false;                // nothing to reach for yet
  // Land-banking has to stay an occasional move. Left unchecked it ate every
  // turn and every dollar, and the firms stopped putting up buildings at all.
  if (a.cash < 350e6 || state.rnd() > 0.3) return false;
  let best = null, bestScore = 0;
  for (const block of state.city.blocks) {
    if (block.isPark || block.lots.length < 4) continue;
    if (!a.regions.has(block.region)) continue;
    if (block.lots[0].tier !== 'core' && block.lots[0].tier !== 'mid') continue;
    // Only finish what is nearly finished: half the block already in hand.
    const mine = block.lots.filter((l) => l.owner === a.id).length;
    if (mine < 2 || mine === block.lots.length) continue;
    const targets = block.lots.filter(
      (l) => l.owner !== a.id && (!l.owner || l.owner === 'npc') && !demolitionBlock(l));
    if (targets.length !== block.lots.length - mine) continue;   // a rival holds one; give up
    targets.sort((x, y) => askPrice(state, x) - askPrice(state, y));
    const price = askPrice(state, targets[0]);
    if (price > a.cash * 0.22) continue;              // never at the cost of building
    const score = mine / price;                        // nearest to done, cheapest to finish
    if (score > bestScore) { bestScore = score; best = { lot: targets[0], price, mine }; }
  }
  if (!best) return false;
  if (!buyLot(state, best.lot, a.id).ok) return false;
  logEvent(state, a.id, `bought ${best.lot.address} — ${best.mine + 1} of 4 on the block`);
  a.cooldown = 1;
  return true;
}

function chaseContractBlocks(state, a) {
  if (!state.contracts) return false;
  for (const c of state.contracts) {
    if (c.claimedBy || c.expired || c.kind !== 'assemble') continue;
    const [col, row] = c.need.blockKey.split(',').map(Number);
    const block = state.city.blocks.find((b) => b.col === col && b.row === row);
    if (!block) continue;
    const mine = block.lots.filter((l) => l.owner === a.id).length;
    if (mine === 4) continue;
    // Someone else is all but finished; do not throw good money after it.
    if (block.lots.some((l) => l.owner && l.owner !== a.id && l.owner !== 'npc'
        && block.lots.filter((x) => x.owner === l.owner).length >= 3)) continue;
    const targets = block.lots.filter((l) => l.owner !== a.id && (!l.owner || l.owner === 'npc'));
    if (!targets.length) continue;
    targets.sort((x, y) => askPrice(state, x) - askPrice(state, y));
    const lot = targets[0];
    const price = askPrice(state, lot);
    if (price > a.cash * 0.55) continue;
    if (!buyLot(state, lot, a.id).ok) continue;
    logEvent(state, a.id, `bought ${lot.address} to assemble the block`);
    a.cooldown = 1;
    return true;
  }
  return false;
}

function rivalDesign(a, lot, floors, state) {
  const allowed = currentEra(state).styles;
  const pick = (...wanted) => wanted.find((w) => allowed.includes(w)) ?? allowed[allowed.length - 1];
  const base = a.strategy === 'institution'
    ? { style: pick(floors > 20 ? 'deco' : 'masonry', 'masonry', 'brick'), form: 'stepped', variant: 1 }
    : a.strategy === 'cowboy'
      ? { style: pick('glass', 'curtain', 'deco', 'loft'), form: 'point', variant: 2 }
      : { style: pick(floors > 14 ? 'curtain' : 'brick', 'brick', 'loft'), form: 'slab', variant: 0 };
  const landmark = rivalLandmark(a, floors, state);
  return landmark ? { ...base, landmark } : base;
}

/**
 * The rivals want the famous drawings too, and there is one of each. A house
 * that can pay the architect's fee on a scheme big enough to carry it will,
 * which means the Chrysalis Crown is not sitting there waiting for you.
 */
function rivalLandmark(a, floors, state) {
  // The grinder builds walk-ups in the boroughs and has no use for an
  // architect. The other two are in this for the name on the building.
  if (a.strategy === 'grinder') return null;
  if (state.rnd() > 0.3 * (state.heat ?? 1)) return null;
  const open = LANDMARKS.filter((L) => floors >= L.minFloors && landmarkStatus(state, L, floors).ok);
  if (!open.length) return null;
  // The tallest thing they can carry: the fee is worth paying on the biggest
  // building on the drawing board, not the smallest.
  open.sort((x, y) => y.minFloors - x.minFloors);
  return open[0].id;
}

/**
 * The heights worth pricing on a site, for this firm.
 *
 * One height per site was the whole reason nothing tall ever went up: it was a
 * flat multiple of the FAR minimum, so a rival priced a single squat scheme,
 * found it penciled, and built it. Nobody ever asked what the same plot would
 * do with forty floors on it. Pricing a few and taking the best is what lets
 * the view premium — which grows with the square of height — be discovered.
 */
const COMMIT = { institution: 0.75, cowboy: 0.88, grinder: 0.6 };

/** The smallest job a firm this size still bothers with. */
function smallestWorthDoing(state, a) {
  if (a.strategy === 'grinder') return 0;              // volume is the whole plan
  return Math.min(140e6, netWorth(state, a.id) * 0.05);
}

function heightOptions(lot, a, state) {
  const lo = minFloors(lot);
  const cap = Math.min(maxFloors(lot, a.id, currentYear(state)), currentEra(state).maxFloors);
  const reach = {
    institution: [1, 1.7, 2.8],     // prime sites, built properly
    cowboy:      [1.5, 2.6, 4.5],   // as tall as the bank will wear
    grinder:     [1, 1.4],          // volume, not monuments
  }[a.strategy] ?? [1, 1.5];
  const out = new Set();
  for (const m of reach) out.add(Math.max(lo, Math.min(cap, Math.round(lo * m))));
  // On a site worth having, everyone at least prices the tallest thing the age
  // allows. That is how a skyline happens.
  if (lot.tier === 'core' || lot.tier === 'mid' || lot.tier === 'island') out.add(cap);
  return [...out].filter((f) => f >= lo && f <= cap);
}
