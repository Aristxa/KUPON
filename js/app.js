import { ICONS } from './icons.js';
import { t, tsq, setLang, getLang, applyStatic } from './i18n.js';
import { db, CATEGORIES, suggestCategory } from './store.js';
import { parseReceiptQR, decodeImageFile, CameraScanner } from './qr.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICONS[name] || ''}</svg>`;

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
const fmtDay = day => { const [y, m, d] = day.split('-'); return `${d}.${m}.${y}`; };
const monthKey = day => day.slice(0, 7);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthName = (key, form = 'month') => t(form)[+key.slice(5, 7) - 1];
const monthLabel = key => `${monthName(key)} ${key.slice(0, 4)}`;
function shiftMonth(key, delta) {
  let y = +key.slice(0, 4), m = +key.slice(5, 7) + delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
const daysIn = key => new Date(+key.slice(0, 4), +key.slice(5, 7), 0).getDate();

function addMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const tm = m - 1 + months;
  const ty = y + Math.floor(tm / 12), tmo = ((tm % 12) + 12) % 12;
  const last = new Date(ty, tmo + 1, 0).getDate();
  return `${ty}-${String(tmo + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const dayDiff = (a, b) => Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 86400000);

const storeLabel = r => db.storeName(r.tin) || t('unnamed');
// Equal share in whole lek; "≈" when the total doesn't divide evenly.
const shareL = (total, n) => { const v = total / n; return Number.isInteger(v) ? fmtL(v) : '≈' + fmtL(Math.round(v)); };
const catOf = r => r.cat || db.storeCat(r.tin) || 'other';
const byDateDesc = (a, b) => (b.day + b.time).localeCompare(a.day + a.time);

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
    const pctStr = (pct > 0 ? '+' : pct < 0 ? '−' : '±') + Math.abs(pct) + '%';
    compare = t('home.vs', { pct: pctStr, month: monthName(prevKey, 'monthIn'), amount: fmtL(prevTotal) });
    if (isCurrent) compare += ' ' + t('home.samePeriod');
  }

  const minKey = all.reduce((m, r) => (monthKey(r.day) < m ? monthKey(r.day) : m), viewMonth);
  const maxKey = [monthKey(today), ...all.map(r => monthKey(r.day))].sort().pop();

  // warranties expiring soon
  const soon = warrantyRows().filter(w => w.left >= 0 && w.left <= 30).length;

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
    ${rs.length ? `
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
    const s = by[r.tin] || (by[r.tin] = { tin: r.tin, n: 0, v: 0 });
    s.n++; s.v += r.total;
  }
  const rows = Object.values(by).sort((a, b) => b.v - a.v).slice(0, 5);
  return `<table class="tbl">
    <thead><tr><th>${esc(t('th.store'))}</th><th class="num">${esc(t('th.visits'))}</th><th class="num">${esc(t('th.amount'))}</th></tr></thead>
    <tbody>${rows.map(s => `
      <tr><td>${esc(db.storeName(s.tin) || t('unnamed'))}<span class="muted small block">${esc(s.tin)}</span></td>
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
    const day = `${String(i + 1).padStart(2, '0')}.${key.slice(5, 7)}`;
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
    <div class="row gap">
      <label class="btn" for="photo-input">${icon('image')}<span>${esc(t('scan.photo'))}</span></label>
      <input type="file" id="photo-input" accept="image/*" hidden>
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
      handleScan(text);
    } catch (err) { setScanMsg(t('scan.noQR'), true); }
  });
  $('#paste-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#paste-input').value;
    if (handleScan(v)) $('#paste-input').value = '';
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
  r.cat = db.storeCat(r.tin) || suggestCategory(db.storeName(r.tin));
  db.add(r);
  setScanMsg('');
  render();
  openNewReceipt(r.iic);
  return true;
}

// ---------- sheets (dialogs) ----------
const sheet = () => $('#sheet');
function openSheet(html, onReady) {
  const d = sheet();
  $('#sheet-body').innerHTML = html;
  if (!d.open) d.showModal();
  // Don't let the dialog focus the first input: on phones that pops the keyboard.
  $('#sheet-body').focus({ preventScroll: true });
  d.scrollTop = 0;
  onReady && onReady(d);
}
function closeSheet() { if (sheet().open) sheet().close(); }

function catSelect(id, value) {
  return `<select id="${id}">${CATEGORIES.map(c => `<option value="${c}" ${c === value ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select>`;
}

function openNewReceipt(iic) {
  const r = db.find(iic);
  const known = db.storeName(r.tin);
  openSheet(`
    <h2>${icon('checkmark_circle', 'ok')} ${esc(t('new.title'))}</h2>
    <p class="hero small-hero"><span class="hero-num">${fmtL(r.total)}</span></p>
    <p class="sub">${fmtDay(r.day)} · ${esc(r.time)} · NIPT ${esc(r.tin)}</p>
    <form id="new-form" class="stack">
      <label for="nf-name">${esc(t('new.storeName'))}</label>
      <input id="nf-name" autocomplete="off" value="${esc(known)}" maxlength="80" required>
      <p class="muted small">${esc(t('new.storeHint', { tin: r.tin }))}</p>
      <label for="nf-cat">${esc(t('new.cat'))}</label>
      ${catSelect('nf-cat', catOf(r))}
      <div class="row end"><button class="btn primary" type="submit">${esc(t('new.save'))}</button></div>
    </form>`, () => {
    const name = $('#nf-name'), cat = $('#nf-cat');
    let catTouched = !!db.storeCat(r.tin);
    cat.addEventListener('change', () => { catTouched = true; });
    name.addEventListener('input', () => { if (!catTouched) cat.value = suggestCategory(name.value); });
    if (!known) name.focus();
    $('#new-form').addEventListener('submit', e => {
      e.preventDefault();
      db.setStore(r.tin, name.value.trim(), cat.value);
      db.update(r.iic, { cat: cat.value });
      closeSheet();
      toast(t('toast.saved'));
      render();
    });
  });
}

function openReceipt(iic) {
  const r = db.find(iic);
  if (!r) return;
  const w = r.warranty;
  const months = [6, 12, 24, 36, 60];
  const mLabel = m => (m % 12 ? t('w.m', { n: m }) : m === 12 ? t('w.y1') : t('w.y', { n: m / 12 }));
  openSheet(`
    <div class="sheet-head">
      <h2>${esc(storeLabel(r))}</h2>
    </div>
    <p class="hero small-hero"><span class="hero-num">${fmtL(r.total)}</span></p>
    <table class="kv">
      <tr><th>${esc(t('r.date'))}</th><td>${fmtDay(r.day)}</td></tr>
      <tr><th>${esc(t('r.time'))}</th><td>${esc(r.time)}</td></tr>
      <tr><th>${esc(t('r.nipt'))}</th><td>${esc(r.tin)}</td></tr>
    </table>
    <div class="stack">
      <label for="rf-name">${esc(t('r.store'))}</label>
      <input id="rf-name" autocomplete="off" value="${esc(db.storeName(r.tin))}" maxlength="80">
      <label for="rf-cat">${esc(t('r.cat'))}</label>
      ${catSelect('rf-cat', catOf(r))}
      <label for="rf-note">${esc(t('r.note'))}</label>
      <input id="rf-note" autocomplete="off" value="${esc(r.note || '')}" maxlength="140" placeholder="${esc(t('r.note.ph'))}">
    </div>

    <div class="actions">
      ${db.demo ? `<p class="muted small">${esc(t('r.demoOfficial'))}</p>` :
        `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">${icon('open')}<span>${esc(t('r.official'))}</span></a>
         <p class="muted small">${esc(t('r.official.hint'))}</p>`}
      <button class="btn" type="button" id="rf-split">${icon('people')}<span>${esc(t('r.split'))}</span></button>
    </div>

    <fieldset class="warranty">
      <label class="check"><input type="checkbox" id="rf-w" ${w ? 'checked' : ''}> ${icon('shield_checkmark')} <span>${esc(t('w.on'))}</span></label>
      <div id="rf-wfields" class="stack" ${w ? '' : 'hidden'}>
        <label for="rf-witem">${esc(t('w.item'))}</label>
        <input id="rf-witem" autocomplete="off" maxlength="80" value="${esc(w ? w.item : '')}" placeholder="${esc(t('w.item.ph'))}">
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
      const months = +$('#rf-wm').value;
      db.update(iic, { warranty: on ? { months, item: $('#rf-witem').value.trim() } : null });
      $('#rf-wuntil').textContent = on ? t('w.until', { date: fmtDay(addMonths(r.day, months)) }) : '';
    };
    saveW();
    $('#rf-w').addEventListener('change', saveW);
    $('#rf-wm').addEventListener('change', saveW);
    $('#rf-witem').addEventListener('input', saveW);
    $('#rf-name').addEventListener('change', e => db.setStore(r.tin, e.target.value.trim(), null));
    $('#rf-cat').addEventListener('change', e => { db.update(iic, { cat: e.target.value }); db.setStore(r.tin, null, e.target.value); });
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
  });
}

// ---------- split ----------
function openSplit(iic) {
  const r = db.find(iic);
  const s = r.split || { mode: 'equal', people: [{ name: t('s.me'), amount: '' }, { name: '', amount: '' }] };
  const people = s.people.map(p => ({ ...p }));
  let mode = s.mode;

  const persist = () => db.update(iic, { split: { mode, people: people.map(p => ({ name: p.name, amount: p.amount })) } });

  const message = () => {
    const head = `Kupon: ${storeLabel(r)}, ${fmtDay(r.day)} ${r.time}\nTotali: ${fmtL(r.total)}`;
    const named = people.map((p, i) => p.name.trim() || `${tsq('s.name.ph')} ${i + 1}`);
    if (mode === 'equal') {
      return `${head}\nNdarë në ${people.length} persona. ${tsq('s.each', { amount: shareL(r.total, people.length) })}`;
    }
    return `${head}\n` + people.map((p, i) => `${named[i]}: ${fmtL(+p.amount || 0)}`).join('\n');
  };

  const draw = () => {
    const assigned = people.reduce((a, p) => a + (+p.amount || 0), 0);
    const diff = Math.round((r.total - assigned) * 100) / 100;
    openSheet(`
      <h2>${esc(t('s.title'))}</h2>
      <p class="sub">${esc(storeLabel(r))} · ${fmtDay(r.day)} · <b>${fmtL(r.total)}</b></p>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="smode" value="equal" ${mode === 'equal' ? 'checked' : ''}><span>${esc(t('s.equal'))}</span></label>
        <label><input type="radio" name="smode" value="custom" ${mode === 'custom' ? 'checked' : ''}><span>${esc(t('s.custom'))}</span></label>
      </div>
      <h3>${esc(t('s.people'))}</h3>
      <ul class="people">${people.map((p, i) => `
        <li>
          <input class="pname" data-i="${i}" value="${esc(p.name)}" placeholder="${esc(t('s.name.ph'))} ${i + 1}" maxlength="30" aria-label="${esc(t('s.name.ph'))} ${i + 1}">
          ${mode === 'custom' ? `<input class="pamt" data-i="${i}" type="number" inputmode="decimal" min="0" step="any" value="${esc(p.amount)}" placeholder="0" aria-label="${esc(t('th.amount'))}">` : `<span class="pshare">${shareL(r.total, people.length)}</span>`}
          <button class="iconbtn" type="button" data-rm="${i}" aria-label="${esc(t('s.remove'))}" ${people.length <= 2 ? 'disabled' : ''}>${icon('dismiss')}</button>
        </li>`).join('')}
      </ul>
      <button class="btn" type="button" id="s-add">${icon('people_add')}<span>${esc(t('s.add'))}</span></button>
      <p class="msg ${mode === 'custom' && diff !== 0 ? 'err' : ''}" id="s-status">${mode === 'equal' ? esc(t('s.each', { amount: shareL(r.total, people.length) })) :
        diff > 0 ? esc(t('s.left', { amount: fmtL(diff) })) : diff < 0 ? esc(t('s.over', { amount: fmtL(-diff) })) : '✓'}</p>
      <pre class="preview" id="s-preview">${esc(message())}</pre>
      <div class="row wrap gap">
        <a class="btn primary" id="s-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(message())}">${icon('share')}<span>${esc(t('s.wa'))}</span></a>
        <button class="btn" type="button" id="s-copy">${icon('copy')}<span>${esc(t('s.copy'))}</span></button>
        ${navigator.share ? `<button class="btn" type="button" id="s-share">${icon('share')}<span>${esc(t('s.share'))}</span></button>` : ''}
      </div>
      <div class="row between"><button class="btn link" type="button" id="s-back">${icon('chevron_left')}<span>${esc(t('r.title'))}</span></button></div>
    `, bind);
  };

  const refreshText = () => {
    $('#s-preview').textContent = message();
    $('#s-wa').href = 'https://wa.me/?text=' + encodeURIComponent(message());
    const assigned = people.reduce((a, p) => a + (+p.amount || 0), 0);
    const diff = Math.round((r.total - assigned) * 100) / 100;
    const st = $('#s-status');
    if (mode === 'custom') {
      st.textContent = diff > 0 ? t('s.left', { amount: fmtL(diff) }) : diff < 0 ? t('s.over', { amount: fmtL(-diff) }) : '✓';
      st.classList.toggle('err', diff !== 0);
    }
  };

  const bind = () => {
    $$('input[name=smode]').forEach(i => i.addEventListener('change', () => { mode = i.value; persist(); draw(); }));
    $$('.pname').forEach(i => i.addEventListener('input', () => { people[+i.dataset.i].name = i.value; persist(); refreshText(); }));
    $$('.pamt').forEach(i => i.addEventListener('input', () => { people[+i.dataset.i].amount = i.value; persist(); refreshText(); }));
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => { people.splice(+b.dataset.rm, 1); persist(); draw(); }));
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

// ---------- receipts list ----------
let query = '';
function renderList() {
  const el = $('#view-list');
  if (!el.dataset.ready) {
    el.dataset.ready = '1';
    el.innerHTML = `
      <h1>${esc(t('list.title'))}</h1>
      <input type="search" id="list-q" placeholder="${esc(t('list.search'))}" aria-label="${esc(t('list.search'))}" autocomplete="off">
      <div id="list-body"></div>`;
    $('#list-q').addEventListener('input', e => { query = e.target.value; renderListBody(); });
  }
  $('#list-q').value = query;
  renderListBody();
}

function renderListBody() {
  const body = $('#list-body');
  const q = query.trim().toLowerCase();
  const all = db.receipts.slice().sort(byDateDesc);
  if (!all.length) {
    body.innerHTML = `<p class="muted pad">${esc(t('list.empty'))}</p><p><a class="btn primary" href="#scan">${icon('qr_code')}<span>${esc(t('home.empty.cta'))}</span></a></p>`;
    return;
  }
  const rs = q ? all.filter(r => (storeLabel(r) + ' ' + r.tin + ' ' + (r.note || '')).toLowerCase().includes(q)) : all;
  if (!rs.length) { body.innerHTML = `<p class="muted pad">${esc(t('list.noMatch'))}</p>`; return; }
  const groups = [];
  for (const r of rs) {
    const k = monthKey(r.day);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, rs: [] });
    groups[groups.length - 1].rs.push(r);
  }
  body.innerHTML = groups.map(g => `
    <h2 class="group"><span>${esc(monthLabel(g.k))}</span><span>${fmtL(sum(g.rs))}</span></h2>
    <ul class="rlist">${g.rs.map(r => `
      <li><button type="button" data-open="${esc(r.iic)}">
        <span class="rmain"><span class="rname">${esc(storeLabel(r))}${r.warranty ? ' ' + icon('shield_checkmark', 'tiny') : ''}</span>
        <span class="muted small">${fmtDay(r.day)} ${esc(r.time)} · ${esc(t('cat.' + catOf(r)))}${r.note ? ' · ' + esc(r.note) : ''}</span></span>
        <span class="ramt">${fmtL(r.total)}</span>
      </button></li>`).join('')}
    </ul>`).join('');
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
  const ymd = dt => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
  const next = new Date(remind); next.setDate(next.getDate() + 1);
  const itemName = r.warranty.item || storeLabel(r);
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kupon//aristxa.github.io//EN', 'BEGIN:VEVENT',
    `UID:kupon-${r.iic}@aristxa.github.io`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${ymd(remind)}`, `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${icsEsc(t('w.cal.title', { item: itemName }))}`,
    `DESCRIPTION:${icsEsc(t('w.cal.desc', { item: itemName, store: storeLabel(r), date: fmtDay(until), url: db.demo ? '-' : r.url }))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${icsEsc(t('w.cal.title', { item: itemName }))}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  download(`garancia-${itemName.replace(/[^\w\-ëçË Ç]+/g, '').trim().replace(/\s+/g, '-') || 'kupon'}.ics`, lines.join('\r\n'), 'text/calendar');
}

// ---------- data ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'data') render(); });

function renderData() {
  const el = $('#view-data');
  const stores = Object.entries(db.stores).filter(([tin]) => db.receipts.some(r => r.tin === tin));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `
    <h1>${esc(t('d.title'))}</h1>
    <p>${esc(t('d.privacy'))}</p>
    <p class="muted">${esc(t('d.stats', { n: db.receipts.length, s: stores.length }))}</p>
    ${db.demo ? `<p class="notice">${esc(t('d.demoOff'))}</p>` : `
    <div class="stack">
      <button class="btn" type="button" data-act="csv" ${db.receipts.length ? '' : 'disabled'}>${icon('arrow_download')}<span>${esc(t('d.csv'))}</span></button>
      <button class="btn" type="button" data-act="json" ${db.receipts.length ? '' : 'disabled'}>${icon('arrow_download')}<span>${esc(t('d.json'))}</span></button>
      <label class="btn" for="import-input">${icon('arrow_upload')}<span>${esc(t('d.import'))}</span></label>
      <input type="file" id="import-input" accept=".json,.csv,application/json,text/csv" hidden>
    </div>`}
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
    <p class="muted small">${esc(t('d.by'))} <a href="https://github.com/Aristxa/KUPON" target="_blank" rel="noopener">${esc(t('d.source'))}</a> · <a href="https://aristxa.github.io" target="_blank" rel="noopener">aristxa.github.io</a></p>
    <p class="muted small">Icons: Microsoft Fluent UI System Icons (MIT). QR fallback: jsQR (Apache-2.0).</p>
    ${!db.demo && db.receipts.length ? `<div class="row"><button class="btn danger" type="button" id="wipe">${icon('delete')}<span>${esc(t('d.danger'))}</span></button></div>` : ''}
    ${!db.receipts.length && !db.demo ? `<p><button class="btn link" type="button" data-act="demo">${esc(t('demo.start'))}</button></p>` : ''}
  `;
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

const CSV_COLS = ['date', 'time', 'store', 'nipt', 'category', 'total_all', 'note', 'warranty_item', 'warranty_months', 'warranty_until', 'crtd', 'iic', 'url'];
function exportCSV() {
  const q = v => { const s = String(v == null ? '' : v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = db.receipts.slice().sort(byDateDesc).map(r => [
    r.day, r.time, db.storeName(r.tin), r.tin, catOf(r), r.total, r.note || '',
    r.warranty ? r.warranty.item : '', r.warranty ? r.warranty.months : '', r.warranty ? addMonths(r.day, r.warranty.months) : '',
    r.crtd, r.iic, r.url,
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
  if (ix.iic == null || ix.nipt == null || ix.date == null || ix.total_all == null) throw new Error('bad csv');
  const stores = {}, receipts = [];
  for (const c of rows) {
    const g = k => (ix[k] != null ? (c[ix[k]] || '').trim() : '');
    // Prefer re-parsing the portal URL; fall back to the columns.
    const parsed = g('url') ? parseReceiptQR(g('url')) : { ok: false };
    const base = parsed.ok ? parsed.receipt : {
      iic: g('iic').toUpperCase(), tin: g('nipt').toUpperCase(), crtd: g('crtd') || `${g('date')}T${g('time') || '00:00'}:00`,
      day: g('date'), time: g('time') || '00:00', total: +g('total_all'), url: g('url'),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base.day)) continue;
    const r = { ...base, cat: CATEGORIES.includes(g('category')) ? g('category') : '', note: g('note') };
    if (g('warranty_months')) r.warranty = { months: +g('warranty_months'), item: g('warranty_item') };
    if (g('store') && !stores[r.tin]) stores[r.tin] = { name: g('store'), cat: r.cat };
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
  const stores = {
    DEMO0000001A: { name: 'Conad (shembull)', cat: 'groceries' },
    DEMO0000002B: { name: 'Big Market (shembull)', cat: 'groceries' },
    DEMO0000003C: { name: 'Kafe Flora (shembull)', cat: 'cafe' },
    DEMO0000004D: { name: 'Kastrati (shembull)', cat: 'fuel' },
    DEMO0000005E: { name: 'Farmaci (shembull)', cat: 'pharmacy' },
    DEMO0000006F: { name: 'Neptun (shembull)', cat: 'electronics' },
    DEMO0000007G: { name: 'Restorant Juvenilja (shembull)', cat: 'cafe' },
  };
  // Deterministic pseudo-random so the sample looks the same every time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const today = todayISO();
  const receipts = [];
  const plan = [['DEMO0000001A', 2, 900, 4200], ['DEMO0000002B', 1, 1500, 6800], ['DEMO0000003C', 5, 180, 650],
    ['DEMO0000004D', 1, 3000, 6000], ['DEMO0000005E', 1, 450, 2200], ['DEMO0000007G', 1, 2400, 7800]];
  let n = 0;
  for (let back = 0; back <= 2; back++) {
    const key = shiftMonth(monthKey(today), -back);
    for (const [tin, perWeek, lo, hi] of plan) {
      const count = Math.round(perWeek * 4.3 * (0.7 + rnd() * 0.6));
      for (let k = 0; k < count; k++) {
        const d = 1 + Math.floor(rnd() * daysIn(key));
        const day = `${key}-${String(d).padStart(2, '0')}`;
        if (day > today) continue;
        const time = `${String(8 + Math.floor(rnd() * 13)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`;
        const total = Math.round((lo + rnd() * (hi - lo)) / 10) * 10;
        receipts.push({ iic: 'DEMO' + String(++n).padStart(28, '0'), tin, crtd: `${day}T${time}:00+02:00`, day, time, total, cat: stores[tin].cat, url: '' });
      }
    }
  }
  const lap = addMonths(today, -23);
  receipts.push({ iic: 'DEMO' + String(++n).padStart(28, '0'), tin: 'DEMO0000006F', crtd: `${lap}T17:20:00+02:00`, day: lap, time: '17:20', total: 89900, cat: 'electronics', url: '', warranty: { months: 24, item: 'Laptop (shembull)' } });
  const fr = addMonths(today, -8);
  receipts.push({ iic: 'DEMO' + String(++n).padStart(28, '0'), tin: 'DEMO0000006F', crtd: `${fr}T11:05:00+02:00`, day: fr, time: '11:05', total: 54900, cat: 'electronics', url: '', warranty: { months: 36, item: 'Frigorifer (shembull)' } });
  return { receipts, stores };
}

// ---------- wiring ----------
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act], [data-open], [data-ics], .tabbar a');
  if (!a) return;
  if (a.dataset.open) { openReceipt(a.dataset.open); return; }
  if (a.dataset.ics) { downloadICS(a.dataset.ics); return; }
  const act = a.dataset.act;
  if (act === 'month') { viewMonth = shiftMonth(viewMonth, +a.dataset.d); render(); }
  else if (act === 'demo') { db.startDemo(sampleData()); viewMonth = monthKey(todayISO()); go('home'); }
  else if (act === 'exit-demo') { db.endDemo(); viewMonth = monthKey(todayISO()); render(); }
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

sheet().addEventListener('close', () => { $('#sheet-body').innerHTML = ''; render(); });
// Tap on the backdrop closes the sheet.
sheet().addEventListener('click', e => { if (e.target === sheet()) closeSheet(); });

window.addEventListener('hashchange', () => go(location.hash.slice(1)));
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (view === 'home') renderHome(); }, 150); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
window.addEventListener('storage', e => { if (e.key === 'kupon.v1') location.reload(); });

// Inject icons for static markup
$$('[data-icon]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });


setLang(db.pref('lang') || 'sq');
applyStatic();
go(location.hash.slice(1) || 'home');

if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
