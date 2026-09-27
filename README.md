# Kupon

Scan the fiscal QR code on any Albanian receipt and see where your money goes.
No account; everything stays in your browser.

Live: https://aristxa.github.io/KUPON/

## What v1 does

- **Scan** with the camera (`BarcodeDetector` where available, bundled jsQR otherwise), upload a photo, or paste the QR link.
- **Log** store NIPT, date, time and total from the QR. You type a store name once per NIPT; the category is suggested from the name. Duplicates are caught by `iic`.
- **Overview**: this month vs last month (same days, for the running month), spend per day, by category, top stores.
- **Split the bill**: equal or custom amounts, with an Albanian message to copy or send on WhatsApp.
- **Warranty vault**: mark a receipt as under warranty, see what expires soon, add a calendar reminder (.ics).
- **Official check**: opens the receipt on the tax portal, which lists the items.
- **Data**: CSV and JSON export, import (merges, skips duplicates), delete all.
- **PWA**: installable, works offline. Albanian UI with an English toggle.

## Limits

The QR code has the store's NIPT, the date/time and the total, not the items or the store name.
The tax portal's API rejects requests from other sites (CORS 403), so items stay behind the "Open official receipt" link for now.

## Run locally

No build step. Serve the folder and open it:

```
python -m http.server 8000
```

The camera needs HTTPS or `localhost`. Add `?nosw` to the URL to skip the service worker while developing.

## Files

- `js/qr.js`: QR parsing (params live after `#/verify?`) and camera/photo decoding
- `js/store.js`: localStorage data, category hints, sample-data mode
- `js/app.js`: views, split, warranty, import/export
- `js/i18n.js`: Albanian and English strings
- `sw.js`: network first, cache fallback

Icons: Microsoft Fluent UI System Icons (MIT). QR fallback: jsQR (Apache-2.0).
