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
| `V` | raise the Vision on the lot you're standing on |
| `E` | get in / out of your car |
| `F` | first person |
| `Tab` | rise to the board, and drop back down |
| `1` `2` `3` `4` | time speed · `Space` pause |
| Click (on the board) | inspect a lot · right-drag orbits · scroll zooms |

## How you win

Highest net worth. You and three AI developers all start with $100M.

Money comes from rent, and rent comes from floor area, and floor area comes from
**FAR** — every lot is entitled to build its site area × its FAR. Most of the
city is built to a fraction of what it's allowed, and that gap is the game.

Building anywhere pulls up land value around it, including your rivals'. The
market runs on a seven-year cycle. Leverage is how you move fast and how you die.
