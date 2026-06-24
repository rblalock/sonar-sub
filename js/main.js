import { createGame, resetGame, updateGame, handlePlayerAction, screenToWorld } from './game.js';
import { Renderer } from './renderer.js';
import { getVisibleEnemySubs } from './sonar.js';
import { getSonarRadius } from './submarine.js';
import { dist } from './utils.js';

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('start-btn');

const renderer = new Renderer(canvas);
const game = createGame();

// Debug access for playtesting
window.__game = game;
window.__renderer = renderer;

let mouseX = 0;
let mouseY = 0;
const keys = new Set();
let endScreenShown = false;

const playerInput = {
  thrustLeft: false,
  thrustRight: false,
  rise: false,
  dive: false,
};

function updateInputFromKeys() {
  playerInput.thrustLeft = keys.has('a') || keys.has('ArrowLeft');
  playerInput.thrustRight = keys.has('d') || keys.has('ArrowRight');
  playerInput.rise = keys.has('w') || keys.has('ArrowUp');
  playerInput.dive = keys.has('s') || keys.has('ArrowDown');
}

function updateAimAngle() {
  const world = screenToWorld(game, renderer, mouseX, mouseY);
  game.aimAngle = Math.atan2(world.y - game.player.y, world.x - game.player.x);
}

function showOverlay(title, message) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function startGame() {
  resetGame(game);
  game.running = true;
  endScreenShown = false;
  hideOverlay();
}

function getEnemyVisibility(game) {
  const visible = getVisibleEnemySubs(
    game.player,
    game.subs,
    game.segments,
    game.sonar,
    game.time,
  );

  const results = visible.map((v) => ({
    sub: v.sub,
    type: v.type,
    alpha: v.type === 'echo' ? v.echo.intensity : 0.85,
  }));

  // Enemy passive bubble reveals them when we're within their sonar range
  const enemy = game.enemy;
  if (enemy.alive && !enemy.silent) {
    const enemyRadius = getSonarRadius(enemy, game.time);
    if (enemyRadius > 0) {
      const d = dist(game.player.x, game.player.y, enemy.x, enemy.y);
      if (d < enemyRadius + 80) {
        const already = results.some((r) => r.sub === enemy);
        if (!already) {
          results.push({ sub: enemy, type: 'bubble', alpha: 0.7 });
        }
      }
    }
  }

  return results;
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  updateAimAngle();
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && game.running) {
    handlePlayerAction(game, { type: 'ping' });
  }
});

window.addEventListener('keydown', (e) => {
  keys.add(e.key);

  if (e.key === ' ') {
    e.preventDefault();
    if (game.running) handlePlayerAction(game, { type: 'ping' });
  }

  if (e.key === '1') handlePlayerAction(game, { type: 'sonar-large' });
  if (e.key === '2') handlePlayerAction(game, { type: 'sonar-small' });
  if (e.key === '3') handlePlayerAction(game, { type: 'sonar-pulse' });
  if (e.key === '4') handlePlayerAction(game, { type: 'sonar-off' });
  if (e.key === 'q' || e.key === 'Q') handlePlayerAction(game, { type: 'silent' });
  if (e.key === 't' || e.key === 'T') handlePlayerAction(game, { type: 'torpedo' });
  if (e.key === 'c' || e.key === 'C') handlePlayerAction(game, { type: 'depthcharge' });
  if (e.key === 'm' || e.key === 'M') handlePlayerAction(game, { type: 'missile' });
  if (e.key === 'r' || e.key === 'R') startGame();

  updateInputFromKeys();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
  updateInputFromKeys();
});

window.addEventListener('resize', () => renderer.resize());

startBtn.addEventListener('click', startGame);

const TIPS = [
  'Your sonar bubble (1-4) reveals nearby walls — but the enemy can hear you.',
  'Press Q for silent running — hides your bubble, but pings and weapons still make noise.',
  'Click or Space fires an active ping along your mouse aim. It bounces off walls.',
  'Pings that hit the enemy leave a fading contact blip — your only fix on them.',
  'Stale intel points a rough direction. The minimap only shows real contacts.',
  'Orange contacts = ping hit. Yellow = enemy noise from their sonar bubble.',
  'Enemy sonar bubble makes noise you can hear at range. Go silent (Q) to hide.',
  'Torpedo (T): same depth. Depth charge (C): enemy below you. Missile (M): above.',
  'The enemy patrols and pings — watch for distant echo flashes and torpedoes.',
  'Move with A/D and W/S. Watch the HUD for crush depth near the sea floor.',
];

let tipIndex = 0;
let tipTimer = 0;

function updateTips(game) {
  const el = document.getElementById('tip-text');
  if (!el || !game.running) return;

  tipTimer += 1 / 60;
  if (tipTimer > 8) {
    tipTimer = 0;
    tipIndex = (tipIndex + 1) % TIPS.length;
  }

  if (game.contacts?.blips?.length > 0) {
    el.textContent = 'CONTACT LOST — fire another ping to reacquire, then close in for a torpedo.';
  } else if (game.player.pingAlert > 0) {
    el.textContent = 'YOU\'VE BEEN PINGED — the enemy knows something is out there. Go silent (Q) and move.';
  } else {
    el.textContent = TIPS[tipIndex];
  }
}

showOverlay(
  'SONAR BATTLE',
  'You and an enemy sub hunt each other in total darkness.\n\n1) Use WASD to move. Your sonar bubble reveals nearby walls.\n2) Fire pings (Space / click) to map terrain and find the enemy.\n3) A ping that hits the enemy leaves a fading contact — chase it.\n4) Torpedo (T) when you\'re at the same depth. Depth charge (C) / missile (M) for depth differences.\n\nThe enemy is NOT on your radar until you ping them. Go.',
);

function gameLoop(timestamp) {
  if (!game.lastTime) game.lastTime = timestamp;
  const dt = Math.min((timestamp - game.lastTime) / 1000, 0.05);
  game.lastTime = timestamp;

  renderer.resize();
  updateInputFromKeys();
  updateAimAngle();

  const wasRunning = game.running;

  if (game.aimAngle !== null) {
    playerInput.facing = Math.cos(game.aimAngle) >= 0 ? 1 : -1;
  }

  if (game.running) {
    updateGame(game, playerInput, null, dt);
  }

  if (wasRunning && !game.running && !endScreenShown) {
    endScreenShown = true;
    if (game.winner === 'player') {
      showOverlay('VICTORY', 'Enemy submarine destroyed. The sea is yours.');
    } else if (game.winner === 'enemy') {
      showOverlay('DEFEAT', 'Your submarine has been destroyed.');
    } else {
      showOverlay('DRAW', 'Both submarines destroyed.');
    }
  }

  const viewer = game.player;

  renderer.setCamera(viewer);
  renderer.clear();
  renderer.drawWorld(game, viewer);
  if (game.contacts) renderer.drawContacts(game.contacts, game.time);
  renderer.drawSubmarine(game.player, false, 1);

  for (const v of getEnemyVisibility(game)) {
    if (v.sub.alive) renderer.drawSubmarine(v.sub, true, v.alpha);
  }

  renderer.drawProjectiles(game.weapons);
  renderer.updateHUD(viewer, game.contacts, game.enemy, game.ai?.state);
  renderer.drawMiniRadar(game, viewer);
  updateTips(game);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);