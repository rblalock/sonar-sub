import { fireActivePing } from './sonar.js';
import { fireTorpedo, fireDepthCharge, fireMissile } from './weapons.js';
import { SONAR_MODES, getSonarRadius } from './submarine.js';
import { dist } from './utils.js';
import { hearNoise } from './noise.js';

const PLAYER_SPAWN = { x: 500, y: 820 };

export function createAI(sub) {
  return {
    sub,
    state: 'patrol',
    stateTimer: 6,
    knownPlayerPos: null,
    pingCooldown: 4 + Math.random() * 4,
    probeSide: 0,
    belief: { confidence: 0.12, x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, source: 'intel' },
  };
}

function assessBelief(ai, game, player, playerDist, time) {
  let confidence = 0.12;
  let x = PLAYER_SPAWN.x;
  let y = PLAYER_SPAWN.y;
  let source = 'intel';

  // Direct ping hits — highest confidence
  for (const echo of game.sonar.echoes) {
    if (echo.hitSub === player && echo.intensity > 0.15) {
      const hitConf = 0.72 + echo.intensity * 0.28;
      if (hitConf >= confidence) {
        confidence = hitConf;
        x = echo.x;
        y = echo.y;
        source = 'ping';
      }
    }
  }

  // Active noise — pings, weapons, explosions (heard even in silent running)
  const heard = hearNoise(game.noise, ai.sub, player, time);
  if (heard && heard.confidence > confidence) {
    confidence = heard.confidence;
    x = heard.x;
    y = heard.y;
    source = heard.source;
    if (heard.confidence >= 0.35) {
      ai.state = 'hunt';
      ai.stateTimer = Math.max(ai.stateTimer, 10);
    }
  }

  // Player passive bubble — muffled bearing/range (silent running suppresses this)
  const playerRadius = getSonarRadius(player, time);
  if (playerRadius > 0 && !player.silent) {
    const hearRange = playerRadius + 450;
    if (playerDist < hearRange) {
      const proximity = 1 - playerDist / hearRange;
      const noiseConf = 0.2 + proximity * 0.45;
      if (noiseConf > confidence) {
        const jitter = (1 - proximity) * 160 + 30;
        confidence = noiseConf;
        x = player.x + (Math.random() - 0.5) * jitter;
        y = player.y + (Math.random() - 0.5) * jitter;
        source = 'noise';
      }
    }
  }

  // Decay a stored contact over time
  if (ai.knownPlayerPos) {
    const age = (time - ai.knownPlayerPos.time) / 1000;
    const decayed = Math.max(0, ai.knownPlayerPos.confidence - age * 0.04);
    if (decayed > confidence) {
      confidence = decayed;
      x = ai.knownPlayerPos.x;
      y = ai.knownPlayerPos.y;
      source = ai.knownPlayerPos.source;
    }
  }

  ai.belief = { confidence, x, y, source };

  if (confidence >= 0.28) {
    ai.knownPlayerPos = { x, y, time, source, confidence };
  }

  return ai.belief;
}

function scheduleProbeCooldown(confidence, state) {
  if (state === 'evade') return 999;

  if (confidence > 0.7) return 1.5 + Math.random() * 3.5;
  if (confidence > 0.45) return 3 + Math.random() * 5;
  if (confidence > 0.25) return 5 + Math.random() * 7;
  return 6 + Math.random() * 10;
}

function computeProbeAngle(ai, sub, belief, time) {
  const { confidence, x, y } = belief;
  const base = Math.atan2(y - sub.y, x - sub.x);

  if (confidence > 0.65) {
    // Tight bracketing around a solid contact
    ai.probeSide ^= 1;
    const offset = 0.06 + (1 - confidence) * 0.18;
    return base + (ai.probeSide ? offset : -offset);
  }

  if (confidence > 0.4) {
    // Focused cone toward a noisy contact
    const spread = 0.25 + (1 - confidence) * 0.35;
    return base + (Math.random() - 0.5) * spread;
  }

  if (confidence > 0.2) {
    // Sector sweep — slow fan across suspected area
    const fan = Math.sin(time * 0.00045 + sub.x * 0.001) * 0.9;
    return base + fan + (Math.random() - 0.5) * 0.5;
  }

  // Distant patrol — occasional wide probes across the western sector
  const sweep = Math.sin(time * 0.00025) * 1.4;
  return base + sweep + (Math.random() - 0.5) * 1.0;
}

function maybeFireProbe(ai, game, belief, time) {
  const { sub } = ai;
  if (ai.pingCooldown > 0 || ai.state === 'evade' || sub.silent) return;

  const { confidence } = belief;

  // Low confidence: only probe sometimes when cooldown elapses
  if (confidence < 0.2 && Math.random() > 0.45) {
    ai.pingCooldown = 3 + Math.random() * 6;
    return;
  }

  const angle = computeProbeAngle(ai, sub, belief, time);
  fireActivePing(game.sonar, sub, angle, game.segments, game.subs, game.noise, time);
  ai.pingCooldown = scheduleProbeCooldown(confidence, ai.state);
}

export function updateAI(ai, game, dt, time) {
  const { sub } = ai;
  const player = game.subs.find((s) => s.isPlayer && s.alive);
  if (!sub.alive || !player) return;

  ai.stateTimer -= dt;
  ai.pingCooldown -= dt;

  const input = {
    thrustLeft: false,
    thrustRight: false,
    rise: false,
    dive: false,
    silent: false,
    sonarMode: sub.sonarMode,
  };

  const playerDist = dist(sub.x, sub.y, player.x, player.y);
  const belief = assessBelief(ai, game, player, playerDist, time);

  // Pinged — go silent, no probes
  if (sub.pingAlert > 0 && ai.state !== 'evade') {
    ai.state = 'evade';
    ai.stateTimer = 3 + Math.random() * 2;
    sub.silent = true;
    sub.sonarMode = SONAR_MODES.OFF;
    ai.evadeDir = Math.random() > 0.5 ? 1 : -1;
    ai.evadeVert = Math.random() > 0.5 ? 1 : -1;
    ai.pingCooldown = 4 + Math.random() * 3;
  }

  if (ai.state === 'evade' && ai.stateTimer <= 0) {
    ai.state = 'hunt';
    sub.silent = false;
    sub.sonarMode = SONAR_MODES.SMALL;
    ai.stateTimer = 10;
    ai.pingCooldown = 2 + Math.random() * 3;
  }

  // Promote/demote state from belief confidence
  if (ai.state === 'patrol' && belief.confidence >= 0.3) {
    ai.state = 'hunt';
    ai.stateTimer = 12;
  }
  if (ai.state === 'hunt' && belief.confidence < 0.18 && ai.stateTimer <= 0) {
    ai.state = 'patrol';
    ai.stateTimer = 8;
    ai.knownPlayerPos = null;
  }

  const moveToward = (tx, ty) => {
    input.thrustRight = tx > sub.x + 20;
    input.thrustLeft = tx < sub.x - 20;
    input.dive = ty > sub.y + 20;
    input.rise = ty < sub.y - 20;
    sub.facing = tx >= sub.x ? 1 : -1;
  };

  if (ai.state === 'patrol') {
    sub.sonarMode = SONAR_MODES.LARGE;
    sub.silent = false;

    const sweepY = PLAYER_SPAWN.y + Math.sin(time * 0.00035) * 100;
    moveToward(PLAYER_SPAWN.x, sweepY);
    maybeFireProbe(ai, game, belief, time);

    if (ai.stateTimer <= 0) {
      ai.state = 'hunt';
      ai.stateTimer = 10;
    }
  } else if (ai.state === 'hunt') {
    sub.sonarMode = belief.confidence > 0.5 ? SONAR_MODES.SMALL : SONAR_MODES.LARGE;
    sub.silent = false;

    const tx = belief.x;
    const ty = belief.y;
    const urgency = belief.confidence;

    moveToward(tx, ty);
    maybeFireProbe(ai, game, belief, time);

    const depthDiff = player.y - sub.y;

    if (urgency > 0.55 && playerDist < 450 && Math.abs(depthDiff) < 45) {
      fireTorpedo(game.weapons, sub, game.noise, time);
    } else if (urgency > 0.45 && depthDiff > 50) {
      fireDepthCharge(game.weapons, sub, game.noise, time);
    } else if (urgency > 0.45 && depthDiff < -50) {
      fireMissile(game.weapons, sub, game.noise, time);
    }

    if (ai.stateTimer <= 0) {
      ai.state = belief.confidence >= 0.25 ? 'hunt' : 'patrol';
      ai.stateTimer = ai.state === 'hunt' ? 10 : 7;
      if (ai.state === 'patrol') ai.knownPlayerPos = null;
    }
  } else if (ai.state === 'evade') {
    input.thrustRight = ai.evadeDir > 0;
    input.thrustLeft = ai.evadeDir < 0;
    input.rise = ai.evadeVert < 0;
    input.dive = ai.evadeVert > 0;
    sub.facing = ai.evadeDir;
  }

  return input;
}