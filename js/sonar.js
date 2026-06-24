import { raycastTerrain } from './world.js';
import { reflect, dist } from './utils.js';
import { getSonarRadius, isSonarActive, alertPing } from './submarine.js';
import { emitNoise } from './noise.js';

export function createSonarSystem() {
  return {
    echoes: [],
    activePings: [],
    pingTrails: [],
  };
}

export function addEcho(sonar, x, y, source, hitSub = null) {
  sonar.echoes.push({
    x,
    y,
    source,
    hitSub,
    born: performance.now(),
    life: 4.5,
    intensity: 1,
  });
}

export function fireActivePing(sonar, sub, angle, segments, allSubs, noise = null, time = 0) {
  if (sub.pingCooldown > 0) return false;

  sub.pingCooldown = 1.2;

  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  if (noise) emitNoise(noise, sub.x, sub.y, 'ping', time, sub);

  sonar.activePings.push({
    x: sub.x + dx * 20,
    y: sub.y + dy * 20,
    dx,
    dy,
    speed: 900,
    bouncesLeft: 6,
    owner: sub,
    trail: [],
    born: performance.now(),
  });

  return true;
}

function checkSubHit(x, y, dx, dy, sub, maxDist) {
  const hw = sub.width / 2 + 2;
  const hh = sub.height / 2 + 2;

  const tValues = [];

  if (Math.abs(dx) > 1e-6) {
    for (const edge of [sub.x - hw, sub.x + hw]) {
      const t = (edge - x) / dx;
      if (t > 0 && t < maxDist) {
        const hy = y + dy * t;
        if (hy >= sub.y - hh && hy <= sub.y + hh) tValues.push(t);
      }
    }
  }

  if (Math.abs(dy) > 1e-6) {
    for (const edge of [sub.y - hh, sub.y + hh]) {
      const t = (edge - y) / dy;
      if (t > 0 && t < maxDist) {
        const hx = x + dx * t;
        if (hx >= sub.x - hw && hx <= sub.x + hw) tValues.push(t);
      }
    }
  }

  if (tValues.length === 0) return null;
  const t = Math.min(...tValues);
  return { x: x + dx * t, y: y + dy * t, dist: t };
}

export function updateSonar(sonar, subs, segments, dt, time, onSubHit = null) {
  // Fade echoes
  sonar.echoes = sonar.echoes.filter((e) => {
    const age = (time - e.born) / 1000;
    e.intensity = Math.max(0, 1 - age / e.life);
    return e.intensity > 0.02;
  });

  // Update active pings
  const remaining = [];

  for (const ping of sonar.activePings) {
    const step = ping.speed * dt;
    let px = ping.x;
    let py = ping.y;
    let dx = ping.dx;
    let dy = ping.dy;
    let traveled = 0;

    while (traveled < step && ping.bouncesLeft >= 0) {
      const remainingDist = step - traveled;

      const terrainHit = raycastTerrain(segments, px, py, dx, dy, remainingDist);
      let subHit = null;
      let subHitDist = remainingDist;

      for (const sub of subs) {
        if (!sub.alive || sub === ping.owner) continue;
        const hit = checkSubHit(px, py, dx, dy, sub, remainingDist);
        if (hit && hit.dist < subHitDist) {
          subHit = { sub, ...hit };
          subHitDist = hit.dist;
        }
      }

      let hitDist = remainingDist;
      let hitType = null;
      let hitData = null;

      if (terrainHit && terrainHit.dist < hitDist) {
        hitDist = terrainHit.dist;
        hitType = 'terrain';
        hitData = terrainHit;
      }

      if (subHit && subHit.dist < hitDist) {
        hitDist = subHit.dist;
        hitType = 'sub';
        hitData = subHit;
      }

      const nx = px + dx * hitDist;
      const ny = py + dy * hitDist;
      ping.trail.push({ x: nx, y: ny, time });

      if (hitType === 'terrain') {
        addEcho(sonar, nx, ny, 'ping');
        px = nx;
        py = ny;
        const ref = reflect(dx, dy, hitData.nx, hitData.ny);
        dx = ref.x;
        dy = ref.y;
        ping.bouncesLeft--;
        traveled += hitDist;
      } else if (hitType === 'sub') {
        addEcho(sonar, nx, ny, 'ping', hitData.sub);
        alertPing(hitData.sub);
        if (onSubHit) onSubHit(ping.owner, hitData.sub, nx, ny);
        ping.bouncesLeft = -1;
        break;
      } else {
        px = nx;
        py = ny;
        traveled += hitDist;
      }
    }

    ping.x = px;
    ping.y = py;
    ping.dx = dx;
    ping.dy = dy;

    const age = (time - ping.born) / 1000;
    if (ping.bouncesLeft >= 0 && age < 3) {
      remaining.push(ping);
    }
  }

  sonar.activePings = remaining;
}

export function getPassiveVisibleSegments(segments, sub, time) {
  const radius = getSonarRadius(sub, time);
  if (radius <= 0) return [];

  const visible = new Set();
  const rayCount = 64;
  const step = (Math.PI * 2) / rayCount;

  for (let i = 0; i < rayCount; i++) {
    const angle = i * step;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = raycastTerrain(segments, sub.x, sub.y, dx, dy, radius);
    if (hit) visible.add(hit.segIndex);
  }

  return [...visible].map((i) => ({ ...segments[i], segIndex: i }));
}

export function getEnemyBubbleSegments(segments, sub, time) {
  if (sub.silent) return [];
  return getPassiveVisibleSegments(segments, sub, time);
}

export function getVisibleEnemySubs(viewer, subs, segments, sonar, time) {
  const visible = [];

  for (const sub of subs) {
    if (!sub.alive || sub === viewer) continue;

    // Passive bubble reveals enemy if they're not silent
    if (isSonarActive(sub, time)) {
      const radius = getSonarRadius(sub, time);
      if (dist(viewer.x, viewer.y, sub.x, sub.y) < radius + 200) {
        visible.push({ sub, type: 'bubble' });
        continue;
      }
    }

    // Echoes that hit this sub
    for (const echo of sonar.echoes) {
      if (echo.hitSub === sub && echo.intensity > 0.15) {
        visible.push({ sub, type: 'echo', echo });
        break;
      }
    }
  }

  return visible;
}

export function getEchoSegments(sonar, viewer) {
  const segs = [];

  for (const echo of sonar.echoes) {
    if (echo.intensity < 0.05) continue;
    if (echo.source === 'bubble' && echo.owner && echo.owner !== viewer) continue;

    const size = 12 * echo.intensity;
    segs.push({
      x1: echo.x - size,
      y1: echo.y,
      x2: echo.x + size,
      y2: echo.y,
      intensity: echo.intensity,
      isEcho: true,
    });
  }

  return segs;
}