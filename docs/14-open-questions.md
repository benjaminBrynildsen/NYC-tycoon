# 14 — Open Questions

The things I can't resolve from a design document, ordered by how much damage
they'd do. Each names what would settle it.

---

## Q1 — Will players voluntarily descend?
**The existential one.**

Every instinct a strategy player has says *zoom out, speed up, optimize*. The
design's answer is a three-part lock: ground truth only exists at street level
([08](08-simulation-core.md#information-fidelity)), negotiation is face-to-face
([07](07-politics-and-approvals.md)), and Attend appointments are on a calendar
([02](02-two-cameras.md#the-calendar)).

But if walking *feels* like a tax on optimal play, players will resent it even
while doing it — and a resented mechanic is worse than an absent one.

**Settles it:** Phase 3's telemetry gate ([13](13-vertical-slice.md)). Time-in-mode,
transitions/hour, and specifically the ratio of *voluntary* to *forced*
descents. Prototype the feel test early — a crude street layer over a stub
sim, inside the first six months, before the real street work is committed to.

**If the answer is no:** the fallback is to make the street layer the *primary*
mode and shrink the board toward the phone — a smaller, more focused game about
one developer on foot. That's still good. It is a different game and the pivot
would be expensive after Phase 3, which is why the early feel test matters.

---

## Q2 — Is the Vision tool fun, or is it homework?
The signature mechanic is a design tool, and design tools are only fun when the
constraint is legible and the feedback is immediate. Five controls might be
three too many, or two too few. Sculpting might be delightful; it might feel
like being asked to do a job.

**Settles it:** Phase 2's gate, tested standalone — a toy with no economy
attached. If people sculpt buildings for twenty minutes with no reward loop,
it's a keeper.

**Watch for:** players finding one massing shape that's always optimal. If the
answer is always "max tower, max view floors," the tool is a slider wearing a
costume. Fix by making the *stack* the puzzle (retail wants frontage, residents
want light, the envelope fights you, the community wants the mass broken) rather
than the height.

---

## Q3 — Can the economy survive contact with players?
Emergent economies get solved. Someone will find the dominant strategy — likely
"buy unbuilt capacity in the path of a transit improvement, hold, flip" — and
the game becomes a single move executed repeatedly.

**Settles it:** the headless soak harness ([11](11-technical-architecture.md#testing)),
running scripted strategies by the thousand and checking that no strategy
dominates across cycles, and that dirty and clean both remain viable.

**The structural defenses:** the cycle punishes timing errors; Standing and Heat
make repeated identical moves progressively harder (the city learns you); and
rivals adapt to your pattern. All three are in the design; none is proven.

---

## Q4 — Real New York, or fictionalized?
[06](06-land-and-building.md#how-much-real-new-york) chooses fictionalized:
real rules, invented specifics. But the marketing pull of *the actual city* —
your actual block — is enormous, and real parcel data is public.

**The trade:** real New York gets free authenticity, free press, and free
content; it costs legal exposure (naming real buildings, real officials, real
businesses), it removes the freedom to shape the map for play, and it invites
a fidelity arms race the budget can't win.

**Settles it:** a legal read, and a test — build Dutch Hill twice, once from
real parcel data and once hand-shaped, and see which one is better to walk
through. My expectation is the hand-shaped one wins on play and loses on
recognition. A hybrid (real geometry, invented names and businesses, compressed
block counts) is probably the answer and should be prototyped as a third option.

---

## Q5 — Does the moral layer land, or does it lecture?
The game's thesis is that showing consequences at street level is more powerful
than judging them. That's a tonal tightrope. Half a degree too far and it's
finger-wagging; half a degree back and it's a game about how fun it is to
displace people, which is a thing some of the press will say it is regardless.

**Settles it:** playtesting with people who will be honest, and the tone rules in
[10](10-people-and-story.md#tone-discipline) enforced in content review from the
first written line. The hardest and most important of those rules is the third:
**good outcomes must be as detailed and as visible as bad ones.** If the art
budget makes decay beautiful and improvement generic, the game has made an
argument nobody intended.

---

## Q6 — Crowd density vs. everything else
[04](04-vehicles-and-traffic.md#density-targets) sets 250–400 pedestrians and
60–120 vehicles on a dense avenue, on top of a streamed city, full interiors,
and a real-time simulation. That is a serious budget on console.

**Settles it:** a pure tech prototype in month 1–2 — one block, target density,
no gameplay — profiled on the lowest target hardware. This number must be known
before the art direction is set, because the answer determines whether the game
is photoreal or stylized.

**If it doesn't hit:** stylize. A stylized New York at full density beats a
photoreal one at half, because density *is* New York. This is a cheap decision
early and a catastrophic one late.

---

## Q7 — How much of the management layer works on a gamepad?
[12](12-ux-and-controls.md) asserts full parity. Zoning overlays, a capital
stack, an assemblage negotiation, and a 3D sculpting tool on two sticks is a
real design problem, not a port problem.

**Settles it:** design every board screen pad-first during Phase 1, before any
mouse affordances are added. If a screen can't be done on a pad, the screen is
too complicated — which is usually true anyway and the constraint will improve
the game.

---

## Q8 — What's the multiplayer story?
Deliberately unaddressed in these docs, and the temptation will be strong,
because rival developers are already modeled as agents and the socket is
obviously there.

**My position:** ship single-player. The information-fidelity system
([08](08-simulation-core.md#information-fidelity)) is the game's spine and it
assumes one player's epistemic position; multiplayer would need it rebuilt, and
deterministic lockstep over a 400× simulation is a hard problem stacked on top
of an already hard project.

**But** the design that *would* work is worth noting for later: 2–6 players,
same city, asynchronous turns over a shared cycle, with the street layer as the
place you meet each other. Assemblage against a human holdout is possibly the
best competitive mechanic in the design. Post-launch, as a sequel or expansion,
built on a sim core that was architected to allow it — which
[11](11-technical-architecture.md) already is, since both views are clients of a
server.
