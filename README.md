# Sonar Battle

A browser-based submarine duel inspired by [Squidi Mechanic #085 — Sonar Battle](https://www.squidi.net/three/entry.php?id=85). Two subs hunt each other in total darkness using passive sonar bubbles and active pings. The enemy AI patrols, probes, listens for your noise, and strikes back.

**Play it here:** https://rblalock.github.io/sonar-sub/

## Run locally

```bash
git clone https://github.com/rblalock/sonar-sub.git
cd sonar-sub
npm run dev
```

Then open http://localhost:5173. Use the dev server rather than opening `index.html` directly.

## Controls

| Key | Action |
|-----|--------|
| W / S | Rise / dive |
| A / D | Thrust |
| Mouse + click / Space | Aim and fire active ping |
| 1–4 | Sonar bubble: large / small / pulse / off |
| Q | Silent running |
| T | Torpedo (same depth) |
| C | Depth charge (target below you) |
| M | Missile (target above you) |
| R | Restart |

## How it works

- **Passive sonar** reveals nearby terrain, but the enemy can hear your bubble.
- **Silent running** hides your bubble and leaves you in total darkness, but pings and weapons still make noise.
- **Active pings** bounce off walls and can briefly reveal the enemy on a hit.
- The **minimap** shows contacts only, not the enemy's real-time position.
- The **AI** builds a picture of where you might be — wide probes when uncertain, tighter bracketing when it hears you.

## Development

```bash
npm run build   # bundle to dist/game.bundle.js
npm run dev     # build + local server on port 5173
```

Source is in `js/`. The published build loads `dist/game.bundle.js`.

Pushes to `main` deploy automatically to GitHub Pages via the workflow in `.github/workflows/pages.yml`.

## Attribution

Game mechanic by [Sean Howard / Squidi.net](https://www.squidi.net/three/entry.php?id=85) (Mechanic #085, 2008). This is an independent fan implementation, not affiliated with Squidi.net.

## License

[MIT](LICENSE)