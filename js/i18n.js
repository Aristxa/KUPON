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
    'home.empty.body': 'Skano kodin QR në fund të çdo kuponi tatimor. Dyqani, artikujt, TVSH dhe totali ruhen në telefonin tënd, dhe shikon nëse kuponi është deklaruar.',
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
    's.remove': 'Hiq', 's.person': 'Personi',

    'd.title': 'Të dhënat', 'd.privacy': 'Kuponat ruhen vetëm në këtë shfletues. Nuk ka llogari dhe asnjë server të Kupon.',
    'd.stats': '{n} kupona, {s} dyqane.',
    'd.csv': 'Shkarko CSV', 'd.json': 'Shkarko kopje rezervë (JSON)', 'd.import': 'Importo JSON ose CSV',
    'd.imported': 'U importuan {n} kupona të rinj.', 'd.importFail': 'Skedari nuk u lexua.',
    'd.stores': 'Dyqanet', 'd.stores.hint': 'Emri dhe kategoria që Kupon mban mend për çdo NIPT.',
    'd.danger': 'Fshi gjithçka', 'd.dangerConfirm': 'Shtyp sërish: fshin të gjithë kuponat',
    'd.cleared': 'Të gjitha të dhënat u fshinë.',
    'd.install': 'Instalo si aplikacion', 'd.installIOS': 'Në iPhone: Ndaj → Shto në ekranin kryesor.',
    'd.about': 'Kupon lexon kodin QR të kuponave tatimorë shqiptarë (NIPT, data, ora, totali) dhe merr pjesën tjetër (dyqani, artikujt, TVSH) nga portali publik i Tatimeve.',
    'd.source': 'Kodi burimor', 'd.by': 'Bërë nga Aristea Gjokthomi.',
    'd.demoOff': 'Mënyra shembull është aktive. Dil prej saj për të menaxhuar të dhënat e tua.',

    'f.ok': 'Deklaruar në Tatime', 'f.checking': 'Duke pyetur Tatimet…',
    'f.pending': 'Ende nuk është te Tatimet. Kupon e kontrollon sërish vetë.',
    'f.pending.why': 'Arkat pa internet mund t\'i dërgojnë kuponat deri në 48 orë më vonë.',
    'f.missing': 'Nuk u gjet te Tatimet pas 48 orësh',
    'f.missing.why': 'Mund të jetë gabim i dyqanit ose kupon i padeklaruar. Mund ta raportosh te Tatimet.',
    'f.ask': 'Pyet Asistentin Fiskal për të drejtat e tua',
    'f.error': 'Tatimet nuk u kontrolluan (pa internet ose portali nuk u përgjigj).',
    'f.unchecked': 'Pa kontrolluar te Tatimet', 'f.check': 'Kontrollo te Tatimet', 'f.recheck': 'Kontrollo sërish',
    'f.mismatch': 'Kujdes: Tatimet kanë totalin {amount}, jo atë të kodit QR.',
    'f.off': 'Kontrolli te Tatimet është i fikur te Të dhënat.',
    'r.items': 'Artikujt', 'r.vat': 'TVSH', 'r.address': 'Adresa', 'r.manual': 'Shtuar me dorë',
    'th.item': 'Artikulli', 'th.qty': 'Sasia', 'th.price': 'Çmimi',
    'new.fetching': 'Duke marrë emrin e dyqanit dhe artikujt nga Tatimet…',
    'new.fetched': 'Emri dhe artikujt u morën nga Tatimet.', 'new.again': 'Ruaj dhe skano tjetrin',
    'home.vat': 'TVSH e paguar: {amount}', 'home.vat.cov': 'nga {n} prej {m} kuponash me të dhëna nga Tatimet',
    'home.budget': 'Buxheti', 'home.budget.left': 'mbeten {amount}', 'home.budget.over': 'mbi buxhet me {amount}',
    'home.checked': '{n} prej {m} kuponash janë deklaruar te Tatimet.',
    'scan.manual': 'Shto shpenzim pa kupon QR',
    'm.title': 'Shpenzim pa kupon QR', 'm.store': 'Ku?', 'm.store.ph': 'p.sh. Taksi, Qiraja, Tregu', 'm.amount': 'Shuma (L)',
    'm.date': 'Data', 'm.time': 'Ora', 'm.add': 'Shto', 'm.bad': 'Plotëso vendin dhe një shumë më të madhe se 0.',
    'list.tab.receipts': 'Kuponat', 'list.tab.prices': 'Çmimet',
    'p.search': 'Kërko produkt', 'p.intro': 'Çdo produkt që ke blerë, me çmimin e fundit dhe ku e gjen më lirë. Ndërtohet nga artikujt që jep Tatimet.',
    'p.empty': 'Ende asnjë artikull. Artikujt vijnë nga Tatimet kur skanon një kupon me internet.',
    'p.last': 'herën e fundit {price} te {store}', 'p.cheapest': 'më lirë {price} te {store}',
    'p.change': '{pct} që nga {date}', 'p.times': '{n} herë', 'p.history': 'Historiku i çmimit',
    'p.unit': 'për {unit}',
    's.items': 'Sipas artikujve', 's.items.hint': 'Prek emrat te çdo artikull. Një artikull i ndarë mes disa vetëve pjesëtohet në mënyrë të barabartë.',
    's.unassigned': 'Pa caktuar: {amount}', 's.noItems': 'Ky kupon nuk ka artikuj nga Tatimet.',
    'd.portal': 'Kontrollo kuponat te Tatimet',
    'd.portal.hint': 'Kur skanon, Kupon pyet portalin zyrtar të Tatimeve për atë kupon (emri i dyqanit, artikujt, TVSH, nëse është deklaruar). Asgjë nuk dërgohet diku tjetër.',
    'd.fetchAll': 'Merr artikujt për kuponat e vjetër ({n})', 'd.fetching': 'Duke marrë {i} nga {n}…', 'd.fetchDone': 'U përditësuan {n} kupona.',
    'd.budgets': 'Buxheti mujor', 'd.budgets.hint': 'Lëre bosh për kategoritë pa buxhet.',
    'd.fiskal': 'Kupon lidhet me Asistentin Fiskal, një asistent për ligjin tatimor shqiptar.',
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
    'home.empty.body': 'Scan the QR code at the bottom of any Albanian fiscal receipt. The store, items, VAT and total are saved on your phone, and you see whether the receipt was declared.',
    'home.empty.cta': 'Scan your first receipt',
    'home.total': 'Spent in {month}', 'home.vs': '{pct} compared with {month} ({amount})',
    'home.vs.none': 'Nothing spent in {month}.',
    'home.count': '{n} receipts', 'home.count1': '1 receipt',
    'home.upto': 'up to {day}', 'home.samePeriod': 'over the same days',
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
    's.remove': 'Remove', 's.person': 'Person',

    'd.title': 'Your data', 'd.privacy': 'Receipts are stored only in this browser. There is no account and no Kupon server.',
    'd.stats': '{n} receipts, {s} stores.',
    'd.csv': 'Download CSV', 'd.json': 'Download backup (JSON)', 'd.import': 'Import JSON or CSV',
    'd.imported': 'Imported {n} new receipts.', 'd.importFail': 'Could not read the file.',
    'd.stores': 'Stores', 'd.stores.hint': 'The name and category Kupon remembers for each NIPT.',
    'd.danger': 'Delete everything', 'd.dangerConfirm': 'Tap again: deletes all receipts',
    'd.cleared': 'All data deleted.',
    'd.install': 'Install as an app', 'd.installIOS': 'On iPhone: Share → Add to Home Screen.',
    'd.about': 'Kupon reads the QR code on Albanian fiscal receipts (NIPT, date, time, total) and gets the rest (store, items, VAT) from the public tax portal.',
    'd.source': 'Source code', 'd.by': 'Made by Aristea Gjokthomi.',
    'd.demoOff': 'Sample mode is on. Exit it to manage your own data.',

    'f.ok': 'Declared to the tax authority', 'f.checking': 'Asking the tax portal…',
    'f.pending': 'Not at the tax authority yet. Kupon will check again by itself.',
    'f.pending.why': 'Tills without internet can send receipts up to 48 hours late.',
    'f.missing': 'Not found at the tax authority after 48 hours',
    'f.missing.why': 'It may be a shop error or an undeclared receipt. You can report it to the tax authority.',
    'f.ask': 'Ask Asistenti Fiskal about your rights',
    'f.error': 'Could not check with the tax portal (no internet or no answer).',
    'f.unchecked': 'Not checked with the tax portal', 'f.check': 'Check with the tax portal', 'f.recheck': 'Check again',
    'f.mismatch': 'Careful: the tax portal has a total of {amount}, not the one in the QR code.',
    'f.off': 'Tax portal checks are turned off under Data.',
    'r.items': 'Items', 'r.vat': 'VAT', 'r.address': 'Address', 'r.manual': 'Added by hand',
    'th.item': 'Item', 'th.qty': 'Qty', 'th.price': 'Price',
    'new.fetching': 'Getting the store name and items from the tax portal…',
    'new.fetched': 'Name and items came from the tax portal.', 'new.again': 'Save and scan another',
    'home.vat': 'VAT paid: {amount}', 'home.vat.cov': 'from {n} of {m} receipts with tax portal data',
    'home.budget': 'Budget', 'home.budget.left': '{amount} left', 'home.budget.over': '{amount} over budget',
    'home.checked': '{n} of {m} receipts are declared to the tax authority.',
    'scan.manual': 'Add spending without a QR receipt',
    'm.title': 'Spending without a QR receipt', 'm.store': 'Where?', 'm.store.ph': 'e.g. Taxi, Rent, Market stall', 'm.amount': 'Amount (L)',
    'm.date': 'Date', 'm.time': 'Time', 'm.add': 'Add', 'm.bad': 'Fill in the place and an amount above 0.',
    'list.tab.receipts': 'Receipts', 'list.tab.prices': 'Prices',
    'p.search': 'Search product', 'p.intro': 'Every product you have bought, with its latest price and where it is cheapest. Built from the items the tax portal returns.',
    'p.empty': 'No items yet. Items come from the tax portal when you scan a receipt while online.',
    'p.last': 'last {price} at {store}', 'p.cheapest': 'cheapest {price} at {store}',
    'p.change': '{pct} since {date}', 'p.times': '{n} times', 'p.history': 'Price history',
    'p.unit': 'per {unit}',
    's.items': 'By item', 's.items.hint': 'Tap names on each item. An item shared by several people is divided equally.',
    's.unassigned': 'Not assigned: {amount}', 's.noItems': 'This receipt has no items from the tax portal.',
    'd.portal': 'Check receipts with the tax portal',
    'd.portal.hint': 'When you scan, Kupon asks the official tax portal about that receipt (store name, items, VAT, whether it was declared). Nothing is sent anywhere else.',
    'd.fetchAll': 'Get items for older receipts ({n})', 'd.fetching': 'Getting {i} of {n}…', 'd.fetchDone': 'Updated {n} receipts.',
    'd.budgets': 'Monthly budget', 'd.budgets.hint': 'Leave empty for categories without a budget.',
    'd.fiskal': 'Kupon goes with Asistenti Fiskal, an assistant for Albanian tax law.',
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
