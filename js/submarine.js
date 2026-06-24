import { clamp } from './utils.js';
import { WORLD, checkSubTerrainCollision, isCrushDepth } from './world.js';

export const SONAR_MODES = {
  LARGE: 'large',
  SMALL: 'small',
  PULSE: 'pulse',
  OFF: 'off',
};

const SONAR_RADIUS = {
  [SONAR_MODES.LARGE]: 280,
  [SONAR_MODES.SMALL]: 140,
  [SONAR_MODES.PULSE]: 200,
  [SONAR_MODES.OFF]: 0,
};

export function createSubmarine(x, y, facing = 1, isPlayer = true) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    facing,
    width: 36,
    height: 14,
    hull: 100,
    maxHull: 100,
    isPlayer,
    alive: true,
    silent: false,
    sonarMode: SONAR_MODES.LARGE,
    pulsePhase: 0,
    pingAlert: 0,
    thrustPower: isPlayer ? 0.58 : 0.52,
    divePower: isPlayer ? 0.44 : 0.4,
    lastCollisionDamage: 0,
    torpedoCooldown: 0,
    depthChargeCooldown: 0,
    missileCooldown: 0,
    pingCooldown: 0,
  };
}

export function getSonarRadius(sub, time) {
  if (sub.silent || sub.sonarMode === SONAR_MODES.OFF) return 0;

  if (sub.sonarMode === SONAR_MODES.PULSE) {
    const phase = (time * 0.001 * 1.5) % 1;
    return phase < 0.4 ? SONAR_RADIUS[SONAR_MODES.PULSE] : 0;
  }

  return SONAR_RADIUS[sub.sonarMode] || 0;
}

export function isSonarActive(sub, time) {
  return getSonarRadius(sub, time) > 0;
}

export function updateSubmarine(sub, input, dt, segments) {
  if (!sub.alive) return;

  sub.torpedoCooldown = Math.max(0, sub.torpedoCooldown - dt);
  sub.depthChargeCooldown = Math.max(0, sub.depthChargeCooldown - dt);
  sub.missileCooldown = Math.max(0, sub.missileCooldown - dt);
  sub.pingCooldown = Math.max(0, sub.pingCooldown - dt);
  sub.pingAlert = Math.max(0, sub.pingAlert - dt);

  if (input) {
    if (input.facing !== undefined) sub.facing = input.facing;
    if (input.thrustLeft) sub.vx -= sub.thrustPower * dt;
    if (input.thrustRight) sub.vx += sub.thrustPower * dt;
    if (input.rise) sub.vy -= sub.divePower * dt;
    if (input.dive) sub.vy += sub.divePower * dt;
    if (input.silent !== undefined) sub.silent = input.silent;
    if (input.sonarMode) sub.sonarMode = input.sonarMode;
  }

  // Water drag — subs move steadily but not fast
  sub.vx *= Math.pow(0.1, dt);
  sub.vy *= Math.pow(0.1, dt);

  sub.x += sub.vx * dt * 60;
  sub.y += sub.vy * dt * 60;

  sub.x = clamp(sub.x, 40, WORLD.width - 40);
  sub.y = clamp(sub.y, WORLD.surfaceY + 20, WORLD.floorY - 20);

  const collision = checkSubTerrainCollision(sub, segments);
  if (collision.hit) {
    const now = performance.now();
    if (now - sub.lastCollisionDamage > 500) {
      sub.hull -= 8;
      sub.lastCollisionDamage = now;
      sub.vx *= -0.3;
      sub.vy *= -0.3;
    }
  }

  if (isCrushDepth(sub.y)) {
    sub.hull -= 12 * dt;
  }

  if (sub.hull <= 0) {
    sub.hull = 0;
    sub.alive = false;
  }
}

export function damageSub(sub, amount) {
  if (!sub.alive) return;
  sub.hull = Math.max(0, sub.hull - amount);
  if (sub.hull <= 0) sub.alive = false;
}

export function alertPing(sub) {
  sub.pingAlert = 2.5;
}