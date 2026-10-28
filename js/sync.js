// Sync between phones, end to end encrypted.
//
// The sync code (16 random bytes, shown as 26 letters and digits) never leaves the phone.
// From it we derive two things with HKDF: the address of the copy on the server, and an AES-GCM key.
// The server only ever sees the address and a sealed blob; without the code it can read neither.

import { db } from './store.js';
import { API_BASE } from './config.js';

const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const te = new TextEncoder();
const td = new TextDecoder();

export const syncSupported = () => !!(window.isSecureContext && window.crypto && crypto.subtle && API_BASE);

function toB32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += ABC[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += ABC[(val << (5 - bits)) & 31];
  return out;
}
function fromB32(str) {
  const clean = str.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    const i = ABC.indexOf(ch);
    if (i < 0) throw new Error('bad code');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export const formatCode = c => c.match(/.{1,4}/g).join('-');
export function newCode() { return formatCode(toB32(crypto.getRandomValues(new Uint8Array(16)))); }
export function validCode(c) { try { return fromB32(c).length === 16; } catch (e) { return false; } }

async function deriveKeys(code) {
  const raw = fromB32(code);
  if (raw.length !== 16) throw new Error('bad code');
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = te.encode('kupon-sync-v1');
  const idBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('id') }, base, 256);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('enc') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id: [...new Uint8Array(idBits)].map(b => b.toString(16).padStart(2, '0')).join(''), key };
}

const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// [version 1][gzip flag][12-byte iv][ciphertext]
async function seal(obj, key) {
  let data = te.encode(JSON.stringify(obj));
  const gz = typeof CompressionStream === 'function';
  if (gz) data = await pipe(data, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(2 + 12 + ct.length);
  out.set([1, gz ? 1 : 0]); out.set(iv, 2); out.set(ct, 14);
  return b64(out);
}
async function open(blob, key) {
  const all = unb64(blob);
  if (all[0] !== 1) throw new Error('version');
  let data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(2, 14) }, key, all.subarray(14)));
  if (all[1]) data = await pipe(data, new DecompressionStream('gzip'));
  return JSON.parse(td.decode(data));
}

// Two copies become one: the newest version of each receipt and store wins, deletions stick.
const stamp = r => r.updatedAt || r.addedAt || '';
export function merge(a, b) {
  const deleted = { ...(a.deleted || {}) };
  for (const [k, v] of Object.entries(b.deleted || {})) if (!deleted[k] || v > deleted[k]) deleted[k] = v;
  const byId = new Map();
  for (const r of [...(a.receipts || []), ...(b.receipts || [])]) {
    const cur = byId.get(r.iic);
    if (!cur || stamp(r) > stamp(cur)) byId.set(r.iic, r);
  }
  const receipts = [...byId.values()].filter(r => !(deleted[r.iic] && deleted[r.iic] >= stamp(r)));
  const stores = { ...(a.stores || {}) };
  for (const [tin, s] of Object.entries(b.stores || {})) if (!stores[tin] || (s.at || '') > (stores[tin].at || '')) stores[tin] = s;
  const newerPrefs = (b.prefsAt || '') > (a.prefsAt || '');
  return { receipts, stores, deleted, prefs: newerPrefs ? b.prefs || {} : a.prefs || {}, prefsAt: newerPrefs ? b.prefsAt : a.prefsAt || '' };
}

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { ...opts, headers: { 'content-type': 'application/json' }, credentials: 'omit' });
  return res;
}

let running = null;
// Fetch, merge, store, push. Returns { ok, error }. Safe to call often; runs one at a time.
export function syncNow() {
  if (running) return running;
  running = (async () => {
    const st = db.pref('sync');
    if (!st || !st.code || db.demo) return { ok: false, error: 'off' };
    if (!navigator.onLine) return { ok: false, error: 'offline' };
    try {
      const { id, key } = await deriveKeys(st.code);
      for (let attempt = 0; attempt < 3; attempt++) {
        const got = await api('/v1/sync/' + id);
        let rev = 0, remote = null;
        if (got.ok) { const j = await got.json(); rev = j.rev; remote = await open(j.blob, key); }
        else if (got.status !== 404) return { ok: false, error: 'http_' + got.status };
        const merged = remote ? merge(db.snapshot(), remote) : db.snapshot();
        db.applySync(merged);
        const put = await api('/v1/sync/' + id, { method: 'PUT', body: JSON.stringify({ rev, blob: await seal(merged, key) }) });
        if (put.status === 409) continue; // another phone wrote first: merge again
        if (!put.ok) return { ok: false, error: 'http_' + put.status };
        const { rev: newRev } = await put.json();
        db.setPref('sync', { ...db.pref('sync'), rev: newRev, at: new Date().toISOString(), error: null });
        return { ok: true };
      }
      return { ok: false, error: 'conflict' };
    } catch (err) {
      const error = err && err.name === 'OperationError' ? 'wrong_code' : 'network';
      db.setPref('sync', { ...db.pref('sync'), error });
      return { ok: false, error };
    }
  })().finally(() => { running = null; });
  return running;
}

// Join an existing copy (a code from the other phone) or start a new one.
export async function enable(code) {
  if (code) {
    // Joining: the copy must already exist, so a typo can't start a second, empty one.
    try {
      const { id } = await deriveKeys(code);
      const res = await api('/v1/sync/' + id);
      if (res.status === 404) return { ok: false, error: 'not_found' };
      if (!res.ok) return { ok: false, error: 'http_' + res.status };
    } catch (err) { return { ok: false, error: 'network' }; }
  }
  db.setPref('sync', { code: code ? formatCode(toB32(fromB32(code))) : newCode(), rev: 0, at: null, error: null });
  const res = await syncNow();
  if (!res.ok && code) db.setPref('sync', null); // a code that doesn't work doesn't stick
  return res;
}
export function disable() { db.setPref('sync', null); }

// Changes sync by themselves a few seconds later, and on coming back online or to the app.
let timer;
export function startAutoSync(onDone) {
  const kick = delay => {
    clearTimeout(timer);
    timer = setTimeout(async () => { if (db.pref('sync')) { const r = await syncNow(); onDone && onDone(r); } }, delay);
  };
  db.onChange(() => kick(4000));
  window.addEventListener('online', () => kick(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(500); });
  kick(1500);
}
