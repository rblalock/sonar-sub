import { getPassiveVisibleSegments, getEchoSegments } from './sonar.js';
import { getSonarRadius } from './submarine.js';
import { depthMeters, WORLD, isCrushDepth } from './world.js';
import { getLatestContact, formatContact, bearingFrom } from './contacts.js';
import { dist } from './utils.js';

const CYAN = '#5ce1ff';
const CYAN_DIM = 'rgba(92, 225, 255, 0.35)';
const CYAN_FAINT = 'rgba(92, 225, 255, 0.12)';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.camera = { x: 0, y: 0 };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setCamera(sub) {
    this.camera.x = sub.x - this.width / 2;
    this.camera.y = sub.y - this.height / 2;
    this.camera.x = Math.max(0, Math.min(WORLD.width - this.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(WORLD.height - this.height, this.camera.y));
  }

  toScreen(x, y) {
    return { x: x - this.camera.x, y: y - this.camera.y };
  }

  clear() {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawColoredSegment(x1, y1, x2, y2, alpha, rgb, glow = false) {
    const s1 = this.toScreen(x1, y1);
    const s2 = this.toScreen(x2, y2);
    this.ctx.save();
    if (glow) {
      this.ctx.shadowColor = `rgb(${rgb})`;
      this.ctx.shadowBlur = 4 * alpha;
    }
    this.ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(s1.x, s1.y);
    this.ctx.lineTo(s2.x, s2.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSegment(x1, y1, x2, y2, alpha = 1, glow = true) {
    const s1 = this.toScreen(x1, y1);
    const s2 = this.toScreen(x2, y2);

    this.ctx.save();
    if (glow) {
      this.ctx.shadowColor = CYAN;
      this.ctx.shadowBlur = 6 * alpha;
    }
    this.ctx.strokeStyle = `rgba(92, 225, 255, ${alpha})`;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(s1.x, s1.y);
    this.ctx.lineTo(s2.x, s2.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawWorld(game, viewer) {
    const { segments, sonar, time } = game;
    const passiveSegs = getPassiveVisibleSegments(segments, viewer, time);
    const echoSegs = getEchoSegments(sonar, viewer);
    const visibleIndices = new Set();

    for (const seg of passiveSegs) {
      if (seg.segIndex !== undefined) visibleIndices.add(seg.segIndex);
    }

    // Draw echo-illuminated terrain segments
    for (const echo of sonar.echoes) {
      if (echo.intensity < 0.1) continue;
      const nearby = findNearbySegments(segments, echo.x, echo.y, 40);
      for (const idx of nearby) {
        visibleIndices.add(idx);
      }
    }

    // Draw visible terrain
    const bubbleRadius = getSonarRadius(viewer, time);

    for (const idx of visibleIndices) {
      const seg = segments[idx];
      const echoIntensity = getEchoIntensityAt(sonar, seg);
      let alpha = Math.max(0.35, echoIntensity);

      if (bubbleRadius > 0) {
        const mx = (seg.x1 + seg.x2) / 2;
        const my = (seg.y1 + seg.y2) / 2;
        const d = Math.hypot(mx - viewer.x, my - viewer.y);
        if (d < bubbleRadius) alpha = Math.max(alpha, 0.85 * (1 - d / bubbleRadius));
      }

      this.drawSegment(seg.x1, seg.y1, seg.x2, seg.y2, alpha);
    }

    // Draw echo blips as short horizontal lines (per Squidi sonar2)
    for (const es of echoSegs) {
      this.drawSegment(es.x1, es.y1, es.x2, es.y2, es.intensity * 0.9, true);
    }

    // Passive sonar bubble ring
    const radius = getSonarRadius(viewer, time);
    if (radius > 0) {
      const s = this.toScreen(viewer.x, viewer.y);
      this.ctx.save();
      this.ctx.strokeStyle = CYAN_FAINT;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Active ping trails (fading path) — own pings bright, enemy pings faint orange
    for (const ping of sonar.activePings) {
      const isOwn = ping.owner === viewer;
      const trail = ping.trail;
      for (let i = 1; i < trail.length; i++) {
        const age = (time - trail[i].time) / 1000;
        const alpha = Math.max(0, (isOwn ? 0.8 : 0.35) - age * 2);
        if (alpha <= 0) continue;
        if (isOwn) {
          this.drawSegment(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y, alpha, false);
        } else {
          this.drawColoredSegment(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y, alpha, '255, 140, 80');
        }
      }

      const ps = this.toScreen(ping.x, ping.y);
      this.ctx.save();
      this.ctx.fillStyle = isOwn ? CYAN : 'rgba(255, 140, 80, 0.7)';
      this.ctx.shadowColor = isOwn ? CYAN : '#ff8c50';
      this.ctx.shadowBlur = isOwn ? 8 : 5;
      this.ctx.beginPath();
      this.ctx.arc(ps.x, ps.y, isOwn ? 3 : 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // Aim line from sub to mouse
    if (game.aimAngle !== null && viewer.alive) {
      const len = 120;
      const ax = viewer.x + Math.cos(game.aimAngle) * len;
      const ay = viewer.y + Math.sin(game.aimAngle) * len;
      this.drawSegment(viewer.x, viewer.y, ax, ay, 0.4, false);
    }
  }

  drawSubmarine(sub, isEnemy = false, alpha = 1) {
    if (!sub.alive) return;

    const s = this.toScreen(sub.x, sub.y);
    const w = sub.width;
    const h = sub.height;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.shadowColor = CYAN;
    this.ctx.shadowBlur = isEnemy ? 10 : 16;
    this.ctx.fillStyle = isEnemy ? 'rgba(255, 120, 80, 0.9)' : CYAN;
    this.ctx.strokeStyle = CYAN;
    this.ctx.lineWidth = 1;

    // Hull
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, w / 2, h / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Conning tower
    const towerX = s.x + sub.facing * 4;
    this.ctx.fillRect(towerX - 3, s.y - h / 2 - 6, 6, 8);

    // Tail fin
    this.ctx.beginPath();
    const tailX = s.x - sub.facing * (w / 2 - 2);
    this.ctx.moveTo(tailX, s.y);
    this.ctx.lineTo(tailX - sub.facing * 8, s.y - 5);
    this.ctx.lineTo(tailX - sub.facing * 8, s.y + 5);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  drawContacts(contacts, time) {
    for (const blip of contacts.blips) {
      const s = this.toScreen(blip.x, blip.y);
      const size = 10 + 8 * blip.intensity;

      this.ctx.save();
      const isNoise = blip.source === 'noise';
      this.ctx.strokeStyle = isNoise
        ? `rgba(255, 200, 80, ${blip.intensity * 0.6})`
        : `rgba(255, 120, 80, ${blip.intensity * 0.9})`;
      this.ctx.shadowColor = '#ff7840';
      this.ctx.shadowBlur = 12 * blip.intensity;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - size, s.y);
      this.ctx.lineTo(s.x + size, s.y);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, size * 0.6, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawProjectiles(weapons) {
    for (const p of weapons.projectiles) {
      const s = this.toScreen(p.x, p.y);
      this.ctx.save();
      this.ctx.shadowColor = CYAN;
      this.ctx.shadowBlur = 4;

      if (p.type === 'torpedo') {
        this.ctx.fillStyle = CYAN_DIM;
        this.ctx.fillRect(s.x - 8, s.y - 2, 16, 4);
      } else if (p.type === 'depthcharge') {
        this.ctx.fillStyle = 'rgba(255, 200, 80, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
      } else if (p.type === 'missile') {
        this.ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
        this.ctx.fillRect(s.x - 2, s.y - 6, 4, 12);
      }

      this.ctx.restore();
    }

    for (const e of weapons.explosions) {
      const s = this.toScreen(e.x, e.y);
      this.ctx.save();
      this.ctx.strokeStyle = `rgba(255, 120, 60, ${e.life / e.maxLife})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, e.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawMiniRadar(game, viewer) {
    const el = document.getElementById('mini-radar');
    if (!el) return;

    const w = el.clientWidth;
    const h = el.clientHeight;
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    el.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / WORLD.width;
    const scaleY = h / WORLD.height;

    ctx.strokeStyle = 'rgba(92, 225, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (const seg of game.segments) {
      ctx.beginPath();
      ctx.moveTo(seg.x1 * scaleX, seg.y1 * scaleY);
      ctx.lineTo(seg.x2 * scaleX, seg.y2 * scaleY);
      ctx.stroke();
    }

    // Player only — enemy is NOT shown unless contacted
    ctx.fillStyle = CYAN;
    ctx.fillRect(viewer.x * scaleX - 2, viewer.y * scaleY - 1, 4, 2);

    for (const blip of game.contacts.blips) {
      const alpha = blip.intensity * (blip.source === 'noise' ? 0.5 : 1);
      ctx.fillStyle = blip.source === 'noise'
        ? `rgba(255, 200, 80, ${alpha})`
        : `rgba(255, 120, 80, ${alpha})`;
      const size = blip.source === 'noise' ? 3 : 4;
      ctx.fillRect(blip.x * scaleX - size / 2, blip.y * scaleY - size / 2, size, size);
    }

    const vx = viewer.x * scaleX;
    const vy = viewer.y * scaleY;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(vx - 8, vy - 6, 16, 12);
  }

  updateHUD(viewer, contacts, enemy = null, aiState = null) {
    const hullBar = document.getElementById('hull-bar');
    const hullText = document.getElementById('hull-text');
    const depthText = document.getElementById('depth-text');
    const sonarText = document.getElementById('sonar-mode-text');
    const statusText = document.getElementById('status-text');
    const alertBox = document.getElementById('alert-box');

    if (!hullBar) return;

    const pct = (viewer.hull / viewer.maxHull) * 100;
    hullBar.style.width = `${pct}%`;
    hullBar.classList.toggle('damaged', pct < 40);
    hullText.textContent = `${Math.round(pct)}%`;
    depthText.textContent = `${depthMeters(viewer.y)}m`;

    let sonarLabel = 'OFF';
    if (viewer.silent) sonarLabel = 'SILENT RUNNING';
    else if (viewer.sonarMode === 'large') sonarLabel = 'BUBBLE (LARGE)';
    else if (viewer.sonarMode === 'small') sonarLabel = 'BUBBLE (SMALL)';
    else if (viewer.sonarMode === 'pulse') sonarLabel = 'BUBBLE (PULSE)';
    sonarText.textContent = sonarLabel;

    let status = viewer.alive ? (isCrushDepth(viewer.y) ? 'CRUSH DEPTH' : 'ACTIVE') : 'DESTROYED';
    if (viewer.alive && aiState && enemy?.alive) {
      status += ` · ENEMY ${aiState.toUpperCase()}`;
    }
    statusText.textContent = status;
    statusText.style.color = isCrushDepth(viewer.y) ? '#ff6b4a' : '';

    const contactRow = document.getElementById('contact-row');
    const contactText = document.getElementById('contact-text');
    const latest = contacts ? getLatestContact(contacts) : null;
    if (contactRow && contactText) {
      if (latest) {
        contactRow.classList.remove('hidden');
        contactText.style.color = '';
        contactText.textContent = formatContact(viewer, latest, performance.now());
      } else if (enemy?.alive) {
        contactRow.classList.remove('hidden');
        const bearing = bearingFrom(viewer, enemy);
        const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const sector = sectors[Math.round(bearing / 45) % 8];
        contactText.textContent = `stale intel — search ${sector}`;
        contactText.style.color = 'var(--cyan-dim)';
      } else {
        contactRow.classList.add('hidden');
      }
    }

    if (viewer.pingAlert > 0) {
      alertBox.classList.remove('hidden');
    } else {
      alertBox.classList.add('hidden');
    }
  }
}

function findNearbySegments(segments, x, y, range) {
  const result = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const d = pointToSegmentDist(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (d < range) result.push(i);
  }
  return result;
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getEchoIntensityAt(sonar, seg) {
  let maxI = 0.15;
  const mx = (seg.x1 + seg.x2) / 2;
  const my = (seg.y1 + seg.y2) / 2;

  for (const echo of sonar.echoes) {
    const d = Math.hypot(echo.x - mx, echo.y - my);
    if (d < 60) maxI = Math.max(maxI, echo.intensity);
  }

  return maxI;
}