import { createTerrain, WORLD } from './world.js';
import { createSubmarine, updateSubmarine, SONAR_MODES } from './submarine.js';
import { createSonarSystem, fireActivePing, updateSonar, getVisibleEnemySubs } from './sonar.js';
import { createWeaponsSystem, fireTorpedo, fireDepthCharge, fireMissile, updateWeapons } from './weapons.js';
import { createAI, updateAI } from './ai.js';
import { createContactSystem, addContact, updateContacts, updateNoiseContact } from './contacts.js';
import { getSonarRadius } from './submarine.js';
import { createNoiseSystem, updateNoise } from './noise.js';

export function createGame() {
  const segments = createTerrain();

  const player = createSubmarine(500, 820, 1, true);
  const enemy = createSubmarine(2100, 880, -1, false);

  return {
    segments,
    subs: [player, enemy],
    player,
    enemy,
    sonar: createSonarSystem(),
    weapons: createWeaponsSystem(),
    ai: createAI(enemy),
    contacts: createContactSystem(),
    noise: createNoiseSystem(),
    time: 0,
    aimAngle: null,
    running: false,
    winner: null,
    lastTime: 0,
  };
}

export function resetGame(game) {
  const fresh = createGame();
  fresh.running = true;
  Object.assign(game, fresh);
  game.running = true;
}

export function updateGame(game, playerInput, enemyInput, dt) {
  if (!game.running || game.winner) return;

  game.time = performance.now();

  const { segments, sonar, weapons } = game;

  enemyInput = updateAI(game.ai, game, dt, game.time);

  updateSubmarine(game.player, playerInput, dt, segments);
  updateSubmarine(game.enemy, enemyInput, dt, segments);

  updateSonar(sonar, game.subs, segments, dt, game.time, (owner, hitSub, x, y) => {
    if (owner.isPlayer && hitSub === game.enemy) {
      addContact(game.contacts, x, y, game.time, 'ping');
    }
  });
  updateContacts(game.contacts, game.time);
  updateNoise(game.noise, game.time);

  updateNoiseContact(
    game.contacts,
    game.player,
    game.enemy,
    getSonarRadius(game.enemy, game.time),
    game.time,
  );

  updateWeapons(weapons, game.subs, segments, dt, game.noise, game.time);

  if (!game.player.alive && !game.enemy.alive) {
    game.winner = 'draw';
    game.running = false;
  } else if (!game.enemy.alive) {
    game.winner = 'player';
    game.running = false;
  } else if (!game.player.alive) {
    game.winner = 'enemy';
    game.running = false;
  }
}

export function handlePlayerAction(game, action) {
  const player = game.player;
  if (!player.alive) return;

  switch (action.type) {
    case 'ping':
      if (game.aimAngle !== null) {
        fireActivePing(game.sonar, player, game.aimAngle, game.segments, game.subs, game.noise, game.time);
      }
      break;
    case 'torpedo':
      fireTorpedo(game.weapons, player, game.noise, game.time);
      break;
    case 'depthcharge':
      fireDepthCharge(game.weapons, player, game.noise, game.time);
      break;
    case 'missile':
      fireMissile(game.weapons, player, game.noise, game.time);
      break;
    case 'sonar-large':
      player.sonarMode = SONAR_MODES.LARGE;
      player.silent = false;
      break;
    case 'sonar-small':
      player.sonarMode = SONAR_MODES.SMALL;
      player.silent = false;
      break;
    case 'sonar-pulse':
      player.sonarMode = SONAR_MODES.PULSE;
      player.silent = false;
      break;
    case 'sonar-off':
      player.sonarMode = SONAR_MODES.OFF;
      break;
    case 'silent':
      player.silent = !player.silent;
      if (player.silent) player.sonarMode = SONAR_MODES.OFF;
      break;
  }
}

export function getVisibleSubsForViewer(game, viewer) {
  const visible = getVisibleEnemySubs(viewer, game.subs, game.segments, game.sonar, game.time);
  return visible;
}

export function screenToWorld(game, renderer, sx, sy) {
  return {
    x: sx + renderer.camera.x,
    y: sy + renderer.camera.y,
  };
}

export function worldToScreen(renderer, wx, wy) {
  return renderer.toScreen(wx, wy);
}