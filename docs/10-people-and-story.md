# 10 — People & Story

## The thesis

There is no written plot. There is a **city that generates stories because it
keeps track of people**, plus a small amount of hand-authored scaffolding to
make sure the generated stories land.

Pillar 4: every number has a face. This document is how that's implemented.

## Tracked NPCs

200–600 individuals simulated continuously, citywide, at all times
([08](08-simulation-core.md#tier-1--tracked-200600-individuals-always-citywide)).

```
Person {
  name, portrait_seed, silhouette_id      // recognizable in a crowd
  home -> Unit, work -> Place, routine[]  // where they are at any hour
  household, income, rent, rent_burden, savings
  relationships[] -> Person               // family, neighbors, allies, rivals
  memory[] -> Event                       // what they saw you do
  opinion_of_player, trust, fear, debt_owed_both_ways
  wants[], current_problem
  status: resident | displaced | departed | thriving | gone
}
```

`memory[]` is the important field. Events are witnessed: a person who saw you
hand an envelope to an inspector on their corner *has that in memory*, can tell
other people, and can tell a reporter. Memory propagates along `relationships`
with decay and distortion. Reputation isn't a slider — it's a rumor network, and
it behaves like one.

### Promotion
Tracked NPCs are instantiated out of Tier 0 cohorts when they become relevant:
you buy the building, so its tenants get names; you talk to a bodega owner
twice, so he gets promoted; a councilmember exists because a district does. This
means the cast is *about your particular game* and nobody is authoring 10,000
people.

### The seven archetypes
Every neighborhood gets one of each, generated with a name, a face, a history,
and a specific want ([07](07-politics-and-approvals.md#the-cast-per-neighborhood)):
the councilmember, the board chair, the organizer, the union rep, the
preservationist, the small-business owner, the super. Plus your own staff, and
the tenants of anything you own.

The super deserves special mention: your building's superintendent knows
everything that is actually happening in your building, and whether he tells you
depends entirely on whether you treat him like a person. He is the game's
cleanest lesson about `reported` vs `actual`
([08](08-simulation-core.md#information-fidelity)).

## Rivals

Three to five AI developers, persistent across a whole playthrough, each with a
**strategy, a personality, and a balance sheet you can partially see.**

| Archetype | Strategy | Tell | How you beat them |
|---|---|---|---|
| **The Institution** | Old money, patient, low leverage, prime sites only | Never overpays; unbothered by busts | Out-hustle them in neighborhoods beneath their notice |
| **The Cowboy** | Maximum leverage, maximum speed, unbuilt-capacity plays | Breaks ground fast, always over-extended | Survive the cycle. He will not. |
| **The Grinder** | Small, cheap, regulated buildings; volume; pressure tactics | High Heat, low profile, hated locally | Standing. Communities will choose you over him. |
| **The Insider** | Modest portfolio, impossible approvals | Wins rezonings he shouldn't | Heat, redirected — or become his friend |
| **The Newcomer** | Foreign capital, price-insensitive, trophy assets | Pays numbers that make no sense | Sell him something at the top of the market |

Rivals act on the same systems you do: they bid at the same auctions, assemble
against you, block your views with their towers, oppose your rezonings, hire
away your staff, and go bankrupt. They should be **beatable by understanding
them**, and the understanding should mostly come from the street — you learn the
Cowboy is over-extended because his site has been quiet for six weeks and you
walked past it.

A rival going under is one of the game's best events: their half-built frame
sits there, and eventually it's for sale, and you can buy the thing you watched
them die on.

## Displacement, and the ledger

### How displacement works
Not a punishment mechanic and not a morality meter. It is a *consequence with an
address.*

When rents rise past a household's tolerance
([08](08-simulation-core.md#the-economic-loop)), they move. The sim resolves
where to: a cheaper block, a smaller unit, a longer commute, out of the city,
or — sometimes — nowhere good. **Tracked people are never deleted.** They get a
new `status` and, usually, a new location you could go visit.

Which produces the game's most characteristic moment, unscripted:

> You upzoned the corridor. Eighteen months later you're walking to the subway
> and the guy who ran the hardware store on the corner is riding past you on a
> delivery e-bike. The game does not stop. No music sting. No dialogue prompt.
> He might not even see you.

The game will never tell you this is bad. It just refuses to let it be invisible.

### The ledger
A persistent, inspectable record kept for the whole run:

- Every building you built, renovated, or demolished.
- Every business that opened or closed on a block you own, and what replaced it.
- Every household displaced, by name where tracked, and where they went.
- Every promise made ([07](07-politics-and-approvals.md#promises-are-objects)),
  and whether it was kept.
- Every envelope handed over, and to whom, and who saw.

At the end of a run the ledger is presented as **a list of places**, not a score.
And most of those places are ones you can walk to. See
[09](09-economy-and-progression.md#scoring).

## Authored content on top

Generated systems produce *situations*; hand-authored content makes them *land*.
The budget should go to:

1. **Neighborhood dossiers** — each playable neighborhood gets a real history,
   a real character, five or six specific hand-written locations, and a local
   conflict that predates you. Depth beats breadth: four excellent
   neighborhoods, not twenty procedural ones.
2. **Set-piece appointments** — ~40 hand-written scenes that fire when the sim
   produces the right conditions: a first hearing that goes badly, a covenant
   call from a banker, a strike at your site, a funeral you should attend, a
   reporter with a document, the holdout's kitchen table, a topping-out.
3. **Dialogue for the seven archetypes**, written well, with real regional
   voice. This is where the game earns its comparison to *Disco Elysium* or it
   doesn't.
4. **The radio** ([04](04-vehicles-and-traffic.md#driving-feel)) — a cheap,
   high-yield channel for the city to comment on what you're doing.

## Tone discipline

Three rules, and they should be enforced in review like a code style guide:

1. **The game never moralizes.** No character exists to lecture the player. The
   organizer opposing you has an argument, an interest, and a life; she is not a
   mouthpiece.
2. **Nobody is a symbol.** The displaced bodega owner has a name, a bad knee,
   an opinion about the Knicks, and a daughter at Hunter. Specificity is the
   entire technique.
3. **Good outcomes are equally real.** A block that got better — where the park
   is lit and the storefronts are full and the people who lived there still live
   there — must be as visible, as detailed, and as satisfying to walk through as
   a block that got hollowed out. Otherwise the game is just a guilt machine,
   and a guilt machine is a much smaller game than this one.
