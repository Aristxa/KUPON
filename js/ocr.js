// Reading a receipt photo that has no QR code, on the phone itself (Tesseract, Albanian model).
// Nothing is uploaded: the engine and the language model are files of this app, fetched once
// the first time someone uses it, then cached for offline use.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerP = null;
let onProgress = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('tesseract failed to load'));
    document.head.appendChild(s);
  });
}

function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      return window.Tesseract.createWorker('sqi', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE,
        langPath: BASE,
        gzip: true,
        logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); },
      });
    })().catch(err => { workerP = null; throw err; });
  }
  return workerP;
}

// Thermal receipts are faint and grey: scale to a sensible size, go greyscale and stretch the contrast.
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) / span) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export async function readReceiptPhoto(file, progress) {
  onProgress = progress;
  try {
    const [worker, canvas] = await Promise.all([getWorker(), prepare(file)]);
    const { data } = await worker.recognize(canvas);
    return { text: data.text, ...parseReceiptText(data.text) };
  } finally {
    onProgress = null;
  }
}

// ---------- making sense of the text ----------

// "1.290,00" "1 290.00" "1290" -> 1290
function toNumber(s) {
  let v = s.replace(/\s/g, '');
  if (/[.,]\d{2}$/.test(v)) v = v.slice(0, -3).replace(/[.,]/g, '') + '.' + v.slice(-2);
  else v = v.replace(/[.,]/g, '');
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
const NUM = /\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?/g;
const numbersIn = line => (line.match(NUM) || []).map(toNumber).filter(n => n > 0 && n < 10000000);

const TOTAL_WORDS = /(totali|total|shuma|gjithsej|p[eë]r t[eë'’ ]*u? ?paguar|per te paguar|vlera)/i;
const NOT_TOTAL = /(tvsh|vat|pa tvsh|baza|kusur|kthim|para te dh|cash|karte|kartë)/i;

export function parseReceiptText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { amount: null, day: null, store: '', tin: '' };

  // NIPT: a letter, eight digits, a letter (OCR sometimes reads O for 0).
  const nm = String(text).toUpperCase().replace(/(?<=\d)O|O(?=\d)/g, '0').match(/\b([A-Z]\d{8}[A-Z])\b/);
  if (nm) out.tin = nm[1];

  // Date: 28.10.2026, 28/10/26, 2026-10-28
  for (const l of lines) {
    let m = l.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/);
    let y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
    else if ((m = l.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    if (m && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2020 && y <= 2100) {
      out.day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      break;
    }
  }

  // Total: the last number on a "TOTALI" line (or the line after it), not a VAT line.
  for (let i = lines.length - 1; i >= 0 && out.amount == null; i--) {
    const l = lines[i];
    if (!TOTAL_WORDS.test(l) || NOT_TOTAL.test(l)) continue;
    const here = numbersIn(l.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/, ''));
    const next = lines[i + 1] ? numbersIn(lines[i + 1]) : [];
    const pick = here.length ? here[here.length - 1] : next.length ? next[next.length - 1] : null;
    if (pick) out.amount = pick;
  }
  // Fallback: the largest amount with cents.
  if (out.amount == null) {
    const withCents = lines.flatMap(l => (l.match(/\d[\d .,]*[.,]\d{2}\b/g) || []).map(toNumber)).filter(n => n > 0 && n < 10000000);
    if (withCents.length) out.amount = Math.max(...withCents);
  }

  // Store: the first line near the top that reads like a name.
  for (const l of lines.slice(0, 6)) {
    if (/nipt|adres|tel|rruga|fatur|kupon|data|ora|nr\./i.test(l)) continue;
    const letters = (l.match(/[A-Za-zËëÇç]/g) || []).length;
    // OCR often reads the Albanian word "i" as "1" or "l" between two words.
    if (letters >= 3 && letters / l.length > 0.6) { out.store = l.replace(/[^\p{L}\p{N} .&'-]/gu, '').replace(/(?<=\p{L} )[1l|](?= \p{L})/gu, 'I').trim(); break; }
  }
  return out;
}
