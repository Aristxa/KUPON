// All data lives in this browser's localStorage. Nothing is sent anywhere.

const KEY = 'kupon.v1';

export const CATEGORIES = ['groceries', 'cafe', 'fuel', 'transport', 'home', 'pharmacy', 'care', 'clothing', 'electronics', 'other'];

// Store-name hints for Albania. Lowercase, matched as substrings.
const HINTS = {
  groceries: ['conad', 'spar', 'carrefour', 'big market', 'bigmarket', 'euromax', 'market', 'supermarket', 'minimarket', 'ushqim', 'mish', 'furr', 'fruta', 'perime', 'lidl', 'mega', 'viva', 'agro', 'bulmet'],
  cafe: ['bar', 'mulliri', 'kafe', 'cafe', 'caffe', 'coffee', 'restorant', 'restaurant', 'pizz', 'fast food', 'fastfood', 'byrek', 'pastiçeri', 'pasticeri', 'ëmbëltore', 'embeltore', 'grill', 'burger', 'sushi', 'lounge', 'bistro', 'taverna'],
  fuel: ['kastrati', 'eni', 'gulf', 'kurum', 'taçi oil', 'taci oil', 'petrol', 'karburant', 'oil', 'gas', 'benzin', 'shell', 'alpet', 'vega'],
  pharmacy: ['farmaci', 'pharma', 'barnatore', 'optik'],
  clothing: ['zara', 'bershka', 'pull', 'stradivarius', 'mango', 'lc waikiki', 'waikiki', 'h&m', 'defacto', 'koton', 'nike', 'adidas', 'veshje', 'kepuc', 'moda', 'fashion', 'shoes', 'intimissimi', 'calzedonia'],
  transport: ['taksi', 'taxi', 'uber', 'bolt', 'autobus', 'bus', 'tren', 'parking', 'parkim', 'furgon', 'biletë', 'bilete'],
  home: ['qera', 'qeraja', 'qira', 'qiraja', 'rent', 'drita', 'oshee', 'ujë', 'ujesjelles', 'ujësjellës', 'ukt', 'fatura', 'internet', 'telefon', 'mirëmbajtje', 'pallati'],
  care: ['berber', 'sallon', 'parukeri', 'barber', 'estetik', 'manikyr', 'kozmetik', 'palestër', 'palester', 'gym', 'fitness'],
  electronics: ['neptun', 'euronics', 'shpresa', 'globe', 'elektronik', 'electronic', 'apple', 'samsung', 'xiaomi', 'mobile', 'celular', 'kompjuter', 'computer', 'teknologji', 'tech', 'vodafone', 'one albania'],
};

export function suggestCategory(name) {
  const n = ' ' + String(name || '').toLowerCase() + ' ';
  if (n.trim() === '') return 'other';
  for (const cat of CATEGORIES) {
    for (const h of HINTS[cat] || []) {
      // short hints ("bar", "eni", "oil") must be whole words
      if (h.length <= 4 ? new RegExp(`[^a-zëç]${h}[^a-zëç]`).test(n) : n.includes(h)) return cat;
    }
  }
  return 'other';
}

function empty() { return { v: 1, receipts: [], stores: {}, prefs: {}, deleted: {} }; }

// Prefs that follow the user to another phone through sync; the rest stay on this one.
export const SYNCED_PREFS = ['limit', 'budgets', 'recurring', 'shopping'];
const listeners = new Set();
let quiet = false;
const now = () => new Date().toISOString();

let persistent = true;
let state = load();
let saved = null; // real state, kept aside while demo mode is on

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { ...empty(), ...s };
  } catch (e) {
    persistent = false;
    return empty();
  }
}

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); persistent = true; }
  catch (e) { persistent = false; }
}
function save() { // demo data is never written
  if (saved) return;
  write(state);
  if (!quiet) listeners.forEach(fn => fn());
}

export const db = {
  get persistent() { return persistent; },
  get demo() { return !!saved; },

  // Sample data for looking around. In memory only, never saved.
  startDemo(sample) {
    if (!saved) saved = state;
    state = { ...empty(), receipts: sample.receipts, stores: sample.stores, prefs: saved.prefs };
  },
  endDemo() { if (saved) { state = saved; saved = null; } },
  get receipts() { return state.receipts; },
  get stores() { return state.stores; },
  pref(k) { return state.prefs[k]; },
  setPref(k, v) { // demo shares the real prefs object
    state.prefs[k] = v;
    if (SYNCED_PREFS.includes(k)) state.prefs.prefsAt = now();
    write(saved || state);
    if (!saved && SYNCED_PREFS.includes(k) && !quiet) listeners.forEach(fn => fn());
  },
  onChange(fn) { listeners.add(fn); },

  find(iic) { return state.receipts.find(r => r.iic === iic); },

  storeName(tin) { return (state.stores[tin] && state.stores[tin].name) || ''; },
  storeCat(tin) { return (state.stores[tin] && state.stores[tin].cat) || ''; },

  // Remember a name/category for this NIPT and apply it to its receipts.
  setStore(tin, name, cat) {
    const prev = state.stores[tin] || {};
    state.stores[tin] = { name: name != null ? name : prev.name || '', cat: cat || prev.cat || '', at: now() };
    save();
  },

  add(r) {
    if (this.find(r.iic)) return false;
    state.receipts.push({ addedAt: now(), ...r, updatedAt: now() });
    save();
    return true;
  },

  update(iic, patch) {
    const r = this.find(iic);
    if (!r) return;
    Object.assign(r, patch, { updatedAt: now() });
    save();
  },

  remove(iic) {
    state.receipts = state.receipts.filter(r => r.iic !== iic);
    state.deleted = { ...(state.deleted || {}), [iic]: now() };
    save();
  },

  clear() { const lang = state.prefs.lang; state = empty(); if (lang) state.prefs.lang = lang; save(); },

  // Merge imported receipts (dedupe by iic) and store names. Returns count added.
  merge(receipts, stores) {
    let added = 0;
    for (const [tin, s] of Object.entries(stores || {})) {
      if (!state.stores[tin] || !state.stores[tin].name) state.stores[tin] = { name: s.name || '', cat: s.cat || '' };
    }
    for (const r of receipts || []) {
      if (!r || !r.iic || !r.day || !Number.isFinite(+r.total)) continue;
      if (this.find(r.iic)) continue;
      state.receipts.push({ ...r, total: +r.total });
      added++;
    }
    save();
    return added;
  },

  // ---- sync ----
  snapshot() {
    const prefs = {};
    for (const k of SYNCED_PREFS) if (state.prefs[k] != null) prefs[k] = state.prefs[k];
    return { receipts: state.receipts, stores: state.stores, deleted: state.deleted || {}, prefs, prefsAt: state.prefs.prefsAt || '' };
  },
  // Put a merged copy in place without waking the sync again.
  applySync(m) {
    if (saved) return;
    state.receipts = m.receipts; state.stores = m.stores; state.deleted = m.deleted;
    for (const k of SYNCED_PREFS) { if (m.prefs[k] != null) state.prefs[k] = m.prefs[k]; else delete state.prefs[k]; }
    if (m.prefsAt) state.prefs.prefsAt = m.prefsAt;
    quiet = true; save(); quiet = false;
  },

  exportJSON() { return JSON.stringify({ app: 'kupon', v: 1, exportedAt: new Date().toISOString(), receipts: state.receipts, stores: state.stores }, null, 2); },
};

// Ask the browser not to evict our data under storage pressure.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
