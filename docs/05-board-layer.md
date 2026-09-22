# 04 — The Board Layer

The management half. The design brief here is unusual: **it must be excellent
enough to carry a full tycoon game on its own, and designed so that it
structurally cannot.**

## The Overseer view

A free camera over the city, from rooftop height to the whole region. Not a flat
map — the actual 3D city, drained of colour and detail, with data painted onto
it. Buildings you own glow warm. Everything else is white massing.

Reading the city as *volume* rather than as a tile map matters: floor area is
the game's central currency, and floor area is a three-dimensional quantity. The
player should be able to see that one block has four times the built mass of its
neighbour by looking at it.

### Overlays

One at a time (stacking two is the reward for a late-game office upgrade). Each
paints the 3D city directly:

- **Value** — land value per buildable square foot. The base map of the game.
- **Rent** — achieved rents, residential and commercial, by floor.
- **Vacancy & turnover**
- **Zoning** — districts, FAR, overlays, special districts, landmark status.
- **Unbuilt capacity** — *the money overlay.* Every lot shaded by the gap
  between what's built and what could legally be built. This is where the player
  learns to see opportunity, and it's the direct board-side equivalent of the
  Vision tool.
- **Transit** — lines, station entrances, load by hour, walk-shed isochrones.
- **Sun & shadow** — aggregate shadow hours per public space, animated.
- **Demographics & displacement** — who lives where, who's moving, who's under
  pressure, rent-burden ratios.
- **Sentiment** — how each block feels about you personally. This one is
  low-fidelity by design, because it comes from surveys, and surveys are
  ([08](08-simulation-core.md#information-fidelity)) systematically wrong in
  interesting ways.
- **Heat** — where investigators, journalists, and rivals are currently looking.

### Time controls
Pause, 1×, 4×, 30×, 400×. An **auto-stop** list: the clock drops to 1× and
pauses on anything you've flagged — an appointment coming due, a covenant
breach, a bid received, a fire. Tuning the auto-stop list is itself a management
skill.

### Tools
Select a lot → title, history, ownership chain, encumbrances, current NOI.
Offer to buy. Assemble ([06](06-land-and-building.md#assemblage)). Draft a
massing (rough block-out only in Overseer; full fidelity needs the Model Room or
the site). File applications. Set rents. Set maintenance budgets. Hire, fire,
assign. Draw a financing structure.

## The Model Room

Your office, and its progression, and the diegetic home of the board layer.

| Tier | Office | The model | What it grants |
|---|---|---|---|
| 0 | Back room of a bodega, Lower East Side | Paper map, pushpins, a notebook | One neighborhood. Overlays: value, zoning. Data is two weeks stale. |
| 1 | Walk-up above a laundromat | Cork board + a chipboard block model of six blocks | Half a district. +Rent, +Vacancy. Weekly data. One staff desk. |
| 2 | Real office, a floor of a prewar building | A proper table model you lean over | A borough. Most overlays. Daily data. Four desks. Conference room = negotiate without travelling. |
| 3 | Tower floor, your own building | Room-sized white massing model of the city; you walk around inside it | All overlays, two stacked. Real-time data. Full org. In-house counsel, lobbyist, construction arm. |
| 4 | The top | The model plus a wall of live feeds from every site | Predictive overlays (projections with honest error bars). The city responds to rumors that you are looking at something. |

The model room is not cosmetic. Each tier is a real capability unlock, and the
*physicality* of it is the point: at tier 3, opening the management UI means
walking into a room and putting your hands into a model of New York. The two
halves of the game converge instead of drifting apart, and the endgame board
view is itself a place with a view out the window of the city you changed.

## Your organization

You cannot be everywhere. The org is how you buy presence — and it is the game's
primary source of lies.

### Roles
- **Property Manager** — runs buildings. Reports condition, tenancy, arrears.
  Shades the numbers when performance is bad.
- **Acquisitions** — finds deals. Brings you lots. Has their own taste and may
  chase the wrong thing enthusiastically.
- **Construction / Super** — schedule and quality. The single highest-leverage
  hire in the game.
- **Counsel** — approvals, contracts, litigation defense, and how fast Heat
  turns into a problem.
- **Lobbyist / Fixer** — relationships. The one who knows which envelope goes to
  whom. Hiring one is a decision about what kind of company you are.
- **Broker / Leasing** — velocity of lease-up and sales.
- **Community Liaison** — Standing maintenance; the only proxy who can attend a
  tenant meeting without making it worse.

### Staff have interests
Every employee has: competence, loyalty, an agenda, and a **reporting bias**.
That last one is the important design object. A property manager whose bonus is
tied to occupancy will report occupancy optimistically. A super under schedule
pressure will report a pour as fine. The board layer is assembled from their
reports.

**You can only correct this by going and looking.** That's pillar 2, implemented
as an org chart. The better your people, the less often you must — but the
temptation to stop checking is the game's central strategic trap, and its
central thematic one.

### Delegation dial
Per asset and per project: `Hands-on` / `Standard` / `Hands-off`. Hands-off is
cheaper in your attention and worse in fidelity and outcome. Late game is
choosing where to spend the attention you have left.

## What the board deliberately cannot do

Restated because it's the crux:

- Cannot ground-truth. Reported condition ≠ actual condition.
- Cannot negotiate with a named stakeholder at full strength.
- Cannot commit a building to construction (needs Model Room or site).
- Cannot catch unscripted local opportunities.
- Cannot see the thing that isn't in anyone's report yet.

Every one of those is a door pointing back down to the street.
