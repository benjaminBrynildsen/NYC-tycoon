# 06 — Politics & Approvals

The antagonist system. Not a villain — a set of institutions with legitimate,
conflicting interests, each of which can be persuaded, traded with, waited out,
or corrupted.

## Why this is the game's best content

Because it converts spreadsheets into rooms full of people who want things. Every
approval step is:

- a **location** you can walk into,
- on a **date** on the calendar,
- with **named people** who remember you,
- who each want something you might be able to give.

It's the mechanism that turns a management game into a place.

## The approvals ladder

Two tracks, and choosing between them is the core strategic decision of any
project.

### As-of-right
Your design fits the existing zoning. No discretionary review. You file with the
buildings department, they check compliance, you build. Fast, certain, capped —
you only get what the envelope already allows.

The whole Vision tool exists partly to make as-of-right *interesting*: squeezing
maximum value out of a fixed envelope is a real puzzle.

### Discretionary (the rezoning path — "ULURP")
You want more than the code allows, or a use it doesn't permit. Now you need a
public approval, and it takes roughly 7–18 months of game time through a fixed,
public sequence:

| Stage | Who | What they want | Binding? |
|---|---|---|---|
| **Pre-certification** | City Planning staff | A clean, complete, defensible application | Gatekeeper — they can stall you indefinitely |
| **Environmental review** | Technical | Shadows, traffic, displacement, infrastructure impact | Produces the *evidence* everyone else will use against you |
| **Community Board** | 30-odd unpaid neighborhood volunteers | To be respected; concrete local benefits; not to be lied to | Advisory only — but their vote shapes everything after |
| **Borough President** | One politician with ambition | A win they can name | Advisory, influential |
| **City Planning Commission** | Appointed technocrats | Precedent, coherence, good planning | Binding |
| **City Council** | The councilmember for that district | Whatever their district and their career need | **Binding, and effectively a single-person veto** |
| *(Mayoral veto / override)* | | | Rare, dramatic, late-game |

That last row is the real lesson and the best mechanic in the ladder: in
practice the whole process collapses into **one councilmember's judgment.**
Everything before it is leverage-building for that conversation. So the game
teaches something true and gives the player a clear dramatic spine: *find out
what she needs, and decide what you're willing to pay.*

### The Landmarks path
An orthogonal gate. If the building or district is landmarked, exterior changes
need a separate commission's approval, with its own aesthetic politics. Slower,
but landmark status also *creates* value — it makes transferable air rights, and
it guarantees your neighbor can't build a tower into your view.

## Stakeholders

Each is a persistent NPC ([10](10-people-and-story.md)) with:

```
Stakeholder {
  wants[]        // concrete, satisfiable asks: a plaza, jobs, a school seat,
                 // units at a rent, a loading dock moved, a park lit at night
  fears[]        // shadow on the garden, traffic, "not for us", precedent
  trust_of_player   // built only by kept promises, over time
  debts[]        // favors owed in both directions
  visibility     // how much what they do is seen by their own constituency
}
```

The important one is `trust_of_player`, and its rule: **it can only be built by
promises you keep, and it decays if you're absent.** You can buy a vote. You
cannot buy trust. Trust is the thing that makes the *next* project cheap — which
is exactly why a patient, honest player has a real, competitive strategy rather
than a difficulty penalty.

### The cast (per neighborhood)
- **The councilmember** — has a district, a constituency, an ambition, a
  re-election date, and one or two things she genuinely cares about.
- **The Community Board chair** — proud, procedural, allergic to being
  bypassed, reachable through respect and unreachable through money.
- **The tenant organizer** — your most consistent opponent and your most
  valuable ally, because they know the truth about every building on the block.
- **The union rep** — controls your labor. Wants scale, hours, and no-show
  jobs. The cheapest source of schedule certainty and the most reliable source
  of Heat.
- **The preservationist** — can landmark a building out from under your
  assemblage. Can also be given a facade and become a lifelong friend.
- **The small-business owner** — the face of displacement. The bodega, the
  hardware store, the barber. Whether they survive your project is the game's
  single most visible moral readout.
- **The rival developer** — see [10](10-people-and-story.md#rivals).
- **The reporter** — doesn't want anything from you. Wants a story. Amplifies
  everything, including your good work, at a time of their choosing.

## Leverage — what you can actually offer

The negotiation surface. All of these are real, all are spatial, all show up in
the Vision tool as design constraints:

- **Physical benefits** — plaza, playground, through-block passage, subway
  entrance, community facility space, street trees, a lit and maintained park.
- **Programmatic** — permanently affordable units (at what rent, for how long,
  and — the sharp one — *in which building*), local hiring, ground-floor space
  at below-market rent reserved for a neighborhood business.
- **Design concessions** — lower the tower, move the shadow, keep the facade,
  break the mass, move the loading dock off the residential street.
- **Money** — a community fund, a nonprofit contribution, campaign support.
  Legal, effective, and the most corrosive to trust when it's transparently a
  substitute for listening.
- **Time** — genuinely engaging early, before the design is fixed. Costs months
  and gets radically better terms. The single most under-used option by players
  and the one the game should reward most.

Every concession is modeled as a real change to the project's economics *and*
to the physical building. Promise affordable units and they exist, at that rent,
with those tenants, who you can go meet.

### Promises are objects
```
Promise { to, what, by_when, verifiable_where, kept?, publicly_known? }
```
A promise is a persistent world object with a location and a deadline. You can
break it. It works. And then at some point you are standing on the corner where
the playground isn't, talking to the woman you promised it to, and the
`trust_of_player` number that governs the rest of your career in that
neighborhood recalculates in front of you.

## Heat

The pressure system. Replaces the wanted level; same function, different
register.

Heat accumulates from: graft, harassment-pattern behaviour toward tenants,
safety violations, broken promises that become public, a permit that's too
convenient, a shell-company structure someone bothers to unwind, and — the
sneaky one — *anomalously good outcomes*. Winning too easily makes people look.

Heat is **directional**: it has a source (investigations bureau, a journalist, a
regulator, a rival's opposition research, a tenant lawsuit) and a **subject**
(you, an entity, a specific project, a specific person you deal with). The Heat
overlay shows where attention currently is.

Consequences escalate:
1. Questions. A reporter calls. A filing gets a second look.
2. Friction. Your permits slow down. Your counsel's time gets expensive.
3. Exposure. A story runs. Standing drops citywide, Community Boards harden.
4. Action. Subpoena, stop-work order, an indicted partner, a lender invoking a
   "reputational" covenant to pull financing *mid-construction* — which is the
   exact moment the half-built tower scene fires.
5. Ruin. Rare, earned, and a legitimate run-ending failure state.

Heat decays with time, cools faster with Standing, and can be **redirected** —
by giving investigators someone else, which is cheap, effective, and costs you a
person who used to trust you.

## Playing clean vs. dirty

Both must be genuinely viable, with different curves:

**Clean** — slower, lower margins early, compounding late. Trust reduces
approval time, lowers opposition, gets you off-market deals from people who'd
rather sell to you, and makes rezonings possible that a dirty player simply
cannot get. The clean player's late game is *unblocked.*

**Dirty** — faster, higher margins early, and buys the one thing money normally
can't: *time.* Its curve is a rising Heat floor and a shrinking set of people
who'll take your call. The dirty player's late game is fast but brittle, and
their failure state is sudden.

Most real playthroughs will be a specific, personal mixture, and the game should
make you aware of exactly where your line ended up being — see
[10](10-people-and-story.md#the-ledger).
