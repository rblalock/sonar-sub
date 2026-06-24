# Sonar Battle

A browser-based submarine duel built from [Squidi Mechanic #085 — Sonar Battle](https://www.squidi.net/three/entry.php?id=85). Two subs hunt each other in total darkness using passive sonar bubbles and active pings. The enemy AI patrols, probes, listens for your noise, and strikes back.

**[Play online](https://rblalock.github.io/sonar-sub/)** *(live after you push to GitHub and enable Pages)*

## Play locally

```bash
git clone https://github.com/rblalock/sonar-sub.git
cd sonar-sub
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> Do not open `index.html` directly from the filesystem — use the dev server.

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
- **Silent running** hides your bubble — total darkness — but pings and weapons still make noise.
- **Active pings** bounce off walls and can briefly reveal the enemy on a hit.
- The **minimap** only shows contacts, not the enemy's live position.
- The **AI** uses belief/confidence: wide random probes when uncertain, tight bracketing when it hears you.

## Development

```bash
npm run build   # bundle to dist/game.bundle.js
npm run dev     # build + local server on port 5173
```

Source lives in `js/`. The shipped page loads `dist/game.bundle.js`.

## GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys to Pages on every push to `main`.

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main` — the workflow publishes the game automatically.

Your game will be at `https://rblalock.github.io/sonar-sub/` (or `https://<your-username>.github.io/sonar-sub/`).

## Attribution

- Game mechanic by [Sean Howard / Squidi.net](https://www.squidi.net/three/entry.php?id=85) (Mechanic #085, 2008).
- This project is an independent fan implementation and is not affiliated with Squidi.net.

## License

[MIT](LICENSE)