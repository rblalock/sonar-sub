import { dist } from './utils.js';

export function createNoiseSystem() {
  return {
    events: [],
  };
}

const NOISE_PROFILES = {
  ping: { strength: 0.75, life: 2.5, range: 750 },
  torpedo: { strength: 0.85, life: 3.5, range: 900 },
  depthcharge: { strength: 0.8, life: 3, range: 850 },
  missile: { strength: 0.95, life: 4, range: 1000 },
  explosion: { strength: 1, life: 5, range: 1100 },
};

export function emitNoise(noise, x, y, type, time, owner = null) {
  const profile = NOISE_PROFILES[type] || { strength: 0.5, life: 2, range: 500 };
  noise.events.push({
    x,
    y,
    type,
    strength: profile.strength,
    range: profile.range,
    life: profile.life,
    born: time,
    owner,
  });

  if (noise.events.length > 16) noise.events.shift();
}

export function updateNoise(noise, time) {
  noise.events = noise.events.filter((e) => {
    const age = (time - e.born) / 1000;
    e.intensity = Math.max(0, 1 - age / e.life);
    return e.intensity > 0.03;
  });
}

export function hearNoise(noise, listener, sourceSub, time) {
  let best = null;

  for (const event of noise.events) {
    if (event.owner === listener) continue;
    if (sourceSub && event.owner && event.owner !== sourceSub) continue;

    const range = event.range * event.intensity;
    const d = dist(listener.x, listener.y, event.x, event.y);
    if (d > range) continue;

    const proximity = 1 - d / range;
    const confidence = event.strength * event.intensity * proximity * 0.85;
    if (!best || confidence > best.confidence) {
      const jitter = (1 - proximity) * 140 + 25;
      best = {
        confidence,
        x: event.x + (Math.random() - 0.5) * jitter,
        y: event.y + (Math.random() - 0.5) * jitter,
        source: event.type,
      };
    }
  }

  return best;
}