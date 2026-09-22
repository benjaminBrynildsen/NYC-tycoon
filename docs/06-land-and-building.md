# 05 — Land & Building

The tycoon substrate. The good news: **New York's actual land-use law is already
a superb game system.** It's spatial, it's legible, it creates puzzles, it
generates conflict, and it produces beautiful shapes. We barely have to invent
anything — we have to *select* and *clarify*.

## The lot

The atomic unit. Not a tile — a real irregular parcel.

```
Lot {
  id, block, geometry (polygon), area
  zoning_district, overlays[], special_district?, landmark_status
  far_base, far_used, far_transferable      // air rights
  owner, ownership_chain[], encumbrances[]
  building?  -> Building
  soil / bedrock_depth, water_table, contamination
  frontage[] -> Street segments (width, traffic, retail quality)
  history[]                                  // every sale, filing, fire, owner
}
```

`history` matters more than it looks. It's where narrative comes from for free:
a lot that burned in 1977, was a parking lot for thirty years, and was bought by
a shell company in 2019 is already a story, and the game can generate thousands
of them.

## Floor Area Ratio — the central currency

FAR is *buildable floor area ÷ lot area.* A 5,000 sf lot in an FAR-4 district
can hold 20,000 sf of building. That's it. That's the whole economic engine.

Why this is such a good game mechanic:
- It's **one number that is simultaneously spatial and financial.** Rare and
  precious in design terms.
- It's **tradeable** (air rights, below), which creates a market between
  players and NPCs over an invisible commodity.
- It's **negotiable** (bonuses and rezonings), which creates politics.
- It's **visible** — the Vision tool renders it as a volume you stand under.

### Getting more of it
Five paths, each a different kind of gameplay. This is the game's strategic
fan-out:

1. **Buy it** — purchase unused development rights from a neighbor (air rights).
   A negotiation, and an assemblage puzzle: rights generally transfer between
   adjacent lots, so geography constrains the market.
2. **Earn it** — public-benefit bonuses. Build a plaza (POPS), fund a subway
   entrance, include permanently affordable units, restore a landmark facade.
   Each is floor area bought with money *and* with a permanent physical
   obligation you have to live next to.
3. **Assemble it** — combine lots into a zoning lot; bigger sites unlock
   different envelopes and tower configurations.
4. **Rezone it** — the political path. Slow, expensive, uncertain, enormous
   payoff. See [07](07-politics-and-approvals.md).
5. **Inherit it** — buy a property with a legal non-conforming condition that's
   worth more than the code allows. Finding these is the connoisseur's game and
   the reward for reading `history`.

### The envelope
FAR says *how much*; the envelope says *what shape*. Setbacks, street wall
requirements, sky exposure plane, rear yard, tower coverage limits, height
factor. The envelope is what the Vision tool renders and what makes sculpting a
puzzle rather than a slider: the same 200,000 buildable square feet is worth
very different money as a squat block versus a slender tower with view floors.

## Assemblage

The best strategic minigame in real estate and it drops straight in.

You want a site. The site is five separately-owned lots. You must buy all five.
The moment the third owner realizes what you're doing, the price of lots four
and five goes vertical — and the fifth owner may simply refuse forever, out of
spite, principle, or a better offer from your rival.

Mechanics:
- **Secrecy is a resource.** Buy through shell entities. Each purchase leaks a
  little; leak accumulates to a **suspicion** value on the block. Buying too
  fast, overpaying, or being *seen on the block* (street layer!) leaks more.
- **Holdouts.** One owner with leverage and a personality. Options: pay
  outrageously; redesign around them (the game must genuinely support building
  around a holdout, and those buildings are great); wait them out (carrying
  costs); apply pressure (Heat); or actually befriend them, which takes street
  time and many visits.
- **Air-rights-only deals** as a fallback: you don't get the land, you get the
  floor area, and their building stays there forever in the middle of your
  block. Compromise made concrete.

Assemblage is also the perfect two-camera mechanic: negotiation is street-level
and per-person, the plan is board-level and geometric.

## The building

```
Building {
  massing (the committed Vision), floors[] { use, area, condition, rent }
  systems { structure, envelope, mechanical, elevator, roof }  // each: condition, age
  units[] -> Tenancy { rent, regulated?, lease_end, arrears, satisfaction, household }
  commercial[] -> Tenancy
  violations[], permits[], certificates
  reported_condition   // what your staff say
  actual_condition     // what is true
}
```

The `reported_condition` / `actual_condition` split is not an implementation
detail. It's pillar 2, in the data model, at the center of the object. Build it
on day one; retrofitting it later is impossible.

## Rent regulation

New York's rent-stabilization system is included because it's the most
interesting constraint in the city and the sharpest moral fork in the game.

- A stabilized unit's rent rises by a board-set percentage annually, regardless
  of the market. In a hot neighborhood it becomes worth vastly less than a free
  unit next door.
- The tenant has, effectively, a permanent right to stay.
- So the gap between what a unit earns and what it *could* earn becomes a
  pressure, and the game must be honest that this pressure has historically been
  resolved by landlords in ugly ways: buyouts, construction harassment, letting
  systems fail, paperwork games.

How the game handles it: **the ugly options exist, they work, and they are
visible from the sidewalk.** Deferring the boiler repair is a budget line on the
board and an old woman in a coat in her own kitchen at street level. The game
never editorializes. It just makes sure both views of that decision exist, and
that the tenant has a name. Displacement accrues to a permanent, inspectable
record ([10](10-people-and-story.md#the-ledger)).

Strategically, it's a real fork: regulated buildings are cheap, stable,
low-ceiling assets — a fine foundation for a patient player — or they're
value-add plays for a player willing to take Heat.

## Construction

Committing a Vision starts a project. Phases, each with duration, cost, risk,
and at least one **Attend** appointment:

| Phase | Typical | Risk events | Attend matters |
|---|---|---|---|
| Pre-development | 3–18 mo | Approvals denied, financing pulled | Hearings, closings |
| Abatement & demo | 1–4 mo | Asbestos found, neighbor damage claim | Catch scope creep early |
| **Excavation & foundation** | 2–8 mo | Bedrock, water table, adjacent underpinning, a collapse | Highest-variance phase in the game |
| Superstructure | 4–18 mo | Labor action, crane permits, weather, steel prices | Topping out |
| Envelope | 3–9 mo | Curtain wall delivery, leaks | Facade mock-up review |
| MEP & interiors | 4–12 mo | Trade sequencing, inspection failures | DOB inspections |
| TCO → CO → lease-up | 2–8 mo | Sign-off delays, soft market | Ribbon cutting |

Underneath: **cost, schedule, quality — pick two.** Push schedule, quality
degrades and shows up as defects for the asset's whole life. Push cost, the
schedule slips and your construction loan keeps accruing.

Site visits (street layer) give a small schedule/quality bonus and, more
importantly, **early information**. A problem caught at week 3 costs a tenth of
the same problem caught at week 30. That's the cleanest possible mechanical
argument for walking.

### The half-built tower
The game's best pressure image: a topped-out concrete frame with no skin, a
construction loan maturing in four months, a soft leasing market, and you can go
stand at the base of it in the rain at night and look up. The game should
engineer this situation for most players at least once. Every system —
financing, approvals, market cycle, the two cameras — points at that moment.

## How much real New York?

**Rules: real. Places: fictionalized.**

Real FAR, real envelope logic, real ULURP, real transit geometry, real street
grid behaviour, real bedrock. Neighborhoods are recognizable but renamed and
compressed; landmarks are evoked, not reproduced. A compressed Manhattan plus
slices of Brooklyn/Queens, at roughly 1:1 street scale but with block counts
reduced ~4× — enough that walking feels real, small enough to author with love.

Reasons: legal exposure, the freedom to make a *better-shaped* city for play,
and the ability to hand-author the places that matter. The texture is what sells
New York, not the parcel data.

See [14](14-open-questions.md#q4) — this is a decision worth revisiting, because
"the actual real New York" has enormous marketing pull.
