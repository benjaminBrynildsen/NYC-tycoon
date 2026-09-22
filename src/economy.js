// The simulation: money, land value, construction, the market cycle, and the
// rival developers you're racing. Runs on a day tick. No rendering in here.

import { CONFIG, DISTRICTS, USES, buildableSf, massing, minFloors, mulberry32 } from './world.js';

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

export function landValue(state, lot) {
  const intensity = lot._intensity ?? 0.35;
  const mult = (0.65 + intensity * 0.9) * state.cycle;
  return lot.landPerSf * buildableSf(lot) * mult;
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
  return u.rent * DISTRICTS[lot.district].rentMul * slender * quality * state.cycle;
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
  const gross = b.gsf * rentPerSf(state, lot, b.use, b.floors, b.quality ?? 1);
  const occ = occupancyFor(state, lot);
  return gross * occ * (1 - USES[b.use].opex);
}

export function buildingValue(state, lot) {
  return buildingNOI(state, lot) / CAP_RATE;
}

export function quote(state, lot, floors, use, ltc) {
  const m = massing(lot, floors);
  const land = lot.owner === 'player' ? 0 : askPrice(state, lot);
  const hard = m.gsf * costPerSf(lot, use, floors);
  const soft = hard * 0.14;
  const total = land + hard + soft;
  const loan = Math.min(total * ltc, total * MAX_LTC);
  const equity = total - loan;
  const gross = m.gsf * rentPerSf(state, lot, use, floors, 1);
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

export function startProject(state, lot, actorId, floors, use, ltc) {
  const a = state.actors[actorId];
  if (lot.owner !== actorId) return { ok: false, why: 'You do not own this lot.' };
  if (lot.project) return { ok: false, why: 'Already under construction.' };
  const q = quote(state, lot, floors, use, ltc);
  if (a.cash < q.equity) return { ok: false, why: `Need ${money(q.equity)} equity.` };

  a.cash -= q.equity;
  a.debt += q.loan;
  const project = {
    lot, owner: actorId, floors, use, ltc,
    cost: q.total, loan: q.loan, spent: q.equity,
    side: q.side, gsf: q.gsf,
    startDay: state.day,
    endDay: state.day + q.months * 30,
    demolished: !!lot.building,
  };
  lot.project = project;
  lot.building = null;                     // demolition is instant; this is a game
  state.projects.push(project);
  logEvent(state, actorId, `broke ground on ${floors} floors at #${lot.id} (${money(q.total)})`);
  return { ok: true, project, quote: q };
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
        quality: 1, age: 0, builtBy: p.owner,
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
    const q = quote(state, lot, floors, a.strategy === 'grinder' ? 'residential' : 'office', a.ltc);
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
    startProject(state, best.lot, a.id, best.floors, use, a.ltc);
    a.cooldown = a.patience;
    state._dirtyGeometry = true;
  }
}

function pickFloors(lot, strategy) {
  const lo = minFloors(lot);
  if (strategy === 'cowboy') return Math.min(CONFIG.MAX_FLOORS, Math.round(lo * 1.8));
  if (strategy === 'institution') return Math.round(lo * 1.35);
  return lo;
}
