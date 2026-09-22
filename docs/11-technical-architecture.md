# 11 — Technical Architecture

## The shape

```
                 ┌─────────────────────────────┐
                 │        SIM CORE             │
                 │  headless, deterministic,   │
                 │  fixed-tick, serializable   │
                 │  no rendering dependencies  │
                 └──────────┬──────────────────┘
                            │  read-only state views
                            │  + command queue (one way in)
              ┌─────────────┴─────────────┐
              │                           │
      ┌───────▼────────┐         ┌────────▼───────┐
      │  STREET VIEW   │         │  BOARD VIEW    │
      │  3rd/1st person│         │  Overseer +    │
      │  Tier 2 crowds │         │  Model Room    │
      │  reads ACTUAL  │         │  reads REPORTED│
      └────────────────┘         └────────────────┘
```

**One rule, enforced absolutely: rendering never mutates simulation state.**
Views read snapshots and submit commands. Both views are clients of the same
server, even in single player. If that boundary holds, the two-camera design is
structurally guaranteed rather than maintained by discipline.

## Sim core

- **Fixed integer tick.** Day tick for Tier 0 economics; sub-ticks (minute-
  resolution) only while a street scene is active. No delta-time in sim logic.
- **Deterministic.** Seeded PRNG per subsystem, integer or fixed-point math, no
  iteration over hash maps with unstable order. The sim must replay identically
  from `seed + command log`.
- **Data-oriented.** Tier 0 is struct-of-arrays over blocks and cohorts, not an
  object graph. This is what makes 400× viable.
- **Serializable at any tick.** Saves are a seed plus a command log plus
  periodic snapshots. This also gives free time-travel debugging, which for an
  emergent economy is not a luxury.
- **Headless-runnable.** The sim must run with no renderer at all, from a CLI,
  for a thousand game-years in a few minutes. This is how the economy gets
  balanced. See [13](13-vertical-slice.md).

### Why this discipline, specifically
Emergent economies fail in ways you can only find by running them thousands of
times and by replaying the exact run that broke. A sim that can't run headless
and can't replay deterministically cannot be balanced, only guessed at. This is
the single highest-leverage technical decision in the project and it must be
made before a single pixel is drawn.

## Stack recommendation

### Sim core: **Rust**
Deterministic by default, fast enough that Tier 0 at 400× is a non-issue,
serializes cleanly, and compiles to a native library *and* to WASM. Expose a
C ABI / FFI surface so any engine can host it.

Fallback: C++ if the team's expertise is there. **Not** C# or a scripting
language inside an engine — you lose determinism guarantees and the ability to
run the sim standalone at speed, which forfeits the balancing pipeline above.

### Client: **Unreal 5** or **Godot 4**

| | Unreal 5 | Godot 4 |
|---|---|---|
| Crowd/vehicle density (the [04](04-vehicles-and-traffic.md) targets) | Mass Entity + Nanite/instancing; built for exactly this | Needs hand-rolled instancing; achievable but you're building it |
| City-scale streaming | World Partition, mature | Manual LOD/streaming work |
| Look (the reason people buy a New York game) | Lumen; best-in-class out of the box | Good, more work |
| Rust FFI | Fine via a plugin | Excellent (GDExtension) |
| Iteration speed / team size | Heavy | Light and fast |
| Licensing | Royalty above threshold | Free, MIT |

**Recommendation: Unreal**, if the goal is a commercial game that competes
visually. The crowd and vehicle density targets and the city streaming are
solved problems there and are genuinely hard everywhere else, and the art is
half the product. Godot is the right call for a small team prioritizing
iteration speed over fidelity, or for an explicitly stylized art direction
(which is a legitimate and much cheaper alternative direction worth
considering — a beautiful stylized New York beats a mediocre realistic one).

**Not a web/Three.js build for the shipping game** — the density targets are out
of reach. Web is, however, an excellent host for the *prototype tools* below.

## The three-stage build order

This is the part that matters more than the engine choice.

### Stage A — Headless sim + terminal/web inspector
No 3D. The city runs, the economy runs, NPC developers build, the cycle cycles.
Interact through a data view and a schematic 2D map. **The game must be
interesting here.** If a spreadsheet version of this isn't compelling, adding
graphics won't fix it — it'll just hide the problem for eighteen months.

### Stage B — Board view
The Overseer camera and overlays on white massing. Now the sim is legible
spatially. Still no avatar. This is the point at which the tycoon game is
playable end to end.

### Stage C — Street view
The avatar, Tier 2 crowds, vehicles, the Vision tool, the transition. The most
expensive stage by far, and the one that must be prototyped earliest as a *feel*
test even while Stages A and B are the real work. See
[13](13-vertical-slice.md).

## Specific technical problems, and answers

### Streaming a walkable city
World Partition-style spatial grid. Three bands: **detail** (~200m, full
interiors, Tier 2 agents, materials), **massing** (~2km, buildings as shaped
volumes with facade impostors), **skyline** (everything else, impostor cards).
The board view uses massing + skyline only, which is why the transition can be
continuous — going up is a progressive cull, not a level load.

### Building generation
Buildings are **generated from sim data**, never hand-placed, or the two views
desync the moment anything changes. A procedural facade system driven by:
period, typology, height, use, condition, ownership, and neighborhood. Storefront
generation is separate and matters enormously — the ground floor is 90% of what
a pedestrian sees, and it's the layer that changes most as the sim runs.

Hand-authoring is reserved for landmarks and the ~30 interiors that carry
scenes.

### Interiors
Do not build a full interior for every building. Three tiers:
1. **Hand-authored** — your office, the hearing room, the bank, ~6 bars and
   bodegas per neighborhood, the holdout's apartment.
2. **Procedural-from-plan** — your own buildings' lobbies, hallways, and units,
   generated from the massing you designed. This is required: you must be able
   to walk into the thing you drew in the Vision tool. It's also a *reward* —
   inspecting your own building is a core verb.
3. **Facade-only** — everything else. Doors that don't open are fine and normal;
   New York is full of them.

### The Vision tool
Runs against a live constraint solver that evaluates the zoning envelope
(setbacks, sky exposure plane, FAR, coverage) as a signed-distance volume. The
player's massing is CSG inside that volume, clamped in real time. Shadow study
is a real-time sun position + shadow accumulation buffer over the neighborhood.
View scoring is a periodic raycast fan from sample points per floor, cached and
invalidated when nearby massing changes.

All of it is **sim-side**, not render-side — the board view needs the same
numbers, and a rival's tower must be able to invalidate your view score whether
or not you're standing there.

### Crowds and vehicles at the [04](04-vehicles-and-traffic.md) targets
- Pedestrians: GPU-instanced skinned meshes, animation texture baking, 3 LOD
  bands, behaviour on a job-system update at 5–10Hz (not per frame).
- Parked vehicles: static instanced, one draw call per model/variant batch.
  Effectively free, enormous visual payoff.
- Moving vehicles: simple path-following on a lane graph with local avoidance.
  Full physics only for the player's vehicle and its immediate neighbors.
- The sampler ([08](08-simulation-core.md)) runs on block entry, not per frame.

### Save/load
Seed + command log + periodic full snapshots. Saves are small and diffable,
which makes bug reports reproducible — genuinely important for a game where the
interesting failures are emergent and ten hours deep.

## Testing

- **Determinism test** in CI: replay a fixed command log for 50 game-years,
  assert identical state hash. Any nondeterminism is a P0 bug.
- **Economy soak**: 1,000 headless runs with randomized seeds and scripted
  player behaviours (passive, aggressive, clean, dirty); assert no runaway
  values, no collapse to a single dominant strategy, no dead markets.
- **Two-camera consistency**: automated check that `actual` state sampled at
  street level matches Tier 0 aggregates within tolerance. Pillar 1 as a test.
- **Feel tests**: unautomatable, and the most important. Weekly playtest of the
  session shape in [02](02-two-cameras.md#session-shape).
