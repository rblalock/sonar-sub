import { raycastSegment } from './utils.js';

export const WORLD = {
  width: 2800,
  height: 1600,
  crushDepth: 0.88,
  surfaceY: 80,
  floorY: 1520,
};

// Jagged cave terrain matching the Squidi sonar1 illustration
export function createTerrain() {
  const segments = [];

  const addSeg = (x1, y1, x2, y2) => {
    segments.push({ x1, y1, x2, y2 });
  };

  // Ceiling — jagged mountain silhouette
  addSeg(0, 60, 120, 60);
  addSeg(120, 60, 180, 140);
  addSeg(180, 140, 320, 90);
  addSeg(320, 90, 480, 170);
  addSeg(480, 170, 620, 100);
  addSeg(620, 100, 780, 155);
  addSeg(780, 155, 940, 80);
  addSeg(940, 80, 1100, 130);
  addSeg(1100, 130, 1280, 70);
  addSeg(1280, 70, 1460, 160);
  addSeg(1460, 160, 1620, 95);
  addSeg(1620, 95, 1800, 145);
  addSeg(1800, 145, 1980, 75);
  addSeg(1980, 75, 2160, 120);
  addSeg(2160, 120, 2340, 85);
  addSeg(2340, 85, 2520, 150);
  addSeg(2520, 150, 2680, 90);
  addSeg(2680, 90, 2800, 110);

  // Floor — stepped ledges
  addSeg(0, 1540, 200, 1540);
  addSeg(200, 1540, 340, 1480);
  addSeg(340, 1480, 520, 1480);
  addSeg(520, 1480, 680, 1530);
  addSeg(680, 1530, 900, 1530);
  addSeg(900, 1530, 1040, 1460);
  addSeg(1040, 1460, 1280, 1460);
  addSeg(1280, 1460, 1420, 1510);
  addSeg(1420, 1510, 1680, 1510);
  addSeg(1680, 1510, 1820, 1440);
  addSeg(1820, 1440, 2060, 1440);
  addSeg(2060, 1440, 2200, 1520);
  addSeg(2200, 1520, 2440, 1520);
  addSeg(2440, 1520, 2580, 1470);
  addSeg(2580, 1470, 2800, 1470);

  // Left wall partial
  addSeg(0, 60, 0, 200);

  // Interior spikes / obstacles (jagged edges hard to see with sonar)
  addSeg(600, 400, 640, 520);
  addSeg(640, 520, 700, 380);
  addSeg(700, 380, 760, 500);

  addSeg(1200, 600, 1240, 720);
  addSeg(1240, 720, 1300, 580);
  addSeg(1300, 580, 1360, 700);

  addSeg(1900, 450, 1940, 570);
  addSeg(1940, 570, 2000, 430);
  addSeg(2000, 430, 2060, 550);

  addSeg(800, 1100, 840, 1220);
  addSeg(840, 1220, 900, 1080);
  addSeg(900, 1080, 960, 1200);

  addSeg(1600, 1000, 1640, 1120);
  addSeg(1640, 1120, 1700, 980);
  addSeg(1700, 980, 1760, 1100);

  // Hanging stalactites from ceiling
  addSeg(400, 170, 420, 280);
  addSeg(420, 280, 450, 170);
  addSeg(1000, 130, 1020, 250);
  addSeg(1020, 250, 1050, 130);
  addSeg(1700, 145, 1720, 270);
  addSeg(1720, 270, 1750, 145);
  addSeg(2300, 85, 2320, 210);
  addSeg(2320, 210, 2350, 85);

  return segments;
}

export function raycastTerrain(segments, ox, oy, dx, dy, maxDist = Infinity) {
  let closest = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const hit = raycastSegment(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2);
    if (hit && hit.dist < maxDist && (!closest || hit.dist < closest.dist)) {
      closest = { ...hit, segIndex: i, seg };
    }
  }

  return closest;
}

export function getVisibleSegments(segments, ox, oy, radius, rayCount = 72) {
  const visible = new Set();
  const step = (Math.PI * 2) / rayCount;

  for (let i = 0; i < rayCount; i++) {
    const angle = i * step;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = raycastTerrain(segments, ox, oy, dx, dy, radius);
    if (hit) visible.add(hit.segIndex);
  }

  return [...visible].map((i) => segments[i]);
}

export function checkSubTerrainCollision(sub, segments) {
  const hw = sub.width / 2;
  const hh = sub.height / 2;
  const corners = [
    [sub.x - hw, sub.y - hh],
    [sub.x + hw, sub.y - hh],
    [sub.x + hw, sub.y + hh],
    [sub.x - hw, sub.y + hh],
  ];

  for (const seg of segments) {
    for (const [cx, cy] of corners) {
      const d = pointToSegmentDist(cx, cy, seg.x1, seg.y1, seg.x2, seg.y2);
      if (d < 4) return { hit: true, seg };
    }
  }

  if (sub.y - hh < WORLD.surfaceY) return { hit: true, type: 'surface' };
  if (sub.y + hh > WORLD.floorY) return { hit: true, type: 'floor' };

  return { hit: false };
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function depthMeters(y) {
  return Math.round((y - WORLD.surfaceY) / 8);
}

export function isCrushDepth(y) {
  const depthRatio = (y - WORLD.surfaceY) / (WORLD.floorY - WORLD.surfaceY);
  return depthRatio > WORLD.crushDepth;
}