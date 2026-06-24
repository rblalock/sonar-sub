import { dist } from './utils.js';

export function createContactSystem() {
  return {
    blips: [],
  };
}

export function addContact(contacts, x, y, time, source = 'ping') {
  contacts.blips.push({
    x,
    y,
    born: time,
    life: 14,
    source,
    intensity: 1,
  });

  // Keep only recent contacts
  if (contacts.blips.length > 8) {
    contacts.blips.shift();
  }
}

export function updateContacts(contacts, time) {
  contacts.blips = contacts.blips.filter((b) => {
    const age = (time - b.born) / 1000;
    b.intensity = Math.max(0, 1 - age / b.life);
    return b.intensity > 0.03;
  });
}

export function getLatestContact(contacts) {
  if (contacts.blips.length === 0) return null;
  return contacts.blips[contacts.blips.length - 1];
}

export function bearingFrom(viewer, target) {
  const angle = Math.atan2(target.y - viewer.y, target.x - viewer.x);
  const deg = ((angle * 180) / Math.PI + 360) % 360;
  return Math.round(deg);
}

export function formatContact(viewer, contact, time) {
  const age = Math.round((time - contact.born) / 1000);
  const range = Math.round(dist(viewer.x, viewer.y, contact.x, contact.y));
  const bearing = bearingFrom(viewer, contact);
  const tag = contact.source === 'noise' ? 'noise ' : '';
  return `${tag}bearing ${String(bearing).padStart(3, '0')}° · ${range}m · ${age}s ago`;
}

export function updateNoiseContact(contacts, listener, source, sourceRadius, time) {
  if (!source.alive || source.silent || sourceRadius <= 0) return;

  const range = dist(listener.x, listener.y, source.x, source.y);
  const hearRange = sourceRadius + 650;
  if (range > hearRange) return;

  const accuracy = 1 - range / hearRange;
  const jitter = (1 - accuracy) * 120 + 20;

  // Throttle noise updates
  const last = contacts.blips.find((b) => b.source === 'noise');
  if (last && time - last.born < 1200) return;

  addContact(
    contacts,
    source.x + (Math.random() - 0.5) * jitter,
    source.y + (Math.random() - 0.5) * jitter,
    time,
    'noise',
  );
}