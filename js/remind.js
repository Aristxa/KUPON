// Reminders: the texts stay on the phone (IndexedDB, where the service worker can read them).
// The server gets the push address and the dates only, and wakes the phone on those mornings.

import { db } from './store.js';
import { API_BASE } from './config.js';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kupon', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function idbSet(key, value) {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export const pushSupported = () => !!(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
// iPhones deliver web push only to apps added to the home screen.
export const needsInstall = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);

const b64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const post = (path, body) => fetch(API_BASE + path, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function registration() {
  return navigator.serviceWorker.getRegistration().then(r => r || navigator.serviceWorker.register('sw.js')).then(() => navigator.serviceWorker.ready);
}

// Ask permission, subscribe, then send the dates. `build` returns [{ id, date, title, body, url }].
export async function enableReminders(build, lang) {
  if (!pushSupported()) return { ok: false, error: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'denied' };
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await (await fetch(API_BASE + '/v1/push/key', { credentials: 'omit' })).json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    }
    db.setPref('remind', { on: true, sent: '' });
    return await syncReminders(build, lang, true);
  } catch (err) {
    return { ok: false, error: 'network' };
  }
}

// Keep the phone's texts and the server's dates up to date; only talks to the server when dates change.
export async function syncReminders(build, lang, force = false) {
  const st = db.pref('remind');
  if (!st || !pushSupported()) return { ok: false, error: 'off' };
  const list = build();
  await idbSet('reminders', list);
  await idbSet('lang', lang);
  const dates = [...new Set(list.map(r => r.date))].sort();
  const sig = JSON.stringify(dates);
  if (!force && sig === st.sent) return { ok: true, count: list.length };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return { ok: false, error: 'no_subscription' };
  try {
    const res = await post('/v1/push/subscribe', { subscription: sub.toJSON(), dates });
    if (!res.ok) return { ok: false, error: 'network' };
    db.setPref('remind', { ...db.pref('remind'), sent: sig });
    return { ok: true, count: list.length };
  } catch (e) { return { ok: false, error: 'network' }; }
}

export async function disableReminders() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) { await post('/v1/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) {}
  db.setPref('remind', null);
  await idbSet('reminders', []).catch(() => {});
}
