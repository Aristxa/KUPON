// Albanian fiscal receipt QR codes: parsing and scanning.
//
// The QR is a URL to the tax portal, e.g.
//   https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify?iic=..&tin=..&crtd=..&prc=..
// The params sit after "#/verify?" (in the hash), so we don't rely on URL.searchParams.

const PORTAL = 'https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify';
const KEYS = ['iic', 'tin', 'crtd', 'ord', 'bu', 'cr', 'sw', 'prc'];

function param(text, key) {
  const m = text.match(new RegExp('(?:^|[?&#/;])' + key + '=([^&#\\s]*)', 'i'));
  if (!m) return '';
  let v = m[1];
  // A raw "+" in "+02:00" is not a space here; only decode %xx.
  try { v = decodeURIComponent(v.replace(/\+/g, '%2B')); } catch (e) {}
  return v.trim();
}

// "2026-09-27T14:03:11+02:00" -> parts, keeping the receipt's own wall-clock time.
function parseCrtd(s) {
  const m = s.replace(' ', 'T').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se = '00'] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return { day: `${y}-${mo}-${d}`, time: `${h}:${mi}`, seconds: se };
}

function parseAmount(s) {
  if (!s) return NaN;
  let v = s.replace(/\s/g, '');
  // "1.450,50" or "1450,50" -> 1450.50
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// Returns { ok: true, receipt } or { ok: false, reason }.
export function parseReceiptQR(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const p = {};
  for (const k of KEYS) p[k] = param(text, k);
  if (!p.iic || !p.tin || !p.crtd || !p.prc) {
    return { ok: false, reason: /tatime\.gov\.al/i.test(text) ? 'incomplete' : 'not_fiscal' };
  }
  const when = parseCrtd(p.crtd);
  const total = parseAmount(p.prc);
  if (!when || !Number.isFinite(total) || total < 0) return { ok: false, reason: 'incomplete' };

  // Keep the exact link the receipt printed when it points at the tax portal (that's what the
  // portal is known to accept). Anything else gets a clean portal URL rebuilt from the params.
  const qs = KEYS.filter(k => p[k]).map(k => `${k}=${encodeURIComponent(p[k])}`).join('&');
  const url = /^https:\/\/efiskalizimi-app\.tatime\.gov\.al\/[^\s<>"]*$/i.test(text) ? text : `${PORTAL}?${qs}`;
  return {
    ok: true,
    receipt: {
      iic: p.iic.toUpperCase(),
      tin: p.tin.toUpperCase(),
      crtd: p.crtd,
      day: when.day,
      time: when.time,
      total,
      ord: p.ord, bu: p.bu, cr: p.cr, sw: p.sw,
      url,
    },
  };
}

// ---------- decoding ----------

let jsQRPromise = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsQRPromise) {
    jsQRPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/jsQR.js';
      s.onload = () => resolve(window.jsQR);
      s.onerror = () => { jsQRPromise = null; reject(new Error('jsQR failed to load')); };
      document.head.appendChild(s);
    });
  }
  return jsQRPromise;
}

let nativeDetector;
async function getNativeDetector() {
  if (nativeDetector !== undefined) return nativeDetector;
  nativeDetector = null;
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) nativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (e) {}
  return nativeDetector;
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function jsQRFrom(source, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hit = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return hit ? hit.data : null;
}

// Decode a QR from an uploaded photo. Returns the text or null.
export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const det = await getNativeDetector();
    if (det) {
      const codes = await det.detect(bitmap);
      if (codes.length) return codes[0].rawValue;
    }
    await loadJsQR();
    // Receipt photos are large and the QR is small: try a few sizes.
    for (const side of [1600, 1000, 2400]) {
      const text = jsQRFrom(bitmap, bitmap.width, bitmap.height, side);
      if (text) return text;
    }
    return null;
  } finally {
    bitmap.close && bitmap.close();
  }
}

// Live camera scanner. Calls onResult(text) once, then stops.
export class CameraScanner {
  constructor(video) { this.video = video; this.stream = null; this.timer = 0; this.active = false; }

  async start(onResult) {
    this.stop();
    this.active = true;
    const det = await getNativeDetector();
    if (!det) await loadJsQR();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (!this.active) { this.stop(); return; }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});

    const tick = async () => {
      if (!this.active) return;
      const v = this.video;
      let text = null;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          if (det) {
            const codes = await det.detect(v);
            if (codes.length) text = codes[0].rawValue;
          } else {
            text = jsQRFrom(v, v.videoWidth, v.videoHeight, 720);
          }
        } catch (e) {}
      }
      if (text && this.active) { this.stop(); onResult(text); return; }
      this.timer = setTimeout(tick, det ? 120 : 200);
    };
    tick();
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}
