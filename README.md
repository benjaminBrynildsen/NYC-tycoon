# AIR RIGHTS

*(working title — repo: `nyc-tycoon`)*

**An open-world city-builder where you walk the streets you're redrawing.**

You play a developer in New York. You start with a folding table in the back of
a bodega and one bad brownstone. You end — if you get there — in a tower of your
own, walking around a room-sized physical model of the city you rebuilt.

The whole game is one idea:

> **One city. One simulation. Two cameras.**

There is a single living New York running at all times. You can look at it from
the sidewalk — third-person, GTA-style, walking, driving, riding the 6 train,
talking to people — or from above, as a board: heat maps, ledgers, zoning
overlays, the whole borough at a glance. It is the *same city* either way. The
crowd on the sidewalk is a live readout of the numbers on the board. The numbers
on the board are an abstraction of the people on the sidewalk.

Neither camera is the "real" game. The design is built so that each one is blind
in exactly the places the other one sees.

---

## The signature mechanic

Stand on an empty lot. Raise **the Vision.**

The world desaturates to blueprint blue and the lot's legal zoning envelope
rises around you as a translucent volume — the literal maximum shape the law
lets you build, floating over the dirt, at 1:1, seen from the sidewalk. You
sculpt a building inside it with your hands. You walk around your own ghost
tower. You step inside it. You ride a ghost elevator to the 30th floor and look
out the window that doesn't exist yet, at the view your tenants would be paying
for. You drag the sun across the sky and watch your shadow sweep over the park
across the street — and watch the community-opposition meter climb as it does.

Then you commit, and for the next two in-game years there is a hole in the
ground you can go stand in.

That is the pitch. Everything else in these documents is in service of making
that moment matter.

---

## Documents

Read in order; each one assumes the last.

| # | Doc | What it settles |
|---|-----|-----------------|
| 01 | [Pillars & Pitch](docs/01-pillars-and-pitch.md) | What the game is, who it's for, the four pillars, what it is *not* |
| 02 | [Two Cameras](docs/02-two-cameras.md) | The mode system: how you switch, the two clocks, the calendar that forces you back down |
| 03 | [The Street Layer](docs/03-street-layer.md) | Avatar, traversal, the verb list, the Vision tool in detail |
| 04 | [Vehicles, Traffic & Crowds](docs/04-vehicles-and-traffic.md) | 11 drivable classes, 10 car models, parking, traffic you caused, crowd density |
| 05 | [The Board Layer](docs/05-board-layer.md) | Overseer view, the Model Room, delegation, the org you build |
| 06 | [Land & Building](docs/06-land-and-building.md) | Lots, FAR, air rights, assemblage, the construction pipeline |
| 07 | [Politics & Approvals](docs/07-politics-and-approvals.md) | ULURP, stakeholders, leverage, graft, Heat |
| 08 | [Simulation Core](docs/08-simulation-core.md) | Tiered agents, how the sidewalk crowd samples the spreadsheet |
| 09 | [Economy & Progression](docs/09-economy-and-progression.md) | Debt, the cycle, Capital/Standing/Heat, the five tiers |
| 10 | [People & Story](docs/10-people-and-story.md) | Tracked NPCs, displacement, rivals, how narrative is generated |
| 11 | [Technical Architecture](docs/11-technical-architecture.md) | Headless deterministic sim + two thin clients; stack recommendation |
| 12 | [UX & Controls](docs/12-ux-and-controls.md) | Control scheme, HUD, the transition, readability rules |
| 13 | [Vertical Slice](docs/13-vertical-slice.md) | What to actually build first, and in what order |
| 14 | [Open Questions](docs/14-open-questions.md) | The risks I can't design away from a desk |

---

## Status

Design only. No code yet, by design — see
[13-vertical-slice.md](docs/13-vertical-slice.md) for what gets built first and
why the simulation comes before the renderer.
