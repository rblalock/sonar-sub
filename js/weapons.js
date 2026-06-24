import { dist } from './utils.js';
import { damageSub } from './submarine.js';
import { raycastTerrain } from './world.js';
import { emitNoise } from './noise.js';

const DEPTH_TOLERANCE = 40;

export function createWeaponsSystem() {
  return {
    projectiles: [],
    explosions: [],
  };
}

export function fireTorpedo(weapons, sub, noise = null, time = 0) {
  if (sub.torpedoCooldown > 0 || !sub.alive) return false;
  sub.torpedoCooldown = 2.5;

  const x = sub.x + sub.facing * 24;
  const y = sub.y;

  weapons.projectiles.push({
    type: 'torpedo',
    x,
    y,
    vx: sub.facing * 5,
    vy: 0,
    owner: sub,
    depth: sub.y,
    life: 6,
    noisy: true,
  });

  if (noise) emitNoise(noise, x, y, 'torpedo', time, sub);
  return true;
}

export function fireDepthCharge(weapons, sub, noise = null, time = 0) {
  if (sub.depthChargeCooldown > 0 || !sub.alive) return false;
  sub.depthChargeCooldown = 3.5;

  const x = sub.x;
  const y = sub.y + 10;

  weapons.projectiles.push({
    type: 'depthcharge',
    x,
    y,
    vx: sub.vx * 0.3,
    vy: 2,
    owner: sub,
    depth: sub.y,
    life: 8,
    armed: false,
    armTimer: 0.4,
    noisy: true,
  });

  if (noise) emitNoise(noise, x, y, 'depthcharge', time, sub);
  return true;
}

export function fireMissile(weapons, sub, noise = null, time = 0) {
  if (sub.missileCooldown > 0 || !sub.alive) return false;
  sub.missileCooldown = 4;

  const x = sub.x;
  const y = sub.y - 16;

  weapons.projectiles.push({
    type: 'missile',
    x,
    y,
    vx: sub.facing * 0.6,
    vy: -5,
    owner: sub,
    depth: sub.y,
    life: 10,
    phase: 'rise',
    facing: sub.facing,
    noisy: true,
  });

  if (noise) emitNoise(noise, x, y, 'missile', time, sub);
  return true;
}

function isBelowLaunch(sub, launchDepth) {
  return sub.y >= launchDepth - 25;
}

function isAboveLaunch(sub, launchDepth) {
  return sub.y < launchDepth - 10;
}

function applyBlastDamage(subs, x, y, radius, owner, filterFn, damage = 40) {
  let hit = false;
  for (const sub of subs) {
    if (!sub.alive || sub === owner) continue;
    if (dist(x, y, sub.x, sub.y) < radius && filterFn(sub)) {
      damageSub(sub, damage);
      hit = true;
    }
  }
  return hit;
}

export function updateWeapons(weapons, subs, segments, dt, noise = null, time = 0) {
  const remaining = [];

  for (const p of weapons.projectiles) {
    p.life -= dt;

    if (p.type === 'torpedo') {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      if (p.noisy && noise && Math.random() < 0.08) {
        emitNoise(noise, p.x, p.y, 'torpedo', time, p.owner);
      }

      const hit = raycastTerrain(segments, p.x, p.y, p.vx, p.vy, 8);
      if (hit && hit.dist < 6) {
        addExplosion(weapons, p.x, p.y, 30, 15, noise, time, p.owner);
        continue;
      }
    } else if (p.type === 'depthcharge') {
      p.armTimer -= dt;
      if (p.armTimer <= 0) p.armed = true;
      p.vy = Math.min(p.vy + 0.18 * dt * 60, 6.5);
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      if (p.noisy && p.armed && noise && Math.random() < 0.06) {
        emitNoise(noise, p.x, p.y, 'depthcharge', time, p.owner);
      }

      if (p.armed) {
        const proximityHit = applyBlastDamage(
          subs, p.x, p.y, 85, p.owner,
          (sub) => isBelowLaunch(sub, p.depth),
        );
        if (proximityHit || p.y > 1480) {
          applyBlastDamage(
            subs, p.x, p.y, 90, p.owner,
            (sub) => isBelowLaunch(sub, p.depth),
          );
          addExplosion(weapons, p.x, p.y, 55, 25, noise, time, p.owner);
          continue;
        }
      }
    } else if (p.type === 'missile') {
      if (p.phase === 'rise') {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        if (p.y < 240) {
          p.phase = 'attack';
          p.vy = 4.5;
          p.vx = 0;
        }
      } else {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
      }

      if (p.noisy && noise && Math.random() < 0.07) {
        emitNoise(noise, p.x, p.y, 'missile', time, p.owner);
      }
    }

    if (p.life <= 0) continue;

    let hitSub = false;
    for (const sub of subs) {
      if (!sub.alive || sub === p.owner) continue;

      const d = dist(p.x, p.y, sub.x, sub.y);

      if (p.type === 'torpedo' && d < 32 && Math.abs(sub.y - p.depth) < DEPTH_TOLERANCE) {
        damageSub(sub, 40);
        addExplosion(weapons, p.x, p.y, 40, 20, noise, time, p.owner);
        hitSub = true;
        break;
      }

      if (p.type === 'missile' && p.phase === 'attack' && dist(p.x, p.y, sub.x, sub.y) < 60 && isAboveLaunch(sub, p.depth)) {
        damageSub(sub, 45);
        addExplosion(weapons, p.x, p.y, 45, 22, noise, time, p.owner);
        hitSub = true;
        break;
      }
    }

    if (!hitSub) remaining.push(p);
  }

  weapons.projectiles = remaining;

  weapons.explosions = weapons.explosions.filter((e) => {
    e.life -= dt;
    e.radius = e.maxRadius * (1 - e.life / e.maxLife);
    return e.life > 0;
  });
}

function addExplosion(weapons, x, y, maxRadius, damage, noise = null, time = 0, owner = null) {
  weapons.explosions.push({
    x,
    y,
    radius: 4,
    maxRadius,
    life: 0.6,
    maxLife: 0.6,
    damage,
  });
  if (noise) emitNoise(noise, x, y, 'explosion', time, owner);
}