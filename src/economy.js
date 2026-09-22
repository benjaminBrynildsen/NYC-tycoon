// The simulation: money, land value, construction, the market cycle, and the
// rival developers you're racing. Runs on a day tick. No rendering in here.

import { CONFIG, DISTRICTS, USES, STYLES, FORMS, buildableSf, massing, minFloors, mulberry32 } from './world.js';

export const START_CASH = 100_000_000;
export const CAP_RATE = 0.055;        // what a stabilised building is worth per $ of NOI
export const INTEREST = 0.065;        // annual, interest-only
export const MAX_LTC = 0.65;          // most you can borrow against a project's cost

export const RIVALS = [
  { id: 'r1', name: 'Halvorsen Estates', color: 0xd4664a, strategy: 'institution',
    blurb: 'Old money. Patient, unlevered, prime sites only.' },
  { id: 'r2', name: 'Vance Bros. Capital', color: 0xe0b341, strategy: 'cowboy',
    blurb: 'Maximum leverage, maximum speed. Always over-extended.' },
  { id: 'r3', name: 'Kestrel Holdings', color: 0x6fa8c7, strategy: 'grinder',
    blurb: 'Cheap lots, high volume, thin margins. Grinds you down.' },
];

export function createState(city, seed = 11) {
  const rnd = mulberry32(seed + 99);

  const actors = {
    player: {
      id: 'player', name: 'You', color: 0x4ade80,
      cash: START_CASH, debt: 0, gsfBuilt: 0, isPlayer: true, history: [],
    },
  };
  for (const r of RIVALS) {
    actors[r.id] = {
      ...r, cash: START_CASH, debt: 0, gsfBuilt: 0, isPlayer: false,
      patience: r.strategy === 'institution' ? 3 : r.strategy === 'cowboy' ? 0 : 1,
      ltc: r.strategy === 'cowboy' ? 0.65 : r.strategy === 'institution' ? 0.3 : 0.5,
      cooldown: 0,
    };
  }

  return {
    city,
    actors,
    day: 0,
    startYear: 1998,
    cycle: 1.0,          // market multiplier on rents and land
    cyclePhase: rnd() * Math.PI * 2,
    projects: [],
    log: [],
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
export function localIntensity(state, lot, radius = 150) {
  let built = 0, capacity = 0;
  for (const l of state.city.lots) {
    const dx = l.x - lot.x, dz = l.z - lot.z;
    if (dx * dx + dz * dz > radius * radius) continue;
    capacity += buildableSf(l);
    if (l.building) built += l.building.gsf;
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
  return { water, park, corridor, blight, intensity,
           total: water * park * corridor * blight * intensity };
}

export function landValue(state, lot) {
  return lot.landPerSf * buildableSf(lot) * premiums(state, lot).total * state.cycle;
}

export function askPrice(state, lot) {
  const base = landValue(state, lot);
  // An owner-occupied building costs more than raw dirt — you're buying them out.
  const occupied = lot.building ? 1.25 + lot.building.gsf / (buildableSf(lot) + 1) * 0.5 : 1.0;
  return base * occupied;
}

export function rentPerSf(state, lot, use, floors, quality = 1) {
  const u = USES[use];
  const slender = 1 + Math.min(floors, 90) / 190;      // height and light are worth money
  const p = premiums(state, lot);
  const place = p.water * p.park * p.corridor * p.blight;
  return u.rent * DISTRICTS[lot.district].rentMul * slender * quality * place * state.cycle;
}

export function costPerSf(lot, use, floors) {
  const u = USES[use];
  return u.cost * (1 + floors / 55);                    // tall is disproportionately expensive
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
  return buildingNOI(state, lot) / CAP_RATE;
}

export const DEFAULT_DESIGN = { style: 'masonry', form: 'stepped', variant: 1 };

export function designMul(design = DEFAULT_DESIGN) {
  const st = STYLES[design.style] || STYLES.masonry;
  const fm = FORMS[design.form] || FORMS.stepped;
  return { cost: st.cost * fm.cost, rent: st.rent * fm.rent };
}

export function quote(state, lot, floors, use, ltc, design = DEFAULT_DESIGN, owner = 'player') {
  const m = massing(lot, floors);
  const dm = designMul(design);
  const land = lot.owner === owner ? 0 : askPrice(state, lot);
  const hard = m.gsf * costPerSf(lot, use, floors) * dm.cost;
  const soft = hard * 0.14;
  const total = land + hard + soft;
  const loan = Math.min(total * ltc, total * MAX_LTC);
  const equity = total - loan;
  const gross = m.gsf * rentPerSf(state, lot, use, floors, 1) * dm.rent;
  const noi = gross * occupancyFor(state, lot) * (1 - USES[use].opex);
  const debtService = loan * INTEREST;
  const months = Math.round(9 + floors * 0.75);
  return { ...m, land, hard, soft, total, loan, equity, gross, noi,
           debtService, cashflow: noi - debtService,
           yieldOnCost: noi / Math.max(total, 1), value: noi / CAP_RATE, months };
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
    .map((a) => ({ ...a, worth: netWorth(state, a.id) }))
    .sort((x, y) => y.worth - x.worth);
}

// ---------------------------------------------------------------- actions

export function buyLot(state, lot, actorId) {
  const a = state.actors[actorId];
  const price = askPrice(state, lot);
  if (lot.owner === actorId) return { ok: false, why: 'You already own this lot.' };
  if (lot.owner && lot.owner !== 'npc') return { ok: false, why: 'Not for sale — a rival owns it.' };
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
  const q = quote(state, lot, floors, use, ltc, design, actorId);
  if (a.cash < q.equity) return { ok: false, why: `Need ${money(q.equity)} equity.` };

  a.cash -= q.equity;
  a.debt += q.loan;
  const project = {
    lot, owner: actorId, floors, use, ltc,
    style: design.style, form: design.form, variant: design.variant,
    designRent: designMul(design).rent,
    cost: q.total, loan: q.loan, spent: q.equity,
    side: q.side, gsf: q.gsf,
    startDay: state.day,
    endDay: state.day + q.months * 30,
    baseMonths: q.months,
    projectedNOI: q.noi,
    demolished: !!lot.building,
  };
  lot.project = project;
  lot.building = null;                     // demolition is instant; this is a game
  state.projects.push(project);
  logEvent(state, actorId, `broke ground on ${floors} floors at #${lot.id} (${money(q.total)})`);
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
      owner.cash += amount;
      owner.debt = Math.max(0, owner.debt - amount * 0.45);
    }
    const from = lot.owner;
    lot.owner = actorId;
    lot.offerBlockedUntil = 0;
    logEvent(state, actorId, `bought ${lot.address} from ${name} for ${money(amount)}`);
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
  a.cash += price * 0.97;                  // brokerage
  lot.owner = 'npc';
  logEvent(state, actorId, `sold #${lot.id} for ${money(price * 0.97)}`);
  return { ok: true, price };
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
  const debtService = a.debt * INTEREST;
  return {
    cash: a.cash, land, buildings, wip, debt: a.debt,
    total: a.cash + land + buildings + wip - a.debt,
    noi, tax, debtService, netIncome: noi - tax - debtService,
    lots, built, gsf,
  };
}

export function logEvent(state, actorId, text) {
  const who = state.actors[actorId];
  state.log.unshift({ day: state.day, actor: actorId, name: who ? who.name : actorId, text });
  if (state.log.length > 60) state.log.pop();
}

// ---------------------------------------------------------------- the tick

export function advance(state, days) {
  const target = state.day + days;
  while (state.day < target) {
    const step = Math.min(1, target - state.day);
    state.day += step;
    if (Math.floor(state.day) !== Math.floor(state.day - step)) dayTick(state);
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
      };
      p.lot.project = null;
      state.actors[p.owner].gsfBuilt += p.gsf;
      state.projects.splice(i, 1);
      logEvent(state, p.owner, `topped out ${p.floors} floors at #${p.lot.id} — ${sf(p.gsf)}`);
      state._dirtyGeometry = true;
    }
  }

  if (d.getUTCDate() === 1 && state.monthOfLastTick !== d.getUTCMonth()) {
    state.monthOfLastTick = d.getUTCMonth();
    monthTick(state);
  }
}

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
      tax += landValue(state, lot) * 0.012 / 12;
    }
    a.cash += noi - tax - (a.debt * INTEREST) / 12;
    a.lastNOI = noi;
  }

  for (const r of RIVALS) rivalTurn(state, state.actors[r.id]);
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
    } else if (!c.famous && wasFamous) {
      logEvent(state, 'player', `— ${c.name} has lost its draw`);
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

  // Distress: a leveraged developer in a downturn has to sell something.
  if (a.cash < 0) {
    const owned = state.city.lots.filter((l) => l.owner === a.id && !l.project);
    if (owned.length) {
      owned.sort((x, y) => buildingValue(state, x) - buildingValue(state, y));
      const lot = owned[0];
      const price = (landValue(state, lot) + buildingValue(state, lot)) * 0.82;
      a.cash += price;
      a.debt = Math.max(0, a.debt - price * 0.6);
      lot.owner = 'npc';
      logEvent(state, a.id, `sold #${lot.id} under pressure for ${money(price)}`);
    }
    a.cooldown = 2;
    return;
  }

  const wants = {
    institution: (l) => (l.district === 'core' ? 3 : l.district === 'mid' ? 2 : 0.3),
    cowboy:      (l) => 1 + (l._intensity ?? 0.3) * 2,
    grinder:     (l) => (l.district === 'edge' || l.district === 'res' ? 2.5 : 0.5),
  }[a.strategy];

  let best = null, bestScore = -Infinity;
  for (const lot of state.city.lots) {
    if (lot.owner === a.id || lot.project) continue;
    if (lot.owner && lot.owner !== 'npc') continue;
    const floors = pickFloors(lot, a.strategy);
    const q = quote(state, lot, floors, a.strategy === 'grinder' ? 'residential' : 'office',
                    a.ltc, rivalDesign(a, lot, floors), a.id);
    if (q.equity > a.cash * 0.6) continue;
    const score = q.yieldOnCost * 100 * wants(lot) - (a.strategy === 'institution' ? q.equity / 9e7 : 0);
    if (score > bestScore) { bestScore = score; best = { lot, floors, q }; }
  }

  const threshold = { institution: 8.5, cowboy: 6, grinder: 9 }[a.strategy];
  if (best && bestScore > threshold) {
    if (best.lot.owner === 'npc' || best.lot.owner === null) {
      const price = askPrice(state, best.lot);
      if (a.cash < price + best.q.equity * 0.5) { a.cooldown = 1; return; }
      a.cash -= price;
      best.lot.owner = a.id;
    }
    const use = a.strategy === 'grinder' ? 'residential' : 'office';
    startProject(state, best.lot, a.id, best.floors, use, a.ltc, rivalDesign(a, best.lot, best.floors));
    a.cooldown = a.patience;
    state._dirtyGeometry = true;
  }
}

/** Each rival has a house style, which you can read off the skyline. */
function rivalDesign(a, lot, floors) {
  if (a.strategy === 'institution') return { style: floors > 20 ? 'deco' : 'masonry', form: 'stepped', variant: 1 };
  if (a.strategy === 'cowboy') return { style: 'glass', form: 'point', variant: 2 };
  return { style: floors > 14 ? 'curtain' : 'brick', form: 'slab', variant: 0 };
}

function pickFloors(lot, strategy) {
  const lo = minFloors(lot);
  if (strategy === 'cowboy') return Math.min(CONFIG.MAX_FLOORS, Math.round(lo * 1.8));
  if (strategy === 'institution') return Math.round(lo * 1.35);
  return lo;
}
