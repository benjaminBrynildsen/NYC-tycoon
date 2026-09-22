# 12 — UX & Controls

## The governing constraint

Two games' worth of interface, and the player must never feel they are switching
applications. The transition is continuous
([02](02-two-cameras.md#the-transition-in-detail)), so the UI must be
continuous too: **the board's visual language is the street's, drained of
colour.** Same typeface, same iconography, same layout grammar. The board looks
like the city with the saturation pulled out, because that's exactly what it is.

## Controls — gamepad

The game must be fully playable on a controller. This is a real constraint on
the Vision tool and the board, and it will make both better.

### Street (on foot)
| Input | Action |
|---|---|
| Left stick | Move |
| Right stick | Camera |
| L3 | Run |
| **R2 (hold)** | `INSPECT` — raise the Vision |
| R1 | `TALK` / context interact |
| L1 | Phone |
| **L1 (hold)** | **Overseer** — the camera rises |
| X / A | `ENTER` / use |
| Y / △ | Toggle first person |
| B / ○ | `PIN` |
| D-pad ↑ | `PHOTOGRAPH` |
| D-pad ↓ | Look up (yes, its own input — see below) |
| D-pad ← / → | Cycle overlay (street-legible ones only) |
| Options | Calendar |

### Street (driving)
| Input | Action |
|---|---|
| R2 / L2 | Throttle / brake |
| Left stick | Steer |
| **L3** | **Horn** |
| R1 | Radio station |
| Y / △ | Camera cycle (incl. interior) |
| X / A (hold) | Exit vehicle |
| L1 (hold) | Overseer (car parks itself, you leave it there) |

### The Vision (while raised)
| Input | Action |
|---|---|
| Left stick | Move (you can walk while it's up) |
| Right stick | Aim the manipulator |
| R2 | Grab / drag the active handle |
| L1 / R1 | Cycle the five tools (Extrude / Tower / Step / Carve / Program) |
| D-pad ← → | Scrub the sun |
| D-pad ↑ | Enter the ghost (walkthrough mode) |
| Y / △ | Toggle the readout panel |

### Board
| Input | Action |
|---|---|
| Left stick | Pan |
| Right stick | Orbit / pitch |
| R2 / L2 | Zoom |
| L1 / R1 | Cycle overlay |
| R3 | Snap to your avatar |
| **L1 (hold)** | **Descend** — back into your body |
| D-pad ← → | Time speed |
| X / A | Select lot / building / person |

**L1-hold is the mode key in both directions.** One muscle memory, and it's the
most-used input in the game. Give it the best button on the pad and never
overload it.

### Mouse & keyboard
Standard WASD + mouse; `Tab` held for the mode transition; overlays on number
keys; the Vision tool gains precision affordances (numeric entry, snapping,
ortho lock) that the pad doesn't get. Mouse users get a genuinely better Vision
tool. That's fine — the pad version must be *complete*, not equivalent.

## Looking up

Its own input, because the entire emotional register of a New York game is the
vertical. Pressing it eases the camera up the facade in front of you, slows the
avatar, narrows the FOV slightly, and lets the score breathe. It does nothing
mechanically. It is one of the most important buttons in the game.

## HUD

**Near-zero by default.** The street's readability comes from the world
([03](03-street-layer.md#street-density--readability)), not from an overlay. The
persistent HUD is:

- Time and date, small, top right. Always. The calendar is the game's pulse.
- A context prompt when something is interactable.
- A soft directional indicator for your current appointment, only when one is
  within an hour.

Everything else — money, meters, portfolio — lives on the phone or the board,
because checking your balance should be a small deliberate act, not ambient
wallpaper. A player walking a block should be *looking at the block.*

### The three meters
Capital / Standing / Heat ([09](09-economy-and-progression.md#the-three-meters))
appear on the phone and board, never persistently on the street — with one
exception: **Heat surfaces on the street when it's actively high**, as a subtle
peripheral vignette and a change in how people look at you. Being watched should
*feel* like being watched, in the camera, not in a number.

## The phone

Diegetic, in your hand, animated. Apps:

| App | Purpose |
|---|---|
| **Calendar** | The spine. Appointments, resolution mode, conflicts. |
| **Portfolio** | Assets, cash flow, debt maturities, the crunch forecast. |
| **Messages** | Staff, stakeholders, brokers, rivals. Where offers arrive. |
| **Contacts** | The relationship graph; trust and favors owed. |
| **Listings** | What's for sale, on and off market. |
| **News** | The city commenting on you and on itself. |
| **Camera roll** | Your `PHOTOGRAPH` evidence and marketing. |
| **Ledger** | [10](10-people-and-story.md#the-ledger). Always available. Never prompted. |

Using the phone mid-conversation is possible and rude, and NPCs notice. Small
touch, large payoff.

## Readability rules

Enforce these like lint:

1. **Any number shown on the board must have a physical referent** the player
   could go verify. No abstract scores.
2. **Any state visible on the street must be derivable from sim data.** No
   decorative detail that implies something untrue.
3. **Uncertainty is always shown as uncertainty.** `reported` values display
   with an error band and an age
   ("74% ±6, as of 9 days ago — J. Rivera"). Never a false precision. The player
   should always know *who* told them something and *when*.
4. **Never punish the player with information they had no route to.** Every
   nasty surprise must have been discoverable — usually by walking somewhere.
   This is the fairness contract that makes pillar 2 feel like skill rather than
   like a gotcha.
5. **No tutorial pop-ups after the first hour.** Tier 1 ([09](09-economy-and-progression.md#tier-1--the-building-opening-35-hrs))
   is the tutorial, and it teaches by having you personally do things that later
   get abstracted.

## Accessibility

- Full remapping; one-stick and hold-to-toggle options for every hold input
  (including the mode key).
- The street layer's information must be available non-visually: an `INSPECT`
  readout describes what the block looks like in words. This also happens to be
  great for players who just want the data.
- Colorblind-safe overlay palettes, with pattern/hatch encoding as well as hue —
  mandatory, since overlays are the board's entire language.
- Adjustable street-time multiplier, including a slow option, decoupled from
  difficulty. Some people want to walk more; let them.
- Motion sickness: the camera transition can be shortened, and the FOV widening
  disabled.
- Text scaling that actually works on the phone UI, which is the hardest surface
  and must be designed at the largest size first.
