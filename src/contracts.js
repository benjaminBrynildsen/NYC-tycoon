// Contracts: the work somebody is actually asking for, with a client, a price
// and a date. They are what turns "accumulate the most" into "get this done
// before Halvorsen does".
//
// Three rules hold the whole system together:
//
//  1. Every contract is generated from the city as it stands, so it is never
//     impossible and never already satisfied the moment it is posted.
//  2. Nothing is reserved for you. The check runs over every developer in the
//     city, and whoever satisfies it first is paid. The rivals are not given
//     special treatment — they win these by building, the same as you.
//  3. Everything has a deadline. A contract nobody delivers expires, and the
//     paper reports that too.

import { HOODS } from './world.js';

const YEAR = 360;

/** Rewards are a mix so that money is never the only thing on the table. */
function reward(cash, standing, abatementYears = 0) {
  return { cash, standing, abatementYears };
}

// ------------------------------------------------------------------ the kinds
//
// Each kind knows how to propose itself from the live city, how to tell
// whether an actor has satisfied it, and how to describe its own progress.

const KINDS = {
  /** A tenant needs floor area of a particular sort in a particular district. */
  tenant: {
    propose(state, rnd) {
      // A tenant wants to be where the city is going, and a requirement posted
      // into a district nobody develops is one nobody can fill.
      const hood = pickHood(state, rnd);
      if (!hood) return null;
      const office = rnd() < 0.62;
      const gsf = Math.round((60 + Math.floor(rnd() * 4) * 35) * 1000);
      const client = pick(rnd, office ? OFFICE_CLIENTS : RESI_CLIENTS);
      return {
        kind: 'tenant', client,
        title: `${HOODS[hood].name}: ${fmtSf(gsf)} of ${office ? 'office' : 'apartments'}`,
        brief: office
          ? `${client} have outgrown their building and will sign for ${fmtSf(gsf)} of new office `
            + `space in ${HOODS[hood].name}. They will take the first one finished.`
          : `${client} are placing ${fmtSf(gsf)} of new apartments in ${HOODS[hood].name}. `
            + `The first completed scheme gets the whole requirement.`,
        need: { hood, gsf, use: office ? 'office' : 'residential' },
        reward: reward(Math.round(gsf * (office ? 90 : 65)), 2),
        years: 6,
      };
    },
    progress(state, c, id) {
      let have = 0;
      for (const lot of state.city.lots) {
        if (lot.owner !== id || lot.hood !== c.need.hood) continue;
        const b = lot.building;
        if (!b || !matchesUse(b.use, c.need.use)) continue;
        if (b.age > 25) continue;                 // they want new space, not a hand-me-down
        have += b.gsf;
      }
      return { have, want: c.need.gsf, text: `${fmtSf(have)} of ${fmtSf(c.need.gsf)}` };
    },
  },

  /** The city wants a landmark on a named avenue by a date. */
  civic: {
    propose(state, rnd, api) {
      const avenues = state.city.corridors.filter(
        (c) => c.axis === 'ns' && c.region === 'manhattan' && c.lots.some((l) => !l.building));
      if (!avenues.length) return null;
      const av = pick(rnd, avenues);
      const cap = api.floorCap(state);
      const floors = Math.max(8, Math.round(cap * (0.30 + rnd() * 0.18)));
      if (floors < 8) return null;
      return {
        kind: 'civic', client: 'The Board of Estimate',
        title: `A tower on ${av.name} — ${floors} floors or better`,
        brief: `The city wants a building of at least ${floors} floors fronting ${av.name}, and is `
          + `offering ten years free of property tax on it. It does not care who builds it.`,
        need: { corridorId: av.id, corridorName: av.name, floors },
        reward: reward(0, 3, 10),
        years: 6,
      };
    },
    progress(state, c, id) {
      let best = 0;
      for (const lot of state.city.lots) {
        if (lot.owner !== id) continue;
        if (lot.avenue.id !== c.need.corridorId && lot.street.id !== c.need.corridorId) continue;
        best = Math.max(best, lot.building?.floors ?? 0);
      }
      return { have: best, want: c.need.floors, text: `${best} of ${c.need.floors} floors` };
    },
  },

  /** Somebody wants a whole block in one pair of hands. */
  assemble: {
    propose(state, rnd) {
      // Only propose a block that is genuinely for sale: nothing on it is a
      // protected landmark, and most of it is still in weak hands.
      const blocks = state.city.blocks.filter(
        (b) => !b.isPark && b.lots.length === 4 && b.region === 'manhattan'
          && !b.lots.every((l) => l.owner === b.lots[0].owner)
          && b.lots.every((l) => !(l.building && l.building.floors >= 50))
          && b.lots.filter((l) => !l.owner || l.owner === 'npc').length >= 3);
      if (!blocks.length) return null;
      const block = pick(rnd, blocks);
      const where = block.lots[0];
      return {
        kind: 'assemble', client: pick(rnd, SYNDICATES),
        title: `Assemble the block at ${where.crossStreet} and ${where.avenue.name}`,
        brief: `A syndicate is paying for control of the whole block at ${where.crossStreet} and `
          + `${where.avenue.name} — all four lots, one owner. Whoever gets there first is paid.`,
        need: { blockKey: `${block.col},${block.row}`,
                where: `${where.crossStreet} & ${where.avenue.name}` },
        reward: reward(34_000_000, 3),
        years: 8,
      };
    },
    progress(state, c, id) {
      const [col, row] = c.need.blockKey.split(',').map(Number);
      const block = state.city.blocks.find((b) => b.col === col && b.row === row);
      const have = block ? block.lots.filter((l) => l.owner === id).length : 0;
      return { have, want: 4, text: `${have} of 4 lots` };
    },
  },

  /** Clear out a bad block and put something decent up. */
  renewal: {
    propose(state, rnd) {
      const hoods = usableHoods(state).filter((h) => {
        const lots = state.city.lots.filter((l) => l.hood === h && l.building);
        return lots.length >= 6
          && lots.filter((l) => (l.building.condition ?? 1) < 0.5).length >= 3;
      });
      if (!hoods.length) return null;
      const hood = pick(rnd, hoods);
      const count = 2 + Math.floor(rnd() * 2);
      return {
        kind: 'renewal', client: 'The Improvement Commission',
        title: `${HOODS[hood].name}: rebuild ${count} run-down buildings`,
        brief: `${HOODS[hood].name} has blocks that are dragging their neighbours down. Put up `
          + `${count} sound new buildings there and the commission will pay for the trouble.`,
        need: { hood, count },
        reward: reward(48_000_000, 4),
        years: 6,
      };
    },
    progress(state, c, id) {
      let have = 0;
      for (const lot of state.city.lots) {
        if (lot.owner !== id || lot.hood !== c.need.hood) continue;
        const b = lot.building;
        if (b && b.age <= 20 && (b.condition ?? 1) > 0.8) have++;
      }
      return { have, want: c.need.count, text: `${have} of ${c.need.count} rebuilt` };
    },
  },

  /** The tallest thing in the city, and everyone can see who has it. */
  trophy: {
    propose(state, rnd, api) {
      const cap = api.floorCap(state);
      const tallest = state.city.lots.reduce((n, l) => Math.max(n, l.building?.floors ?? 0), 0);
      // Anchored to the record that actually stands, not to what the age
      // permits. Asking for 165 floors in a city whose tallest is sixteen is
      // not a contract, it is a joke.
      const floors = Math.min(cap, Math.max(tallest + 5, Math.round(tallest * 1.4), 10));
      if (floors <= tallest) return null;
      return {
        kind: 'trophy', client: 'The Real Estate Record',
        title: `The tallest building in New York — ${floors} floors`,
        brief: `The Record will name the tallest building in the city, and the house that owns it. `
          + `Nothing under ${floors} floors will do, and the title goes to whoever holds it on the day.`,
        need: { floors },
        reward: reward(60_000_000, 8),
        years: 10,
      };
    },
    progress(state, c, id) {
      let mine = 0, best = 0;
      for (const lot of state.city.lots) {
        const f = lot.building?.floors ?? 0;
        best = Math.max(best, f);
        if (lot.owner === id) mine = Math.max(mine, f);
      }
      const want = Math.max(c.need.floors, best);
      return { have: mine, want, text: `${mine} floors · tallest standing is ${best}` };
    },
  },
};

// ------------------------------------------------------------------- the loop

const MAX_OPEN = 3;

/** Post, award and expire. Called once a month from the sim. */
export function tickContracts(state, api) {
  if (!state.contracts) state.contracts = [];
  if (!state.contractsPostedAt) state.contractsPostedAt = -999;

  const open = state.contracts.filter((c) => !c.claimedBy && !c.expired);

  // Award first: a contract satisfied on the same tick it would expire still
  // counts, because the work was done in time.
  for (const c of open) {
    const winner = whoSatisfies(state, c);
    if (winner) { awardContract(state, c, winner, api); continue; }
    if (state.day >= c.dueDay) expireContract(state, c, api);
  }

  const stillOpen = state.contracts.filter((c) => !c.claimedBy && !c.expired).length;
  if (stillOpen >= MAX_OPEN) return;
  if (state.day - state.contractsPostedAt < 240 + state.rnd() * 180) return;
  postContract(state, api);
}

function postContract(state, api) {
  const order = shuffle(state.rnd, Object.keys(KINDS));
  for (const kind of order) {
    // Never two of the same kind open at once — variety is the point.
    if (state.contracts.some((c) => c.kind === kind && !c.claimedBy && !c.expired)) continue;
    const draft = KINDS[kind].propose(state, state.rnd, api);
    if (!draft) continue;
    const c = {
      ...draft,
      id: `c${state.contracts.length}_${Math.floor(state.day)}`,
      postedDay: state.day,
      dueDay: state.day + draft.years * YEAR,
      claimedBy: null,
      expired: false,
    };
    // Posting something already satisfied would be a gift, not a contract.
    if (whoSatisfies(state, c)) continue;
    state.contracts.unshift(c);
    state.contractsPostedAt = state.day;
    api.pushNews(state, 'contract', `WANTED: ${c.title.toUpperCase()}`,
      `${c.brief} Offered by ${c.client}. ${rewardLine(c)} The requirement stands until `
      + `${api.dateIn(state, c.dueDay - state.day)}.`);
    return;
  }
}

function awardContract(state, c, winner, api) {
  c.claimedBy = winner;
  c.claimedDay = state.day;
  const a = state.actors[winner];
  a.cash += c.reward.cash;
  a.standing = (a.standing ?? 0) + c.reward.standing;
  if (c.reward.abatementYears) applyAbatement(state, c, winner);

  const mine = winner === 'player';
  api.logEvent(state, winner, `${mine ? 'Won' : 'Took'} the ${c.client} contract — ${c.title}`);
  api.pushNews(state, 'contract',
    mine ? `THE ${c.client.toUpperCase()} CONTRACT IS YOURS`
         : `${a.name.toUpperCase()} TAKES THE ${c.client.toUpperCase()} CONTRACT`,
    `${c.title}. ${mine ? 'You delivered it' : `${a.name} delivered it`} `
    + `${Math.round((c.dueDay - state.day) / YEAR * 10) / 10} years inside the deadline. ${rewardLine(c)}`);
}

function expireContract(state, c, api) {
  c.expired = true;
  c.bestRatio = bestRatio(state, c);
  api.pushNews(state, 'contract', `${c.client.toUpperCase()} WITHDRAW THEIR REQUIREMENT`,
    `Nobody in this city could deliver ${c.title.toLowerCase()} inside the time. `
    + `${c.client} have taken their business elsewhere.`);
}

/** How close the closest developer got, 0 to 1. */
function bestRatio(state, c) {
  const kind = KINDS[c.kind];
  let best = 0;
  for (const id in state.actors) {
    if (state.actors[id].retired) continue;
    const p = kind.progress(state, c, id);
    if (p.want) best = Math.max(best, Math.min(1, p.have / p.want));
  }
  return best;
}

/** The first developer who meets the requirement, or null. */
function whoSatisfies(state, c) {
  const kind = KINDS[c.kind];
  for (const id in state.actors) {
    if (state.actors[id].retired) continue;
    const p = kind.progress(state, c, id);
    if (p.have >= p.want) return id;
  }
  return null;
}

/** Ten years free of tax, on the building that earned it. */
function applyAbatement(state, c, winner) {
  const until = state.day + c.reward.abatementYears * YEAR;
  for (const lot of state.city.lots) {
    if (lot.owner !== winner || !lot.building) continue;
    if (c.need.corridorId
        && lot.avenue.id !== c.need.corridorId && lot.street.id !== c.need.corridorId) continue;
    if (c.need.floors && lot.building.floors < c.need.floors) continue;
    lot.abatedUntil = Math.max(lot.abatedUntil ?? 0, until);
    return;
  }
}

// ------------------------------------------------------------------ reporting

/** Open contracts with everyone's progress, for the panel. */
export function contractBoard(state) {
  if (!state.contracts) return [];
  return state.contracts
    .filter((c) => !c.claimedBy && !c.expired)
    .map((c) => {
      const kind = KINDS[c.kind];
      const rows = [];
      for (const id in state.actors) {
        if (state.actors[id].retired) continue;
        const p = kind.progress(state, c, id);
        rows.push({ id, name: state.actors[id].name, ...p,
                    ratio: p.want ? Math.min(1, p.have / p.want) : 0 });
      }
      rows.sort((a, b) => b.ratio - a.ratio);
      const you = rows.find((r) => r.id === 'player');
      const rival = rows.find((r) => r.id !== 'player');
      return {
        ...c,
        monthsLeft: Math.max(0, Math.round((c.dueDay - state.day) / 30)),
        you, leader: rows[0], rival,
        // Somebody else is closer than you and actually moving.
        threatened: rows[0].id !== 'player' && rows[0].ratio > (you?.ratio ?? 0),
      };
    });
}

export function rewardLine(c) {
  const bits = [];
  if (c.reward.cash) bits.push(money(c.reward.cash));
  if (c.reward.abatementYears) bits.push(`${c.reward.abatementYears} years free of property tax`);
  if (c.reward.standing) bits.push(`${c.reward.standing} standing`);
  return `Pays ${bits.join(' · ')}.`;
}

/** What a rival should be leaning towards, so the race is real. */
export function contractBias(state, actorId, lot) {
  if (!state.contracts) return 1;
  let bias = 1;
  for (const c of state.contracts) {
    if (c.claimedBy || c.expired) continue;
    // The closer the date, the harder an unfilled requirement pulls. A job
    // with six years to run is a nice-to-have; one with six months is a race.
    const life = c.dueDay - c.postedDay;
    const urgency = 1 + 1.4 * (1 - Math.max(0, Math.min(1, (c.dueDay - state.day) / life)));
    if (c.need.hood && lot.hood === c.need.hood) bias += 1.5 * urgency;
    if (c.need.corridorId
        && (lot.avenue.id === c.need.corridorId || lot.street.id === c.need.corridorId)) bias += 1.5 * urgency;
    if (c.need.blockKey === `${lot.block.col},${lot.block.row}`) bias += 2.0 * urgency;
  }
  return bias;
}

/**
 * What the trade calls you. Standing is earned by delivering what the city
 * asked for, not by being rich — so the two rankings can disagree, and a
 * patient builder can outrank a bigger balance sheet.
 */
const RANKS = [
  { at: 0,  title: 'Speculator', ltc: 0.50, interest: 0.070, fill: false,
    perk: 'You buy and you build. Everything else has to be earned.' },
  { at: 3,  title: 'Builder', ltc: 0.58, interest: 0.068, fill: false,
    perk: 'Lenders will go to 58% of cost.' },
  { at: 7,  title: 'Developer', ltc: 0.64, interest: 0.065, fill: true,
    perk: 'Leverage to 64%, and the harbour commission will licence you to fill water.' },
  { at: 13, title: 'Magnate', ltc: 0.70, interest: 0.060, fill: true, fillDiscount: 0.2,
    perk: 'Leverage to 70%, cheaper money, and a fifth off the cost of fill.' },
  { at: 21, title: 'Titan', ltc: 0.75, interest: 0.050, fill: true, fillDiscount: 0.3,
    perk: 'The bond market opens: 5% money, leverage to 75%, a third off fill.' },
];

export function rankFor(standing = 0) {
  let r = RANKS[0];
  for (const x of RANKS) if (standing >= x.at) r = x;
  return r;
}

export function titleFor(standing = 0) { return rankFor(standing).title; }

/** The next rung, and how far off it is. */
export function nextRank(standing = 0) {
  return RANKS.find((r) => r.at > standing) ?? null;
}

export { RANKS };

// --------------------------------------------------------------------- odds

const OFFICE_CLIENTS = ['Pierce & Co.', 'The Atlantic Mutual', 'Sterling Shipping',
  'Rowe, Hatch & Finch', 'The Merchants Exchange', 'Calloway Steel'];
const RESI_CLIENTS = ['The Wentworth Trust', 'Ashby Residential', 'The Model Tenement Fund',
  'Holloway & Sons'];
const SYNDICATES = ['A Chicago syndicate', 'The Devereux family', 'An anonymous buyer',
  'The Hudson Land Company'];

function pick(rnd, list) { return list[Math.floor(rnd() * list.length)]; }

function shuffle(rnd, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick a district, weighted towards the ones that get built in. */
function pickHood(state, rnd) {
  const weight = { core: 4, mid: 3, edge: 1.4, res: 1 };
  const pool = [];
  for (const h of usableHoods(state)) {
    const w = weight[HOODS[h].tier] ?? 1;
    for (let i = 0; i < Math.round(w * 2); i++) pool.push(h);
  }
  return pool.length ? pick(rnd, pool) : null;
}

function usableHoods(state) {
  const seen = new Set();
  for (const lot of state.city.lots) {
    if (lot.region === 'manhattan') seen.add(lot.hood);
  }
  return [...seen];
}

function matchesUse(have, want) {
  return have === want || have === 'mixed';
}

function fmtSf(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}m sf` : `${Math.round(n / 1000)}k sf`;
}

function money(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}k`;
}
