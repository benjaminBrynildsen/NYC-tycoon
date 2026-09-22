# 04 — Vehicles, Traffic & Crowds

Two jobs. Vehicles are **how you move**, and vehicles are **how the city shows
you what it has become.** Both matter equally, and the second one is what makes
this a different vehicle system from every other open-world game's.

## Design principle: the curb is a readout

Every street in New York is lined, end to end, with parked cars. That parked
fleet is the single densest piece of visual information in the city — the mix of
what's at the curb tells you the block's income, its age, its trajectory, and
whether it turned over in the last five years.

So: **the parked fleet on a block is sampled from that block's population
cohorts** ([08](08-simulation-core.md)), exactly like pedestrians. Not decorated,
sampled. Which means:

- A block you gentrified three game-years ago has visibly different cars at the
  curb than it did when you bought in. Nobody authored that transition. It falls
  out of the simulation.
- You can read a block's wealth by walking it and looking at the curb, with the
  HUD off.
- Your own portfolio's effects arrive, silently, as a change in what's parked
  outside the buildings you own.

Parked vehicles are cheap — static instanced meshes with a shared material and a
color/patina variant index. This is the highest visual-information-per-byte
system in the whole game.

## The drivable fleet

Eleven drivable classes, plus four ridden/chartered. All are real assets in the
tycoon layer: purchased, insured, registered, parked, maintained, ticketed,
towed, and depreciated.

| # | Class | Speed | Capacity | Parking | Role |
|---|---|---|---|---|---|
| 1 | **Sedan** | Med | 4 | Hard | The default. Anonymous, which is a feature during a quiet assemblage. |
| 2 | **SUV / Crossover** | Med | 5 | Very hard | Status + capacity. Bad in narrow downtown streets; genuinely worse to park. |
| 3 | **Pickup truck** | Med | 2 + bed | Hard | Reads as legitimate on a job site. Small trust bonus with trades. |
| 4 | **Cargo van** | Med-low | 2 + cargo | Hard | The maintenance fleet's workhorse. Commercial plates change parking rules. |
| 5 | **Box truck** | Low | Large cargo | Awful | Moves, fit-outs, deliveries. Double-parking it *causes congestion you'll sit in.* |
| 6 | **Flatbed / dump** | Low | Site materials | Site only | Construction logistics. Its arrival at your site is an event. |
| 7 | **Motorcycle** | High | 1 | Trivial | Lane-filtering makes it the fastest door-to-door vehicle in heavy traffic. Weather-exposed, conspicuous, higher accident risk. |
| 8 | **Scooter / moped** | Med-high | 1 + top box | Trivial | The delivery archetype. Cheap, unglamorous, invisible — which is occasionally exactly what you want. |
| 9 | **E-bike** | Med-high | 1 | Trivial | Best all-round mid-range tool in the game. Battery range is a real constraint; charge at your own buildings. |
| 10 | **Bicycle** | Med | 1 | Trivial | Free, silent, weather-exposed, reads well with certain constituencies. |
| 11 | **Helicopter** | Instant pad-to-pad | 4 | Pads only | Tier 5. Survey tool, flex, Heat generator. |

Ridden, not driven — still core traversal:

| Class | Notes |
|---|---|
| **Taxi / for-hire** | Hail on street or summon by phone. Costs money, no parking problem, driver is a Tier-1-promotable NPC and one of the best ambient-information sources in the game. |
| **Chauffeured towncar** | Your own car + your own driver (a staffed role). You work on the phone while moving — the only vehicle where travel time isn't lost time. A genuine Tier-3 power unlock. |
| **Subway** | See [03](03-street-layer.md). |
| **Ferry** | Slow, scenic, waterfront-adjacent, and the best camera angle on your own skyline. |

### Why a hierarchy rather than "cars are best"
Because in New York they aren't, and that's the interesting part. The optimal
vehicle genuinely changes with distance, density, hour, weather, and what you're
carrying. The e-bike wins the middle game. The motorcycle wins rush hour. The
subway wins long crosstown trips. The towncar wins when your time is worth more
than the money. And the flashy car is sometimes *strategically wrong* — see
presentation, below.

## The ten cars

Fictional marques (consistent with the fictionalized-New-York decision in
[06](06-land-and-building.md#how-much-real-new-york)). Each model is defined by
three things: how it drives, what it costs to run, and **what it says about you
when you pull up in it.**

| Model | Class | Drive feel | Presentation | Notes |
|---|---|---|---|---|
| **Ardsley Meridian** | Sedan, ~20yr old | Soft, floaty, slow | *Invisible* | Tier 1 starter. Nobody looks twice — the lowest assemblage-leak vehicle in the game. |
| **Kestrel Estate** | Wagon | Sturdy, understeer | *Practical* | Hauls tools and drywall. Cheap. Reads as a person who does their own work. |
| **Bowery Victor** | Ex-taxi sedan | Heavy, wallowing, indestructible | *Hustler* | Retired cab, 300k miles, cheap as dirt. Cult vehicle. Slight comic dignity. |
| **Hartsdale LX** | Luxury sedan | Smooth, insulated | *Arrived* | The Tier 2 "I have a real company now" car. |
| **Corvin Executive** | Executive sedan | Serene, long | *Serious money* | The negotiation car. Best presentation bonus at closings and bank meetings. |
| **Palisade XT** | Full-size luxury SUV | Ponderous, commanding | *Loud money* | Status and capacity. Terrible downtown. Actively hurts you at a tenant meeting. |
| **Fordham 250** | Full-size pickup | Truck-like, bouncy | *Working* | Best presentation on a construction site; trades take you more seriously. |
| **Vantor GT** | Sports coupe | Fast, twitchy, useless in traffic | *Conspicuous* | Genuinely fast at 4am on an empty avenue. Raises block suspicion during assemblage. A trap, and a fun one. |
| **Halcyon EV** | Electric sedan | Instant torque, silent | *Correct* | Cheap to run, small Standing bonus with some constituencies, quiet sneers from others. Silence has a stealth use. |
| **Meadow Marque** | Vintage classic | Vague, unassisted, alive | *Taste* | Pure flex. Unreliable in rain, needs a garage, appreciates in value. A collectible that's also an asset on the balance sheet. |

### Colors & variation
Each model ships with:

- **12 factory colors** (model-specific palettes — the Vantor doesn't come in
  beige, the Bowery Victor is mostly yellow-with-the-decals-scraped-off).
- **4 patina states** — showroom / lived-in / neglected / wrecked. Patina drifts
  with mileage, weather, and whether you pay for a garage. A neglected car is a
  *presentation penalty*.
- **Trim & detail variants** — wheels, tint, roof rack, plate style (passenger,
  commercial, livery, out-of-state, vanity), bumper stickers, parking-permit
  placards, dashboard junk visible through the windshield.
- **Commercial liveries** — your company name on a van is free advertising and
  also means everyone on the block knows exactly who is doing the work.

10 models × 12 colors × 4 patinas × trim variants ≈ **a few thousand distinct
readable vehicles** from ten meshes. That's how you get New York's density
without a New York art budget. The NPC fleet draws from a wider pool of
lower-detail background models on the same variant system.

### Presentation is a stat
Established for clothing in [03](03-street-layer.md#camera--body); the vehicle
feeds the same number. Arriving is a social act with a modifier attached:

| Where | Wants | Punishes |
|---|---|---|
| Bank / closing | Corvin, Hartsdale | Beat-up anything |
| Construction site | Fordham, Kestrel | Vantor, Palisade |
| Community Board hearing | Halcyon, bike, **arriving by subway** | Palisade, Vantor, Meadow |
| Tenant meeting | Anything modest | Anything expensive — and this one is unforgiving |
| Auction | Corvin, Palisade | Anything that reads broke |
| Quiet assemblage | Ardsley, Bowery, e-bike | Anything memorable |

Owning one car is a compromise. Owning a *garage* — and choosing what to take
today — is one of the nicer small decisions in the game, and it makes the fleet
a strategic loadout rather than a collection.

## The fleet as a business asset

Vehicles aren't only yours to drive. Your company runs them:

- **Maintenance fleet** — vans and pickups. Fleet size and condition directly
  set how fast work orders get resolved across your portfolio. Too few vans is a
  legible, fixable cause of tenant dissatisfaction.
- **Construction logistics** — flatbeds, dumps, concrete. Delivery scheduling is
  a real constraint on your build schedule, and badly scheduled deliveries
  **double-park on your own street and congest your own neighborhood**, which
  raises local hostility right before your hearing.
- **Running costs** — insurance, fuel/charging, garaging (Manhattan garage rent
  is a genuinely painful line item), maintenance, depreciation, and tickets.
- **Fleet as tell** — a rival's flatbeds showing up on a block three days
  running is intelligence. You can read *their* logistics the same way they can
  read yours.

## Driving feel

Arcade-leaning but weighty. This is not a driving simulator and must never
become one. Targets:

- **Weight and inertia** over grip and precision. Cars should feel like they
  have mass and bad shock absorbers.
- **The street is hostile.** Potholes, steel plates, manhole covers, double-
  parked box trucks, a sanitation truck reversing, scaffolding narrowing a lane
  to one, cyclists, a cab cutting across three lanes. Driving is *work*.
- **No damage model beyond cosmetic + a repair bill.** No combat, no chases, no
  police pursuit. Collisions cost money, insurance premiums, and — if you hit
  something with witnesses — Heat.
- **Honking** as a dedicated input. Non-negotiable. It is the city's language.
- **Radio** — a handful of stations that also carry the city's state: market
  news that moves your business, a talk segment about a rezoning you filed, a
  local station mourning a closed business you closed. The radio is a diegetic
  news feed for the simulation, and it's the cheapest ambient storytelling in the
  project.

## Parking

Kept, and kept annoying, because it's the mechanism that makes the traversal
hierarchy real.

- Curb space is finite and simulated per block. Dense blocks at 7pm genuinely
  have no space, and circling is a real (short, capped) cost.
- **Alternate side parking** — street cleaning schedules per block. Park wrong
  and come back to a ticket, or to no car at all.
- **Tickets, towing, impound.** The impound lot is a location you can drive to,
  in another vehicle, which is a joke the city makes at your expense and a
  perfect small humiliation for a player who has just become very rich.
- **Escapes from parking**: commercial plates (if you're in a work vehicle on a
  job), a garage (money), a spot in your own building (the first time you park
  in a garage under a building you built is a real progression beat), or simply
  not driving — which is the lesson.

## Traffic

Traffic is generated by the simulation, not scripted density:

- Trips come from Tier 0 job/housing distributions — commute tides, lunch, the
  evening peak, garbage night, the 4am emptiness.
- **Your buildings generate trips.** Upzone a corridor, add 400 units and
  50,000 sf of retail, and the traffic on that avenue changes measurably.
- Which means: **you sit in the traffic you caused.** A Tier 5 player in a
  Palisade, late for a hearing, stuck on the avenue they densified, is the
  single best feedback image in the game and it costs almost nothing to build —
  the congestion model already exists for the sim's own purposes.
- Construction closures, water main breaks, snow, a presidential motorcade, and
  a parade all exist as calendar events that break the network.
- Traffic is an **overlay** on the board ([05](05-board-layer.md#overlays)) and a
  **lived experience** on the street. Same data. Classic two-camera pairing.

## Crowds

"Lots of NPCs" is a hard requirement, and it's also what sells New York more
than any building does.

### Density targets

| Context | Pedestrians visible | Vehicles moving | Parked |
|---|---|---|---|
| Dense commercial avenue, 6pm | 250–400 | 60–120 | Curb fully lined |
| Residential side street, 6pm | 40–90 | 10–25 | Curb fully lined |
| Same street, 4am | 3–12 | 2–8 | Curb fully lined |
| Subway platform, rush | 60–150 | — | — |
| Community Board hearing room | 30–80 | — | — |
| Protest / picket at your site | 20–200 | — | — |

These are the numbers the renderer has to hit; they drive the whole technical
plan in [11](11-technical-architecture.md).

### Getting variety cheaply
Same combinatorial trick as the vehicles:

- 8 body types × 40 outfit sets × per-garment color ramps × accessories (bags,
  headphones, umbrellas, strollers, dogs, carts, coffee, phone-in-hand) ×
  4 age bands × hair/skin variation.
- Outfit sets are **tagged by cohort and context**, so the sampler dresses the
  crowd from the block's actual demographics and the hour: the 7am crowd on a
  working-class block is not the 7am crowd six blocks north, and neither is the
  11pm crowd on either.
- Seasonal and weather layers on top (coats, umbrellas, shorts) applied globally
  — one system, enormous perceived variety.
- ~200 hand-authored silhouettes for **tracked NPCs**
  ([10](10-people-and-story.md)) so the people who matter are instantly
  recognizable across a crowd. That recognizability is the payoff: spotting the
  tenant organizer in the back of a hearing room should be a *feeling*.

### Crowds have behaviour, not just volume
Queues, clusters, stoops, smokers outside a bar, a line for a food cart, kids
after school at 3pm, a stalled subway disgorging 200 people at once, people
slowing to look up at your construction site. Crowd *shape* is as readable as
crowd size, and it's how a block communicates that something is happening.
