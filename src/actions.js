import { renderClients } from './clients.js';
import { DOC_TEXT } from './config.js';
import { pageFrame } from './dom.js';
import { addDays, daysBetween, todayISO } from './format.js';
import { renderPage } from './page.js';
import { persistWorking, renderAll, renderHistory, updateStatusLine } from './panels.js';
import { S, consumeSerial, isQuote, migrate, newInvoice, peekSerial } from './state.js';
import { toast } from './ui.js';
import { $, LS, clone, uid } from './util.js';

/* =====================================================================
   ACTIONS
   ===================================================================== */
const word = inv => DOC_TEXT[isQuote(inv) ? 'quote' : 'invoice'].short.toLowerCase();

export function openInvoice(id) {
  if (id === S.cur.id && !S.dirty) { $('#app').classList.remove('hist-mobile'); return; }
  if (S.dirty && !confirm(`Discard unsaved changes to the current ${word(S.cur)}?`)) return;
  const inv = S.invoices.find(i => i.id === id); if (!inv) return;
  S.cur = migrate(clone(inv)); S.dirty = false; persistWorking();
  $('#app').classList.remove('hist-mobile');
  renderAll();
}

/** Start a blank invoice or quote. */
export function newDocument(kind = 'invoice') {
  if (S.dirty && !confirm(`Discard unsaved changes to the current ${word(S.cur)}?`)) return;
  S.cur = newInvoice(kind); S.dirty = false; persistWorking(); renderAll();
  toast(`New ${kind} — ${peekSerial(kind)} is assigned when you save`);
  setTimeout(() => $('[data-f="client.name"]', pageFrame)?.focus(), 50);
}
export const newInvoiceAction = () => newDocument('invoice');

export function save(silent) {
  const a = document.activeElement; if (a && pageFrame.contains(a)) a.blur();
  const isNew = !S.cur.number;
  if (isNew) S.cur.number = consumeSerial(S.cur.kind);
  S.cur.updatedAt = Date.now();
  const i = S.invoices.findIndex(x => x.id === S.cur.id), copy = clone(S.cur);
  if (i >= 0) S.invoices[i] = copy; else S.invoices.push(copy);
  if (!LS.set('invoices', S.invoices)) return false;
  S.dirty = false; persistWorking();
  if (isNew) renderPage();
  renderHistory(); renderClients(); updateStatusLine();
  if (!silent) toast(`Saved ${S.cur.number}`);
  return true;
}

export function duplicate() {
  if (!S.cur.number) { toast(`Save this ${word(S.cur)} first — there is nothing to duplicate yet.`); return; }
  if (S.dirty && confirm(`Save your changes to ${S.cur.number} before duplicating?`)) save(true);
  const c = clone(S.cur), span = daysBetween(S.cur.issueDate, S.cur.dueDate);
  Object.assign(c, { id: uid(), number: null, status: 'draft', payments: [], paidDate: '', issueDate: todayISO(), createdAt: Date.now(), updatedAt: Date.now() });
  c.dueDate = addDays(c.issueDate, c.dueManual ? span : c.terms);
  c.items = c.items.map(i => ({ ...i, id: uid() }));
  S.cur = c; S.dirty = true; persistWorking(); renderAll();
  toast(`Duplicated — saves as ${peekSerial()}`);
}

/** The client said yes: make an invoice from this quote and mark the quote accepted. */
export function convertQuote() {
  if (!isQuote(S.cur)) return;
  if (S.dirty || !S.cur.number) save(true);
  const quote = S.cur, issue = todayISO(), terms = +S.settings.defaultTerms || 0;
  const stored = S.invoices.find(i => i.id === quote.id);
  if (stored) { stored.status = 'accepted'; stored.updatedAt = Date.now(); LS.set('invoices', S.invoices); }
  const inv = migrate({
    ...clone(quote), id: uid(), kind: 'invoice', number: null, status: 'draft', quoteRef: quote.number,
    issueDate: issue, terms, dueDate: addDays(issue, terms), dueManual: false,
    termsText: S.settings.defaultTermsText, payments: [], paidDate: '', createdAt: Date.now(), updatedAt: Date.now(),
  });
  inv.items = inv.items.map(i => ({ ...i, id: uid() }));
  S.cur = inv; S.dirty = true; persistWorking(); renderAll();
  toast(`Invoice made from ${quote.number} — it becomes ${peekSerial('invoice')} when you save`);
}

export function deleteInvoice(id) {
  const inv = S.invoices.find(i => i.id === id); if (!inv) return;
  if (!confirm(`Delete ${inv.number}${inv.client?.name ? ' for ' + inv.client.name : ''}?\n\nThis cannot be undone. The number will not be reused.`)) return;
  S.invoices = S.invoices.filter(i => i.id !== id); LS.set('invoices', S.invoices);
  if (S.cur.id === id) { S.cur = newInvoice(); S.dirty = false; persistWorking(); renderAll(); }
  else renderHistory();
  renderClients();
  toast(`Deleted ${inv.number}`);
}
