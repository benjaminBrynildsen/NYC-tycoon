# Playing it

**Live build:** https://claude.ai/artifact/CDA6mcqPJb83DdWFXbt2wN

Or run it locally — it's plain ES modules, so it just needs a static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`node tools/build-artifact.mjs` regenerates `dist/artifact.html` (the hosted
build) from `index.html` + `src/style.css`. Run it after any change to either.

## Controls

| | |
|---|---|
| `W A S D` | walk / drive / pan the board |
| `Shift` | run |
| Mouse | look (click once to capture the pointer; drag also works) |
| `Space` | jump — over a parapet, or off the embankment into the river |
| `V` | raise the Vision on the lot you're standing on |
| `E` | your car, the lift to a roof, or the airship at its mast |
| `F` | first person |
| `Tab` | rise to the board, and drop back down |
| `1` `2` `3` `4` | time speed · `Space` pauses from the board |
| Click (on the board) | inspect a lot · right-drag orbits · scroll zooms |

On a phone: left thumb walks, right thumb looks, and the buttons down the
right-hand side are the verbs. On the map, drag to pan, pinch to zoom, twist
to rotate and slide two fingers to tilt towards the skyline.

## Off the pavement

Every tower of fifty floors or more carries a mooring mast. Take the lift to
the roof, walk to the mast, and `E` charters the airship tied to it. You fly
it by looking where you want to go and holding forward; the nose follows your
eye, and it climbs or dives with it. It will not fly through the city — the
skyline pushes it up. `E` again puts you over the side, and what happens next
is gravity's business.

You can jump off anything. A setback is a real surface, so stepping off the
top of a tower often means landing on its own terrace forty floors down. Go in
the river and you swim, slowly; swim at the shore and you climb out. There is
no health in this game and there is not going to be any — falling sixty
storeys costs you nothing but the walk back.

## How you win

Highest net worth. You and three AI developers all start with $100M.

Money comes from rent, and rent comes from floor area, and floor area comes from
**FAR** — every lot is entitled to build its site area × its FAR. Most of the
city is built to a fraction of what it's allowed, and that gap is the game.

Building anywhere pulls up land value around it, including your rivals'. The
market runs on a seven-year cycle. Leverage is how you move fast and how you die.
