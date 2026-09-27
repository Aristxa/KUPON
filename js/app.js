import { ICONS } from './icons.js';
import { t, tsq, setLang, getLang, applyStatic } from './i18n.js';
import { db, CATEGORIES, suggestCategory } from './store.js';
import { parseReceiptQR, decodeImageFile, CameraScanner } from './qr.js';
import { lookupReceipt, tidySellerName } from './portal.js';

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
  const patch = { fiscal: { status: res.status, at: new Date().toISOString() } };
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
        <h1>${esc(t('home.empty.title'))}</h1>
        <p>${esc(t('home.empty.body'))}</p>
        <p><a class="btn primary" href="#scan">${icon('qr_code')}<span>${esc(t('home.empty.cta'))}</span></a></p>
        <p><button class="btn link" type="button" data-act="demo">${esc(t('demo.start'))}</button></p>
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

  let compare;
  if (!prevTotal) compare = t('home.vs.none', { month: monthName(prevKey, 'monthIn') });
  else {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100);
    compare = t('home.vs', { pct: pctStr(pct), month: monthName(prevKey, 'monthIn'), amount: fmtL(prevTotal) });
    if (isCurrent) compare += ' ' + t('home.samePeriod');
  }

  // What the tax portal told us about this month's receipts
  const qr = rs.filter(r => !isManual(r));
  const withVat = qr.filter(r => r.vat != null);
  const vat = withVat.reduce((s, r) => s + r.vat, 0);
  const declared = qr.filter(r => fiscalState(r) === 'ok').length;

  const minKey = all.reduce((m, r) => (monthKey(r.day) < m ? monthKey(r.day) : m), viewMonth);
  const maxKey = [monthKey(today), ...all.map(r => monthKey(r.day))].sort().pop();

  const soon = warrantyRows().filter(w => w.left >= 0 && w.left <= 30).length;
  const missing = all.filter(r => fiscalState(r) === 'missing').length;

  el.innerHTML = `
    ${soon ? `<a class="notice" href="#warranty">${icon('shield_checkmark')}<span>${esc(soon === 1 ? t('home.warrantySoon1') : t('home.warrantySoon', { n: soon }))}</span></a>` : ''}
    <div class="monthbar">
      <button class="iconbtn" type="button" data-act="month" data-d="-1" aria-label="${esc(t('home.prev'))}" ${viewMonth <= minKey ? 'disabled' : ''}>${icon('chevron_left')}</button>
      <h1>${esc(monthLabel(viewMonth))}</h1>
      <button class="iconbtn" type="button" data-act="month" data-d="1" aria-label="${esc(t('home.next'))}" ${viewMonth >= maxKey ? 'disabled' : ''}>${icon('chevron_right')}</button>
    </div>
    <p class="hero"><span class="hero-num">${fmtL(total)}</span></p>
    <p class="sub">${esc(t('home.total', { month: monthName(viewMonth, 'monthIn') }))}${isCurrent ? ' ' + esc(t('home.upto', { day: fmtDay(today).slice(0, 5) })) : ''} · ${esc(rs.length === 1 ? t('home.count1') : t('home.count', { n: rs.length }))}</p>
    <p class="sub">${esc(compare)}</p>
    ${withVat.length ? `<p class="sub">${esc(t('home.vat', { amount: fmtL(Math.round(vat)) }))} <span class="muted">(${esc(t('home.vat.cov', { n: withVat.length, m: qr.length }))})</span></p>` : ''}
    ${qr.length && (declared || missing) ? `<p class="sub">${icon('checkmark_circle', 'tiny')} ${esc(t('home.checked', { n: declared, m: qr.length }))}</p>` : ''}
    ${rs.length ? `
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
  if (rs.length) drawDaily($('#daily-chart'), rs, viewMonth, isCurrent ? +today.slice(8, 10) : daysIn(viewMonth));
}

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
  return `<table class="tbl">
    <thead><tr><th>${esc(t('th.category'))}</th><th class="num">${esc(t('th.amount'))}</th><th class="num">${esc(t('th.share'))}</th></tr></thead>
    <tbody>${rows.map(([c, v]) => `
      <tr><td>${esc(t('cat.' + c))}<span class="meter"><span style="width:${Math.max(2, (v / max) * 100).toFixed(1)}%"></span></span></td>
      <td class="num">${fmtL(v)}</td><td class="num muted">${total ? Math.round((v / total) * 100) : 0}%</td></tr>`).join('')}
    </tbody></table>`;
}

function storeTable(rs) {
  const by = {};
  for (const r of rs) {
    const k = storeKey(r);
    const s = by[k] || (by[k] = { label: storeLabel(r), tin: r.tin, n: 0, v: 0 });
    s.n++; s.v += r.total;
  }
  const rows = Object.values(by).sort((a, b) => b.v - a.v).slice(0, 5);
  return `<table class="tbl">
    <thead><tr><th>${esc(t('th.store'))}</th><th class="num">${esc(t('th.visits'))}</th><th class="num">${esc(t('th.amount'))}</th></tr></thead>
    <tbody>${rows.map(s => `
      <tr><td>${esc(s.label)}${s.tin ? `<span class="muted small block">${esc(s.tin)}</span>` : ''}</td>
      <td class="num">${s.n}</td><td class="num">${fmtL(s.v)}</td></tr>`).join('')}
    </tbody></table>`;
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const shortL = v => (v >= 1000 ? (v / 1000).toLocaleString(getLang() === 'sq' ? 'sq-AL' : 'en-GB', { maximumFractionDigits: 1 }) + 'k' : String(v));

function drawDaily(host, rs, key, lastDay) {
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
      const top = y(d.v), h = Math.max(2, base - top), r = Math.min(4, bw / 2, h);
      bars += `<path d="M${x},${base}V${base - h + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}z" class="bar"/>`;
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
    <div class="row gap wrap">
      <label class="btn" for="photo-input">${icon('image')}<span>${esc(t('scan.photo'))}</span></label>
      <input type="file" id="photo-input" accept="image/*" hidden>
      <button class="btn" type="button" data-act="manual">${icon('edit')}<span>${esc(t('scan.manual'))}</span></button>
    </div>
    <form id="paste-form" class="stack">
      <label for="paste-input">${esc(t('scan.paste.label'))}</label>
      <div class="row">
        <input id="paste-input" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t('scan.paste.ph'))}">
        <button class="btn" type="submit">${icon('add')}<span>${esc(t('scan.paste.go'))}</span></button>
      </div>
    </form>`;
  scanner.video = $('#video');
  $('#cam-btn').addEventListener('click', () => (cameraOn ? stopCamera() : startCamera()));
  $('#photo-input').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setScanMsg(t('scan.busy'));
    try {
      const text = await decodeImageFile(f);
      if (!text) { setScanMsg(t('scan.noQR'), true); return; }
      lastFromCamera = false;
      handleScan(text);
    } catch (err) { setScanMsg(t('scan.noQR'), true); }
  });
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
  const ib = $('#ibox');
  if (ib) ib.innerHTML = itemsBox(r);
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
    case 'ok': return `<p class="fstate ok">${icon('checkmark_circle')}<span>${esc(t('f.ok'))}</span></p>${mismatch}`;
    case 'checking': return `<p class="fstate muted"><span class="spin" aria-hidden="true"></span><span>${esc(t('f.checking'))}</span></p>`;
    case 'pending': return `<p class="fstate">${icon('arrow_sync')}<span>${esc(t('f.pending'))} <span class="muted small">${esc(t('f.pending.why'))}</span></span></p>${btn(t('f.recheck'))}`;
    case 'missing': return `<div class="fmissing"><p class="fstate warn">${icon('warning')}<span><b>${esc(t('f.missing'))}</b><br><span class="small">${esc(t('f.missing.why'))}</span></span></p>
      <div class="row wrap gap">${btn(t('f.recheck'))}<a class="btn small" href="${FISKAL_URL}" target="_blank" rel="noopener">${icon('open')}<span>${esc(t('f.ask'))}</span></a></div></div>`;
    case 'error': return `<p class="fstate muted">${icon('warning')}<span>${esc(t('f.error'))}</span></p>${btn(t('f.recheck'))}`;
    default: return portalOn() ? btn(t('f.check')) : `<p class="muted small">${esc(t('f.off'))}</p>`;
  }
}

function itemsBox(r) {
  if (!r.items || !r.items.length) return '';
  return `<h3>${esc(t('r.items'))}</h3>
    <table class="tbl items">
      <thead><tr><th>${esc(t('th.item'))}</th><th class="num">${esc(t('th.qty'))}</th><th class="num">${esc(t('th.amount'))}</th></tr></thead>
      <tbody>${r.items.map(it => `<tr><td>${esc(it.name)}${it.qty !== 1 && it.unitPrice != null ? `<span class="muted small block">${fmtL(it.unitPrice)}${unitOf(it.unit) ? ' / ' + esc(unitOf(it.unit)) : ''}</span>` : ''}</td>
        <td class="num">${fmtQty(it.qty)}</td><td class="num">${fmtL(it.total)}</td></tr>`).join('')}</tbody>
      ${r.vat != null ? `<tfoot><tr><td>${esc(t('r.vat'))}</td><td></td><td class="num">${fmtL(r.vat)}</td></tr></tfoot>` : ''}
    </table>`;
}

function openNewReceipt(iic) {
  const r = db.find(iic);
  const known = db.storeName(r.tin);
  openSheet(`
    <h2>${icon('checkmark_circle', 'ok')} ${esc(t('new.title'))}</h2>
    <p class="hero small-hero"><span class="hero-num">${fmtL(r.total)}</span></p>
    <p class="sub">${fmtDay(r.day)} · ${esc(r.time)} · NIPT ${esc(r.tin)}</p>
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
    </form>
    <div id="ibox">${itemsBox(r)}</div>`, () => {
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
  const addr = r.seller && [r.seller.address, r.seller.town].filter(Boolean).join(', ');
  openSheet(`
    <div class="sheet-head">
      <h2>${esc(storeLabel(r))}</h2>
    </div>
    <p class="hero small-hero"><span class="hero-num">${fmtL(r.total)}</span></p>
    <div id="fbox">${fiscalBox(r)}</div>
    <table class="kv">
      <tr><th>${esc(t('r.date'))}</th><td>${fmtDay(r.day)}</td></tr>
      <tr><th>${esc(t('r.time'))}</th><td>${esc(r.time)}</td></tr>
      ${r.tin ? `<tr><th>${esc(t('r.nipt'))}</th><td>${esc(r.tin)}</td></tr>` : ''}
      ${addr ? `<tr><th>${esc(t('r.address'))}</th><td>${esc(addr)}</td></tr>` : ''}
    </table>
    <div id="ibox">${itemsBox(r)}</div>
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
function openManual() {
  openSheet(`
    <h2>${esc(t('m.title'))}</h2>
    <form id="m-form" class="stack">
      <label for="m-store">${esc(t('m.store'))}</label>
      <input id="m-store" autocomplete="off" maxlength="80" placeholder="${esc(t('m.store.ph'))}" required>
      <label for="m-amount">${esc(t('m.amount'))}</label>
      <input id="m-amount" type="number" inputmode="decimal" min="0" step="any" required>
      <div class="row">
        <div class="stack grow"><label for="m-date">${esc(t('m.date'))}</label><input id="m-date" type="date" value="${todayISO()}" max="${todayISO()}" required></div>
        <div class="stack grow"><label for="m-time">${esc(t('m.time'))}</label><input id="m-time" type="time" value="${nowHM()}"></div>
      </div>
      <label for="m-cat">${esc(t('r.cat'))}</label>
      ${catSelect('m-cat', 'other')}
      <label for="m-note">${esc(t('r.note'))}</label>
      <input id="m-note" autocomplete="off" maxlength="140" placeholder="${esc(t('r.note.ph'))}">
      <p class="msg err" id="m-msg"></p>
      <div class="row end"><button class="btn primary" type="submit">${icon('add')}<span>${esc(t('m.add'))}</span></button></div>
    </form>`, () => {
    const store = $('#m-store'), cat = $('#m-cat');
    let catTouched = false;
    cat.addEventListener('change', () => { catTouched = true; });
    store.addEventListener('input', () => { if (!catTouched) cat.value = suggestCategory(store.value); });
    store.focus();
    $('#m-form').addEventListener('submit', e => {
      e.preventDefault();
      const amount = Number(String($('#m-amount').value).replace(',', '.'));
      const day = $('#m-date').value, time = $('#m-time').value || '12:00';
      if (!store.value.trim() || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) { $('#m-msg').textContent = t('m.bad'); return; }
      if (db.demo) db.endDemo();
      const iic = 'M' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
      db.add({ iic, src: 'manual', tin: '', storeName: store.value.trim(), crtd: `${day}T${time}:00`, day, time, total: Math.round(amount * 100) / 100, cat: cat.value, catSet: true, note: $('#m-note').value.trim(), url: '' });
      closeSheet();
      toast(t('toast.saved'));
      go('list');
    });
  });
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
function renderList() {
  const el = $('#view-list');
  if (!el.dataset.ready) {
    el.dataset.ready = '1';
    el.innerHTML = `
      <div class="seg" role="tablist">
        <label><input type="radio" name="ltab" value="receipts"><span>${icon('receipt')} ${esc(t('list.tab.receipts'))}</span></label>
        <label><input type="radio" name="ltab" value="prices"><span>${icon('tag')} ${esc(t('list.tab.prices'))}</span></label>
      </div>
      <input type="search" id="list-q" autocomplete="off">
      <div id="list-body"></div>`;
    $('#list-q').addEventListener('input', e => { query = e.target.value; renderListBody(); });
    $$('input[name=ltab]').forEach(i => i.addEventListener('change', () => { listTab = i.value; query = ''; renderList(); }));
  }
  $$('input[name=ltab]').forEach(i => { i.checked = i.value === listTab; });
  const q = $('#list-q');
  q.value = query;
  q.placeholder = t(listTab === 'prices' ? 'p.search' : 'list.search');
  q.setAttribute('aria-label', q.placeholder);
  renderListBody();
}

function renderListBody() {
  if (listTab === 'prices') { renderPrices(); return; }
  const body = $('#list-body');
  const q = query.trim().toLowerCase();
  const all = db.receipts.slice().sort(byDateDesc);
  if (!all.length) {
    body.innerHTML = `<p class="muted pad">${esc(t('list.empty'))}</p><p><a class="btn primary" href="#scan">${icon('qr_code')}<span>${esc(t('home.empty.cta'))}</span></a></p>`;
    return;
  }
  const rs = q ? all.filter(r => (storeLabel(r) + ' ' + r.tin + ' ' + (r.note || '') + ' ' + (r.items || []).map(i => i.name).join(' ')).toLowerCase().includes(q)) : all;
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

function renderPrices() {
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
  }).join('')}</ul>` : `<p class="muted pad">${esc(t('list.noMatch'))}</p>`);
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
    <h3>${esc(t('p.history'))}</h3>
    <table class="tbl"><thead><tr><th>${esc(t('th.date'))}</th><th>${esc(t('th.store'))}</th><th class="num">${esc(t('th.price'))}</th></tr></thead>
      <tbody>${p.buys.slice().reverse().map(b => `<tr><td class="small">${fmtDay(b.day)}</td><td class="small">${esc(b.store)}</td><td class="num">${fmtL(b.price)}</td></tr>`).join('')}</tbody></table>
    <div class="row end"><button class="btn primary" type="button" id="p-close">${esc(t('r.close'))}</button></div>`,
  () => $('#p-close').addEventListener('click', closeSheet));
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
    <p class="muted">${esc(t('d.fiskal'))} <a href="${FISKAL_URL}" target="_blank" rel="noopener">Asistenti Fiskal ↗</a></p>
    <p class="muted small">${esc(t('d.by'))} <a href="https://github.com/Aristxa/KUPON" target="_blank" rel="noopener">${esc(t('d.source'))}</a> · <a href="https://aristxa.github.io" target="_blank" rel="noopener">aristxa.github.io</a></p>
    <p class="muted small">Icons: Microsoft Fluent UI System Icons (MIT). QR fallback: jsQR (Apache-2.0).</p>
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
  const S = ' (shembull)';
  const stores = {
    DEMO0000001A: { name: 'Supermarket A' + S, cat: 'groceries' },
    DEMO0000002B: { name: 'Supermarket B' + S, cat: 'groceries' },
    DEMO0000003C: { name: 'Kafe e Lagjes' + S, cat: 'cafe' },
    DEMO0000004D: { name: 'Karburant' + S, cat: 'fuel' },
    DEMO0000005E: { name: 'Farmaci' + S, cat: 'pharmacy' },
    DEMO0000006F: { name: 'Dyqan elektronike' + S, cat: 'electronics' },
    DEMO0000007G: { name: 'Restorant tradicional' + S, cat: 'cafe' },
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
  l.warranty = { months: 24, item: 'Laptop 14"' + S };
  const fr = addMonths(today, -8);
  const f2 = mk('DEMO0000006F', fr, '11:05', [{ name: 'Frigorifer', unit: 'copë', qty: 1, unitPrice: 54900, total: 54900, vatRate: 20 }]);
  f2.warranty = { months: 36, item: 'Frigorifer' + S };
  return { receipts, stores };
}

// ---------- wiring ----------
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act], [data-open], [data-ics], [data-check], [data-product], .tabbar a');
  if (!a) return;
  if (a.dataset.open) { openReceipt(a.dataset.open); return; }
  if (a.dataset.ics) { downloadICS(a.dataset.ics); return; }
  if (a.dataset.check) { checkReceipt(a.dataset.check); return; }
  if (a.dataset.product) { openProduct(a.dataset.product); return; }
  const act = a.dataset.act;
  if (act === 'month') { viewMonth = shiftMonth(viewMonth, +a.dataset.d); render(); }
  else if (act === 'demo') { db.startDemo(sampleData()); viewMonth = monthKey(todayISO()); go('home'); }
  else if (act === 'exit-demo') { db.endDemo(); viewMonth = monthKey(todayISO()); render(); }
  else if (act === 'manual') openManual();
  else if (act === 'csv') exportCSV();
  else if (act === 'json') download(`kupon-${todayISO()}.json`, db.exportJSON(), 'application/json');
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
go(location.hash.slice(1) || 'home');
setTimeout(recheckPending, 1500);

if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
