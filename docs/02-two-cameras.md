# 02 — Two Cameras

This is the load-bearing document. Everything else can be re-designed; if this
system doesn't work, there is no game.

## The problem, stated honestly

Street play and management play want opposite things from time.

| | Street | Board |
|---|---|---|
| Time | 1:1. A walk takes a walk. | Compressed. A year in ten minutes. |
| Scale | One block | One borough |
| Information | Deep, narrow, sensory | Shallow, wide, numeric |
| Agency | Small, immediate, personal | Large, delayed, statistical |

If you let the player fast-forward while embodied, the world becomes incoherent
(pedestrians as blurs, day/night strobing). If you don't, the tycoon layer
crawls. If you make switching free and instant, the player picks whichever mode
is more efficient and never uses the other — and it will be the board, always,
because the board is where the money is.

So: **switching must be cheap enough to do constantly and expensive enough to be
a decision.**

## The two clocks

There is one world clock. What changes is your *relationship* to it.

**Street time — 1:1.** You are embodied. The clock runs at real speed (with a
configurable base multiplier; see below). You cannot accelerate it. Everything
you do costs the time it takes.

**Board time — up to 400×.** You are disembodied. You can run the clock at 1×,
4×, 30×, or 400× (a day, a week, a month per minute roughly). You can pause.
Your avatar stands where you left them, and the world moves around them.

The base "street second" is not one real second. A full 24-hour day at true 1:1
is unplayable. **1 real minute = 4 in-game minutes** is the starting tuning
value: a day is six real minutes, a cross-neighborhood walk is a couple of
in-game hours, a full year of street play is ~36 real hours. Tune in the slice;
this number controls the entire game's pacing and is the single most important
tuning constant in the project.

### Why this asymmetry is the whole design
Because it means **time spent on the street is time the city is not advancing**
— and equally, **time spent on the board is time you are not seeing anything
with your own eyes.** Both are costly. Neither dominates. Every session is a
rhythm of descending for something specific and ascending to burn the months
between.

## Switching

### The Phone — read-mostly, available anywhere

Pull out your phone at street level. This is the *lightweight* board: dashboards,
messages, portfolio summary, the calendar, accept/decline offers, approve a
budget line, call a deputy. No map painting, no construction, no acceleration.

Cost: a few seconds of animation, and you're standing on a sidewalk staring at
your phone, which is exactly the correct amount of social friction. Available
mid-conversation at a cost to that conversation.

### Overseer — the full board, from anywhere, with a cost

Hold the mode key. The camera detaches from your avatar's head and rises,
continuously, no cut, no load. Street noise ducks to a low room-tone hum. Colour
grades toward a cooler, flatter, cartographic palette. Buildings you own light
up. Your avatar shrinks to a small pulsing marker you can always find.

Here you can pan, zoom, overlay, inspect, plan, *and accelerate time*.

**The cost:** while in Overseer, your avatar is standing still in the world,
inert, and the clock may be running at 400×. You will miss things. Opportunities
are *local and timed* — a super-in-the-lobby tipping you off about a landlord
about to sell, a rival's crew mis-pouring a foundation you could photograph, a
broker's open house — and they resolve without you. Overseer is the fog-of-war
mode. You see all the numbers and none of the details.

Full **build and commit** actions are gated further (below).

### The Model Room — the endgame board

Your office contains a physical scale model of the city. It starts as a paper
neighborhood map pinned to a wall in a back room. It becomes a table. It becomes
a room-sized white massing model of half of Manhattan that you walk around
inside, reach into, pick buildings up out of.

Mechanically it's the same Overseer UI with better numbers and lower latency
(see [05](05-board-layer.md#the-model-room)). Emotionally it is the progression
track that makes the management layer *a place*, so that even your spreadsheets
are somewhere you walk to. This is how the game keeps the two halves from
splitting apart at high levels of play.

### What's gated where

| Action | Phone | Overseer | Model Room | On site |
|---|---|---|---|---|
| Read dashboards, ledgers, overlays | ✓ | ✓ | ✓ | — |
| Messages, calls, accept/decline | ✓ | ✓ | ✓ | ✓ |
| Accelerate time | — | ✓ | ✓ | — |
| Assign staff, set policies | ✓ | ✓ | ✓ | — |
| Bid at auction (remote, −10% edge) | ✓ | ✓ | ✓ | n/a |
| Bid at auction (in the room) | — | — | — | ✓ |
| **Draft a massing (the Vision)** | — | rough block-out only | ✓ full | ✓ full |
| **Commit a project to construction** | — | — | ✓ | ✓ |
| File a rezoning application | — | — | ✓ | — |
| Negotiate with a named stakeholder | poor terms | — | — | ✓ best terms |
| Ground-truth inspect a property | — | — | — | ✓ only |

The shape of that table is the design: **anything that changes the physical city
requires either your office or your feet.** Never a menu from the sky.

## The Calendar

The mechanism that forces descent.

City time generates **appointments** — timestamped events at a location. They
appear on your phone, on the board, and as markers in the world. Each has a
resolution mode:

- **Auto** — resolves without you at a baseline outcome.
- **Proxy** — send a staff member. Outcome scaled by their skill, their agenda,
  and how much they like you. They may also lie to you about what happened.
- **Attend** — be physically there in street mode at that time. Best outcomes,
  full information, and often the only way to catch the unscripted thing.

Examples across the game's tiers:

| Appointment | Auto | Proxy | Attend |
|---|---|---|---|
| Community Board hearing | Presumed opposition | Deputy reads statement, −1 hostility | You take questions; can win a swing member; can also blow it |
| Foreclosure auction | You don't bid | Capped bid, no read on the room | You see who else showed up, can outbid live, learn a rival's appetite |
| Concrete pour | Baseline quality | Baseline + super's competence | Catch the bad pour; +quality, −schedule risk |
| Rent strike / tenant meeting | Escalates | Deputy escalates it worse | The only path to de-escalation |
| Loan closing | Standard terms | Standard terms | Banker reads your confidence: ±25bp |
| Topping out | Nothing | Nothing | Press, Standing, a genuinely good scene |

Attend-only appointments are the game's heartbeat. You fast-forward the board
toward the 14th, then drop to the street, and *walk into the room.*

### Appointment pressure
Appointments stack, conflict, and cluster. Two hearings on the same night in
different boroughs is a real decision — and a reason to grow an organization you
can trust. The mid-game skill is triage; the late-game skill is having built a
staff whose proxies don't cost you much. That's a satisfying arc for a
management game: **your progression is measured in how little you personally
have to show up.** And the game's quiet argument is that the day you stop
showing up is the day the numbers start lying to you.

## The transition, in detail

Non-negotiable: **no cut, no load, no menu.** The transition is a continuous
camera move through real space, and the world keeps simulating through it. It
should take ~1.2 seconds up and ~1.0 down, skippable by holding.

Up:
1. Avatar's head-camera detaches, begins rising, FOV widens slightly.
2. Street audio low-passes and ducks under a rising synth pad + room tone.
3. Ambient crowd and vehicle density culls progressively as the camera clears
   rooftops; the tiered sim folds embodied agents back into aggregates
   ([08](08-simulation-core.md#reconciliation)).
4. Above ~80m, the cartographic grade and overlay affordances fade in.
5. Above ~300m, unloaded districts stream in as massing + data, not detail.

Down is the reverse, and the last half-second is the important one: the moment
where the massing blocks resolve into buildings with storefronts and the crowd
spawns. That half-second is the game's thesis. Spend real art and audio budget
on it.

### Dropping in somewhere else
You can descend anywhere you have *presence* — a property you own, an office, a
site, or a subway station you've been to. Descending elsewhere is a **travel**
action: the camera returns to your avatar and you move (train, car, walk), which
costs street time. You cannot teleport your body. The city's geography must stay
real or the whole spatial layer decays into a map screen.

## Session shape

A good 45-minute session should look like:

1. **(Board, 3 min @ 30×)** Review the week. Rents posted, two offers, an
   inspection failed at 114 Orchard. Calendar shows a hearing Thursday and an
   auction Friday.
2. **(Street, 12 min)** Drop at 114 Orchard. Walk it. The violation is real and
   it's worse than reported — your property manager has been shading his
   numbers. Handle it. On the way to the train, notice a shuttered lot you
   didn't have flagged; raise the Vision on it; the envelope is bigger than you
   expected. Photograph it, pin it.
3. **(Board, 4 min @ 400×)** Skip to Thursday. Pull title on the pinned lot,
   find the owner, have a deputy open a conversation. Run a rough massing.
4. **(Street, 15 min)** Community Board hearing. It goes badly in an interesting
   way. Afterwards, the thing that actually matters happens in the hallway.
5. **(Board, 6 min @ 400×)** Restructure the proposal around what you learned.
   Commit. Watch three months go by; the foundation pour appointment comes up.
6. **(Street, 5 min)** Go stand in the hole.

If the slice can produce that session, the game works.
