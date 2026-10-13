import { DEFAULT_SETTINGS, GST_FEATURE, START_NUMBER, TEMPLATES } from './config.js';
import { addDays, thisYear, todayISO } from './format.js';
import { LS, isHex, merge, round2, uid } from './util.js';

// Everything the app shares and reassigns lives on S (settings, invoices, the open invoice…),
// so every module sees the same values.
export const S = {};

/* =====================================================================
   STATE
   ===================================================================== */
S.settings = merge(DEFAULT_SETTINGS, LS.get('settings', {}));
if (!TEMPLATES[S.settings.defaultTemplate]) S.settings.defaultTemplate = 'bold';
// Invoices and quotes share one list; `kind` tells them apart.
S.invoices = LS.get('invoices', []);
S.counter = LS.get('counter', { next: START_NUMBER, year: thisYear() });     // invoice numbers
S.counterQ = LS.get('counterQ', { next: START_NUMBER, year: thisYear() });   // quote numbers
export const used = new Set(LS.get('used', []));
S.invoices.forEach(i => i.number && used.add(i.number));
// Client logos are stored once and referenced by id, so a logo reused on many
// invoices costs its bytes once in localStorage.
S.logos = LS.get('logos', {});
// The client book. Picking a client copies their details onto the invoice, so an
// invoice already issued never changes when the client's details are edited later.
S.clients = LS.get('clients', null);
if (!Array.isArray(S.clients)) { S.clients = clientsFromInvoices(); LS.set('clients', S.clients); }
// Saved services: reusable line items with a price.
S.services = LS.get('services', []);
// First run with this feature: build the book from clients already on saved invoices.
export function clientsFromInvoices() {
  const seen = new Map();
  [...S.invoices].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(i => {
    const c = i.client || {}, key = String(c.company || c.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.set(key, { id: 'C' + uid(), name: c.name || '', company: c.company || '', address: c.address || '', email: c.email || '', phone: '', gstin: c.gstin || '', logo: c.logo || '', createdAt: Date.now() });
  });
  return [...seen.values()];
}
export const ui = merge({ historyOpen: true, sideTab: 'invoices', docFilter: 'all' }, LS.get('ui', {}));
S.cur = undefined; S.dirty = false;
export const gstOn = () => GST_FEATURE && !!S.settings.gstEnabled;
export const taxModeOf = inv => gstOn() ? inv.taxMode : 'none';
export const isQuote = inv => inv?.kind === 'quote';

/* ---------- serial numbers ----------
   Invoices and quotes each have their own series (RCS-0001, RCS-Q-0001).
   A counter only moves forward when a document is saved or downloaded, and
   every issued number is remembered in `used`, so even a deleted invoice's
   number is never handed out again. */
const counterKey = kind => kind === 'quote' ? 'counterQ' : 'counter';
export function syncCounterYear(kind = 'invoice') {
  const k = counterKey(kind);
  if (S.settings.serial.yearly && S[k].year !== thisYear()) { S[k] = { next: START_NUMBER, year: thisYear() }; LS.set(k, S[k]); }
}
export function fmtSerial(n, kind = 'invoice') {
  const s = S.settings.serial, prefix = kind === 'quote' ? (s.quotePrefix || 'Q-') : s.prefix;
  return prefix + (s.yearly ? thisYear() + '-' : '') + String(n).padStart(s.pad || 4, '0');
}
export function nextFree(kind = 'invoice') {
  syncCounterYear(kind);
  let n = Math.max(1, S[counterKey(kind)].next | 0);
  while (used.has(fmtSerial(n, kind))) n++;
  return n;
}
export const peekSerial = (kind = S.cur?.kind || 'invoice') => fmtSerial(nextFree(kind), kind);
export function consumeSerial(kind = 'invoice') {
  const n = nextFree(kind), s = fmtSerial(n, kind), k = counterKey(kind);
  S[k] = { next: n + 1, year: thisYear() }; used.add(s);
  LS.set(k, S[k]); LS.set('used', [...used]);
  return s;
}
export const serialText = () => S.cur.number || peekSerial();

/* ---------- invoice model ---------- */
export const newItem = (o = {}) => ({ id: uid(), desc: '', sub: '', qty: 1, rate: 0, ...o });
export const defaultAccents = () => Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.swatches[0]]));
export function newInvoice(sample = false, kind = 'invoice') {
  const quote = kind === 'quote';
  const issue = todayISO(), terms = quote ? +S.settings.quoteValidDays || 30 : +S.settings.defaultTerms || 0;
  const inv = {
    id: uid(), kind, number: null, status: 'draft',
    template: S.settings.defaultTemplate, accents: defaultAccents(),
    issueDate: issue, terms, dueDate: addDays(issue, terms), dueManual: false,
    client: { name: '', company: '', address: '', email: '', gstin: '', logo: '' }, clientId: '',
    project: { title: '', desc: '' },
    items: [newItem()],
    discount: { type: 'none', value: 0 },
    taxRate: +S.settings.defaultTax || 0, taxMode: gstOn() ? (S.settings.defaultTaxMode || 'split') : 'none',
    notes: quote ? S.settings.defaultQuoteNotes : S.settings.defaultNotes,
    termsText: quote ? S.settings.defaultQuoteTerms : S.settings.defaultTermsText,
    thanks: S.settings.thanks,
    acceptText: S.settings.defaultAcceptText,   // quotes: how to accept
    payments: [],                               // invoices: [{ id, date, amount, note }]
    paidDate: '', quoteRef: '',
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  if (sample) {
    inv.client = { name: 'Aarav Mehta', company: 'Northwind Foods Pvt. Ltd.', address: '4th Floor, Prestige Meridian\nMG Road, Bengaluru 560001', gstin: '', logo: '' };
    inv.project = { title: 'Website redesign', desc: 'Brand-led redesign of the marketing site, from research through launch.' };
    inv.items = [
      newItem({ desc: 'Discovery & UX research', sub: 'Stakeholder interviews, competitor audit, user flows', qty: 1, rate: 45000 }),
      newItem({ desc: 'UI design — marketing website', sub: 'Responsive screens and a Figma design system', qty: 12, rate: 6500 }),
      newItem({ desc: 'Webflow development', sub: 'CMS setup, interactions, launch support', qty: 1, rate: 60000 }),
    ];
  }
  return inv;
}
export function migrate(inv) {
  const m = merge(newInvoice(false, inv.kind === 'quote' ? 'quote' : 'invoice'), inv);
  if (!TEMPLATES[m.template]) m.template = S.settings.defaultTemplate;   // earlier designs no longer exist
  const acc = {};
  for (const [k, v] of Object.entries(m.accents || {})) if (TEMPLATES[k] && isHex(v)) acc[k] = v;
  m.accents = { ...defaultAccents(), ...acc };
  if (!Array.isArray(m.payments)) m.payments = [];
  delete m.accent;
  return m;
}
export const accentOf = inv => inv.accents?.[inv.template] || TEMPLATES[inv.template].swatches[0];

export function compute(inv) {
  const lines = {}; let subtotal = 0;
  inv.items.forEach(it => { const a = round2((+it.qty || 0) * (+it.rate || 0)); lines[it.id] = a; subtotal += a; });
  subtotal = round2(subtotal);
  const d = inv.discount || {}; let discount = 0;
  if (d.type === 'pct') discount = round2(subtotal * Math.min(100, Math.max(0, +d.value || 0)) / 100);
  else if (d.type === 'flat') discount = round2(Math.min(subtotal, Math.max(0, +d.value || 0)));
  const taxable = round2(subtotal - discount);
  const rate = Math.max(0, +inv.taxRate || 0);
  let cgst = 0, sgst = 0, igst = 0;
  const mode = taxModeOf(inv);
  if (mode === 'split') { cgst = round2(taxable * rate / 200); sgst = cgst; }
  else if (mode === 'igst') igst = round2(taxable * rate / 100);
  const tax = round2(cgst + sgst + igst);
  const total = round2(taxable + tax);
  // Payments received so far; `due` is what the client still owes (and what the QR asks for).
  const paid = isQuote(inv) ? 0 : round2((inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0));
  const balance = round2(total - paid);
  return { lines, subtotal, discount, taxable, cgst, sgst, igst, tax, total, paid, balance, due: paid > 0 ? Math.max(0, balance) : total };
}

/** Where a document stands. Invoices: draft · sent · partial · paid · overdue. Quotes: draft · sent · accepted · declined. */
export function docStatus(inv, t = compute(inv)) {
  if (isQuote(inv)) return inv.status;
  if (inv.status === 'paid' || (t.paid > 0 && t.balance <= 0.004)) return 'paid';
  if (inv.status !== 'draft' && inv.dueDate && inv.dueDate < todayISO()) return 'overdue';
  if (t.paid > 0) return 'partial';
  return inv.status === 'paid' ? 'paid' : inv.status;
}
