# 13 — The Vertical Slice

## Scope honesty

The game described in these documents is a 5–8 year, 100+ person project at full
scope. That is not a reason to design it smaller on paper — the design should be
whole so the slice knows what it's a slice *of* — but it is a reason to be
ruthless about what gets built first.

The slice's job is to answer **one question**, and it is not "is the city
pretty."

> **Will a player who has unlocked the board voluntarily go back down to the
> street — repeatedly, for hours — because the street is where the game is?**

That's [pillar 1's risk](01-pillars-and-pitch.md#the-single-riskiest-assumption).
Everything in the slice exists to test it. Anything that doesn't test it is cut,
including things that would make a better demo.

## The slice

**One neighborhood. One arc. Both cameras.**

- **Place:** a fictionalized Lower-East-Side-alike — call it **Dutch Hill**.
  12 blocks. ~60 lots. One subway station. One park. One avenue, one commercial
  side street, two residential streets, one edge lot nobody's touched since the
  70s.
- **Time:** ~3 in-game years. ~4–6 hours of play.
- **Arc:** you own one walk-up. You end having built one ground-up building on a
  three-lot assemblage — through a real Community Board fight, a real holdout,
  a real construction schedule, and one market wobble.
- **Cast:** ~20 tracked NPCs. All seven archetypes, one of each, written
  properly. Four staff you can hire. One rival (**the Cowboy** — the most
  legible and the best foil for a first-time player).
- **Both cameras, fully.** Street with crowds and the Vision tool; Overseer with
  four overlays; the Tier 0/1 office progression.

### What's in
- Walking, first/third person, `INSPECT` / `TALK` / `PIN` / `ENTER` /
  `PHOTOGRAPH` / `HAND OVER` / `ATTEND`.
- The Vision tool, complete: envelope, five sculpt tools, walk-around, ghost
  interior, sun study, view scoring.
- Three vehicles only: **e-bike, sedan, van** — enough to prove traversal
  hierarchy, parking friction, and the fleet-as-asset idea without building ten
  models. The full fleet in [04](04-vehicles-and-traffic.md) is a content
  scale-up, not a systems risk, so it is exactly the right thing to defer.
- Crowds at full target density. This is not deferrable — an empty New York
  tests nothing, and density is a core technical risk.
- Tier 0/1/2 simulation, the six-edge economy, `actual`/`reported` fidelity.
- Overlays: Value, Unbuilt Capacity, Sentiment, Transit.
- One full ULURP arc. One holdout. One assemblage.
- The calendar with Auto/Proxy/Attend, and at least six Attend-only
  appointments.
- Construction with all phases, one site you can visit, one site crisis.
- One debt structure with one covenant, and one moment where it bites.

### What's out
- Other boroughs, other neighborhoods.
- Tiers 4–5, megaprojects, helicopters, the Model Room above tier 2.
- Seven of the ten car models; taxis, ferries, motorcycles.
- Rent regulation as a full system (present as flavor, not yet a mechanic).
- Landmarks, air rights trading, POPS bonuses — pick **one** bonus mechanism
  only (subway entrance) to prove the "buy FAR with a physical obligation"
  pattern.
- More than one rival.
- Weather beyond day/night and rain.

## Build order

### Phase 0 — Sim first, no graphics (8–12 weeks)
Headless. Dutch Hill as data. The six-edge economy, Tier 0, NPC developers, the
cycle, the calendar. A terminal/web inspector with a schematic map.

**Gate: is it interesting as a text game?** Have five people play it as a
spreadsheet for an hour. If nobody wants a second hour, the problem is the
design and no amount of Unreal will fix it. This gate is the single most
valuable thing in this document.

### Phase 1 — Board view (6–8 weeks)
Overseer camera, white massing, four overlays, time controls, lot selection,
buy/sell, a rough block-out massing tool.

**Gate: is this already a good small tycoon game?** It should be — that's what
makes the next gate meaningful.

### Phase 2 — The Vision (6–10 weeks)
Built *in the board view first*, then ported to street. The envelope solver, the
five tools, the readouts, shadow, views.

**Gate: is sculpting inside a zoning envelope fun in its own right?**

### Phase 3 — Street layer (16–24 weeks)
The avatar, streaming, crowds, three vehicles, interiors, the verb set, the
transition, and the Vision at 1:1 on the sidewalk.

**Gate: the [session shape](02-two-cameras.md#session-shape).** Put people in
front of it for 45 minutes and *measure the camera*. Log time-in-mode and count
transitions.

Success looks like: **40–60% of session time on the street, 8+ transitions per
hour, and — the real signal — players descending for reasons they chose rather
than reasons the game forced.** If they descend only when an Attend appointment
drags them, the design has failed and the fix is more ground-truth value, not
more scripted appointments.

### Phase 4 — Arc, cast, polish (12–16 weeks)
The 20 NPCs written properly. The ULURP fight. The holdout. The construction
crisis. The covenant. The ending walk.

**Gate: does the last scene land?** The player walks back to the block they
started on and looks at what it became. If that doesn't produce a feeling, the
game is a systems toy and needs a different ending — or a different game.

**Total: roughly 12–18 months with a small team (8–15), assuming the Phase 0
gate passes on the first or second design iteration.**

## Anti-goals for the slice

Things that will feel urgent and must be resisted:

- **Making the city bigger.** Twelve blocks played deeply beats a borough played
  shallowly, and a bigger map actively hides whether the street layer works.
- **Making it prettier before Phase 3's gate.** Fidelity is a cost multiplier on
  every subsequent change.
- **Adding a seventh economic edge.** Every one you add costs balance time
  quadratically. Six is enough to produce everything described in these docs.
- **Adding combat, crime, or chases** because the traversal reads as GTA. It is
  the single fastest way to turn this into an expensive, worse version of a game
  that already exists.
- **Building ten car models early** because it's tractable and fun. Content is
  not risk. Ship the risk first.
