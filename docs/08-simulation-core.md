# 07 — Simulation Core

The technical expression of "one city, two cameras." If this is built right,
the rest of the game becomes possible. If it's built as two systems that
synchronize, the game dies of desync bugs and thematic incoherence.

## The rule

> **The crowd on the sidewalk is a sampler of the statistical simulation.**

Pedestrians are not decoration spawned by a density value. Each one is
instantiated *from* the local population distribution, carries a real
household's attributes, is going somewhere the sim says someone like them would
be going, and folds back into the aggregate when you leave. Walk a block and
you are, literally, sampling the distribution.

This is what makes pillar 1 true rather than aspirational, and it's cheap: it
costs about the same as faking it.

## Three tiers

### Tier 0 — Aggregate (the whole city, always)
The city as statistics. Every block holds cohorts, not individuals:

```
BlockState {
  households: Cohort[]    // { size, income_band, tenure, rent_burden,
                          //   years_here, employment, satisfaction, count }
  businesses: Cohort[]
  jobs_by_sector, footfall_by_hour, transit_load
  land_value, rents, vacancy, construction_pipeline
  condition, sentiment_toward_player, crime, service_quality
}
```

Updated on a coarse tick (one in-game day). Cheap enough to run a few thousand
blocks at 400× on one thread. This is the layer the board reads, the layer the
economy runs on, and the layer that persists.

### Tier 1 — Tracked (200–600 individuals, always, citywide)
The named cast: stakeholders, staff, rivals, tenants who matter, the bodega
owner, the super, the holdout, the councilmember, plus anyone the player has
talked to more than twice (auto-promotion).

Full individual state: home, work, routine, relationships, memory of the player,
goals, money, current problem. Simulated as lightweight behaviour trees on the
day tick regardless of where the camera is. They live their lives while you're
on the board, and they have *opinions about what happened while you were gone.*

Tracked agents are promoted out of Tier 0 (the bodega owner is instantiated from
the cohort that owned that business) and can be demoted back if the player
loses interest. **Displaced tracked agents are never deleted** — see
[the ledger](10-people-and-story.md#the-ledger).

### Tier 2 — Embodied (the few hundred around the camera)
Only exists in street mode, only within ~200m, only while you're there. Full
navmesh agents with animation, appearance, and a destination.

Spawned by **sampling Tier 0**: to fill a block at 6pm, ask the block for its
population distribution and current hour, draw households from it, and
instantiate people whose appearance, direction, pace, and destination reflect
the draw. A block that is 70% working-class and heavily commuting produces a
visibly different 6pm sidewalk than the block next to it that gentrified two
game-years ago — without a single hand-authored rule about how gentrification
looks. The visual language falls out of the data.

Tier 1 agents present in the area are *promoted into* Tier 2 bodies, so the
councilmember you saw at the hearing is genuinely walking home.

### Reconciliation
When you leave, Tier 2 agents are discarded — but any *consequential* state they
accrued (a conversation, a transaction, a grievance, a witnessed action) is
written back to Tier 0/1 before they despawn. Nothing that mattered is lost;
nothing that didn't is kept. The camera transition
([02](02-two-cameras.md#the-transition-in-detail)) is the reconciliation window,
which is why it gets 1.2 seconds.

## The economic loop

Runs on the day tick at Tier 0. Deliberately small — six couplings that produce
everything:

1. **Jobs → demand.** Job counts by sector and location create demand for
   housing within a commute-shed and for retail within a walk-shed.
2. **Demand ÷ supply → rent.** Per block, per use, per quality band. Supply is
   *your buildings and everyone else's.*
3. **Rent → value.** Land value is capitalized from achievable rent on
   *buildable* area, not built area. This is why unbuilt capacity is the money
   overlay — and why the player learns to see the city as potential.
4. **Value → construction.** Above a threshold, NPC developers build. The city
   develops itself whether or not you act, which makes waiting a real risk and
   makes the world feel alive rather than frozen around the player.
5. **Construction → displacement + amenity.** New supply raises local quality
   and rents; rising rents push households and businesses out by rent-burden
   threshold; who leaves and where they go is tracked.
6. **Displacement + amenity → sentiment → politics.** Which feeds back into how
   hard the next project is ([07](07-politics-and-approvals.md)).

That's the whole machine. Everything the player experiences — booms, hollowed-out
retail strips, opposition, the gentrification spiral, the bust — emerges from
those six edges. Resist adding a seventh until the slice proves you need it.

### Exogenous forces
Not everything should be the player's fault. The sim needs weather it doesn't
control: interest rates on a multi-year cycle, national capital flows,
recessions, a pandemic-shaped shock to office demand, a transit expansion the
city funds, a fire, a hurricane, a blackout. These arrive on the calendar, hit
everyone, and create the tide you're swimming in.
See [09](09-economy-and-progression.md#the-cycle).

## Information fidelity

Pillar 2, as a data structure. This is the most unusual thing in the
architecture and the most important.

Every observable quantity exists in up to three versions:

```
Observable<T> {
  actual: T            // ground truth; the simulation's real value
  reported: T          // what your org tells you; biased + lagged + rounded
  perceived: T         // what the public/market believes; laggier, rumor-driven
}
```

- The **board** shows `reported` (and `perceived` for sentiment overlays).
- The **street** shows `actual` — you see the water stain, the empty storefront,
  the dark windows, the people in coats in the lobby.
- Market prices are set from `perceived`, which is why information asymmetry is
  monetizable: knowing `actual` before anyone else *is* the business.

Bias is generated per reporting staff member from their incentives and
competence. Lag is generated from your office tier. Both are visible to the
player as an honest uncertainty band, so this reads as *fog of war* rather than
as the game lying for fun.

The consequences are lovely:
- Inspecting a property personally is a mechanical act of *refreshing* a value.
- Walking an unfamiliar block is reconnaissance with real EV.
- A great property manager is one whose `reported` tracks `actual` closely.
- The moment you stop walking is the moment your model of the city starts to
  drift from the city, and the game never announces this. You find out.

## Determinism & scale

- Fixed-step integer tick, seeded PRNG, no floating-point drift in sim logic,
  full serializability. The sim must be replayable from a seed + input log —
  essential for debugging emergent economies and for the test harness.
- Rendering never mutates sim state. One direction only.
- Target: one borough (~2,000 blocks, ~40,000 lots) at 400× on a single core.
  Tier 0 is a few thousand struct-of-arrays updates per day tick — this is
  comfortably achievable and should be benchmarked in week one, before any
  renderer exists ([13](13-vertical-slice.md)).
