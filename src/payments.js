import { fmtDate, money, todayISO } from './format.js';
import { renderPage } from './page.js';
import { markDirty, persistWorking, renderHistory } from './panels.js';
import { S, compute, isQuote } from './state.js';
import { toast } from './ui.js';
import { $, LS, esc, parseNum, round2, uid } from './util.js';

/* =====================================================================
   PAYMENTS — money received against an invoice
   ===================================================================== */

// A payment is a record of money in, not an edit to the invoice, so on a saved
// invoice it's stored straight away (same as changing its status).
function commit(change) {
  change(S.cur);
  const stored = S.invoices.find(i => i.id === S.cur.id);
  if (stored) { change(stored); stored.updatedAt = Date.now(); LS.set('invoices', S.invoices); persistWorking(); }
  else markDirty();
  renderPage(); renderHistory(); renderPayments();
}

// The status follows the money: fully paid → Paid; part paid on a draft → Sent.
export function settle(inv) {
  const t = compute(inv);
  if (t.paid > 0 && t.balance <= 0.004) { inv.status = 'paid'; inv.paidDate = inv.payments.map(p => p.date).sort().pop(); }
  else if (inv.status === 'paid' && t.paid > 0 && t.balance > 0.004) { inv.status = 'sent'; inv.paidDate = ''; }
  else if (t.paid > 0 && inv.status === 'draft') inv.status = 'sent';
}

export function renderPayments() {
  const sec = $('#paySection');
  sec.hidden = isQuote(S.cur);
  if (sec.hidden) return;
  const t = compute(S.cur), full = t.paid > 0 && t.balance <= 0.004;
  $('#paySum').innerHTML = t.paid > 0
    ? `<span>Received</span><b>${money(t.paid)}</b><span>Balance due</span><b class="${full ? 'ok' : 'due'}">${money(Math.max(0, t.balance))}</b>`
    : '<span class="none">No payments recorded yet.</span>';
  $('#payList').innerHTML = [...(S.cur.payments || [])].sort((a, b) => a.date.localeCompare(b.date)).map(p => `
    <div class="pay-item"><div><b>${money(p.amount)}</b><span>${fmtDate(p.date, 'mid')}${p.note ? ' · ' + esc(p.note) : ''}</span></div>
    <button type="button" class="h-del" data-del-pay="${p.id}" title="Remove this payment" aria-label="Remove payment">×</button></div>`).join('');
  $('#payForm').hidden = full;
  $('#payDone').hidden = !full;
  if (full) $('#payDone').textContent = `Paid in full${S.cur.paidDate ? ' on ' + fmtDate(S.cur.paidDate, 'mid') : ''}.`;
  const amt = $('#payAmt'), date = $('#payDate');
  if (document.activeElement !== amt) amt.value = t.due > 0 ? t.due.toFixed(2) : '';
  if (document.activeElement !== date && !date.value) date.value = todayISO();
}

$('#payForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = round2(parseNum($('#payAmt').value)), date = $('#payDate').value || todayISO(), note = $('#payNote').value.trim();
  if (!(amount > 0)) { toast('Enter the amount you received.'); $('#payAmt').focus(); return; }
  commit(inv => { inv.payments = [...(inv.payments || []), { id: 'P' + uid(), date, amount, note }]; settle(inv); });
  $('#payNote').value = ''; $('#payDate').value = todayISO();
  const t = compute(S.cur);
  toast(t.balance <= 0.004 ? `${S.cur.number || 'This invoice'} is paid in full` : `Recorded ${money(amount)} — ${money(t.balance)} still due`);
});
$('#payList').addEventListener('click', e => {
  const b = e.target.closest('[data-del-pay]'); if (!b) return;
  if (!confirm('Remove this payment?')) return;
  commit(inv => { inv.payments = inv.payments.filter(p => p.id !== b.dataset.delPay); settle(inv); });
});
