export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

export function reflect(dx, dy, nx, ny) {
  const dot = dx * nx + dy * ny;
  return { x: dx - 2 * dot * nx, y: dy - 2 * dot * ny };
}

export function segmentIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-9) return null;

  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;

  if (t < 0 || t > 1 || u < 0) return null;

  return {
    x: ax + t * (bx - ax),
    y: ay + t * (by - ay),
    t,
    u,
    nx: -(dy - cy),
    ny: dx - cx,
  };
}

export function raycastSegment(ox, oy, dx, dy, ax, ay, bx, by) {
  const denom = (bx - ax) * dy - (by - ay) * dx;
  if (Math.abs(denom) < 1e-9) return null;

  const t = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  const u = ((ax - ox) * (by - ay) - (ay - oy) * (bx - ax)) / denom;

  if (t < 0 || t > 1 || u < 0) return null;

  const hitX = ax + t * (bx - ax);
  const hitY = ay + t * (by - ay);
  const segDx = bx - ax;
  const segDy = by - ay;
  const len = Math.hypot(segDx, segDy) || 1;

  return {
    x: hitX,
    y: hitY,
    dist: u,
    nx: -segDy / len,
    ny: segDx / len,
    segIndex: -1,
  };
}

export function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  return dist(cx, cy, closestX, closestY) < r;
}