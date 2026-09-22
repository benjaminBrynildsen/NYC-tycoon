# 01 — Pillars & Pitch

## The one-line pitch

*Rollercoaster Tycoon where you can put the camera on the ground and walk
through the park — except the park is New York City and the rides are buildings
people have to live in.*

## The fantasy

Not "be rich." The fantasy is **authorship of a place**, plus the thing that
makes it interesting: **you have to live in the place you authored.**

Most city builders let you carve up a map from orbit and never face it. Most
open-world games let you wander a city you have no power over. This game puts
those two together on purpose, because the interesting feeling is the one in the
overlap:

- You rezone six blocks from a menu. Then you walk those six blocks and the
  hardware store is a bank branch and the guy who ran it is delivering food on
  an e-bike, and he recognizes you.
- You build the tallest thing in the neighborhood. Then you stand at its base
  at 4pm in November and it's dark and windy and nobody is on that corner
  anymore.
- Or: you fund a subway entrance to buy extra floor area, purely as a cynical
  trade. Then you ride through it every day for the rest of the game and it's
  genuinely nicer, and people use it, and you feel weirdly good about a decision
  you made for the wrong reasons.

The game does not tell you these things in a dialogue box. It shows them by
putting a camera where your feet are.

## Four pillars

### 1. Two cameras, one truth
There is exactly one simulation. The street view and the board view are two
renderings of the same state, never two systems bolted together. If the board
says a block is 62% occupied, then 38% of the windows on that block are dark
when you walk it at night. Any divergence between the two views is a bug — with
one crucial exception (pillar 2).

### 2. Your data is worse than your eyes
The board doesn't lie, but it's *late*, *aggregated*, and *filtered by the
people who report to you*. Ground truth exists only at street level. A tenant
satisfaction score of 71 does not tell you the boiler is out on the north line;
the tenants standing in the lobby in coats do. This is the engine that keeps the
walking layer necessary for the whole game, not just the tutorial. See
[08](08-simulation-core.md#information-fidelity).

### 3. Everything is on a calendar, and some of it needs your body
City time produces scheduled events: an auction Tuesday, a community board
hearing the 14th, a topping-out, a rent strike, a City Council vote. Some you
can send a deputy to. Some you cannot. This means fast-forwarding is never free
— you are always fast-forwarding *toward* something you have to physically
attend. It is the clockwork that makes you switch cameras rather than picking a
favorite. See [02](02-two-cameras.md#the-calendar).

### 4. Every number has a face
No abstraction goes un-embodied. "Displacement: 340 households" is a stat on the
board and also forty specific people with names and routines who used to be on
that block and are now somewhere else, or nowhere. The game keeps a small cast
of these people permanently simulated so that your spreadsheet has consequences
you can bump into on the sidewalk. See [10](10-people-and-story.md).

## Tone

Ambitious, grubby, affectionate, unsentimental. The city is beautiful and it is
also a machine for extracting rent. The game is not a morality play — it will
never scold you — but it is scrupulously honest about what your choices do,
because the whole design is an honesty machine: it puts you on the street where
the results are.

Reference points for feel: *Disco Elysium*'s specificity of place, *The Wire*'s
institutional patience, *Cities: Skylines*' systems legibility, *RollerCoaster
Tycoon*'s tactility, *GTA IV*'s New York (the melancholy one, not the joke one).

## What this is *not*

Worth stating early, because each of these is a fork the project could
accidentally take and lose itself.

- **Not a crime game.** "GTA-style" here means the *traversal and camera* —
  open world, third person, walk anywhere, drive, enter buildings, talk to
  people. It does not mean shooting. There is an underworld, and it is about
  envelopes, no-show jobs, and inspectors who look the other way. The antagonist
  is a maturing construction loan, not a rival gang. This is both a better fit
  for the fantasy and a far cheaper game to build (no combat, no weapons, no
  police pursuit AI, no gore).
- **Not a real-estate spreadsheet with a 3D screensaver.** If the walking layer
  is optional flavor, the project has failed. Pillar 2 and 3 exist specifically
  to prevent this, and they must be load-bearing from the first prototype.
- **Not SimCity.** You are not the mayor. You do not own the city. You are one
  actor inside it, and the government is an obstacle and a resource, not your
  avatar. This is a much better game: it gives you antagonists with legitimate
  interests.
- **Not a 1:1 New York.** See [06](06-land-and-building.md#how-much-real-new-york)
  — a fictionalized, compressed New York, real in its rules and its texture,
  invented in its specifics.
- **Not architecture CAD.** The Vision tool is five controls, not five hundred.
  Tactile, not technical.

## Audience

Primary: people who bounce off city builders because they feel remote, and
people who bounce off open-world games because nothing they do matters. That's a
real, underserved overlap.

Secondary: the enormous latent audience for "a really good New York." People
will buy this to walk around in it. That is a legitimate reason and the art
budget should respect it.

## The single riskiest assumption

That players will *voluntarily* go back down to the street once they understand
the board. Every city-builder instinct they have says "zoom out, speed up." If
the walking layer is a chore, the game becomes a bad tycoon game with a long
loading screen.

Everything in [02](02-two-cameras.md) is an answer to that risk. It should be
the first thing the vertical slice tests, and the thing we are most willing to
be wrong about. See [14](14-open-questions.md#q1).
