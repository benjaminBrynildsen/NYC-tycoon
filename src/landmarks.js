// Signature designs: the buildings a city gets remembered for.
//
// A normal scheme is a facade, a form and a colour, and every developer in
// New York can put up the same one. A signature design is a named architect
// with a drawing nobody else can use — it costs a great deal more to build,
// it rents for more, it is worth more than its income says it is, and there
// is exactly one of each. Somebody gets the Chrysalis Crown and everybody
// else gets to look at it.
//
// The profile is the whole of the silhouette: volumes as fractions of the lot
// and of the building's height, stacked by hand rather than generated. That
// is why these read as particular buildings and the ordinary stock reads as
// stock. `dx` offsets a volume sideways, which is how a pair of towers on one
// plot is possible at all.

export const LANDMARKS = [
  {
    id: 'cleaver', name: 'The Cleaver', architect: 'Halsted & Root',
    from: 1898, minFloors: 14, maxFloors: 26, type: 'prewar', variant: 2,
    fee: 1.2, rent: 1.1, prestige: 1.07, standing: 2,
    blurb: 'A blade of a building on a corner plot: twenty feet deep, a full block long, '
         + 'and a cornice the whole way round. Everybody photographs it.',
    profile: [{ w: 1, d: 0.34, f: 1, y0: 0 }],
    crown: null,
  },
  {
    id: 'cathedral', name: 'The Woolwright Cathedral', architect: 'Cass Merrow',
    from: 1908, minFloors: 34, maxFloors: 60, type: 'prewar', variant: 0,
    fee: 1.3, rent: 1.16, prestige: 1.1, standing: 3,
    blurb: 'A cathedral of commerce — gothic stonework carried to the top of a tower and '
         + 'finished with a spire, because the client wanted a church that paid rent.',
    profile: [
      { w: 1, d: 1, f: 0.30, y0: 0 },
      { w: 0.60, d: 0.60, f: 0.48, y0: 0.30 },
      { w: 0.42, d: 0.42, f: 0.22, y0: 0.78 },
    ],
    crown: 'spire',
  },
  {
    id: 'ziggurat', name: 'The Ziggurat', architect: 'Hugh Vandermere',
    from: 1918, minFloors: 24, maxFloors: 48, type: 'deco', variant: 1,
    fee: 1.24, rent: 1.13, prestige: 1.08, standing: 2,
    blurb: 'The setback resolution taken literally and without apology: five stone terraces '
         + 'stepping back for light, each one a garden. The wedding cake everyone copies.',
    profile: [
      { w: 1, d: 1, f: 0.2, y0: 0 },
      { w: 0.84, d: 0.84, f: 0.2, y0: 0.2 },
      { w: 0.68, d: 0.68, f: 0.2, y0: 0.4 },
      { w: 0.52, d: 0.52, f: 0.2, y0: 0.6 },
      { w: 0.36, d: 0.36, f: 0.2, y0: 0.8 },
    ],
    crown: null,
  },
  {
    id: 'crown', name: 'The Chrysalis Crown', architect: 'William Van Alden',
    from: 1927, minFloors: 48, maxFloors: 90, type: 'deco', variant: 3,
    fee: 1.44, rent: 1.22, prestige: 1.16, standing: 4,
    blurb: 'Stainless arches stacked into a sunburst and a needle above them, assembled in '
         + 'secret inside the shaft and raised in ninety minutes to steal the record.',
    profile: [
      { w: 1, d: 1, f: 0.06, y0: 0 },
      { w: 0.80, d: 0.80, f: 0.44, y0: 0.06 },
      { w: 0.62, d: 0.62, f: 0.30, y0: 0.50 },
      { w: 0.42, d: 0.42, f: 0.20, y0: 0.80 },
    ],
    crown: 'sunburst',
  },
  {
    id: 'empire', name: 'The Empire Mast', architect: 'Shreve, Lamb & Ardsley',
    from: 1929, minFloors: 66, maxFloors: 110, type: 'deco', variant: 1,
    fee: 1.42, rent: 1.21, prestige: 1.15, standing: 5,
    blurb: 'Limestone and steel, five setbacks, and a mooring mast on top that was sold as '
         + 'an airship terminal and has never once been used as one.',
    profile: [
      { w: 1, d: 1, f: 0.05, y0: 0 },
      { w: 0.88, d: 0.88, f: 0.07, y0: 0.05 },
      { w: 0.72, d: 0.72, f: 0.50, y0: 0.12 },
      { w: 0.50, d: 0.50, f: 0.26, y0: 0.62 },
      { w: 0.32, d: 0.32, f: 0.12, y0: 0.88 },
    ],
    crown: 'mast',
  },
  {
    id: 'bronze', name: 'The Seagate House', architect: 'Miesler & Jensen',
    from: 1955, minFloors: 32, maxFloors: 60, type: 'midcentury', variant: 1,
    fee: 1.28, rent: 1.15, prestige: 1.09, standing: 3,
    blurb: 'A bronze and smoked-glass slab set back behind its own plaza — half the plot '
         + 'given away as open ground, which is exactly why it is worth what it is.',
    profile: [
      { w: 0.62, d: 0.62, f: 0.06, y0: 0 },
      { w: 0.54, d: 0.36, f: 0.94, y0: 0.06 },
    ],
    crown: null,
  },
  {
    id: 'twins', name: 'The Ledger Twins', architect: 'Yamane Associates',
    from: 1968, minFloors: 72, maxFloors: 120, type: 'midcentury', variant: 2,
    fee: 1.36, rent: 1.19, prestige: 1.12, standing: 4,
    blurb: 'Two identical shafts on one podium, close enough that the gap between them is '
         + 'a weather system. Nobody agrees whether they are one building or two.',
    profile: [
      { w: 1, d: 1, f: 0.05, y0: 0 },
      { w: 0.40, d: 0.44, f: 0.95, y0: 0.05, dx: -0.28 },
      { w: 0.40, d: 0.44, f: 0.95, y0: 0.05, dx: 0.28 },
    ],
    crown: null,
  },
  {
    id: 'arkwright', name: 'The Arkwright Spire', architect: 'Ada Marchetti',
    from: 1992, minFloors: 70, maxFloors: 140, type: 'glass', variant: 2,
    fee: 1.5, rent: 1.25, prestige: 1.18, standing: 6,
    blurb: 'A private tower for a man who builds engines: a tapering glass shaft, a landing '
         + 'deck cantilevered off the top, and a crown that is lit from the inside all night.',
    profile: [
      { w: 1, d: 1, f: 0.08, y0: 0 },
      { w: 0.74, d: 0.74, f: 0.52, y0: 0.08 },
      { w: 0.50, d: 0.50, f: 0.40, y0: 0.60 },
    ],
    crown: 'lantern',
  },
  {
    id: 'lantern', name: 'The Lantern', architect: 'Sørensen Ito',
    from: 2006, minFloors: 80, maxFloors: 300, type: 'glass', variant: 0,
    fee: 1.46, rent: 1.23, prestige: 1.165, standing: 5,
    blurb: 'A faceted shaft that narrows four times on the way up and ends in a glass crown '
         + 'you can see from the far end of the harbour.',
    profile: [
      { w: 1, d: 1, f: 0.05, y0: 0 },
      { w: 0.78, d: 0.78, f: 0.35, y0: 0.05 },
      { w: 0.60, d: 0.60, f: 0.30, y0: 0.40 },
      { w: 0.44, d: 0.44, f: 0.30, y0: 0.70 },
    ],
    crown: 'lantern',
  },
];

const BY_ID = new Map(LANDMARKS.map((l) => [l.id, l]));

export function landmarkById(id) {
  return id ? BY_ID.get(id) ?? null : null;
}

/**
 * Whether this design can still be commissioned: invented, not already spoken
 * for, and tall enough to be the building it is a drawing of. A signature
 * design is a one-off — reserved the day somebody breaks ground on it, not the
 * day it tops out, so two developers cannot race each other to the same tower.
 */
export function landmarkStatus(state, l, floors = null) {
  const taken = state.landmarks?.[l.id];
  if (taken) {
    const who = state.actors[taken.by];
    return { ok: false, taken: true,
             why: `${l.name} was commissioned by ${who ? who.name : 'somebody else'}. `
                + 'There is only ever one.' };
  }
  const year = state.startYear + Math.floor(state.day / 360);
  if (year < l.from) return { ok: false, why: `${l.architect} has not drawn it yet — ${l.from}.` };
  if (floors !== null && floors < l.minFloors) {
    return { ok: false, short: true,
             why: `${l.name} does not work under ${l.minFloors} floors.` };
  }
  // A drawing is a building, not a style sheet. Stretching the Cleaver — a
  // blade of a thing fourteen storeys high — to a hundred and fifty floors
  // makes nonsense of the design and of the fee that was paid for it.
  if (floors !== null && floors > l.maxFloors) {
    return { ok: false, tall: true,
             why: `${l.name} does not work above ${l.maxFloors} floors.` };
  }
  return { ok: true };
}

/** Every signature design that is still on the table, for the build panel. */
export function landmarkOptions(state, floors = null) {
  return LANDMARKS.map((l) => ({ ...l, status: landmarkStatus(state, l, floors) }));
}
