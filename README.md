# Kupon

Scan the fiscal QR code on any Albanian receipt and see where your money goes.
No account; everything stays in your browser.

Live: https://aristxa.github.io/KUPON/

## What it does

- **Scan** with the camera (`BarcodeDetector` where available, bundled jsQR otherwise), upload a photo, or paste the QR link. Batch mode: save and scan the next one.
- **Declared check**: every receipt is looked up on the tax authority's public check portal. You see whether it was declared, and receipts that aren't there yet are checked again (tills may report up to 48 hours late).
- **Items, store name and VAT** come from the same lookup, so a scan is logged with no typing.
- **Overview**: this month against the same days of last month, VAT paid, spend per day, by category and by store, and monthly budgets.
- **Price memory**: every product you buy gets a price history across stores, showing where it is cheapest and how its price has changed.
- **Split the bill**: equally, by custom amounts, or by item (tap who had what). You get an Albanian message to copy or send on WhatsApp.
- **Warranty vault**: mark a receipt as under warranty, see what expires soon, and add a calendar reminder (.ics).
- **Manual entry** for spending without a fiscal receipt.
- **Data**: CSV and JSON export, import (merges and skips duplicates), delete all.
- **PWA**: installable and works offline. Albanian UI with an English toggle.

## How the portal lookup works

The QR code holds the NIPT, date/time and total. The rest comes from `POST /invoice-check/api/verifyInvoice`
(form fields `iic`, `dateTimeCreated`, `tin`), the endpoint the portal's own page uses. A plain form POST needs no CORS preflight,
and the endpoint answers with `Access-Control-Allow-Origin: *`, so the browser reads it directly, without a server or proxy.
Kupon sends one request per receipt you scan, plus occasional rechecks for receipts that aren't there yet. You can turn it off under *Data*.

## Run locally

No build step. Serve the folder and open it:

```
python -m http.server 8000
```

The camera needs HTTPS or `localhost`. Add `?nosw` to the URL to skip the service worker while developing.

## Files

- `js/portal.js`: tax portal lookup and response parsing
- `js/qr.js`: QR parsing (params live after `#/verify?`) and camera/photo decoding
- `js/store.js`: localStorage data, category hints, sample-data mode
- `js/app.js`: views, split, warranty, import/export
- `js/i18n.js`: Albanian and English strings
- `sw.js`: network first, cache fallback

Icons: Microsoft Fluent UI System Icons (MIT). QR fallback: jsQR (Apache-2.0).
