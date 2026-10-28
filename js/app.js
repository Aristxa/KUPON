import { ICONS } from './icons.js';
import { t, tsq, setLang, getLang, applyStatic } from './i18n.js';
import { db, CATEGORIES, suggestCategory } from './store.js';
import { parseReceiptQR, decodeImageFile, CameraScanner } from './qr.js';
import { lookupReceipt, tidySellerName } from './portal.js';
import { readReceiptPhoto } from './ocr.js';
import { syncSupported, syncNow, enable as enableSync, disable as disableSync, validCode, startAutoSync } from './sync.js';
import { API_BASE } from './config.js';
import { pushSupported, needsInstall, enableReminders, syncReminders, disableReminders } from './remind.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICONS[name] || ''}</svg>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FISKAL_URL = 'https://aristeaaa-assistent.hf.space/';

// ---------- analytics (cookie-free GoatCounter, same as the portfolio) ----------
if (!/^(localhost|127\.|192\.168\.|\[::1\])/.test(location.hostname) && location.protocol === 'https:') {
  const gc = document.createElement('script');
  gc.async = true;
  gc.src = 'https://gc.zgo.at/count.js';
  gc.dataset.goatcounter = 'https://aristea.goatcounter.com/count';
  gc.dataset.goatcounterSettings = JSON.stringify({ path: '/KUPON/' });
  document.head.appendChild(gc);
}

// ---------- formatting ----------
const NB = ' ';
export function fmtL(n) {
  const neg = n < 0; n = Math.abs(n);
  const whole = Math.floor(Math.round(n * 100) / 100);
  const cents = Math.round((n - whole) * 100);
  const int = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return (neg ? '−' : '') + int + (cents ? ',' + String(cents).padStart(2, '0') : '') + NB + 'L';
}
const fmtQty = q => (Number.isInteger(q) ? String(q) : String(Math.round(q * 1000) / 1000).replace('.', ','));
const fmtDay = day => { const [y, m, d] = day.split('-'); return `${d}.${m}.${y}`; };
const monthKey = day => day.slice(0, 7);
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const monthName = (key, form = 'month') => t(form)[+key.slice(5, 7) - 1];
const monthLabel = key => `${monthName(key)} ${key.slice(0, 4)}`;
function shiftMonth(key, delta) {
  let y = +key.slice(0, 4), m = +key.slice(5, 7) + delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
const daysIn = key => new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate();

function addMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const tm = m - 1 + months;
  const ty = y + Math.floor(tm / 12), tmo = ((tm % 12) + 12) % 12;
  const last = new Date(ty, tmo + 1, 0).getDate();
  return `${ty}-${pad(tmo + 1)}-${pad(Math.min(d, last))}`;
}
const utc = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const pctStr = pct => (pct > 0 ? '+' : pct < 0 ? '−' : '±') + Math.abs(pct) + '%';

const storeLabel = r => r.storeName || db.storeName(r.tin) || t('unnamed');
const storeKey = r => r.tin || 'm:' + (r.storeName || '').trim().toLowerCase();
// Equal share in whole lek; "≈" when the total doesn't divide evenly.
const shareL = (total, n) => { const v = total / n; return Number.isInteger(v) ? fmtL(v) : '≈' + fmtL(Math.round(v)); };
const catOf = r => r.cat || db.storeCat(r.tin) || 'other';
const byDateDesc = (a, b) => (b.day + b.time).localeCompare(a.day + a.time);
const isManual = r => r.src === 'manual';
// Only show units that change the meaning of a price (kg, L), not "piece".
const unitOf = u => (u && !/^(cop[eë]|copa|pc|pcs|cp|njësi|nje|x)\.?$/i.test(u.trim()) ? u.trim() : '');

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  // A modal dialog sits in the top layer, so the toast has to live inside it while it's open.
  const host = sheet().open ? sheet() : document.body;
  if (el.parentNode !== host) host.appendChild(el);
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- tax portal ----------
const portalOn = () => db.pref('portal') !== false;
const checking = new Set();
const ageHours = r => { const t0 = Date.parse(r.crtd); return Number.isFinite(t0) ? (Date.now() - t0) / 3600000 : 0; };

// ok | checking | pending (not there yet, < 48 h) | missing (not there after 48 h) | error | unchecked | manual
function fiscalState(r) {
  if (isManual(r)) return 'manual';
  if (checking.has(r.iic)) return 'checking';
  const f = r.fiscal;
  if (!f) return 'unchecked';
  if (f.status === 'ok') return 'ok';
  if (f.status === 'notfound') return ageHours(r) >= 48 ? 'missing' : 'pending';
  return 'error';
}

function applyLookup(iic, res) {
  const r = db.find(iic);
  if (!r) return;
  const patch = { fiscal: { status: res.status, at: new Date().toISOString(), ...(res.reason ? { reason: res.reason } : {}) } };
  if (res.status === 'ok') {
    const d = res.data;
    Object.assign(patch, { seller: d.seller, items: d.items, vat: d.vat, net: d.net, portalTotal: d.total, payment: d.payment });
    // First time we see this NIPT: name the store from the receipt itself.
    if (!db.storeName(r.tin) && d.seller.name) {
      const name = tidySellerName(d.seller.name);
      const cat = db.storeCat(r.tin) || suggestCategory(name);
      db.setStore(r.tin, name, cat);
      if (!r.catSet) patch.cat = cat;
    }
  }
  db.update(iic, patch);
  if (res.status === 'ok') sharePrices(iic);
}

async function checkReceipt(iic) {
  const r = db.find(iic);
  if (!r || isManual(r) || db.demo || !portalOn() || checking.has(iic)) return;
  checking.add(iic);
  refreshOpen(iic);
  const res = await lookupReceipt(r);
  checking.delete(iic);
  applyLookup(iic, res);
  refreshOpen(iic);
  if (!sheet().open) render();
}

// Receipts not at the tax authority yet get checked again, gently: recent ones, at most hourly.
async function recheckPending() {
  if (!portalOn() || db.demo || !navigator.onLine) return;
  const now = Date.now();
  const due = db.receipts.filter(r => !isManual(r) && (!r.fiscal || r.fiscal.status !== 'ok') && ageHours(r) < 24 * 7 &&
    (!r.fiscal || now - Date.parse(r.fiscal.at) > 3600000)).slice(0, 8);
  for (const r of due) { await checkReceipt(r.iic); await sleep(800); }
}

// ---------- routing ----------
const VIEWS = ['home', 'scan', 'list', 'warranty', 'data'];
let view = 'home';
let viewMonth = monthKey(todayISO());
const scanner = new CameraScanner(null);

function go(v) {
  if (!VIEWS.includes(v)) v = 'home';
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  view = v;
  if (v !== 'scan') stopCamera();
  $$('.view').forEach(el => { el.hidden = el.id !== 'view-' + v; });
  $$('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
  render();
  window.scrollTo(0, 0);
}

function render() {
  $('#demo-banner').hidden = !db.demo;
  $('#persist-warning').hidden = db.persistent;
  ({ home: renderHome, scan: renderScan, list: renderList, warranty: renderWarranty, data: renderData })[view]();
}

// ---------- overview ----------
function monthReceipts(key) { return db.receipts.filter(r => monthKey(r.day) === key); }
const sum = rs => rs.reduce((s, r) => s + r.total, 0);

function renderHome() {
  const el = $('#view-home');
  const all = db.receipts;
  if (!all.length) {
    el.innerHTML = `
      <div class="empty">
        <p class="kicker">${esc(t('home.empty.kicker'))}</p>
        <h1>${esc(t('home.empty.h1a'))} <em>${esc(t('home.empty.h1b'))}</em></h1>
        <p class="serif">${esc(t('home.empty.lead'))}</p>
        <a class="btn cobalt big" href="#scan">${icon('qr_code')}<span>${esc(t('home.empty.cta'))}</span></a>
        <p class="center"><button class="btn link" type="button" data-act="demo">${esc(t('demo.start'))}</button></p>
        <ul class="facts">
          <li><b>01</b><span>${esc(t('home.empty.f1'))}</span></li>
          <li><b>02</b><span>${esc(t('home.empty.f2'))}</span></li>
          <li><b>03</b><span>${esc(t('home.empty.f3'))}</span></li>
        </ul>
      </div>`;
    return;
  }

  const today = todayISO();
  const isCurrent = viewMonth === monthKey(today);
  const rs = monthReceipts(viewMonth);
  const prevKey = shiftMonth(viewMonth, -1);
  let prev = monthReceipts(prevKey);
  const total = sum(rs);
  // For the running month, compare with the same days of last month, not the whole month.
  if (isCurrent) {
    const upto = +today.slice(8, 10);
    prev = prev.filter(r => +r.day.slice(8, 10) <= upto);
  }
  const prevTotal = sum(prev);

  const prevMonth = monthName(prevKey, 'monthIn');
  const vsPct = prevTotal ? pctStr(Math.round(((total - prevTotal) / prevTotal) * 100)) : '–';
  const vsSub = prevTotal ? t('home.k.vsSub', { amount: fmtL(prevTotal), month: prevMonth }) : t('home.vs.none', { month: prevMonth });

  // What the tax portal told us about this month's receipts
  const qr = rs.filter(r => !isManual(r));
  const withVat = qr.filter(r => r.vat != null);
  const vat = withVat.reduce((s, r) => s + r.vat, 0);
  const declared = qr.filter(r => fiscalState(r) === 'ok').length;

  const minKey = all.reduce((m, r) => (monthKey(r.day) < m ? monthKey(r.day) : m), viewMonth);
  const maxKey = [monthKey(today), ...all.map(r => monthKey(r.day))].sort().pop();

  const soon = warrantyRows().filter(w => w.left >= 0 && w.left <= 30).length;
  const missing = qr.filter(r => fiscalState(r) === 'missing').length;

  el.innerHTML = `
    ${nudges()}
    ${soon ? `<a class="notice" href="#warranty">${icon('shield_checkmark')}<span>${esc(soon === 1 ? t('home.warrantySoon1') : t('home.warrantySoon', { n: soon }))}</span></a>` : ''}
    <div class="monthbar">
      <button class="iconbtn" type="button" data-act="month" data-d="-1" aria-label="${esc(t('home.prev'))}" ${viewMonth <= minKey ? 'disabled' : ''}>${icon('chevron_left')}</button>
      <h1>${esc(monthLabel(viewMonth))}</h1>
      <button class="iconbtn" type="button" data-act="month" data-d="1" aria-label="${esc(t('home.next'))}" ${viewMonth >= maxKey ? 'disabled' : ''}>${icon('chevron_right')}</button>
    </div>
    <div class="total">
      <p class="kicker">${esc(t('home.total', { month: monthName(viewMonth, 'monthIn') }))}${isCurrent ? ' ' + esc(t('home.upto', { day: fmtDay(today).slice(0, 5) })) : ''}</p>
      <p class="hero-num">${bigL(total)}</p>
      <div class="row wrap share-row">${rs.length ? `<button class="btn small share-btn" type="button" data-act="share">${icon('share')}<span>${esc(t('share.btn'))}</span></button>` : ''}
      ${wrapYear() && db.receipts.some(r => r.day.startsWith(wrapYear() + '-')) ? `<button class="btn small share-btn cobalt" type="button" data-act="share-year" data-year="${wrapYear()}">${icon('share')}<span>${esc(t('year.btn', { year: wrapYear() }))}</span></button>` : ''}</div>
    </div>
    <dl class="tally">
      <div><dt>${esc(t('home.k.receipts'))}</dt><dd>${rs.length}</dd></div>
      <div><dt>${esc(t('home.k.vs'))}</dt><dd>${esc(vsPct)}<small>${esc(vsSub)}</small></dd></div>
      <div><dt>${esc(t('home.k.vat'))}</dt><dd>${withVat.length ? esc(fmtL(Math.round(vat))) : '–'}${withVat.length < qr.length ? `<small>${esc(t('home.k.vatSub', { n: withVat.length, m: qr.length }))}</small>` : ''}</dd></div>
    </dl>
    ${qr.length && (declared || missing) ? `
      <a class="declared${missing ? ' has-missing' : ''}" href="#list">
        <span class="n">${declared}<span>/${qr.length}</span></span>
        <span class="t">${esc(t('home.declared'))}${missing ? `<br>${esc(t('home.declared.missing', { n: missing }))}` : ''}</span>
      </a>` : ''}
    ${isCurrent ? limitSection(total, today) : ''}
    ${rs.length ? `
      ${insightsSection(rs, prev)}
      ${apiUp && db.pref('coach') && isCurrent ? `<button class="btn coach-btn" type="button" data-act="coach">${icon('people')}<span><b>${esc(t('ai.title'))}</b><small>${esc(t('ai.cta'))}</small></span></button>` : ''}
      ${cheaperSection()}
      ${budgetSection(rs)}
      <section>
        <h2>${esc(t('home.daily'))}</h2>
        <div class="chart" id="daily-chart" role="img" aria-label="${esc(t('chart.label', { month: monthName(viewMonth, 'monthIn') }))}"></div>
      </section>
      <section>
        <h2>${esc(t('home.byCat'))}</h2>
        ${categoryTable(rs, total)}
      </section>
      <section>
        <h2>${esc(t('home.topStores'))}</h2>
        ${storeTable(rs)}
      </section>` : `<p class="muted pad">${esc(t('home.noMonth'))}</p>`}
  `;
  if (rs.length) drawDaily($('#daily-chart'), rs, viewMonth, isCurrent ? +today.slice(8, 10) : daysIn(viewMonth), isCurrent ? +today.slice(8, 10) : 0);
}

// ---------- monthly limit ----------
function limitSection(total, today) {
  const limit = db.pref('limit');
  if (!(limit > 0)) return db.demo ? '' : `<p><button class="btn link" type="button" data-act="limit">${esc(t('lim.set'))}</button></p>`;
  const key = monthKey(today);
  const day = +today.slice(8, 10);
  const daysLeft = daysIn(key) - day + 1;
  const left = limit - total, over = left < 0;
  return `<section class="limit${over ? ' over' : ''}">
    <div class="limit-head"><h2>${esc(t('lim.title'))}</h2><button class="btn link small" type="button" data-act="limit">${esc(t('lim.edit'))}</button></div>
    <div class="limit-bar" role="img" aria-label="${esc(fmtL(total) + ' ' + t('lim.of', { limit: fmtL(limit) }))}">
      <span style="width:${Math.min(100, (total / limit) * 100).toFixed(1)}%"></span>
      <i style="left:${((day / daysIn(key)) * 100).toFixed(1)}%"></i>
    </div>
    <p class="limit-nums"><b>${fmtL(total)}</b> <span class="muted">${esc(t('lim.of', { limit: fmtL(limit) }))}</span></p>
    <p class="small">${esc(over ? t('lim.over', { amount: fmtL(-left) }) : t('lim.left', { left: fmtL(left), perDay: fmtL(Math.floor(left / daysLeft)) }))}</p>
  </section>`;
}

function openLimit() {
  const cur = db.pref('limit');
  openSheet(`
    <h2>${esc(t('lim.title'))}</h2>
    <form id="lim-form" class="stack">
      <label for="lim-v">${esc(t('lim.label'))}</label>
      <input id="lim-v" type="number" inputmode="numeric" min="0" step="1000" value="${cur > 0 ? cur : ''}" placeholder="60000">
      <p class="muted small">${esc(t('lim.hint'))}</p>
      <div class="row between0 wrap">
        ${cur > 0 ? `<button class="btn danger" type="button" id="lim-off">${esc(t('lim.remove'))}</button>` : '<span></span>'}
        <button class="btn primary" type="submit">${esc(t('lim.save'))}</button>
      </div>
    </form>`, () => {
    $('#lim-form').addEventListener('submit', e => {
      e.preventDefault();
      const v = Math.round(Number($('#lim-v').value));
      db.setPref('limit', v > 0 ? v : null);
      closeSheet();
      toast(t('toast.saved'));
    });
    const off = $('#lim-off');
    if (off) off.addEventListener('click', () => { db.setPref('limit', null); closeSheet(); });
  });
}

// ---------- what stands out this month (all computed here, on the phone) ----------
function insightsSection(rs, prev) {
  const out = [];
  const byCat = list => { const m = {}; for (const r of list) m[catOf(r)] = (m[catOf(r)] || 0) + r.total; return m; };
  // The category that moved most against last month (the same days, for the running month).
  const now = byCat(rs), before = byCat(prev);
  let best = null;
  for (const c of new Set([...Object.keys(now), ...Object.keys(before)])) {
    const a = now[c] || 0, b = before[c] || 0;
    if (b < 1000 || Math.max(a, b) < 2000) continue;
    const pct = Math.round(((a - b) / b) * 100);
    if (Math.abs(pct) >= 10 && (!best || Math.abs(pct) > Math.abs(best.pct))) best = { c, pct };
  }
  if (best) out.push({ big: pctStr(best.pct), text: t('ins.cat', { cat: t('cat.' + best.c) }), cls: best.pct > 0 ? 'warn' : 'good', cat: best.c });
  // Cafés and restaurants.
  const cafe = rs.filter(r => catOf(r) === 'cafe');
  if (cafe.length >= 2 && !(best && best.c === 'cafe')) out.push({ big: String(cafe.length), text: t('ins.cafe', { amount: fmtL(sum(cafe)) }), cat: 'cafe' });
  // The biggest price rise among things bought this month.
  const key = monthKey(rs[0].day);
  let rise = null;
  for (const p of priceIndex()) {
    const ins = p.buys.filter(b => monthKey(b.day) === key);
    if (!ins.length) continue;
    const last = ins[ins.length - 1];
    const earlier = p.buys.filter(b => (b.day + b.time) < (last.day + last.time) && b.price !== last.price).pop();
    if (!earlier || last.price <= earlier.price) continue;
    const pct = Math.round(((last.price - earlier.price) / earlier.price) * 100);
    if (pct >= 3 && (!rise || pct > rise.pct)) rise = { pct, p, from: earlier.price, to: last.price };
  }
  if (rise) out.push({ big: pctStr(rise.pct), text: t('ins.price', { name: rise.p.name, from: fmtL(rise.from), to: fmtL(rise.to) }), cls: 'warn', product: rise.p.key });
  // The biggest receipt.
  if (rs.length >= 3) {
    const big = rs.reduce((m, r) => (r.total > m.total ? r : m));
    out.push({ big: fmtL(big.total), text: t('ins.big', { store: storeLabel(big), date: fmtDay(big.day).slice(0, 5) }), open: big.iic });
  }
  // Weekends.
  const tot = sum(rs);
  if (rs.length >= 6 && tot > 0) {
    const weekend = r => { const [y, m, d] = r.day.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return w === 0 || w === 6; };
    const share = Math.round((sum(rs.filter(weekend)) / tot) * 100);
    if (share >= 35) out.push({ big: share + '%', text: t('ins.weekend') });
  }
  if (!out.length) return '';
  return `<section>
    <h2>${esc(t('ins.title'))}</h2>
    <ul class="insights">${out.slice(0, 4).map(i => {
      const attr = i.product ? ` data-product="${esc(i.product)}"` : i.open ? ` data-open="${esc(i.open)}"` : i.cat ? ` data-cat="${i.cat}"` : '';
      const inner = `<b class="${i.cls || ''}">${esc(i.big)}</b><span>${esc(i.text)}</span>`;
      return `<li>${attr ? `<button type="button"${attr}>${inner}</button>` : `<div>${inner}</div>`}</li>`;
    }).join('')}</ul>
  </section>`;
}

// ---------- gentle prompts: backup and install ----------
const since = iso => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity);
function nudges() {
  if (db.demo) return '';
  const all = db.receipts;
  const oldest = all.reduce((m, r) => (r.addedAt && r.addedAt < m ? r.addedAt : m), new Date().toISOString());
  if (all.length >= 10 && since(db.pref('lastExport')) > 30 && since(oldest) > 14 && since(db.pref('backupLater')) > 14) {
    return `<div class="nudge">${icon('arrow_download')}<div><p>${esc(t('bk.text'))}</p>
      <div class="row wrap"><button class="btn small primary" type="button" data-act="json">${esc(t('bk.save'))}</button>
      <button class="btn small link" type="button" data-act="later" data-k="backupLater">${esc(t('bk.later'))}</button></div></div></div>`;
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && all.length >= 3 && (installEvt || ios) && since(db.pref('installLater')) > 30) {
    return `<div class="nudge">${icon('add')}<div><p>${esc(t('in.text'))}</p>
      ${installEvt ? '' : `<p class="muted small">${esc(t('in.ios'))}</p>`}
      <div class="row wrap">${installEvt ? `<button class="btn small primary" type="button" data-act="install">${esc(t('in.btn'))}</button>` : ''}
      <button class="btn small link" type="button" data-act="later" data-k="installLater">${esc(t('in.later'))}</button></div></div></div>`;
  }
  return '';
}

// Products you last bought somewhere dearer than another store you also buy them at.
function cheaperSection() {
  const picks = priceIndex()
    .filter(p => p.cheapest && p.cheapest.skey !== p.last.skey && p.cheapest.price < p.last.price)
    .sort((a, b) => (b.last.price - b.cheapest.price) - (a.last.price - a.cheapest.price))
    .slice(0, 3);
  if (!picks.length) return '';
  return `<section>
    <h2>${esc(t('home.cheaper'))}</h2>
    <ul class="rlist">${picks.map(p => `
      <li><button type="button" data-product="${esc(p.key)}">
        <span class="rmain"><span class="rname">${esc(p.name)}</span>
        <span class="muted small">${esc(t('home.cheaper.line', { price: fmtL(p.cheapest.price), store: p.cheapest.store, paid: fmtL(p.last.price), last: p.last.store }))}</span></span>
        <span class="ramt good">−${fmtL(p.last.price - p.cheapest.price)}</span>
      </button></li>`).join('')}
    </ul>
    <p><button class="btn link" type="button" data-act="prices">${esc(t('home.cheaper.all'))}</button></p>
  </section>`;
}

// ---------- the month as a story image (1080 × 1920) ----------
// One 1080 × 1920 story in the receipt look: label row, headline with the accent line in cobalt,
// a big amount, ruled rows, an optional stamp, and the sign-off. Always light: it's a printed thing.
async function storyImage({ title, accent, amount, sub, rows, stamp }) {
  const W = 1080, H = 1920, M = 90;
  const PAPER = '#eceae4', INK = '#121211', MUTED = '#6e6c65', LINE = '#cfccc3', COBALT = '#2433ff';
  await Promise.all(['800 100px Archivo', '600 100px Archivo', '400 100px Newsreader'].map(f => document.fonts.load(f).catch(() => {})));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const cond = (weight, size) => { x.font = `${weight} ${size}px Archivo`; if ('fontStretch' in x) x.fontStretch = 'extra-condensed'; };
  const plain = (weight, size) => { x.font = `${weight} ${size}px Archivo`; if ('fontStretch' in x) x.fontStretch = 'normal'; };
  const track = px => { if ('letterSpacing' in x) x.letterSpacing = px + 'px'; };
  const rule = (y, color = INK, w = 2) => { x.fillStyle = color; x.fillRect(M, y, W - 2 * M, w); };
  const fit = (text, weight, size, max) => { cond(weight, size); while (x.measureText(text).width > max && size > 40) { size -= 6; cond(weight, size); } return size; };

  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  plain(700, 30); track(5); x.fillStyle = MUTED;
  x.fillText('KUPON', M, 150);
  x.textAlign = 'right'; x.fillText('NOVARIS LABS', W - M, 150); x.textAlign = 'left';
  rule(186);

  track(0); x.fillStyle = INK;
  fit(title, 800, 190, W - 2 * M); x.fillText(title, M - 6, 390);
  x.fillStyle = COBALT; fit(accent, 800, 190, W - 2 * M); x.fillText(accent, M - 6, 560);

  let size = 330;
  cond(800, size);
  while (x.measureText(amount).width > W - 2 * M - 120 && size > 120) { size -= 10; cond(800, size); }
  x.fillStyle = INK;
  x.fillText(amount, M - 8, 930);
  const aw = x.measureText(amount).width;
  cond(800, Math.round(size * 0.4)); x.fillText('L', M + aw + 10, 930);
  plain(500, 38); x.fillStyle = MUTED;
  x.fillText(sub, M, 1000);

  const rowH = rows.length > 3 ? 104 : 128;
  let y = 1070;
  rule(y);
  for (const [k, v] of rows) {
    plain(600, 38); x.fillStyle = INK; x.textAlign = 'left'; x.fillText(k, M, y + rowH * 0.62);
    x.textAlign = 'right'; fit(v, 800, 60, W - 2 * M - x.measureText(k).width - 40);
    x.fillText(v, W - M, y + rowH * 0.66); x.textAlign = 'left';
    y += rowH; rule(y, LINE, 2);
  }

  if (stamp) {
    const word = stamp.toUpperCase();
    cond(900, 92); track(4);
    const half = Math.ceil(x.measureText(word).width / 2) + 36;
    x.save();
    x.translate(W - M - half - 20, 1580); x.rotate(-9 * Math.PI / 180);
    x.strokeStyle = COBALT; x.fillStyle = COBALT;
    x.lineWidth = 7; x.strokeRect(-half, -78, half * 2, 156);
    x.lineWidth = 2.5; x.strokeRect(-half - 12, -90, half * 2 + 24, 180);
    x.textAlign = 'center';
    x.fillText(word, 0, 22);
    plain(800, 24); track(6); x.fillText(t('stamp.sub').toUpperCase(), 0, 60);
    x.restore(); track(0); x.textAlign = 'left';
  }

  rule(H - 230);
  x.font = 'italic 400 44px Newsreader'; if ('fontStretch' in x) x.fontStretch = 'normal';
  x.fillStyle = MUTED; x.fillText(t('share.foot'), M, H - 150);
  cond(800, 64); x.fillStyle = INK; x.fillText('KUPON.NOVARIS.AL', M, H - 80);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function topBy(rs, keyOf) {
  const m = {};
  for (const r of rs) m[keyOf(r)] = (m[keyOf(r)] || 0) + r.total;
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || [null, 0];
}

function monthImage(key) {
  const rs = monthReceipts(key);
  const total = sum(rs);
  const today = todayISO();
  const qr = rs.filter(r => !isManual(r));
  const declared = qr.filter(r => fiscalState(r) === 'ok').length;
  const [topCat, topV] = topBy(rs, catOf);
  return storyImage({
    title: t('share.title', { month: t('monthDef')[+key.slice(5, 7) - 1] }).toUpperCase(),
    accent: key.slice(0, 4),
    amount: fmtL(total).slice(0, -2),
    sub: t('share.spent') + (key === monthKey(today) ? ' ' + t('share.upto', { day: fmtDay(today).slice(0, 5) }) : ''),
    rows: [
      [t('share.receipts'), String(rs.length)],
      [t('share.declared'), qr.length ? `${declared}/${qr.length}` : '–'],
      [t('share.top'), `${t('cat.' + (topCat || 'other'))} ${total ? Math.round((topV / total) * 100) : 0}%`],
    ],
    stamp: qr.length && declared ? t('stamp.ok') : '',
  });
}

// The year at a glance: for December and January, when everyone posts theirs.
function yearStats(year) {
  const rs = db.receipts.filter(r => r.day.startsWith(year + '-'));
  const total = sum(rs);
  const qr = rs.filter(r => !isManual(r));
  const declared = qr.filter(r => fiscalState(r) === 'ok').length;
  const visits = {};
  for (const r of rs) { const k = storeKey(r); visits[k] = visits[k] || { label: storeLabel(r), n: 0 }; visits[k].n++; }
  const shop = Object.values(visits).sort((a, b) => b.n - a.n)[0];
  const [topCat, topV] = topBy(rs, catOf);
  const [topMonth] = topBy(rs, r => monthKey(r.day));
  let rise = null;
  for (const p of priceIndex()) {
    const ys = p.buys.filter(b => b.day.startsWith(year + '-'));
    if (ys.length < 2 || !(ys[0].price > 0)) continue;
    const pct = Math.round(((ys[ys.length - 1].price - ys[0].price) / ys[0].price) * 100);
    if (pct >= 3 && (!rise || pct > rise.pct)) rise = { pct, name: p.name };
  }
  return { rs, total, qr, declared, shop, topCat, topV, topMonth, rise };
}

function yearImage(year) {
  const s = yearStats(year);
  const rows = [
    [t('share.receipts'), String(s.rs.length)],
    [t('share.declared'), s.qr.length ? `${s.declared}/${s.qr.length}` : '–'],
  ];
  if (s.shop) rows.push([t('year.shop'), `${s.shop.label} · ${s.shop.n}×`]);
  if (s.topCat) rows.push([t('share.top'), `${t('cat.' + s.topCat)} ${s.total ? Math.round((s.topV / s.total) * 100) : 0}%`]);
  if (s.rise) rows.push([t('year.rise'), `${s.rise.name} ${pctStr(s.rise.pct)}`]);
  else if (s.topMonth) rows.push([t('year.month'), monthName(s.topMonth)]);
  return storyImage({
    title: t('year.title').toUpperCase(),
    accent: String(year),
    amount: fmtL(s.total).slice(0, -2),
    sub: t('year.sub', { year }),
    rows: rows.slice(0, 5),
    stamp: '',
  });
}

async function shareImage(btn, makeBlob, name) {
  btn.disabled = true;
  try {
    const blob = await makeBlob();
    if (!blob) throw new Error('no image');
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (err) { if (err.name !== 'AbortError') throw err; }
    } else {
      download(name, blob, 'image/png');
      toast(t('share.saved'));
    }
  } catch (err) {
    toast(t('share.fail'));
  } finally {
    btn.disabled = false;
  }
}
// December and January: the year in review is offered on the overview.
const wrapYear = () => { const m = +todayISO().slice(5, 7); const y = +todayISO().slice(0, 4); return m === 12 ? y : m === 1 ? y - 1 : null; };

function budgetSection(rs) {
  const budgets = db.pref('budgets') || {};
  const cats = CATEGORIES.filter(c => budgets[c] > 0);
  if (!cats.length) return '';
  const spent = {};
  for (const r of rs) spent[catOf(r)] = (spent[catOf(r)] || 0) + r.total;
  return `<section>
    <h2>${esc(t('home.budget'))}</h2>
    <table class="tbl">
      <tbody>${cats.map(c => {
        const s = spent[c] || 0, b = budgets[c], over = s > b;
        return `<tr><td>${esc(t('cat.' + c))}<span class="meter ${over ? 'over' : ''}"><span style="width:${Math.min(100, (s / b) * 100).toFixed(1)}%"></span></span>
          <span class="small ${over ? 'warn' : 'muted'}">${esc(over ? t('home.budget.over', { amount: fmtL(s - b) }) : t('home.budget.left', { amount: fmtL(b - s) }))}</span></td>
          <td class="num">${fmtL(s)}<span class="muted small block">/ ${fmtL(b)}</span></td></tr>`;
      }).join('')}</tbody>
    </table></section>`;
}

function categoryTable(rs, total) {
  const by = {};
  for (const r of rs) by[catOf(r)] = (by[catOf(r)] || 0) + r.total;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const max = rows[0][1] || 1;
  return `<ul class="rows">${rows.map(([c, v]) => `
    <li><button type="button" class="rowbtn" data-cat="${c}"><span class="rk">${total ? Math.round((v / total) * 100) : 0}%</span><span class="rl">${esc(t('cat.' + c))}</span><span class="rv">${fmtL(v)}</span>
      <span class="meter"><span style="width:${Math.max(2, (v / max) * 100).toFixed(1)}%"></span></span></button></li>`).join('')}
    </ul>`;
}

function storeTable(rs) {
  const by = {};
  for (const r of rs) {
    const k = storeKey(r);
    const s = by[k] || (by[k] = { key: k, label: storeLabel(r), tin: r.tin, n: 0, v: 0 });
    s.n++; s.v += r.total;
  }
  const rows = Object.values(by).sort((a, b) => b.v - a.v).slice(0, 5);
  return `<ul class="rows">${rows.map((s, i) => `
    <li><button type="button" class="rowbtn" data-store="${esc(s.key)}"><span class="rk">${pad(i + 1)}</span><span class="rl">${esc(s.label)}</span>
      <span class="rv"><small>${esc(s.n === 1 ? t('home.count1') : t('home.count', { n: s.n }))}</small> ${fmtL(s.v)}</span></button></li>`).join('')}
    </ul>`;
}
// The big total: the amount in display type, "L" set smaller.
const bigL = n => esc(fmtL(n).slice(0, -2)) + '<span class="cur">L</span>';

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const shortL = v => (v >= 1000 ? (v / 1000).toLocaleString(getLang() === 'sq' ? 'sq-AL' : 'en-GB', { maximumFractionDigits: 1 }) + 'k' : String(v));

function drawDaily(host, rs, key, lastDay, todayDay = 0) {
  const n = daysIn(key);
  const days = Array.from({ length: n }, () => ({ v: 0, c: 0 }));
  for (const r of rs) { const d = +r.day.slice(8, 10) - 1; days[d].v += r.total; days[d].c++; }
  const max = niceMax(Math.max(...days.map(d => d.v)));

  const W = Math.max(280, host.clientWidth || 340), H = 150;
  const padL = 34, padR = 4, padT = 10, padB = 20;
  const cw = (W - padL - padR) / n, bw = Math.max(2, cw - 2);
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  const base = y(0);
  let bars = '', hits = '', labels = '';
  days.forEach((d, i) => {
    const x = padL + i * cw + (cw - bw) / 2;
    if (d.v > 0) {
      const h = Math.max(2, base - y(d.v));
      bars += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" class="bar${i + 1 === todayDay ? ' today' : ''}"/>`;
    }
    hits += `<rect x="${padL + i * cw}" y="${padT}" width="${cw}" height="${base - padT}" class="hit" data-i="${i}"/>`;
    const dn = i + 1;
    if (dn === 1 || dn % 7 === 1 && dn <= n - 3 || dn === n) {
      labels += `<text x="${padL + i * cw + cw / 2}" y="${H - 5}" text-anchor="middle" class="axis-t">${dn}</text>`;
    }
  });
  const grid = [max / 2, max].map(v => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" class="axis-t">${shortL(v)}</text>`).join('');

  host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${grid}<line x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}" class="baseline"/>
    ${bars}${labels}<g class="hits">${hits}</g></svg><div class="tip" hidden></div>`;

  const tip = $('.tip', host);
  const show = i => {
    const d = days[i];
    const day = `${pad(i + 1)}.${key.slice(5, 7)}`;
    tip.innerHTML = `<b>${day}</b> ${d.v ? fmtL(d.v) + ` · ${d.c === 1 ? t('home.count1') : t('home.count', { n: d.c })}` : (i + 1 > lastDay ? '–' : fmtL(0))}`;
    tip.hidden = false;
    const cx = padL + i * cw + cw / 2;
    tip.style.left = Math.min(Math.max(cx, 60), W - 60) + 'px';
    $$('.hit', host).forEach(h => h.classList.toggle('on', +h.dataset.i === i));
  };
  const hide = () => { tip.hidden = true; $$('.hit', host).forEach(h => h.classList.remove('on')); };
  $('.hits', host).addEventListener('pointerover', e => { if (e.target.dataset.i) show(+e.target.dataset.i); });
  $('.hits', host).addEventListener('pointerdown', e => { if (e.target.dataset.i) show(+e.target.dataset.i); });
  host.addEventListener('pointerleave', hide);
}

// ---------- scan ----------
let cameraOn = false;
let lastFromCamera = false;

function renderScan() {
  const el = $('#view-scan');
  if (el.dataset.ready) { setScanMsg(''); return; }
  el.dataset.ready = '1';
  el.innerHTML = `
    <h1>${esc(t('scan.title'))}</h1>
    <div class="viewfinder" id="vf">
      <video id="video" playsinline muted></video>
      <div class="frame" aria-hidden="true"></div>
      <button class="btn primary big" type="button" id="cam-btn">${icon('camera')}<span>${esc(t('scan.start'))}</span></button>
    </div>
    <p class="muted center small" id="scan-hint">${esc(t('scan.hint'))}</p>
    <p class="msg" id="scan-msg" role="status" aria-live="polite"></p>
    <div class="scan-alt">
      <label class="btn" for="shoot-input">${icon('camera')}<span>${esc(t('scan.shoot'))}</span></label>
      <input type="file" id="shoot-input" accept="image/*" capture="environment" hidden>
      <label class="btn" for="photo-input">${icon('image')}<span>${esc(t('scan.photo'))}</span></label>
      <input type="file" id="photo-input" accept="image/*" hidden>
    </div>
    <p class="muted small">${esc(t('scan.photoHint'))}</p>
    <button class="btn cash-btn" type="button" data-act="manual">${icon('wallet')}<span><b>${esc(t('q.title'))}</b><small>${esc(t('scan.cashHint'))}</small></span></button>
    <form id="paste-form" class="stack">
      <label for="paste-input">${esc(t('scan.paste.label'))}</label>
      <div class="row">
        <input id="paste-input" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t('scan.paste.ph'))}">
        <button class="btn" type="submit">${icon('add')}<span>${esc(t('scan.paste.go'))}</span></button>
      </div>
    </form>`;
  scanner.video = $('#video');
  $('#cam-btn').addEventListener('click', () => (cameraOn ? stopCamera() : startCamera()));
  const fromPhoto = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setScanMsg(t('scan.busy'));
    let qr = null;
    try { qr = await decodeImageFile(f); } catch (err) {}
    if (qr && parseReceiptQR(qr).ok) { lastFromCamera = false; handleScan(qr); return; }
    // No QR code: read the printed text instead, on the phone.
    setScanMsg(t('ocr.reading', { pct: 0 }));
    try {
      const res = await readReceiptPhoto(f, p => setScanMsg(t('ocr.reading', { pct: Math.round(p * 100) })));
      setScanMsg('');
      if (!res.amount && !res.store) { setScanMsg(t('ocr.nothing'), true); return; }
      const known = res.tin && db.storeName(res.tin);
      openManual({
        amount: res.amount, day: res.day, fromPhoto: true,
        store: known || (res.store ? tidySellerName(res.store) : ''),
        cat: res.tin && db.storeCat(res.tin) ? db.storeCat(res.tin) : undefined,
      });
    } catch (err) {
      setScanMsg(t('ocr.fail'), true);
    }
  };
  $('#photo-input').addEventListener('change', fromPhoto);
  $('#shoot-input').addEventListener('change', fromPhoto);
  $('#paste-form').addEventListener('submit', e => {
    e.preventDefault();
    lastFromCamera = false;
    if (handleScan($('#paste-input').value)) $('#paste-input').value = '';
  });
}

function setScanMsg(msg, isErr) {
  const m = $('#scan-msg');
  if (!m) return;
  m.textContent = msg;
  m.classList.toggle('err', !!isErr);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScanMsg(t('scan.insecure'), true); return;
  }
  setScanMsg('');
  cameraOn = true;
  $('#vf').classList.add('live');
  $('#cam-btn').innerHTML = `${icon('dismiss')}<span>${esc(t('scan.stop'))}</span>`;
  try {
    await scanner.start(text => {
      stopCamera();
      if (navigator.vibrate) navigator.vibrate(60);
      lastFromCamera = true;
      handleScan(text);
    });
  } catch (err) {
    stopCamera();
    setScanMsg(t('scan.noCamera'), true);
  }
}

function stopCamera() {
  scanner.stop();
  cameraOn = false;
  const vf = $('#vf');
  if (vf) {
    vf.classList.remove('live');
    $('#cam-btn').innerHTML = `${icon('camera')}<span>${esc(t('scan.start'))}</span>`;
  }
}

// Returns true when the input was a valid receipt (new or duplicate).
function handleScan(text) {
  const res = parseReceiptQR(text);
  if (!res.ok) { setScanMsg(t('err.' + res.reason), true); return false; }
  if (db.demo) db.endDemo(); // a real scan always goes into the real data
  const r = res.receipt;
  const existing = db.find(r.iic);
  if (existing) {
    setScanMsg('');
    toast(t('scan.dup'));
    openReceipt(existing.iic);
    return true;
  }
  r.src = 'qr';
  r.cat = db.storeCat(r.tin) || suggestCategory(db.storeName(r.tin));
  db.add(r);
  setScanMsg('');
  openNewReceipt(r.iic);
  checkReceipt(r.iic);
  return true;
}

// ---------- sheets (dialogs) ----------
const sheet = () => $('#sheet');
let openIic = null, openKind = null;
function openSheet(html, onReady, iic = null, kind = null) {
  const d = sheet();
  openIic = iic; openKind = kind;
  $('#sheet-body').innerHTML = html;
  if (!d.open) d.showModal();
  // Don't let the dialog focus the first input: on phones that pops the keyboard.
  $('#sheet-body').focus({ preventScroll: true });
  d.scrollTop = 0;
  onReady && onReady(d);
}
function closeSheet() { if (sheet().open) sheet().close(); }

// Update the parts of an open sheet that depend on the portal, without touching inputs.
function refreshOpen(iic) {
  if (!sheet().open || openIic !== iic) return;
  const r = db.find(iic);
  if (!r) return;
  const fb = $('#fbox');
  if (fb) fb.innerHTML = fiscalBox(r);
  const rb = $('#rbox');
  if (rb) {
    // Stamp it with a little thump only when the answer has just arrived.
    const st = fiscalState(r);
    rb.innerHTML = receiptPaper(r, rb.dataset.st === 'checking' && st !== 'checking');
    rb.dataset.st = st;
  }
  if (openKind === 'new') {
    const name = $('#nf-name');
    if (name && !name.value.trim() && db.storeName(r.tin)) {
      name.value = db.storeName(r.tin);
      $('#nf-cat').value = catOf(r);
    }
  }
}

function catSelect(id, value) {
  return `<select id="${id}">${CATEGORIES.map(c => `<option value="${c}" ${c === value ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select>`;
}

function fiscalBox(r) {
  const st = fiscalState(r);
  if (st === 'manual') return `<p class="fstate muted">${icon('edit')}<span>${esc(t('r.manual'))}</span></p>`;
  if (db.demo && st !== 'ok' && st !== 'pending') return '';
  const btn = label => (db.demo ? '' : `<button class="btn small" type="button" data-check="${esc(r.iic)}">${icon('arrow_sync')}<span>${esc(label)}</span></button>`);
  const mismatch = st === 'ok' && r.portalTotal != null && Math.abs(r.portalTotal - r.total) > 0.5
    ? `<p class="fstate warn">${icon('warning')}<span>${esc(t('f.mismatch', { amount: fmtL(r.portalTotal) }))}</span></p>` : '';
  switch (st) {
    case 'ok': return mismatch; // the stamp on the receipt says it
    case 'checking': return `<p class="fstate muted"><span class="spin" aria-hidden="true"></span><span>${esc(t('f.checking'))}</span></p>`;
    case 'pending': return `<p class="fstate">${icon('arrow_sync')}<span>${esc(t('f.pending'))} <span class="muted small">${esc(t('f.pending.why'))}</span></span></p>${btn(t('f.recheck'))}`;
    case 'missing': return `<div class="fmissing"><p class="fstate warn">${icon('warning')}<span><b>${esc(t('f.missing'))}</b><br><span class="small">${esc(t('f.missing.why'))}</span></span></p>
      <div class="row wrap gap">${btn(t('f.recheck'))}<a class="btn small" href="${FISKAL_URL}" target="_blank" rel="noopener">${icon('open')}<span>${esc(t('f.ask'))}</span></a></div></div>`;
    case 'error': return `<p class="fstate muted">${icon('warning')}<span>${esc(t('f.error'))}${r.fiscal && r.fiscal.reason ? ` <span class="small">(${esc(r.fiscal.reason)})</span>` : ''}</span></p>${btn(t('f.recheck'))}`;
    default: return portalOn() ? btn(t('f.check')) : `<p class="muted small">${esc(t('f.off'))}</p>`;
  }
}

// The receipt as paper, with the tax authority's answer stamped on it.
function stampHtml(r, fresh) {
  const st = fiscalState(r);
  if (!['ok', 'missing', 'pending'].includes(st)) return '';
  return `<div class="stamp ${st}${fresh ? ' fresh' : ''}" aria-hidden="true"><b>${esc(t('stamp.' + st))}</b><small>${esc(t('stamp.sub'))}</small></div>`;
}

function receiptPaper(r, fresh = false) {
  const addr = r.seller && [r.seller.address, r.seller.town].filter(Boolean).join(', ');
  const meta = [fmtDay(r.day), r.time, r.tin && !db.demo ? 'NIPT ' + r.tin : ''].filter(Boolean).join(' · ');
  const items = r.items && r.items.length ? `<hr class="r-cut"><ul class="r-items">${r.items.map(it => `
    <li><span>${esc(it.name)}${it.qty !== 1 && it.unitPrice != null ? `<span class="q">${fmtQty(it.qty)} × ${fmtL(it.unitPrice)}${unitOf(it.unit) ? ' / ' + esc(unitOf(it.unit)) : ''}</span>` : ''}</span><span>${fmtL(it.total)}</span></li>`).join('')}</ul>` : '';
  const vat = r.vat != null ? `<div class="r-sum"><span>${esc(t('r.net'))}</span><span>${fmtL(r.net != null ? r.net : r.total - r.vat)}</span></div>
    <div class="r-sum"><span>${esc(t('r.vat'))}</span><span>${fmtL(r.vat)}</span></div>` : '';
  return `<div class="receipt">
    ${stampHtml(r, fresh)}
    <p class="r-store">${esc(storeLabel(r))}</p>
    ${addr ? `<p class="r-meta">${esc(addr)}</p>` : ''}
    <p class="r-meta">${esc(meta)}</p>
    ${items}
    <hr class="r-cut">
    ${vat}
    <div class="r-total"><span>${esc(t('th.total'))}</span><span>${fmtL(r.total)}</span></div>
    ${!isManual(r) && !db.demo && r.iic ? `<p class="r-foot">NIVF ${esc(r.iic.slice(0, 8))}…</p>` : ''}
  </div>`;
}


function openNewReceipt(iic) {
  const r = db.find(iic);
  const known = db.storeName(r.tin);
  openSheet(`
    <p class="kicker sheet-label">${icon('checkmark_circle', 'tiny')} ${esc(t('new.title'))}</p>
    <div id="rbox" data-st="${fiscalState(r)}">${receiptPaper(r)}</div>
    <div id="fbox">${fiscalBox(r)}</div>
    <form id="new-form" class="stack">
      <label for="nf-name">${esc(t('new.storeName'))}</label>
      <input id="nf-name" autocomplete="off" value="${esc(known)}" maxlength="80">
      <p class="muted small">${esc(t('new.storeHint', { tin: r.tin }))}</p>
      <label for="nf-cat">${esc(t('new.cat'))}</label>
      ${catSelect('nf-cat', catOf(r))}
      <div class="row end wrap">
        ${lastFromCamera ? `<button class="btn" type="submit" value="again">${icon('qr_code')}<span>${esc(t('new.again'))}</span></button>` : ''}
        <button class="btn primary" type="submit" value="save">${esc(t('new.save'))}</button>
      </div>
    </form>`, () => {
    const name = $('#nf-name'), cat = $('#nf-cat');
    let catTouched = !!db.storeCat(r.tin);
    cat.addEventListener('change', () => { catTouched = true; });
    name.addEventListener('input', () => { if (!catTouched) cat.value = suggestCategory(name.value); });
    $('#new-form').addEventListener('submit', e => {
      e.preventDefault();
      const again = e.submitter && e.submitter.value === 'again';
      if (name.value.trim()) db.setStore(r.tin, name.value.trim(), cat.value);
      else db.setStore(r.tin, null, cat.value);
      db.update(r.iic, { cat: cat.value, catSet: catTouched || undefined });
      closeSheet();
      toast(t('toast.saved'));
      if (again) { go('scan'); startCamera(); } else render();
    });
  }, iic, 'new');
}

function openReceipt(iic) {
  const r = db.find(iic);
  if (!r) return;
  const w = r.warranty;
  const months = [6, 12, 24, 36, 60];
  const mLabel = m => (m % 12 ? t('w.m', { n: m }) : m === 12 ? t('w.y1') : t('w.y', { n: m / 12 }));
  openSheet(`
    <div id="rbox" data-st="${fiscalState(r)}">${receiptPaper(r)}</div>
    <div id="fbox">${fiscalBox(r)}</div>
    <div class="stack">
      <label for="rf-name">${esc(t('r.store'))}</label>
      <input id="rf-name" autocomplete="off" value="${esc(isManual(r) ? r.storeName : db.storeName(r.tin))}" maxlength="80">
      <label for="rf-cat">${esc(t('r.cat'))}</label>
      ${catSelect('rf-cat', catOf(r))}
      <label for="rf-note">${esc(t('r.note'))}</label>
      <input id="rf-note" autocomplete="off" value="${esc(r.note || '')}" maxlength="140" placeholder="${esc(t('r.note.ph'))}">
    </div>

    <div class="actions">
      ${isManual(r) ? '' : db.demo ? `<p class="muted small">${esc(t('r.demoOfficial'))}</p>` :
        `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">${icon('open')}<span>${esc(t('r.official'))}</span></a>`}
      <button class="btn" type="button" id="rf-split">${icon('people')}<span>${esc(t('r.split'))}</span></button>
    </div>

    <fieldset class="warranty">
      <label class="check"><input type="checkbox" id="rf-w" ${w ? 'checked' : ''}> ${icon('shield_checkmark')} <span>${esc(t('w.on'))}</span></label>
      <div id="rf-wfields" class="stack" ${w ? '' : 'hidden'}>
        <label for="rf-witem">${esc(t('w.item'))}</label>
        <input id="rf-witem" autocomplete="off" maxlength="80" value="${esc(w ? w.item : '')}" placeholder="${esc(t('w.item.ph'))}" list="rf-witems">
        ${r.items && r.items.length ? `<datalist id="rf-witems">${r.items.map(it => `<option value="${esc(it.name)}">`).join('')}</datalist>` : ''}
        <label for="rf-wm">${esc(t('w.months'))}</label>
        <select id="rf-wm">${months.map(m => `<option value="${m}" ${(w ? w.months : 24) === m ? 'selected' : ''}>${esc(mLabel(m))}</option>`).join('')}</select>
        <p class="muted small" id="rf-wuntil"></p>
      </div>
    </fieldset>

    <div class="row between">
      <button class="btn danger" type="button" id="rf-del">${icon('delete')}<span>${esc(t('r.delete'))}</span></button>
      <button class="btn primary" type="button" id="rf-close">${esc(t('r.close'))}</button>
    </div>`, () => {
    const saveW = () => {
      const on = $('#rf-w').checked;
      $('#rf-wfields').hidden = !on;
      const m = +$('#rf-wm').value;
      db.update(iic, { warranty: on ? { months: m, item: $('#rf-witem').value.trim() } : null });
      $('#rf-wuntil').textContent = on ? t('w.until', { date: fmtDay(addMonths(r.day, m)) }) : '';
    };
    $('#rf-wuntil').textContent = w ? t('w.until', { date: fmtDay(addMonths(r.day, w.months)) }) : '';
    $('#rf-w').addEventListener('change', saveW);
    $('#rf-wm').addEventListener('change', saveW);
    $('#rf-witem').addEventListener('input', saveW);
    $('#rf-name').addEventListener('change', e => {
      const v = e.target.value.trim();
      if (isManual(r)) db.update(iic, { storeName: v }); else db.setStore(r.tin, v, null);
    });
    $('#rf-cat').addEventListener('change', e => {
      db.update(iic, { cat: e.target.value, catSet: true });
      if (!isManual(r)) db.setStore(r.tin, null, e.target.value);
    });
    $('#rf-note').addEventListener('change', e => db.update(iic, { note: e.target.value.trim() }));
    $('#rf-split').addEventListener('click', () => openSplit(iic));
    $('#rf-close').addEventListener('click', () => { closeSheet(); });
    const del = $('#rf-del');
    del.addEventListener('click', () => {
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.querySelector('span').textContent = t('r.deleteConfirm');
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.querySelector('span').textContent = t('r.delete'); } }, 4000);
        return;
      }
      db.remove(iic);
      closeSheet();
      toast(t('toast.deleted'));
    });
  }, iic, 'receipt');
}

// ---------- manual entry ----------
// Cash and other spending without a QR receipt: a keypad, a category, done.
// `pre` comes from a receipt photo read on the phone: { amount, store, day, cat }.
function openManual(pre = {}) {
  let digits = pre.amount > 0 ? String(Math.round(pre.amount)) : '';
  let cat = pre.cat || (pre.store ? suggestCategory(pre.store) : 'other');
  let day = pre.day && pre.day <= todayISO() ? pre.day : todayISO();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const places = [...new Set(db.receipts.filter(isManual).map(r => r.storeName).filter(Boolean))].slice(-30);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
  openSheet(`
    <p class="kicker sheet-label">${icon(pre.fromPhoto ? 'image' : 'wallet', 'tiny')} ${esc(t(pre.fromPhoto ? 'q.photo' : 'q.cash'))}</p>
    ${pre.fromPhoto ? `<p class="notice">${icon('image')}<span>${esc(t('q.fromPhoto'))}</span></p>` : ''}
    <p class="q-amount" id="q-amount" aria-live="polite"></p>
    <div class="keypad" role="group" aria-label="${esc(t('m.amount'))}">
      ${keys.map(k => `<button type="button" data-key="${k}" ${k === 'del' ? `aria-label="${esc(t('q.del'))}"` : ''}>${k === 'del' ? '⌫' : k}</button>`).join('')}
    </div>
    <div class="chips q-cats" id="q-cats">${CATEGORIES.map(c => `<button type="button" class="chip" data-qcat="${c}" aria-pressed="${c === cat}">${esc(t('cat.' + c))}</button>`).join('')}</div>
    <input id="q-where" autocomplete="off" maxlength="80" list="q-places" placeholder="${esc(t('q.where'))}" value="${esc(pre.store || '')}" aria-label="${esc(t('m.store'))}">
    <datalist id="q-places">${places.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <div class="chips q-days" id="q-days">
      <button type="button" class="chip" data-qday="${todayISO()}">${esc(t('q.today'))}</button>
      <button type="button" class="chip" data-qday="${yesterday}">${esc(t('q.yesterday'))}</button>
      <label class="chip q-pick">${esc(t('q.other'))}<input type="date" id="q-date" max="${todayISO()}" value="${day}"></label>
    </div>
    <label class="check" ${pre.fromPhoto ? 'hidden' : ''}><input type="checkbox" id="q-rep"> <span id="q-rep-l"></span></label>
    <button class="btn primary big q-save" type="button" id="q-save" disabled></button>`, () => {
    const amountEl = $('#q-amount'), save = $('#q-save'), where = $('#q-where');
    let catTouched = !!pre.cat;
    const value = () => (digits ? Number(digits) : 0);
    const paint = () => {
      amountEl.innerHTML = `${digits ? esc(fmtL(value()).slice(0, -2)) : '0'}<span class="cur">L</span>`;
      amountEl.classList.toggle('empty', !digits);
      save.disabled = !(value() > 0);
      save.textContent = value() > 0 ? t('q.add', { amount: fmtL(value()) }) : t('q.addEmpty');
      $$('#q-cats .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qcat === cat)));
      $$('#q-days [data-qday]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.qday === day)));
      $('.q-pick').setAttribute('aria-pressed', String(day !== todayISO() && day !== yesterday));
      $('#q-rep-l').textContent = t('q.repeat', { day: +day.slice(8, 10) });
    };
    const press = k => {
      if (k === 'del') digits = digits.slice(0, -1);
      else if (digits.length < 9) digits = (digits + k).replace(/^0+/, '');
      if (navigator.vibrate) navigator.vibrate(8);
      paint();
    };
    $('.keypad').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) press(b.dataset.key); });
    $('#q-cats').addEventListener('click', e => { const b = e.target.closest('[data-qcat]'); if (b) { cat = b.dataset.qcat; catTouched = true; paint(); } });
    $('#q-days').addEventListener('click', e => { const b = e.target.closest('[data-qday]'); if (b) { day = b.dataset.qday; $('#q-date').value = day; paint(); } });
    $('#q-date').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= todayISO()) { day = e.target.value; paint(); } });
    $('.q-pick').addEventListener('click', () => { const d = $('#q-date'); try { d.showPicker && d.showPicker(); } catch (e) {} });
    where.addEventListener('input', () => { if (!catTouched && where.value.trim()) { const c = suggestCategory(where.value); if (c !== 'other') { cat = c; paint(); } } });
    // A hardware keyboard works too (laptops).
    const onKey = e => {
      if (e.target === where || e.target.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('del'); e.preventDefault(); }
      else if (e.key === 'Enter' && !save.disabled) { save.click(); e.preventDefault(); }
    };
    sheet().addEventListener('keydown', onKey);
    sheet().addEventListener('close', () => sheet().removeEventListener('keydown', onKey), { once: true });
    save.addEventListener('click', () => {
      if (!(value() > 0)) return;
      if (db.demo) db.endDemo();
      const name = where.value.trim() || t('cat.' + cat);
      const time = day === todayISO() ? nowHM() : '12:00';
      const iic = 'M' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.add({ iic, src: 'manual', tin: '', storeName: name, crtd: `${day}T${time}:00`, day, time, total: value(), cat, catSet: true, note: pre.fromPhoto ? 'foto' : '', url: '' });
      if ($('#q-rep').checked) {
        const rec = db.pref('recurring') || [];
        rec.push({ id: Date.now().toString(36), name, amount: value(), cat, dom: +day.slice(8, 10), last: monthKey(day) });
        db.setPref('recurring', rec);
      }
      closeSheet();
      toast(t('toast.saved'));
      render();
    });
    paint();
  });
}

// Repeating spending (rent, bills): add this month's entry once its day has come,
// and catch up on months the app wasn't opened. Ids are fixed per month, so nothing doubles.
function applyRecurring() {
  if (db.demo) return;
  const rec = db.pref('recurring') || [];
  if (!rec.length) return;
  const today = todayISO(), cur = monthKey(today);
  let added = 0;
  for (const r of rec) {
    let m = shiftMonth(r.last, 1);
    while (m <= cur) {
      const d = Math.min(r.dom, daysIn(m));
      const day = `${m}-${pad(d)}`;
      if (day > today) break;
      if (db.add({ iic: `R${r.id}${m.replace('-', '')}`.toUpperCase(), src: 'manual', tin: '', storeName: r.name, crtd: `${day}T09:00:00`, day, time: '09:00', total: r.amount, cat: r.cat, catSet: true, note: '', url: '', recurring: r.id })) added++;
      r.last = m;
      m = shiftMonth(m, 1);
    }
  }
  db.setPref('recurring', rec);
  if (added) toast(added === 1 ? t('rec.added', { n: added }) : t('rec.addedN', { n: added }));
}

// ---------- split ----------
function openSplit(iic) {
  const r = db.find(iic);
  const hasItems = !!(r.items && r.items.length);
  const s = r.split || { mode: hasItems ? 'items' : 'equal', people: [{ name: t('s.me'), amount: '' }, { name: '', amount: '' }], assign: {} };
  const people = s.people.map(p => ({ ...p }));
  const assign = { ...(s.assign || {}) }; // item index -> [person index]
  let mode = s.mode === 'items' && !hasItems ? 'equal' : s.mode;

  const persist = () => db.update(iic, { split: { mode, people: people.map(p => ({ name: p.name, amount: p.amount })), assign } });
  const nameOf = (i, lang = t) => people[i].name.trim() || `${lang('s.person')} ${i + 1}`;

  // Per-person totals when splitting by item. A shared item is divided equally.
  const itemTotals = () => {
    const per = people.map(() => ({ v: 0, items: [] }));
    let unassigned = 0;
    (r.items || []).forEach((it, k) => {
      const who = (assign[k] || []).filter(i => i < people.length);
      if (!who.length) { unassigned += it.total; return; }
      for (const i of who) { per[i].v += it.total / who.length; per[i].items.push(it.name); }
    });
    return { per, unassigned: Math.round(unassigned * 100) / 100 };
  };

  const message = () => {
    const head = `Kupon: ${storeLabel(r)}, ${fmtDay(r.day)} ${r.time}\nTotali: ${fmtL(r.total)}`;
    if (mode === 'equal') {
      return `${head}\nNdarë në ${people.length} persona. ${tsq('s.each', { amount: shareL(r.total, people.length) })}`;
    }
    if (mode === 'items') {
      const { per, unassigned } = itemTotals();
      return `${head}\n` + per.map((p, i) => `${nameOf(i, tsq)}: ${fmtL(Math.round(p.v))}${p.items.length ? ` (${p.items.join(', ')})` : ''}`).join('\n') +
        (unassigned > 0 ? `\n${tsq('s.unassigned', { amount: fmtL(unassigned) })}` : '');
    }
    return `${head}\n` + people.map((p, i) => `${nameOf(i, tsq)}: ${fmtL(+p.amount || 0)}`).join('\n');
  };

  const statusText = () => {
    if (mode === 'equal') return { text: t('s.each', { amount: shareL(r.total, people.length) }), err: false };
    if (mode === 'items') {
      const { unassigned } = itemTotals();
      return unassigned > 0 ? { text: t('s.unassigned', { amount: fmtL(unassigned) }), err: true } : { text: '✓', err: false };
    }
    const assigned = people.reduce((a, p) => a + (+p.amount || 0), 0);
    const diff = Math.round((r.total - assigned) * 100) / 100;
    return diff > 0 ? { text: t('s.left', { amount: fmtL(diff) }), err: true } : diff < 0 ? { text: t('s.over', { amount: fmtL(-diff) }), err: true } : { text: '✓', err: false };
  };

  const personRight = i => {
    if (mode === 'custom') return `<input class="pamt" data-i="${i}" type="number" inputmode="decimal" min="0" step="any" value="${esc(people[i].amount)}" placeholder="0" aria-label="${esc(t('th.amount'))}">`;
    if (mode === 'items') return `<span class="pshare" data-share="${i}">${fmtL(Math.round(itemTotals().per[i].v))}</span>`;
    return `<span class="pshare">${shareL(r.total, people.length)}</span>`;
  };

  const itemsList = () => `
    <p class="muted small">${esc(t('s.items.hint'))}</p>
    <ul class="sitems">${r.items.map((it, k) => `
      <li><div class="row between0"><span>${esc(it.name)}${it.qty !== 1 ? ` <span class="muted small">× ${fmtQty(it.qty)}</span>` : ''}</span><span class="num">${fmtL(it.total)}</span></div>
      <div class="chips">${people.map((p, i) => `<button type="button" class="chip" data-k="${k}" data-p="${i}" aria-pressed="${(assign[k] || []).includes(i)}">${esc(nameOf(i))}</button>`).join('')}</div></li>`).join('')}
    </ul>`;

  const draw = () => {
    const st = statusText();
    openSheet(`
      <h2>${esc(t('s.title'))}</h2>
      <p class="sub">${esc(storeLabel(r))} · ${fmtDay(r.day)} · <b>${fmtL(r.total)}</b></p>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="smode" value="equal" ${mode === 'equal' ? 'checked' : ''}><span>${esc(t('s.equal'))}</span></label>
        ${hasItems ? `<label><input type="radio" name="smode" value="items" ${mode === 'items' ? 'checked' : ''}><span>${esc(t('s.items'))}</span></label>` : ''}
        <label><input type="radio" name="smode" value="custom" ${mode === 'custom' ? 'checked' : ''}><span>${esc(t('s.custom'))}</span></label>
      </div>
      <h3>${esc(t('s.people'))}</h3>
      <ul class="people">${people.map((p, i) => `
        <li>
          <input class="pname" data-i="${i}" value="${esc(p.name)}" placeholder="${esc(t('s.name.ph'))} ${i + 1}" maxlength="30" aria-label="${esc(t('s.name.ph'))} ${i + 1}">
          ${personRight(i)}
          <button class="iconbtn" type="button" data-rm="${i}" aria-label="${esc(t('s.remove'))}" ${people.length <= 2 ? 'disabled' : ''}>${icon('dismiss')}</button>
        </li>`).join('')}
      </ul>
      <button class="btn" type="button" id="s-add">${icon('people_add')}<span>${esc(t('s.add'))}</span></button>
      ${mode === 'items' ? itemsList() : ''}
      <p class="msg ${st.err ? 'err' : ''}" id="s-status">${esc(st.text)}</p>
      <pre class="preview" id="s-preview">${esc(message())}</pre>
      <div class="row wrap gap">
        <a class="btn primary" id="s-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(message())}">${icon('share')}<span>${esc(t('s.wa'))}</span></a>
        <button class="btn" type="button" id="s-copy">${icon('copy')}<span>${esc(t('s.copy'))}</span></button>
        ${navigator.share ? `<button class="btn" type="button" id="s-share">${icon('share')}<span>${esc(t('s.share'))}</span></button>` : ''}
      </div>
      <div class="row between"><button class="btn link" type="button" id="s-back">${icon('chevron_left')}<span>${esc(t('r.title'))}</span></button></div>
    `, bind, iic, 'split');
  };

  const refreshText = () => {
    $('#s-preview').textContent = message();
    $('#s-wa').href = 'https://wa.me/?text=' + encodeURIComponent(message());
    const st = statusText();
    $('#s-status').textContent = st.text;
    $('#s-status').classList.toggle('err', st.err);
    if (mode === 'items') {
      const { per } = itemTotals();
      $$('[data-share]').forEach(el => { el.textContent = fmtL(Math.round(per[+el.dataset.share].v)); });
      $$('.chip').forEach(c => { c.textContent = nameOf(+c.dataset.p); });
    }
  };

  const bind = () => {
    $$('input[name=smode]').forEach(i => i.addEventListener('change', () => { mode = i.value; persist(); draw(); }));
    $$('.pname').forEach(i => i.addEventListener('input', () => { people[+i.dataset.i].name = i.value; persist(); refreshText(); }));
    $$('.pamt').forEach(i => i.addEventListener('input', () => { people[+i.dataset.i].amount = i.value; persist(); refreshText(); }));
    $$('.chip').forEach(c => c.addEventListener('click', () => {
      const k = c.dataset.k, p = +c.dataset.p;
      const cur = new Set(assign[k] || []);
      cur.has(p) ? cur.delete(p) : cur.add(p);
      assign[k] = [...cur].sort((a, b) => a - b);
      c.setAttribute('aria-pressed', cur.has(p));
      persist(); refreshText();
    }));
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.rm;
      people.splice(i, 1);
      for (const k of Object.keys(assign)) assign[k] = assign[k].filter(p => p !== i).map(p => (p > i ? p - 1 : p));
      persist(); draw();
    }));
    $('#s-add').addEventListener('click', () => {
      people.push({ name: '', amount: '' }); persist(); draw();
      const names = $$('.pname'); names[names.length - 1].focus();
    });
    $('#s-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(message()); toast(t('s.copied')); }
      catch (e) { const p = $('#s-preview'); const rg = document.createRange(); rg.selectNodeContents(p); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); }
    });
    const sh = $('#s-share');
    if (sh) sh.addEventListener('click', () => navigator.share({ text: message() }).catch(() => {}));
    $('#s-back').addEventListener('click', () => openReceipt(iic));
  };

  draw();
}

// ---------- receipts list & prices ----------
let query = '';
let listTab = 'receipts';
let listCat = '';
function renderList() {
  const el = $('#view-list');
  if (!el.dataset.ready) {
    el.dataset.ready = '1';
    el.innerHTML = `
      <div class="seg" role="tablist">
        <label><input type="radio" name="ltab" value="receipts"><span>${icon('receipt')} ${esc(t('list.tab.receipts'))}</span></label>
        <label><input type="radio" name="ltab" value="prices"><span>${icon('tag')} ${esc(t('list.tab.prices'))}</span></label>
        <label><input type="radio" name="ltab" value="shop"><span>${icon('wallet')} ${esc(t('list.tab.shop'))}</span></label>
      </div>
      <input type="search" id="list-q" autocomplete="off">
      <div class="chips cats" id="list-cats"></div>
      <div id="list-body"></div>`;
    $('#list-q').addEventListener('input', e => { query = e.target.value; renderListBody(); });
    $$('input[name=ltab]').forEach(i => i.addEventListener('change', () => { listTab = i.value; query = ''; renderList(); }));
  }
  $$('input[name=ltab]').forEach(i => { i.checked = i.value === listTab; });
  const q = $('#list-q');
  q.hidden = listTab === 'shop';
  q.value = query;
  q.placeholder = t(listTab === 'prices' ? 'p.search' : 'list.search');
  q.setAttribute('aria-label', q.placeholder);
  renderListBody();
}

function renderListBody() {
  const chips = $('#list-cats');
  if (listTab === 'prices') { chips.hidden = true; renderPrices(); return; }
  if (listTab === 'shop') { chips.hidden = true; renderShopping(); return; }
  const body = $('#list-body');
  const present = CATEGORIES.filter(c => db.receipts.some(r => catOf(r) === c));
  if (listCat && !present.includes(listCat)) listCat = '';
  chips.hidden = present.length < 2;
  chips.innerHTML = ['', ...present].map(c => `<button type="button" class="chip" data-lcat="${c}" aria-pressed="${listCat === c}">${esc(c ? t('cat.' + c) : t('list.all'))}</button>`).join('');
  const q = query.trim().toLowerCase();
  const all = db.receipts.slice().sort(byDateDesc);
  if (!all.length) {
    body.innerHTML = `<p class="muted pad">${esc(t('list.empty'))}</p><p><a class="btn primary" href="#scan">${icon('qr_code')}<span>${esc(t('home.empty.cta'))}</span></a></p>`;
    return;
  }
  const pool = listCat ? all.filter(r => catOf(r) === listCat) : all;
  const rs = q ? pool.filter(r => (storeLabel(r) + ' ' + r.tin + ' ' + (r.note || '') + ' ' + (r.items || []).map(i => i.name).join(' ')).toLowerCase().includes(q)) : all;
  if (!rs.length) { body.innerHTML = `<p class="muted pad">${esc(t('list.noMatch'))}</p>`; return; }
  const groups = [];
  for (const r of rs) {
    const k = monthKey(r.day);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, rs: [] });
    groups[groups.length - 1].rs.push(r);
  }
  const mark = r => {
    const st = fiscalState(r);
    if (st === 'ok') return ' ' + icon('checkmark_circle', 'tiny');
    if (st === 'missing') return ' ' + icon('warning', 'tiny warn');
    if (st === 'manual') return ' ' + icon('edit', 'tiny muted');
    return '';
  };
  body.innerHTML = groups.map(g => `
    <h2 class="group"><span>${esc(monthLabel(g.k))}</span><span>${fmtL(sum(g.rs))}</span></h2>
    <ul class="rlist">${g.rs.map(r => `
      <li><button type="button" data-open="${esc(r.iic)}">
        <span class="rmain"><span class="rname">${esc(storeLabel(r))}${mark(r)}${r.warranty ? ' ' + icon('shield_checkmark', 'tiny') : ''}</span>
        <span class="muted small">${fmtDay(r.day)} ${esc(r.time)} · ${esc(t('cat.' + catOf(r)))}${r.items && r.items.length ? ' · ' + r.items.length + ' ' + esc(t('r.items').toLowerCase()) : ''}${r.note ? ' · ' + esc(r.note) : ''}</span></span>
        <span class="ramt">${fmtL(r.total)}</span>
      </button></li>`).join('')}
    </ul>`).join('');
}

const productKey = name => name.toLowerCase().replace(/\s+/g, ' ').trim();

// Every item bought, across receipts, with its unit price over time.
function priceIndex() {
  const map = new Map();
  for (const r of db.receipts) {
    for (const it of r.items || []) {
      if (!(it.unitPrice > 0)) continue;
      const key = productKey(it.name);
      let p = map.get(key);
      if (!p) { p = { key, name: it.name, unit: it.unit, buys: [] }; map.set(key, p); }
      p.buys.push({ day: r.day, time: r.time, price: it.unitPrice, store: storeLabel(r), skey: storeKey(r), iic: r.iic });
    }
  }
  for (const p of map.values()) {
    p.buys.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
    p.last = p.buys[p.buys.length - 1];
    // Cheapest current price: the latest price seen at each store, then the lowest of those.
    const latest = new Map();
    for (const b of p.buys) latest.set(b.skey, b);
    p.byStore = [...latest.values()].sort((a, b) => a.price - b.price);
    p.cheapest = p.byStore[0];
    const first = p.buys[0];
    p.change = first.day < p.last.day && first.price > 0 ? Math.round(((p.last.price - first.price) / first.price) * 100) : null;
    p.first = first;
  }
  return [...map.values()];
}

// ---------- shopping list ----------
// Each line is matched to things you've bought before, to show the price you'd pay and where it was cheapest.
const shopping = () => db.pref('shopping') || [];
const saveShopping = list => db.setPref('shopping', list);

function matchProduct(name, index) {
  const key = productKey(name);
  const exact = index.find(p => p.key === key);
  if (exact) return exact;
  const words = key.split(' ').filter(w => w.length > 1);
  if (!words.length) return null;
  // every word of the list line appears in the product name; the most-bought wins
  const hits = index.filter(p => words.every(w => p.key.includes(w)));
  return hits.sort((a, b) => b.buys.length - a.buys.length)[0] || null;
}

function renderShopping() {
  const body = $('#list-body');
  const list = shopping();
  const index = priceIndex();
  const names = index.map(p => p.name);
  const rows = list.map(it => ({ it, p: matchProduct(it.name, index), c: ((communityCache.get(productKey(it.name)) || {}).rows || [])[0] }));
  // Ask the server once for prices of lines we haven't looked up yet, then draw again.
  const missing = list.filter(it => !it.done && !communityCache.has(productKey(it.name))).map(it => it.name);
  if (apiUp && missing.length) communityLookup(missing).then(() => { if (listTab === 'shop' && view === 'list') renderShopping(); });
  // Redrawing must not lose what is being typed in the add field.
  const typing = $('#sh-in');
  const keep = typing ? { value: typing.value, focused: document.activeElement === typing } : null;
  const open = rows.filter(r => !r.it.done);
  // Estimate: each open line at its cheapest known price; count which shop is cheapest most often.
  let est = 0, priced = 0;
  const bestAt = {};
  for (const { it, p, c } of open) {
    const own = p && p.cheapest;
    const best = own && (!c || own.price <= c.price) ? { price: own.price, store: own.store } : c ? { price: c.price, store: c.store } : null;
    if (!best) continue;
    est += best.price * (it.qty || 1); priced++;
    bestAt[best.store] = (bestAt[best.store] || 0) + 1;
  }
  const topStore = Object.entries(bestAt).sort((a, b) => b[1] - a[1])[0];
  body.innerHTML = `
    <form id="sh-form" class="row sh-add">
      <input id="sh-in" list="sh-names" autocomplete="off" maxlength="60" placeholder="${esc(t('sh.ph'))}" aria-label="${esc(t('sh.ph'))}">
      <datalist id="sh-names">${names.slice(0, 300).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <button class="btn primary" type="submit" aria-label="${esc(t('sh.add'))}">${icon('add')}</button>
    </form>
    ${open.length ? `<div class="sh-sum">
      <p><span class="kicker">${esc(t('sh.est'))}</span><b>${priced ? '≈' + esc(fmtL(Math.round(est))) : '–'}</b></p>
      <p class="muted small">${esc(priced < open.length ? t('sh.known', { n: priced, m: open.length }) : t('sh.allKnown'))}${topStore && topStore[1] > 1 ? ' ' + esc(t('sh.where', { store: topStore[0], n: topStore[1] })) : ''}</p>
    </div>` : ''}
    ${list.length ? `<ul class="sh-list">${rows.map(({ it, p, c }) => `
      <li class="${it.done ? 'done' : ''}">
        <label class="sh-check"><input type="checkbox" data-sh-done="${esc(it.id)}" ${it.done ? 'checked' : ''}><span class="sr">${esc(t('sh.done'))}</span></label>
        <span class="sh-main"><span class="sh-name">${esc(it.name)}</span>
          <span class="muted small">${p ? esc(p.cheapest && p.cheapest.skey !== p.last.skey && p.cheapest.price < p.last.price
            ? t('sh.cheaper', { price: fmtL(p.cheapest.price), store: p.cheapest.store, last: fmtL(p.last.price) })
            : t('sh.last', { price: fmtL(p.last.price), store: p.last.store })) : c ? '' : esc(t('sh.unknown'))}</span>
          ${c && (!p || c.price < (p.cheapest || p.last).price) ? `<span class="small good">${esc(t('sh.others', { price: fmtL(c.price), store: c.store }))}</span>` : ''}</span>
        <span class="sh-qty"><button type="button" data-sh-q="${esc(it.id)}" data-d="-1" aria-label="−">−</button><b>${it.qty || 1}</b><button type="button" data-sh-q="${esc(it.id)}" data-d="1" aria-label="+">+</button></span>
      </li>`).join('')}</ul>
      ${list.some(i => i.done) ? `<p><button class="btn link" type="button" data-act="sh-clear">${esc(t('sh.clear'))}</button></p>` : ''}`
      : `<p class="muted pad">${esc(t('sh.empty'))}</p>`}`;
  if (keep) { const i = $('#sh-in'); i.value = keep.value; if (keep.focused) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); } }
  $('#sh-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#sh-in').value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    const cur = shopping();
    const same = cur.find(i => productKey(i.name) === productKey(v) && !i.done);
    if (same) same.qty = (same.qty || 1) + 1;
    else cur.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: v, qty: 1, done: false });
    saveShopping(cur);
    $('#sh-in').value = '';
    renderShopping();
    $('#sh-in').focus();
  });
}

let communityTimer;
function renderPrices() {
  clearTimeout(communityTimer);
  if (apiUp && query.trim().length >= 3) {
    const q0 = query;
    communityTimer = setTimeout(async () => {
      const rows = await communityPrices(q0);
      const box = $('#p-everyone');
      if (!box || query !== q0) return;
      box.innerHTML = rows.length ? `<h2>${esc(t('cp.others'))}</h2>${offerRows(rows.slice(0, 12))}<p class="muted small">${esc(t('cp.source'))}</p>` : '';
    }, 450);
  }
  const body = $('#list-body');
  const q = query.trim().toLowerCase();
  const all = priceIndex().sort((a, b) => (b.last.day + b.last.time).localeCompare(a.last.day + a.last.time));
  if (!all.length) { body.innerHTML = `<p class="muted pad">${esc(t('p.empty'))}</p>`; return; }
  const ps = q ? all.filter(p => p.key.includes(q)) : all;
  const unit = p => (unitOf(p.unit) ? ' ' + t('p.unit', { unit: unitOf(p.unit) }) : '');
  body.innerHTML = `<p class="muted small">${esc(t('p.intro'))}</p>` + (ps.length ? `<ul class="rlist">${ps.map(p => {
    const cheaperElsewhere = p.cheapest && p.cheapest.skey !== p.last.skey && p.cheapest.price < p.last.price;
    return `<li><button type="button" data-product="${esc(p.key)}">
      <span class="rmain"><span class="rname">${esc(p.name)}</span>
      <span class="muted small">${esc(t('p.last', { price: fmtL(p.last.price), store: p.last.store }))}${esc(unit(p))}</span>
      ${cheaperElsewhere ? `<span class="small good">${icon('arrow_trending_down', 'tiny')} ${esc(t('p.cheapest', { price: fmtL(p.cheapest.price), store: p.cheapest.store }))}</span>` : ''}</span>
      <span class="ramt small">${p.change != null && p.change !== 0 ? `<span class="${p.change > 0 ? 'warn' : 'good'}">${esc(pctStr(p.change))}</span><br>` : ''}<span class="muted">${esc(t('p.times', { n: p.buys.length }))}</span></span>
    </button></li>`;
  }).join('')}</ul>` : `<p class="muted pad">${esc(t('list.noMatch'))}</p>`) + '<div id="p-everyone"></div>';
}

function openProduct(key) {
  const p = priceIndex().find(x => x.key === key);
  if (!p) return;
  openSheet(`
    <h2>${esc(p.name)}</h2>
    ${p.change != null && p.change !== 0 ? `<p class="sub"><span class="${p.change > 0 ? 'warn' : 'good'}">${icon(p.change > 0 ? 'arrow_trending' : 'arrow_trending_down', 'tiny')} ${esc(t('p.change', { pct: pctStr(p.change), date: fmtDay(p.first.day) }))}</span></p>` : ''}
    ${p.byStore.length > 1 ? `
      <h3>${esc(t('th.store'))}</h3>
      <table class="tbl"><tbody>${p.byStore.map((b, i) => `<tr><td>${esc(b.store)}<span class="muted small block">${fmtDay(b.day)}</span></td>
        <td class="num ${i === 0 ? 'good' : ''}">${fmtL(b.price)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div id="p-community"></div>
    <h3>${esc(t('p.history'))}</h3>
    <table class="tbl"><thead><tr><th>${esc(t('th.date'))}</th><th>${esc(t('th.store'))}</th><th class="num">${esc(t('th.price'))}</th></tr></thead>
      <tbody>${p.buys.slice().reverse().map(b => `<tr><td class="small">${fmtDay(b.day)}</td><td class="small">${esc(b.store)}</td><td class="num">${fmtL(b.price)}</td></tr>`).join('')}</tbody></table>
    <div class="row end"><button class="btn primary" type="button" id="p-close">${esc(t('r.close'))}</button></div>`,
  () => {
    $('#p-close').addEventListener('click', closeSheet);
    if (!apiUp) return;
    const box = $('#p-community');
    box.innerHTML = `<h3>${esc(t('cp.others'))}</h3><p class="fstate muted"><span class="spin" aria-hidden="true"></span><span>${esc(t('cp.loading'))}</span></p>`;
    communityPrices(p.name).then(rows => {
      if (!box.isConnected) return;
      box.innerHTML = `<h3>${esc(t('cp.others'))}</h3>` + (rows.length ? offerRows(rows.slice(0, 8)) + `<p class="muted small">${esc(t('cp.source'))}</p>` : `<p class="muted small">${esc(t('cp.none'))}</p>`);
    });
  });
}

// ---------- Kupon's server: features that need it appear only when it answers ----------
let apiUp = false;
async function checkApi() {
  if (!API_BASE) return;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(API_BASE + '/v1/health', { signal: ctrl.signal, credentials: 'omit' });
    apiUp = res.ok;
  } catch (e) { apiUp = false; }
  if (apiUp && !sheet().open) render();
}

// ---------- shared prices (opt-in to give; anyone can look) ----------
// Giving sends only the receipt's code, NIPT and time: the server reads the items from the portal itself.
async function sharePrices(iic) {
  const r = db.find(iic);
  if (!r || !apiUp || db.demo || !db.pref('sharePrices') || r.shared || isManual(r)) return false;
  try {
    const res = await fetch(API_BASE + '/v1/prices/contribute', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ iic: r.iic, tin: r.tin, crtd: r.crtd }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && !j.error) { db.update(iic, { shared: true }); return true; }
  } catch (e) {}
  return false;
}

async function shareOlder(btn) {
  const todo = db.receipts.filter(r => !isManual(r) && fiscalState(r) === 'ok' && !r.shared).slice(0, 150);
  btn.disabled = true;
  let n = 0;
  for (let i = 0; i < todo.length; i++) {
    const s = btn.querySelector('span'); if (s) s.textContent = t('cp.sharing', { i: i + 1, n: todo.length });
    if (await sharePrices(todo[i].iic)) n++;
    await sleep(500);
  }
  toast(t('cp.shared', { n }));
  render();
}

// Answers are kept for a few minutes so lists and sheets don't ask twice.
const communityCache = new Map();
async function communityPrices(q) {
  const key = productKey(q);
  const hit = communityCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.rows;
  if (!apiUp) return [];
  try {
    const res = await fetch(API_BASE + '/v1/prices?q=' + encodeURIComponent(q), { credentials: 'omit' });
    const rows = res.ok ? (await res.json()).results || [] : [];
    communityCache.set(key, { at: Date.now(), rows });
    return rows;
  } catch (e) { return []; }
}
async function communityLookup(names) {
  const need = names.filter(n => { const h = communityCache.get(productKey(n)); return !h || Date.now() - h.at > 5 * 60000; });
  if (need.length && apiUp) {
    try {
      const res = await fetch(API_BASE + '/v1/prices/lookup', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ names: need.slice(0, 25) }) });
      if (res.ok) { const { results } = await res.json(); for (const [n, rows] of Object.entries(results || {})) communityCache.set(productKey(n), { at: Date.now(), rows }); }
    } catch (e) {}
  }
  return Object.fromEntries(names.map(n => [n, (communityCache.get(productKey(n)) || {}).rows || []]));
}
const offerRows = rows => `<ul class="rows">${rows.map(o => `<li><span class="rk">${esc(fmtDay(o.day).slice(0, 5))}</span>
  <span class="rl">${esc(o.store)}${o.town ? `<span class="muted small"> · ${esc(o.town)}</span>` : ''}<span class="muted small block">${esc(o.name)}</span></span>
  <span class="rv">${fmtL(o.price)}</span></li>`).join('')}</ul>`;

function sharePricesSection() {
  if (!apiUp || db.demo) return '';
  const on = !!db.pref('sharePrices');
  const older = on ? db.receipts.filter(r => !isManual(r) && fiscalState(r) === 'ok' && !r.shared).length : 0;
  return `<h2>${esc(t('cp.title'))}</h2>
    <label class="check"><input type="checkbox" data-act="cp-toggle" ${on ? 'checked' : ''}> <span>${esc(t('cp.toggle'))}</span></label>
    <p class="muted small">${esc(t('cp.privacy'))}</p>
    ${older ? `<p><button class="btn small" type="button" data-act="cp-older">${icon('arrow_upload')}<span>${esc(t('cp.older', { n: older }))}</span></button></p>` : ''}`;
}

// ---------- reminders ----------
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

// Everything the phone may want to say on a given morning. Texts stay here; dates go to the server.
function buildReminders() {
  const today = todayISO(), out = [];
  for (const w of warrantyRows()) {
    for (const before of [30, 7]) {
      const date = addDays(w.until, -before);
      if (date > today) out.push({ id: `w-${w.r.iic}-${before}`, date, url: '#warranty', title: t('rm.wTitle', { n: before }),
        body: t('rm.wBody', { item: (w.r.warranty && w.r.warranty.item) || storeLabel(w.r), store: storeLabel(w.r), date: fmtDay(w.until) }) });
    }
  }
  for (const r of db.receipts) {
    if (isManual(r) || fiscalState(r) === 'ok' || dayDiff(r.day, today) > 7) continue;
    const date = addDays(r.day, 2) > today ? addDays(r.day, 2) : addDays(today, 1);
    out.push({ id: `p-${r.iic}`, date, url: '#list', title: t('rm.pTitle'), body: t('rm.pBody', { store: storeLabel(r), amount: fmtL(r.total), date: fmtDay(r.day) }) });
  }
  const key = monthKey(today), next = shiftMonth(key, 1);
  out.push({ id: `m-${key}`, date: `${next}-01`, url: '#home', title: t('rm.mTitle', { month: t('monthDef')[+key.slice(5, 7) - 1] }), body: t('rm.mBody') });
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
}

function remindSection() {
  if (!apiUp || db.demo || !pushSupported()) return '';
  const on = !!db.pref('remind');
  const next = on ? buildReminders()[0] : null;
  return `<h2>${esc(t('rm.title'))}</h2>
    ${needsInstall() && !on ? `<p class="small">${esc(t('rm.ios'))}</p>` : `
    <label class="check"><input type="checkbox" data-act="rm-toggle" ${on ? 'checked' : ''}> <span>${esc(t('rm.toggle'))}</span></label>
    <p class="muted small">${esc(t('rm.what'))}</p>
    ${next ? `<p class="small">${icon('calendar_add', 'tiny')} ${esc(t('rm.next', { date: fmtDay(next.date), title: next.title }))}</p>` : ''}`}`;
}

async function toggleReminders(input) {
  input.disabled = true;
  if (db.pref('remind')) { await disableReminders(); toast(t('rm.off')); }
  else {
    const r = await enableReminders(buildReminders, getLang());
    toast(r.ok ? t('rm.on') : t('rm.err.' + (r.error === 'denied' ? 'denied' : 'network')));
  }
  render();
}

// ---------- sync between phones ----------
const ago = iso => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? t('sy.now') : m < 60 ? t('sy.min', { n: m }) : m < 1440 ? t('sy.hour', { n: Math.round(m / 60) }) : fmtDay(iso.slice(0, 10));
};
function syncSection() {
  if (db.demo || (!apiUp && !db.pref('sync'))) return '';
  const st = db.pref('sync');
  const head = `<h2>${esc(t('sy.title'))}</h2>`;
  if (!syncSupported()) return head + `<p class="muted small">${esc(t('sy.https'))}</p>`;
  if (!st) {
    return head + `<p class="small">${esc(t('sy.intro'))}</p>
      <div class="row wrap"><button class="btn primary" type="button" data-act="sync-on">${icon('arrow_sync')}<span>${esc(t('sy.on'))}</span></button>
      <button class="btn" type="button" data-act="sync-join">${esc(t('sy.join'))}</button></div>`;
  }
  return head + `<p class="small">${icon('checkmark_circle', 'tiny')} ${esc(st.at ? t('sy.last', { when: ago(st.at) }) : t('sy.never'))}${st.error ? ` <span class="warn">· ${esc(t('sy.err.' + (st.error.startsWith('http') ? 'network' : st.error)))}</span>` : ''}</p>
    <div class="row wrap"><button class="btn" type="button" data-act="sync-now">${icon('arrow_sync')}<span>${esc(t('sy.now.btn'))}</span></button>
    <button class="btn" type="button" data-act="sync-code">${esc(t('sy.show'))}</button>
    <button class="btn link" type="button" data-act="sync-off"><span>${esc(t('sy.off'))}</span></button></div>`;
}

async function turnSyncOn(btn) {
  btn.disabled = true;
  const res = await enableSync();
  if (!res.ok) { toast(t('sy.err.' + (res.error && res.error.startsWith('http') ? 'network' : res.error || 'network'))); disableSync(); render(); return; }
  render();
  openSyncCode(true);
}

function openSyncCode(first = false) {
  const st = db.pref('sync');
  if (!st) return;
  openSheet(`
    <h2>${esc(t('sy.codeTitle'))}</h2>
    ${first ? `<p>${esc(t('sy.codeFirst'))}</p>` : ''}
    <p class="sync-code" id="sy-code">${esc(st.code)}</p>
    <div class="row wrap"><button class="btn" type="button" id="sy-copy">${icon('copy')}<span>${esc(t('sy.copy'))}</span></button>
    ${navigator.share ? `<button class="btn" type="button" id="sy-share">${icon('share')}<span>${esc(t('sy.shareCode'))}</span></button>` : ''}</div>
    <p class="notice">${icon('warning')}<span>${esc(t('sy.keep'))}</span></p>
    <p class="muted small">${esc(t('sy.how'))}</p>
    <div class="row end"><button class="btn primary" type="button" id="sy-close">${esc(t('r.close'))}</button></div>`, () => {
    $('#sy-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(st.code); toast(t('sy.copied')); } catch (e) { toast(st.code); } });
    const sh = $('#sy-share');
    if (sh) sh.addEventListener('click', () => navigator.share({ text: st.code }).catch(() => {}));
    $('#sy-close').addEventListener('click', closeSheet);
  });
}

function openJoin() {
  openSheet(`
    <h2>${esc(t('sy.join'))}</h2>
    <form id="sy-form" class="stack">
      <label for="sy-in">${esc(t('sy.codeLabel'))}</label>
      <input id="sy-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX">
      <p class="muted small">${esc(t('sy.joinHint'))}</p>
      <p class="msg err" id="sy-msg"></p>
      <div class="row end"><button class="btn primary" type="submit">${esc(t('sy.joinBtn'))}</button></div>
    </form>`, () => {
    $('#sy-form').addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('#sy-in').value;
      if (!validCode(code)) { $('#sy-msg').textContent = t('sy.err.bad_code'); return; }
      const b = e.submitter; if (b) b.disabled = true;
      $('#sy-msg').textContent = '';
      const res = await enableSync(code);
      if (b) b.disabled = false;
      if (!res.ok) { $('#sy-msg').textContent = t('sy.err.' + (res.error && res.error.startsWith('http') ? 'network' : res.error || 'network')); return; }
      closeSheet();
      toast(t('sy.joined', { n: db.receipts.length }));
    });
  });
}

// ---------- AI coach (opt-in; sends category totals only) ----------
function coachSection() {
  if (!apiUp) return '';
  return `<h2>${esc(t('ai.title'))}</h2>
    <label class="check"><input type="checkbox" data-act="coach-toggle" ${db.pref('coach') ? 'checked' : ''}> <span>${esc(t('ai.toggle'))}</span></label>
    <p class="muted small">${esc(t('ai.privacy'))}</p>`;
}

// Exactly what leaves the phone: numbers per category, nothing else.
function coachSummary() {
  const today = todayISO(), key = monthKey(today), day = +today.slice(8, 10);
  const rs = monthReceipts(key);
  const prevAll = monthReceipts(shiftMonth(key, -1));
  const prev = prevAll.filter(r => +r.day.slice(8, 10) <= day);
  const byCat = list => { const m = {}; for (const r of list) m[catOf(r)] = Math.round((m[catOf(r)] || 0) + r.total); return m; };
  return {
    month: key, dayOfMonth: day, daysInMonth: daysIn(key),
    total: Math.round(sum(rs)), byCategory: byCat(rs),
    lastMonthSameDays: byCat(prev), lastMonthTotal: Math.round(sum(prevAll)),
    monthlyLimit: db.pref('limit') > 0 ? db.pref('limit') : null, receipts: rs.length,
  };
}

function openCoach() {
  const summary = coachSummary();
  const asks = [t('ai.q1'), t('ai.q2'), t('ai.q3')];
  openSheet(`
    <p class="kicker sheet-label">${icon('people', 'tiny')} ${esc(t('ai.title'))}</p>
    <div class="chips" id="ai-asks">${asks.map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form id="ai-form" class="stack">
      <label for="ai-q">${esc(t('ai.label'))}</label>
      <input id="ai-q" maxlength="300" autocomplete="off" placeholder="${esc(t('ai.ph'))}">
      <div class="row end"><button class="btn primary" type="submit">${esc(t('ai.send'))}</button></div>
    </form>
    <div id="ai-out" aria-live="polite"></div>
    <details class="ai-sent"><summary class="muted small">${esc(t('ai.sent'))}</summary><pre>${esc(JSON.stringify(summary, null, 1))}</pre></details>`, () => {
    const out = $('#ai-out'), q = $('#ai-q');
    $('#ai-asks').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { q.value = b.dataset.q; $('#ai-form').requestSubmit(); } });
    $('#ai-form').addEventListener('submit', async e => {
      e.preventDefault();
      const question = q.value.trim();
      if (question.length < 3) return;
      const btn = $('#ai-form button'); btn.disabled = true;
      out.innerHTML = `<p class="fstate muted"><span class="spin" aria-hidden="true"></span><span>${esc(t('ai.thinking'))}</span></p>`;
      try {
        const res = await fetch(API_BASE + '/v1/coach', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, lang: getLang(), summary }) });
        const j = await res.json().catch(() => ({}));
        if (res.status === 429) throw new Error(j.error === 'busy' ? 'busy' : 'rate');
        if (!res.ok || !j.answer) throw new Error(j.refused ? 'refused' : 'down');
        out.innerHTML = `<div class="ai-answer"><p class="ai-q">${esc(question)}</p>${j.answer.split(/\n+/).map(p => `<p>${esc(p.replace(/^[-*•]\s*/, '· '))}</p>`).join('')}</div>`;
      } catch (err) {
        out.innerHTML = `<p class="fstate warn">${icon('warning')}<span>${esc(t('ai.err.' + (['rate', 'busy', 'refused'].includes(err.message) ? err.message : 'down')))}</span></p>`;
      } finally { btn.disabled = false; }
    });
  });
}

// ---------- one store ----------
function openStore(key) {
  const rs = db.receipts.filter(r => storeKey(r) === key).sort(byDateDesc);
  if (!rs.length) return;
  const total = sum(rs);
  const counts = new Map();
  for (const r of rs) {
    for (const it of r.items || []) {
      const k = productKey(it.name);
      const c = counts.get(k) || { name: it.name, n: 0, last: null };
      c.n++;
      if (c.last == null) c.last = it.unitPrice; // newest receipt first, so this is the latest price
      counts.set(k, c);
    }
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  openSheet(`
    <p class="kicker sheet-label">${esc(t('cat.' + catOf(rs[0])))}${rs[0].tin && !db.demo ? ' · NIPT ' + esc(rs[0].tin) : ''}</p>
    <h2>${esc(storeLabel(rs[0]))}</h2>
    <dl class="tally">
      <div><dt>${esc(t('st.visits'))}</dt><dd>${rs.length}</dd></div>
      <div><dt>${esc(t('st.total'))}</dt><dd>${fmtL(total)}</dd></div>
      <div><dt>${esc(t('st.avg'))}</dt><dd>${fmtL(Math.round(total / rs.length))}</dd></div>
    </dl>
    <p class="muted small">${esc(t('st.first', { date: fmtDay(rs[rs.length - 1].day), last: fmtDay(rs[0].day) }))}</p>
    ${top.length ? `<h3>${esc(t('st.items'))}</h3>
      <ul class="rows">${top.map(c => `<li><span class="rk">${c.n}×</span><span class="rl">${esc(c.name)}</span><span class="rv">${c.last != null ? fmtL(c.last) : ''}</span></li>`).join('')}</ul>` : ''}
    <h3>${esc(t('st.recent'))}</h3>
    <ul class="rlist">${rs.slice(0, 8).map(r => `
      <li><button type="button" data-open="${esc(r.iic)}"><span class="rmain"><span class="rname">${fmtDay(r.day)}</span>
        <span class="muted small">${esc(r.time)}${r.items && r.items.length ? ' · ' + r.items.length + ' ' + esc(t('r.items').toLowerCase()) : ''}</span></span>
        <span class="ramt">${fmtL(r.total)}</span></button></li>`).join('')}</ul>
    <div class="row end"><button class="btn primary" type="button" id="st-close">${esc(t('r.close'))}</button></div>`,
  () => $('#st-close').addEventListener('click', closeSheet));
}

// ---------- warranty vault ----------
function warrantyRows() {
  const today = todayISO();
  return db.receipts.filter(r => r.warranty).map(r => {
    const until = addMonths(r.day, r.warranty.months);
    return { r, until, left: dayDiff(today, until) };
  }).sort((a, b) => a.until.localeCompare(b.until));
}

function renderWarranty() {
  const el = $('#view-warranty');
  const rows = warrantyRows();
  const soon = rows.filter(w => w.left >= 0 && w.left <= 30);
  const active = rows.filter(w => w.left > 30);
  const expired = rows.filter(w => w.left < 0).reverse();
  const item = w => {
    const label = w.left < 0 ? t('w.ago', { date: fmtDay(w.until) }) : w.left === 0 ? t('w.today') : w.left === 1 ? t('w.left1') : t('w.left', { n: w.left });
    return `<li class="${w.left >= 0 && w.left <= 30 ? 'soon' : ''}">
      <button type="button" data-open="${esc(w.r.iic)}">
        <span class="rmain"><span class="rname">${esc(w.r.warranty.item || storeLabel(w.r))}</span>
        <span class="muted small">${esc(storeLabel(w.r))} · ${fmtDay(w.r.day)} · ${fmtL(w.r.total)}</span></span>
        <span class="ramt small">${w.left >= 0 ? esc(t('w.until', { date: fmtDay(w.until) })) + '<br>' : ''}<span class="${w.left >= 0 && w.left <= 30 ? 'warn' : 'muted'}">${esc(label)}</span></span>
      </button>
      ${w.left >= 0 ? `<button type="button" class="btn link small" data-ics="${esc(w.r.iic)}">${icon('calendar_add')}<span>${esc(t('w.cal'))}</span></button>` : ''}
    </li>`;
  };
  const section = (title, list) => (list.length ? `<h2>${esc(title)}</h2><ul class="rlist wlist">${list.map(item).join('')}</ul>` : '');
  el.innerHTML = `
    <h1>${esc(t('w.title'))}</h1>
    <p class="muted">${esc(t('w.intro'))}</p>
    ${rows.length ? section(t('w.soon'), soon) + section(t('w.active'), active) + section(t('w.expired'), expired) : `<p class="muted pad">${esc(t('w.empty'))}</p>`}`;
}

function downloadICS(iic) {
  const r = db.find(iic);
  const until = addMonths(r.day, r.warranty.months);
  // All-day event two weeks before expiry, so there is time to use the warranty.
  const [y, m, d] = until.split('-').map(Number);
  const remind = new Date(y, m - 1, d - 14);
  const ymd = dt => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
  const next = new Date(remind); next.setDate(next.getDate() + 1);
  const itemName = r.warranty.item || storeLabel(r);
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kupon//aristxa.github.io//EN', 'BEGIN:VEVENT',
    `UID:kupon-${r.iic}@aristxa.github.io`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${ymd(remind)}`, `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${icsEsc(t('w.cal.title', { item: itemName }))}`,
    `DESCRIPTION:${icsEsc(t('w.cal.desc', { item: itemName, store: storeLabel(r), date: fmtDay(until), url: db.demo || !r.url ? '-' : r.url }))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${icsEsc(t('w.cal.title', { item: itemName }))}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  download(`garancia-${itemName.replace(/[^\w\-ëçË Ç]+/g, '').trim().replace(/\s+/g, '-') || 'kupon'}.ics`, lines.join('\r\n'), 'text/calendar');
}

// ---------- data ----------
let installEvt = null;
let fetchingAll = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'data') render(); });

function renderData() {
  const el = $('#view-data');
  const stores = Object.entries(db.stores).filter(([tin]) => db.receipts.some(r => r.tin === tin));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const unfetched = db.receipts.filter(r => !isManual(r) && fiscalState(r) !== 'ok');
  const budgets = db.pref('budgets') || {};
  el.innerHTML = `
    <h1>${esc(t('d.title'))}</h1>
    <p>${esc(t('d.privacy'))}</p>
    <p class="muted">${esc(t('d.stats', { n: db.receipts.length, s: stores.length }))}</p>
    ${db.demo ? `<p class="notice">${esc(t('d.demoOff'))}</p>` : `
    <fieldset class="warranty">
      <label class="check"><input type="checkbox" id="d-portal" ${portalOn() ? 'checked' : ''}> ${icon('checkmark_circle')} <span>${esc(t('d.portal'))}</span></label>
      <p class="muted small">${esc(t('d.portal.hint'))}</p>
      ${portalOn() && unfetched.length ? `<button class="btn small" type="button" id="d-fetch" ${fetchingAll ? 'disabled' : ''}>${icon('arrow_sync')}<span>${esc(t('d.fetchAll', { n: unfetched.length }))}</span></button>` : ''}
    </fieldset>
    <div class="stack">
      <button class="btn" type="button" data-act="csv" ${db.receipts.length ? '' : 'disabled'}>${icon('arrow_download')}<span>${esc(t('d.csv'))}</span></button>
      <button class="btn" type="button" data-act="json" ${db.receipts.length ? '' : 'disabled'}>${icon('arrow_download')}<span>${esc(t('d.json'))}</span></button>
      <label class="btn" for="import-input">${icon('arrow_upload')}<span>${esc(t('d.import'))}</span></label>
      <input type="file" id="import-input" accept=".json,.csv,application/json,text/csv" hidden>
    </div>`}
    ${syncSection()}
    ${remindSection()}
    ${sharePricesSection()}
    ${coachSection()}
    ${(db.pref('recurring') || []).length ? `<h2>${esc(t('rec.title'))}</h2>
      <p class="muted small">${esc(t('rec.hint'))}</p>
      <ul class="rlist">${db.pref('recurring').map(r => `<li><div class="rec-row"><span class="rmain"><span class="rname">${esc(r.name)}</span>
        <span class="muted small">${esc(t('cat.' + r.cat))} · ${esc(t('rec.day', { day: r.dom }))}</span></span>
        <span class="ramt">${fmtL(r.amount)}</span><button class="btn small" type="button" data-act="rec-stop" data-id="${esc(r.id)}">${esc(t('rec.stop'))}</button></div></li>`).join('')}</ul>` : ''}
    ${db.receipts.length ? `<h2>${esc(t('year.title'))}</h2><p><button class="btn" type="button" data-act="share-year" data-year="${wrapYear() || todayISO().slice(0, 4)}">${icon('share')}<span>${esc(t('year.btn', { year: wrapYear() || todayISO().slice(0, 4) }))}</span></button></p>` : ''}
    <h2>${esc(t('lim.title'))}</h2>
    <p><button class="btn" type="button" data-act="limit">${db.pref('limit') > 0 ? esc(fmtL(db.pref('limit')) + ' · ' + t('lim.edit')) : esc(t('lim.set'))}</button></p>
    <h2>${esc(t('d.budgets'))}</h2>
    <p class="muted small">${esc(t('d.budgets.hint'))}</p>
    <table class="tbl budgets"><tbody>${CATEGORIES.map(c => `
      <tr><td><label for="b-${c}">${esc(t('cat.' + c))}</label></td>
      <td class="num"><input id="b-${c}" data-budget="${c}" type="number" inputmode="numeric" min="0" step="100" value="${budgets[c] > 0 ? budgets[c] : ''}" placeholder="–"></td></tr>`).join('')}
    </tbody></table>
    ${!standalone && (installEvt || ios) ? `
      <h2>${esc(t('d.install'))}</h2>
      ${installEvt ? `<button class="btn" type="button" data-act="install">${icon('arrow_download')}<span>${esc(t('d.install'))}</span></button>` : `<p class="muted">${esc(t('d.installIOS'))}</p>`}` : ''}
    ${stores.length ? `
      <h2>${esc(t('d.stores'))}</h2>
      <p class="muted small">${esc(t('d.stores.hint'))}</p>
      <table class="tbl">
        <thead><tr><th>${esc(t('th.store'))}</th><th>${esc(t('r.nipt'))}</th><th>${esc(t('th.category'))}</th></tr></thead>
        <tbody>${stores.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '')).map(([tin, s]) => `
          <tr><td>${esc(s.name || t('unnamed'))}</td><td class="small">${esc(tin)}</td><td class="small">${esc(t('cat.' + (s.cat || 'other')))}</td></tr>`).join('')}
        </tbody></table>` : ''}
    <h2>Kupon</h2>
    <p class="muted">${esc(t('d.about'))}</p>
    <p class="muted small">${esc(t('d.notGov'))}</p>
    <p class="muted">${esc(t('d.fiskal'))} <a href="${FISKAL_URL}" target="_blank" rel="noopener">Asistenti Fiskal ↗</a></p>
    <p class="muted small"><a href="https://github.com/Aristxa/KUPON" target="_blank" rel="noopener">${esc(t('d.source'))}</a> · Icons: Microsoft Fluent UI System Icons (MIT). QR fallback: jsQR (Apache-2.0).</p>
    <p class="credit">${esc(t('d.credit'))} <a href="https://www.novaris.al" target="_blank" rel="noopener">Novaris Labs ↗</a></p>
    ${!db.demo && db.receipts.length ? `<div class="row"><button class="btn danger" type="button" id="wipe">${icon('delete')}<span>${esc(t('d.danger'))}</span></button></div>` : ''}
    ${!db.receipts.length && !db.demo ? `<p><button class="btn link" type="button" data-act="demo">${esc(t('demo.start'))}</button></p>` : ''}
  `;
  $$('[data-budget]').forEach(inp => inp.addEventListener('change', () => {
    const b = { ...(db.pref('budgets') || {}) };
    const v = Math.round(Number(inp.value));
    if (v > 0) b[inp.dataset.budget] = v; else delete b[inp.dataset.budget];
    db.setPref('budgets', b);
    toast(t('toast.saved'));
  }));
  const portal = $('#d-portal');
  if (portal) portal.addEventListener('change', () => { db.setPref('portal', portal.checked); render(); });
  const fetchBtn = $('#d-fetch');
  if (fetchBtn) fetchBtn.addEventListener('click', async () => {
    fetchingAll = true;
    const list = db.receipts.filter(r => !isManual(r) && fiscalState(r) !== 'ok').map(r => r.iic);
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      const b = $('#d-fetch span');
      if (b) b.textContent = t('d.fetching', { i: i + 1, n: list.length });
      await checkReceipt(list[i]);
      if (fiscalState(db.find(list[i]) || {}) === 'ok') ok++;
      await sleep(800);
    }
    fetchingAll = false;
    toast(t('d.fetchDone', { n: ok }));
    if (view === 'data') render();
  });
  const imp = $('#import-input');
  if (imp) imp.addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const n = /\.csv$/i.test(f.name) || !/^\s*[{[]/.test(text) ? importCSV(text) : importJSON(text);
      toast(t('d.imported', { n }));
      render();
    } catch (err) { toast(t('d.importFail')); }
  });
  const wipe = $('#wipe');
  if (wipe) wipe.addEventListener('click', () => {
    if (!wipe.dataset.armed) {
      wipe.dataset.armed = '1';
      wipe.querySelector('span').textContent = t('d.dangerConfirm');
      setTimeout(() => { if (wipe.isConnected) { delete wipe.dataset.armed; wipe.querySelector('span').textContent = t('d.danger'); } }, 4000);
      return;
    }
    db.clear();
    toast(t('d.cleared'));
    render();
  });
}

function download(name, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const CSV_COLS = ['date', 'time', 'store', 'nipt', 'category', 'total_all', 'vat_all', 'declared', 'items', 'note', 'warranty_item', 'warranty_months', 'warranty_until', 'source', 'crtd', 'iic', 'url'];
function exportCSV() {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = db.receipts.slice().sort(byDateDesc).map(r => [
    r.day, r.time, storeLabel(r), r.tin, catOf(r), r.total, r.vat != null ? r.vat : '',
    isManual(r) ? '' : fiscalState(r) === 'ok' ? 'yes' : fiscalState(r) === 'missing' ? 'no' : '',
    (r.items || []).map(i => `${fmtQty(i.qty)} x ${i.name}`).join(' | '),
    r.note || '', r.warranty ? r.warranty.item : '', r.warranty ? r.warranty.months : '', r.warranty ? addMonths(r.day, r.warranty.months) : '',
    r.src || 'qr', r.crtd, r.iic, r.url,
  ].map(q).join(','));
  // BOM so Excel reads ë and ç correctly
  download(`kupon-${todayISO()}.csv`, '﻿' + [CSV_COLS.join(','), ...rows].join('\r\n'), 'text/csv');
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function importCSV(text) {
  const [head, ...rows] = parseCSV(text);
  const ix = Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), i]));
  if (ix.iic == null || ix.date == null || ix.total_all == null) throw new Error('bad csv');
  const stores = {}, receipts = [];
  for (const c of rows) {
    const g = k => (ix[k] != null ? (c[ix[k]] || '').trim() : '');
    // Prefer re-parsing the portal URL; fall back to the columns.
    const parsed = g('url') ? parseReceiptQR(g('url')) : { ok: false };
    const manual = g('source') === 'manual' || (!g('nipt') && !g('url'));
    const base = parsed.ok ? parsed.receipt : {
      iic: g('iic').toUpperCase(), tin: g('nipt').toUpperCase(), crtd: g('crtd') || `${g('date')}T${g('time') || '00:00'}:00`,
      day: g('date'), time: g('time') || '00:00', total: +g('total_all'), url: g('url'),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base.day)) continue;
    const r = { ...base, src: manual ? 'manual' : 'qr', cat: CATEGORIES.includes(g('category')) ? g('category') : '', note: g('note') };
    if (manual) r.storeName = g('store');
    if (g('vat_all')) r.vat = +g('vat_all');
    if (g('warranty_months')) r.warranty = { months: +g('warranty_months'), item: g('warranty_item') };
    if (!manual && g('store') && !stores[r.tin]) stores[r.tin] = { name: g('store'), cat: r.cat };
    receipts.push(r);
  }
  return db.merge(receipts, stores);
}

function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.receipts)) throw new Error('bad json');
  return db.merge(data.receipts, data.stores || {});
}

// ---------- sample data (clearly labelled, never saved) ----------
function sampleData() {
  // Generic names, so no real business is implied; the banner says it's sample data.
  const stores = {
    DEMO0000001A: { name: 'Supermarketi', cat: 'groceries' },
    DEMO0000002B: { name: 'Marketi i lagjes', cat: 'groceries' },
    DEMO0000003C: { name: 'Kafeja e lagjes', cat: 'cafe' },
    DEMO0000004D: { name: 'Karburanti', cat: 'fuel' },
    DEMO0000005E: { name: 'Farmacia', cat: 'pharmacy' },
    DEMO0000006F: { name: 'Dyqani i elektronikës', cat: 'electronics' },
    DEMO0000007G: { name: 'Restoranti tradicional', cat: 'cafe' },
  };
  const grocery = [['Qumësht 1L', 140], ['Bukë', 80], ['Vezë 10 copë', 260], ['Djathë i bardhë 1kg', 850], ['Domate 1kg', 150],
    ['Kafe 250g', 650], ['Ujë 1.5L', 60], ['Makarona 500g', 120], ['Vaj ulliri 1L', 1100], ['Mollë 1kg', 120], ['Kos 1kg', 230], ['Oriz 1kg', 190]];
  const menus = {
    DEMO0000003C: [['Kafe ekspres', 100], ['Kapuçino', 180], ['Ujë 0.5L', 80], ['Kruasan', 150], ['Çaj', 150]],
    DEMO0000007G: [['Tavë kosi', 700], ['Fërgesë', 650], ['Sallatë jeshile', 350], ['Birrë', 250], ['Verë e kuqe, gotë', 400], ['Byrek', 200]],
    DEMO0000005E: [['Paracetamol', 250], ['Vitaminë C', 650], ['Ibuprofen', 320], ['Krem duarsh', 480]],
  };
  const storeFactor = { DEMO0000001A: 1.0, DEMO0000002B: 0.93 };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const today = todayISO();
  const receipts = [];
  const plan = [['DEMO0000001A', 2, 5], ['DEMO0000002B', 1, 8], ['DEMO0000003C', 5, 2], ['DEMO0000004D', 1, 0],
    ['DEMO0000005E', 1, 2], ['DEMO0000007G', 1, 5]];
  let n = 0;
  const mk = (tin, day, time, items) => {
    const total = Math.round(items.reduce((s, i) => s + i.total, 0));
    const vat = Math.round((total / 6) * 100) / 100; // 20% VAT included in the price
    const r = { iic: 'DEMO' + String(++n).padStart(28, '0'), src: 'qr', tin, crtd: `${day}T${time}:00+02:00`, day, time, total, cat: stores[tin].cat, url: '',
      items, vat, net: total - vat, seller: { name: stores[tin].name, address: 'Rruga e shembullit 1', town: 'Tiranë' } };
    r.fiscal = { status: 'ok', at: new Date().toISOString() };
    receipts.push(r);
    return r;
  };
  for (let back = 3; back >= 0; back--) {
    const key = shiftMonth(monthKey(today), -back);
    const drift = 1 + (3 - back) * 0.012; // prices creep up a little each month
    for (const [tin, perWeek, lines] of plan) {
      const count = Math.round(perWeek * 4.3 * (0.7 + rnd() * 0.6));
      for (let k = 0; k < count; k++) {
        const d = 1 + Math.floor(rnd() * daysIn(key));
        const day = `${key}-${pad(d)}`;
        const time = `${pad(8 + Math.floor(rnd() * 13))}:${pad(Math.floor(rnd() * 60))}`;
        if (day > today || (day === today && time > nowHM())) continue;
        let items;
        if (tin === 'DEMO0000004D') {
          const price = Math.round(182 * drift), qty = Math.round((18 + rnd() * 20) * 100) / 100;
          items = [{ name: 'Naftë', unit: 'L', qty, unitPrice: price, total: Math.round(qty * price), vatRate: 20 }];
        } else {
          const menu = menus[tin] || grocery;
          const f = (storeFactor[tin] || 1) * drift;
          const picks = new Set();
          const want = (lines || 3) + Math.floor(rnd() * 3);
          while (picks.size < Math.min(want, menu.length)) picks.add(Math.floor(rnd() * menu.length));
          items = [...picks].map(i => {
            const [name, base] = menu[i];
            const unitPrice = Math.round((base * f) / 10) * 10;
            const qty = 1 + (rnd() < 0.25 ? 1 : 0);
            return { name, unit: 'copë', qty, unitPrice, total: unitPrice * qty, vatRate: 20 };
          });
        }
        mk(tin, day, time, items);
      }
    }
  }
  // One from today that the tax portal does not have yet, to show the pending state.
  const cafe = mk('DEMO0000003C', today, nowHM() > '00:30' ? nowHM() : '00:30', [{ name: 'Kafe ekspres', unit: 'copë', qty: 2, unitPrice: 100, total: 200, vatRate: 20 }]);
  cafe.fiscal = { status: 'notfound', at: new Date().toISOString() };
  delete cafe.items; delete cafe.vat; delete cafe.seller;

  const lap = addMonths(today, -23);
  const l = mk('DEMO0000006F', lap, '17:20', [{ name: 'Laptop 14"', unit: 'copë', qty: 1, unitPrice: 89900, total: 89900, vatRate: 20 }]);
  l.warranty = { months: 24, item: 'Laptop 14"' };
  const fr = addMonths(today, -8);
  const f2 = mk('DEMO0000006F', fr, '11:05', [{ name: 'Frigorifer', unit: 'copë', qty: 1, unitPrice: 54900, total: 54900, vatRate: 20 }]);
  f2.warranty = { months: 36, item: 'Frigorifer' };
  return { receipts, stores };
}

// ---------- wiring ----------
document.addEventListener('click', e => {
  const sh = e.target.closest('[data-sh-q], [data-sh-done]');
  if (sh) {
    const list = shopping();
    const it = list.find(i => i.id === (sh.dataset.shQ || sh.dataset.shDone));
    if (!it) return;
    if (sh.dataset.shQ) { it.qty = Math.max(0, (it.qty || 1) + +sh.dataset.d); if (!it.qty) list.splice(list.indexOf(it), 1); }
    else it.done = sh.checked;
    saveShopping(list);
    renderShopping();
    return;
  }
  const a = e.target.closest('[data-act], [data-open], [data-ics], [data-check], [data-product], [data-cat], [data-store], [data-lcat], .tabbar a');
  if (!a) return;
  if (a.dataset.cat) { listTab = 'receipts'; listCat = a.dataset.cat; query = ''; go('list'); return; }
  if (a.dataset.store) { openStore(a.dataset.store); return; }
  if (a.dataset.lcat != null) { listCat = a.dataset.lcat; renderListBody(); return; }
  if (a.dataset.open) { openReceipt(a.dataset.open); return; }
  if (a.dataset.ics) { downloadICS(a.dataset.ics); return; }
  if (a.dataset.check) { checkReceipt(a.dataset.check); return; }
  if (a.dataset.product) { openProduct(a.dataset.product); return; }
  const act = a.dataset.act;
  if (act === 'month') { viewMonth = shiftMonth(viewMonth, +a.dataset.d); render(); }
  else if (act === 'demo') { db.startDemo(sampleData()); viewMonth = monthKey(todayISO()); go('home'); }
  else if (act === 'exit-demo') { db.endDemo(); viewMonth = monthKey(todayISO()); render(); }
  else if (act === 'manual') openManual();
  else if (act === 'share') shareImage(a, () => monthImage(viewMonth), `kupon-${viewMonth}.png`);
  else if (act === 'share-year') { const y = +a.dataset.year; shareImage(a, () => yearImage(y), `kupon-viti-${y}.png`); }
  else if (act === 'prices') { listTab = 'prices'; query = ''; go('list'); }
  else if (act === 'csv') exportCSV();
  else if (act === 'json') { download(`kupon-${todayISO()}.json`, db.exportJSON(), 'application/json'); if (!db.demo) { db.setPref('lastExport', new Date().toISOString()); render(); } }
  else if (act === 'limit') openLimit();
  else if (act === 'sh-clear') { saveShopping(shopping().filter(i => !i.done)); renderShopping(); }
  else if (act === 'sync-on') turnSyncOn(a);
  else if (act === 'sync-join') openJoin();
  else if (act === 'sync-code') openSyncCode();
  else if (act === 'sync-now') { a.disabled = true; syncNow().then(r => { toast(r.ok ? t('sy.done') : t('sy.err.' + (r.error && r.error.startsWith('http') ? 'network' : r.error || 'network'))); render(); }); }
  else if (act === 'sync-off') { if (!a.dataset.armed) { a.dataset.armed = '1'; a.querySelector('span').textContent = t('sy.offConfirm'); return; } disableSync(); render(); }
  else if (act === 'coach') openCoach();
  else if (act === 'rm-toggle') toggleReminders(a);
  else if (act === 'cp-toggle') { db.setPref('sharePrices', !db.pref('sharePrices')); render(); }
  else if (act === 'cp-older') shareOlder(a);
  else if (act === 'coach-toggle') { db.setPref('coach', !db.pref('coach')); render(); }
  else if (act === 'rec-stop') { db.setPref('recurring', (db.pref('recurring') || []).filter(r => r.id !== a.dataset.id)); render(); }
  else if (act === 'later') { db.setPref(a.dataset.k, new Date().toISOString()); render(); }
  else if (act === 'install' && installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); }
  else if (act === 'lang') {
    setLang(getLang() === 'sq' ? 'en' : 'sq');
    db.setPref('lang', getLang());
    applyStatic();
    $$('.view').forEach(v => { delete v.dataset.ready; v.innerHTML = ''; });
    if (sheet().open) closeSheet();
    render();
  }
});

sheet().addEventListener('close', () => { $('#sheet-body').innerHTML = ''; openIic = null; openKind = null; render(); });
// Tap on the backdrop closes the sheet.
sheet().addEventListener('click', e => { if (e.target === sheet()) closeSheet(); });

window.addEventListener('hashchange', () => go(location.hash.slice(1)));
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (view === 'home') renderHome(); }, 150); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('storage', e => { if (e.key === 'kupon.v1') location.reload(); });
window.addEventListener('online', () => recheckPending());

// Inject icons for static markup
$$('[data-icon]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });

setLang(db.pref('lang') || 'sq');
applyStatic();
// Right after an update the browser may still hold an older i18n.js from before it. Fetch the
// app's files fresh once and reload, rather than show text keys. ('release' must match i18n.js.)
if (t('release') !== '8' && !sessionStorage.getItem('kupon.refreshed')) {
  sessionStorage.setItem('kupon.refreshed', '1');
  Promise.all(['js/i18n.js', 'js/app.js', 'js/store.js', 'js/sync.js', 'js/ocr.js', 'js/config.js', 'js/portal.js', 'js/qr.js', 'js/icons.js', 'js/remind.js', 'css/app.css']
    .map(u => fetch(u, { cache: 'reload' }).catch(() => {}))).finally(() => location.reload());
}
applyRecurring();
startAutoSync(r => { if (r && r.ok && !sheet().open) render(); });
// Keep reminder texts and dates current whenever receipts or warranties change.
let remindTimer;
const refreshReminders = () => { clearTimeout(remindTimer); remindTimer = setTimeout(() => { if (db.pref('remind')) syncReminders(buildReminders, getLang()); }, 3000); };
db.onChange(refreshReminders);
refreshReminders();
checkApi();
go(location.hash.slice(1) || 'home');
setTimeout(recheckPending, 1500);

if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
