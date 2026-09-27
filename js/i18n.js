// UI strings. Albanian first, English second.

const STR = {
  sq: {
    'nav.home': 'Pasqyra', 'nav.scan': 'Skano', 'nav.list': 'Kuponat', 'nav.warranty': 'Garancitë', 'nav.settings': 'Të dhënat',
    'lang.switch': 'EN', 'lang.label': 'Switch to English',

    'cat.groceries': 'Ushqime', 'cat.cafe': 'Kafe & restorante', 'cat.fuel': 'Karburant', 'cat.pharmacy': 'Farmaci',
    'cat.clothing': 'Veshje', 'cat.electronics': 'Elektronikë', 'cat.other': 'Të tjera',

    'demo.banner': 'Po shikon të dhëna shembull, jo kuponat e tu.', 'demo.exit': 'Dil',
    'demo.start': 'Shiko me të dhëna shembull',
    'store.nopersist': 'Ky shfletues nuk lejon ruajtjen e të dhënave (p.sh. dritare private). Kuponat do humbasin kur ta mbyllësh.',

    'home.empty.title': 'Ende asnjë kupon',
    'home.empty.body': 'Skano kodin QR në fund të çdo kuponi tatimor. Dyqani, data, ora dhe totali ruhen në telefonin tënd.',
    'home.empty.cta': 'Skano kuponin e parë',
    'home.total': 'Shpenzuar në {month}', 'home.vs': '{pct} krahasuar me {month} ({amount})',
    'home.vs.none': 'Asnjë shpenzim në {month}.',
    'home.count': '{n} kupona', 'home.count1': '1 kupon',
    'home.upto': 'deri më {day}', 'home.samePeriod': 'në të njëjtën periudhë',
    'home.daily': 'Çdo ditë', 'home.byCat': 'Sipas kategorisë', 'home.topStores': 'Dyqanet kryesore',
    'home.noMonth': 'Asnjë kupon këtë muaj.',
    'home.prev': 'Muaji i kaluar', 'home.next': 'Muaji tjetër',
    'home.warrantySoon': '{n} garanci skadojnë brenda 30 ditëve.', 'home.warrantySoon1': '1 garanci skadon brenda 30 ditëve.',
    'th.category': 'Kategoria', 'th.store': 'Dyqani', 'th.amount': 'Shuma', 'th.share': 'Pjesa', 'th.visits': 'Kupona',
    'th.date': 'Data', 'th.total': 'Totali',
    'chart.label': 'Shpenzimet ditore në {month}. Shiko tabelën e kuponave për shifrat.',

    'scan.title': 'Skano kuponin', 'scan.hint': 'Mbaje kodin QR brenda kornizës.',
    'scan.start': 'Hap kamerën', 'scan.stop': 'Mbyll kamerën',
    'scan.photo': 'Ngarko foto', 'scan.paste': 'Ngjit lidhjen',
    'scan.paste.label': 'Lidhja nga kodi QR', 'scan.paste.ph': 'https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify?iic=…',
    'scan.paste.go': 'Shto', 'scan.or': 'ose',
    'scan.noCamera': 'Kamera nuk u hap. Kontrollo lejet e shfletuesit, ose ngarko një foto të kuponit.',
    'scan.insecure': 'Kamera punon vetëm në HTTPS. Ngarko një foto ose ngjit lidhjen.',
    'scan.noQR': 'Nuk u gjet asnjë kod QR në foto. Provo një foto më të afërt e të mprehtë.',
    'scan.busy': 'Duke lexuar foton…',
    'err.not_fiscal': 'Ky kod QR nuk është kupon tatimor shqiptar.',
    'err.incomplete': 'Kodi QR i mungojnë të dhëna (iic, NIPT, data ose totali).',
    'err.empty': 'Ngjit lidhjen e kuponit.',
    'scan.dup': 'Ky kupon është skanuar më parë.',

    'new.title': 'Kuponi u shtua', 'new.storeName': 'Emri i dyqanit',
    'new.storeHint': 'Shkruaje një herë. Kupon mban mend emrin për NIPT {tin}.',
    'new.save': 'Ruaj', 'new.cat': 'Kategoria',

    'list.title': 'Kuponat', 'list.search': 'Kërko dyqan ose NIPT', 'list.empty': 'Asnjë kupon.',
    'list.noMatch': 'Asnjë kupon nuk përputhet.',
    'unnamed': 'Dyqan pa emër',

    'r.title': 'Kuponi', 'r.store': 'Dyqani', 'r.nipt': 'NIPT', 'r.date': 'Data', 'r.time': 'Ora', 'r.total': 'Totali',
    'r.cat': 'Kategoria', 'r.note': 'Shënim', 'r.note.ph': 'p.sh. darkë me shokët',
    'r.official': 'Hap kuponin zyrtar', 'r.official.hint': 'Portali i Tatimeve tregon artikujt dhe nëse kuponi është deklaruar.',
    'r.split': 'Ndaj faturën', 'r.warranty': 'Garanci', 'r.delete': 'Fshi kuponin', 'r.deleteConfirm': 'Shtyp sërish për ta fshirë',
    'r.close': 'Mbyll', 'r.demoOfficial': 'Kuponët shembull nuk kanë faqe zyrtare.',

    'w.on': 'Ruaje në garanci', 'w.item': 'Artikulli', 'w.item.ph': 'p.sh. Laptop Lenovo', 'w.months': 'Kohëzgjatja',
    'w.m': '{n} muaj', 'w.y1': '1 vit', 'w.y': '{n} vjet',
    'w.until': 'Skadon më {date}', 'w.title': 'Garancitë',
    'w.intro': 'Kuponat për elektronikë, pajisje shtëpiake e të tjera që kanë garanci. Hape kuponin dhe aktivizo "Ruaje në garanci".',
    'w.empty': 'Asnjë garanci e ruajtur.', 'w.soon': 'Skadojnë së shpejti', 'w.active': 'Aktive', 'w.expired': 'Të skaduara',
    'w.left': 'edhe {n} ditë', 'w.left1': 'edhe 1 ditë', 'w.today': 'skadon sot', 'w.ago': 'skadoi më {date}',
    'w.cal': 'Kujtesë në kalendar', 'w.cal.title': 'Garancia skadon: {item}',
    'w.cal.desc': 'Garancia për {item} ({store}) skadon më {date}. Kuponi: {url}',

    's.title': 'Ndaj faturën', 's.people': 'Personat', 's.add': 'Shto person', 's.name.ph': 'Emri',
    's.me': 'Unë', 's.equal': 'Në mënyrë të barabartë', 's.custom': 'Shuma të ndryshme',
    's.each': 'Secili: {amount}', 's.left': 'Mbeten pa ndarë: {amount}', 's.over': 'Tejkalon totalin me {amount}',
    's.copy': 'Kopjo mesazhin', 's.copied': 'U kopjua', 's.wa': 'Dërgo në WhatsApp', 's.share': 'Ndaj',
    's.remove': 'Hiq',

    'd.title': 'Të dhënat', 'd.privacy': 'Të gjitha të dhënat ruhen vetëm në këtë shfletues. Asgjë nuk dërgohet në ndonjë server.',
    'd.stats': '{n} kupona, {s} dyqane.',
    'd.csv': 'Shkarko CSV', 'd.json': 'Shkarko kopje rezervë (JSON)', 'd.import': 'Importo JSON ose CSV',
    'd.imported': 'U importuan {n} kupona të rinj.', 'd.importFail': 'Skedari nuk u lexua.',
    'd.stores': 'Dyqanet', 'd.stores.hint': 'Emri dhe kategoria që Kupon mban mend për çdo NIPT.',
    'd.danger': 'Fshi gjithçka', 'd.dangerConfirm': 'Shtyp sërish: fshin të gjithë kuponat',
    'd.cleared': 'Të gjitha të dhënat u fshinë.',
    'd.install': 'Instalo si aplikacion', 'd.installIOS': 'Në iPhone: Ndaj → Shto në ekranin kryesor.',
    'd.about': 'Kupon lexon kodin QR të kuponave tatimorë shqiptarë. Kodi QR përmban NIPT-in e dyqanit, datën, orën dhe totalin, por jo artikujt. Për artikujt, hap kuponin zyrtar në portalin e Tatimeve.',
    'd.source': 'Kodi burimor', 'd.by': 'Bërë nga Aristea Gjokthomi.',
    'd.demoOff': 'Mënyra shembull është aktive. Dil prej saj për të menaxhuar të dhënat e tua.',

    'toast.saved': 'U ruajt', 'toast.deleted': 'Kuponi u fshi',
    'month': ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'],
    'monthIn': ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'],
  },
  en: {
    'nav.home': 'Overview', 'nav.scan': 'Scan', 'nav.list': 'Receipts', 'nav.warranty': 'Warranties', 'nav.settings': 'Data',
    'lang.switch': 'SQ', 'lang.label': 'Kalo në shqip',

    'cat.groceries': 'Groceries', 'cat.cafe': 'Cafés & restaurants', 'cat.fuel': 'Fuel', 'cat.pharmacy': 'Pharmacy',
    'cat.clothing': 'Clothing', 'cat.electronics': 'Electronics', 'cat.other': 'Other',

    'demo.banner': 'You are looking at sample data, not your receipts.', 'demo.exit': 'Exit',
    'demo.start': 'Look around with sample data',
    'store.nopersist': 'This browser does not allow saving data (e.g. a private window). Receipts will be lost when you close it.',

    'home.empty.title': 'No receipts yet',
    'home.empty.body': 'Scan the QR code at the bottom of any Albanian fiscal receipt. The store, date, time and total are saved on your phone.',
    'home.empty.cta': 'Scan your first receipt',
    'home.total': 'Spent in {month}', 'home.vs': '{pct} compared with {month} ({amount})',
    'home.vs.none': 'Nothing spent in {month}.',
    'home.count': '{n} receipts', 'home.count1': '1 receipt',
    'home.upto': 'up to the {day}', 'home.samePeriod': 'over the same days',
    'home.daily': 'Each day', 'home.byCat': 'By category', 'home.topStores': 'Top stores',
    'home.noMonth': 'No receipts this month.',
    'home.prev': 'Previous month', 'home.next': 'Next month',
    'home.warrantySoon': '{n} warranties expire within 30 days.', 'home.warrantySoon1': '1 warranty expires within 30 days.',
    'th.category': 'Category', 'th.store': 'Store', 'th.amount': 'Amount', 'th.share': 'Share', 'th.visits': 'Receipts',
    'th.date': 'Date', 'th.total': 'Total',
    'chart.label': 'Daily spending in {month}. See the receipts table for the figures.',

    'scan.title': 'Scan a receipt', 'scan.hint': 'Keep the QR code inside the frame.',
    'scan.start': 'Open camera', 'scan.stop': 'Close camera',
    'scan.photo': 'Upload photo', 'scan.paste': 'Paste link',
    'scan.paste.label': 'Link from the QR code', 'scan.paste.ph': 'https://efiskalizimi-app.tatime.gov.al/invoice-check/#/verify?iic=…',
    'scan.paste.go': 'Add', 'scan.or': 'or',
    'scan.noCamera': 'Could not open the camera. Check the browser permissions, or upload a photo of the receipt.',
    'scan.insecure': 'The camera only works over HTTPS. Upload a photo or paste the link.',
    'scan.noQR': 'No QR code found in the photo. Try a closer, sharper photo.',
    'scan.busy': 'Reading photo…',
    'err.not_fiscal': 'This QR code is not an Albanian fiscal receipt.',
    'err.incomplete': 'The QR code is missing data (iic, NIPT, date or total).',
    'err.empty': 'Paste the receipt link.',
    'scan.dup': 'You already scanned this receipt.',

    'new.title': 'Receipt added', 'new.storeName': 'Store name',
    'new.storeHint': 'Type it once. Kupon remembers the name for NIPT {tin}.',
    'new.save': 'Save', 'new.cat': 'Category',

    'list.title': 'Receipts', 'list.search': 'Search store or NIPT', 'list.empty': 'No receipts.',
    'list.noMatch': 'No receipts match.',
    'unnamed': 'Unnamed store',

    'r.title': 'Receipt', 'r.store': 'Store', 'r.nipt': 'NIPT', 'r.date': 'Date', 'r.time': 'Time', 'r.total': 'Total',
    'r.cat': 'Category', 'r.note': 'Note', 'r.note.ph': 'e.g. dinner with friends',
    'r.official': 'Open official receipt', 'r.official.hint': 'The tax portal shows the items and whether the receipt was declared.',
    'r.split': 'Split the bill', 'r.warranty': 'Warranty', 'r.delete': 'Delete receipt', 'r.deleteConfirm': 'Tap again to delete',
    'r.close': 'Close', 'r.demoOfficial': 'Sample receipts have no official page.',

    'w.on': 'Keep in warranty vault', 'w.item': 'Item', 'w.item.ph': 'e.g. Lenovo laptop', 'w.months': 'Length',
    'w.m': '{n} months', 'w.y1': '1 year', 'w.y': '{n} years',
    'w.until': 'Expires on {date}', 'w.title': 'Warranties',
    'w.intro': 'Receipts for electronics, appliances and anything else under warranty. Open a receipt and turn on "Keep in warranty vault".',
    'w.empty': 'No warranties saved.', 'w.soon': 'Expiring soon', 'w.active': 'Active', 'w.expired': 'Expired',
    'w.left': '{n} days left', 'w.left1': '1 day left', 'w.today': 'expires today', 'w.ago': 'expired on {date}',
    'w.cal': 'Calendar reminder', 'w.cal.title': 'Warranty expires: {item}',
    'w.cal.desc': 'The warranty for {item} ({store}) expires on {date}. Receipt: {url}',

    's.title': 'Split the bill', 's.people': 'People', 's.add': 'Add person', 's.name.ph': 'Name',
    's.me': 'Me', 's.equal': 'Equally', 's.custom': 'Custom amounts',
    's.each': 'Each: {amount}', 's.left': 'Not assigned yet: {amount}', 's.over': 'Over the total by {amount}',
    's.copy': 'Copy message', 's.copied': 'Copied', 's.wa': 'Send on WhatsApp', 's.share': 'Share',
    's.remove': 'Remove',

    'd.title': 'Your data', 'd.privacy': 'All data is stored only in this browser. Nothing is sent to any server.',
    'd.stats': '{n} receipts, {s} stores.',
    'd.csv': 'Download CSV', 'd.json': 'Download backup (JSON)', 'd.import': 'Import JSON or CSV',
    'd.imported': 'Imported {n} new receipts.', 'd.importFail': 'Could not read the file.',
    'd.stores': 'Stores', 'd.stores.hint': 'The name and category Kupon remembers for each NIPT.',
    'd.danger': 'Delete everything', 'd.dangerConfirm': 'Tap again: deletes all receipts',
    'd.cleared': 'All data deleted.',
    'd.install': 'Install as an app', 'd.installIOS': 'On iPhone: Share → Add to Home Screen.',
    'd.about': 'Kupon reads the QR code on Albanian fiscal receipts. The QR holds the store\'s NIPT, the date, time and total, but not the items. For the items, open the official receipt on the tax portal.',
    'd.source': 'Source code', 'd.by': 'Made by Aristea Gjokthomi.',
    'd.demoOff': 'Sample mode is on. Exit it to manage your own data.',

    'toast.saved': 'Saved', 'toast.deleted': 'Receipt deleted',
    'month': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    'monthIn': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

let lang = 'sq';
export function setLang(l) { lang = STR[l] ? l : 'sq'; document.documentElement.lang = lang; }
export function getLang() { return lang; }

export function t(key, vars) {
  let s = STR[lang][key];
  if (s == null) s = STR.sq[key];
  if (s == null) return key;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  return s;
}

// Albanian share messages always use Albanian, whatever the UI language.
export function tsq(key, vars) {
  const prev = lang; lang = 'sq';
  try { return t(key, vars); } finally { lang = prev; }
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
}
