// Receipt details from the tax authority's public check portal.
//
// The portal's own page calls this endpoint with a plain form POST. Plain form POSTs need no CORS
// preflight, and the endpoint answers with Access-Control-Allow-Origin: *, so the browser can read it
// directly. One request per receipt, only for receipts the user scanned.
//
// Field names come from the portal's front-end (verifyInvoiceData.* and its items table).
// An empty body means the portal has no record of the receipt (yet: tills that were offline
// can send receipts up to 48 hours late).

const ENDPOINT = 'https://efiskalizimi-app.tatime.gov.al/invoice-check/api/verifyInvoice';

const num = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = v => (v == null ? '' : String(v).trim());

function normalizeItem(it) {
  const qty = num(it.quantity);
  const unitPrice = num(it.unitPriceAfterVat) ?? num(it.unitPriceBeforeVat);
  let total = num(it.priceAfterVat);
  if (total == null && qty != null && unitPrice != null) total = Math.round(qty * unitPrice * 100) / 100;
  return {
    name: str(it.name) || str(it.code) || '?',
    code: str(it.code),
    unit: str(it.unit),
    qty: qty ?? 1,
    unitPrice: unitPrice ?? (total != null && qty ? total / qty : null),
    total: total ?? 0,
    vatRate: num(it.vatRate),
    vat: num(it.vatAmount),
  };
}

// Returns { status: 'ok', data } | { status: 'notfound' } | { status: 'error', reason }.
export async function lookupReceipt(r, { timeout = 15000 } = {}) {
  if (!navigator.onLine) return { status: 'error', reason: 'offline' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ iic: r.iic, dateTimeCreated: r.crtd, tin: r.tin }),
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return { status: 'error', reason: 'http_' + res.status };
    const text = (await res.text()).trim();
    if (!text || text === 'null') return { status: 'notfound' };
    let d;
    try { d = JSON.parse(text); } catch (e) { return { status: 'error', reason: 'parse' }; }
    if (!d || typeof d !== 'object') return { status: 'notfound' };

    const seller = d.seller || {};
    const pay = Array.isArray(d.paymentMethod) ? d.paymentMethod : [];
    return {
      status: 'ok',
      data: {
        seller: { name: str(seller.name), address: str(seller.address), town: str(seller.town) },
        total: num(d.totalPrice),
        net: num(d.totalPriceWithoutVAT),
        vat: num(d.totalVATAmount),
        items: Array.isArray(d.items) ? d.items.map(normalizeItem) : [],
        payment: pay.map(p => str(p.type || p.typeCode || p.code)).filter(Boolean),
        invoiceNumber: str(d.invoiceNumber),
      },
    };
  } catch (e) {
    return { status: 'error', reason: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// Shop names on receipts are the legal entity, often in capitals with the company form attached.
export function tidySellerName(name) {
  let n = str(name).replace(/\s+/g, ' ');
  n = n.replace(/\b(SH\.?\s?P\.?\s?K\.?|SH\.?\s?A\.?|PERSON FIZIK|P\.?\s?F\.?)\s*$/i, '').replace(/[\s,.-]+$/, '');
  if (n && n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/(^|[\s"'(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  return n;
}
