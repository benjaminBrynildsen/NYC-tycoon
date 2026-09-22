# 03 — The Street Layer

## Camera & body

**Third person by default.** Over-the-shoulder, moderately close. You need to
see your avatar against the buildings — that's how the player feels scale, and
scale is the entire emotional payload of a New York game.

**First person on a toggle**, free and instant. First person is the *inspection*
camera: interiors, reading violation notices, the Vision tool, looking up.
Looking up is important enough to deserve a dedicated input (see
[12](12-ux-and-controls.md)).

The avatar is customizable but not a blank: they are a person with a name, a
history, and a body the city treats differently depending on how you dress them.
Turning up to a Community Board hearing in a $4,000 coat is a choice with a
number attached. This is cheap to implement (a `presentation` tag on the avatar
read by dialogue checks) and does an enormous amount of thematic work.

## Traversal

New York is the rare city where the traversal hierarchy is genuinely
interesting, because **the fast option changes with density and time of day.**
Summary below; the full fleet — eleven drivable classes, ten car models, parking,
traffic and crowd density — is [04](04-vehicles-and-traffic.md).

| Mode | Speed | Cost | Notes |
|---|---|---|---|
| **Walk** | Slow | Free | Highest information density. You see storefronts, faces, notices, scaffolding. The game's default and its best state. |
| **Run** | Medium | Free, but conspicuous | You look like you're in trouble. Minor social modifier. |
| **Subway** | Fast over distance, fixed overhead | A few in-game minutes + fare | Semi-fast-travel: enter station → short platform scene → arrive. Delays are simulated and are a *readout of your own transit investments*. Random encounters on platforms. |
| **Bike** | Fast at mid-range | Cheap | Best door-to-door tool in the middle game. Exposed to weather and traffic. |
| **Car / car service** | Fast only when the street is empty | Expensive; status | **Subject to the traffic you caused.** A late-game player who upzoned their own corridor sits in it. The single best feedback loop in the game and it costs almost nothing to implement — congestion already exists in the sim. |
| **Helicopter** | Instant between pads | Very expensive, Heat + Standing cost | Late game. Survey tool, flex, and a way to see the skyline you made. Landing one on your own roof is a genuine progression beat. |

Vehicles are also business assets, a presentation stat, and a readout of the
city's wealth gradient. That's a system in its own right — see
[04](04-vehicles-and-traffic.md).

Deliberately **no parkour, no climbing.** You are a person in a suit. Verticality
comes from elevators, roofs you have access to, scaffolding you have permits
for, and the Vision tool. Access to height is a *privilege you acquire*, which
is far more on-theme than free movement — and much cheaper to build.

## The verb list

Small, sharp, and all of them tied into the simulation. No verb exists that
doesn't move a number somewhere.

### `INSPECT` — hold to raise the Vision (see below)
The universal "look properly at this" verb. Context-sensitive: on a lot it shows
the zoning envelope; on a building it shows condition, violations, tenancy,
ownership, and rent roll (to the fidelity you're entitled to); on a person it
shows what you know about them; on a street it shows traffic, footfall, and
frontage quality.

### `TALK`
Dialogue with tracked NPCs ([10](10-people-and-story.md)). Not a dialogue-tree
epic — short, purposeful exchanges with a small number of levers: what you
offer, what you threaten, what you reveal, and whether you're honest. NPCs
remember, gossip, and compare notes. Reputation is a social graph, not a slider.

### `PHOTOGRAPH`
Evidence and marketing. Photograph a rival's unsafe scaffolding → a filing with
DOB that costs them weeks. Photograph a violation on your own property → proof
of remediation. Photograph a beautiful corner at golden hour → marketing asset
that measurably lifts lease-up speed. A verb that quietly teaches you to look at
the city.

### `PIN`
Drop a marker that becomes a task in the board layer. The connective tissue
between the two cameras: this is how the street feeds the board. Pinning a lot
queues a title search; pinning a defect queues a work order; pinning a person
queues a background check.

### `ENTER`
Buildings are real and enterable where it matters: lobbies, stairwells,
basements (boilers! the boiler is where the truth lives), your own units,
bodegas, bars, community centers, the Community Board hearing room, DOB's
offices, your bank. Not every interior — a curated set, plus procedural lobbies
and hallways for owned buildings, which is where inspection happens.

### `ATTEND`
Standing in the right place at the right time and participating. The calendar
verb.

### `HAND OVER`
Deliberately its own verb, deliberately physical: contracts, keys, and
envelopes. Handing someone an envelope is an animation you perform, on a street,
where anyone might be watching — and sometimes someone is. Making corruption a
*motor action in public space* rather than a menu confirmation is the single
best argument for this game having a street layer at all.

## The Vision

The signature mechanic. Deserves its own detail.

### Raising it
Hold `INSPECT` while standing on or facing a lot. Over ~0.4s:
- Saturation drains from the world; everything shifts to a blueprint palette
  (deep indigo, cyan line work, warm amber for your own holdings).
- The **zoning envelope** rises out of the lot: a translucent volume describing
  the maximum legally buildable shape. Not a box — a real shape, cut by setback
  requirements and the sky exposure plane, so it leans and steps back as it
  rises. You are standing under the law, looking up at it.
- Neighbouring buildings ghost to white massing so you can read context.
- A quiet HUD strip: lot area, zoning district, base FAR, available bonuses,
  current use, owner, last sale.

Seeing the envelope is itself the hook. Most people have never seen the shape a
zoning code makes. It is a genuinely startling image and it's *free content* —
the law already drew it.

### Sculpting
Inside the envelope, five controls. That's the budget. It must feel like
kneading clay, not operating CAD.

1. **Extrude** — drag up from the lot to set podium height.
2. **Tower** — pull a slab or point tower out of the podium; drag its footprint.
3. **Step** — add setbacks/terraces; the envelope pushes back if you exceed it.
4. **Carve** — subtract: light courts, a through-block passage, an arcade, a
   plaza (a plaza is a *trade*, see POPS in [06](06-land-and-building.md)).
5. **Program** — paint use onto floors: retail, office, residential (by unit
   mix), amenity, mechanical, parking. Stacking is the real puzzle.

Live readout on every change: GSF, FAR used/available, unit count and mix,
estimated hard cost, estimated stabilized rent, shadow footprint, view score by
floor, and three risk gauges — **Opposition**, **Schedule**, **Financing**.

### The three things only the street camera can give you

This is where the mechanic justifies the whole architecture:

**1. Walk-around.** Your ghost building exists at 1:1 in the world. Cross the
street and look at it from the far sidewalk. Look at it from the park. Look at
it from the block where the people who will oppose it live. The board can never
give you this and a render can't either.

**2. Occupancy preview.** Step inside. Ride a ghost elevator. Get out on 30. The
window isn't there but the **view is computed for real** from the sim's actual
geometry. Views are a priced commodity — the sim raycasts sightlines and prices
them into rent. Which means a rival can build a tower that takes your view and
craters your rent roll, and you can do it to them, and *you can go stand in the
apartment and watch it happen.* That's a grudge with a camera angle.

**3. Sun study.** Scrub time of day and season; watch your shadow move across
the neighborhood in real time, at real scale, from the ground. Shadow falling on
a park, a school yard, or a community garden during specific hours feeds
directly into the Opposition gauge — and this is exactly how real opposition
works, so it teaches something true. It is also, simply, beautiful.

### Committing
`COMMIT` requires the Model Room or the site itself ([02](02-two-cameras.md)).
On commit, the massing becomes a **Project**: a budget, a schedule, a capital
stack, an approvals path ([07](07-politics-and-approvals.md)), and — critically
— a construction site that exists in the world and that you can go visit, in the
rain, at night, when you are worried about it.

### Speculative Vision
You can raise the Vision on lots you don't own. This is the reconnaissance
layer: understand what a site *could* be before buying, and understand what your
neighbor could do to you. Standing on your own roof and raising the Vision on
every lot around you — seeing the skyline of everything that could legally be
built — is a genuinely unnerving picture of a city's latent future, and it's the
most effective possible teaching tool for the game's economics.

## Street density & readability

The street must *look* like the numbers ([08](08-simulation-core.md)). Non-
negotiable visual readouts, all driven by sim state, none of them decorative:

- **Vacancy** — dark windows, papered storefronts, lockboxes, For Lease vinyl.
- **Investment** — scaffolding (New York's true native plant), new curb cuts,
  fresh brick pointing, permit placards you can actually read.
- **Wealth gradient** — shop mix, car mix, pedestrian dress, tree condition,
  trash containerization, sidewalk repair.
- **Distress** — the specific, unglamorous kind: mattress on the curb, buckets
  in a lobby, a hand-written note taped to a mailbox.
- **Time** — commute tides, lunch rush, night shift, garbage night, the 4am
  emptiness, snow.

A player should be able to walk one block with the HUD off and correctly guess
the block's median rent within 15%. If they can't, the visual language isn't
carrying the simulation, and the street layer is decoration.
