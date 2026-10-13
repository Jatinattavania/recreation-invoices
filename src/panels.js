import { deleteInvoice, openInvoice } from './actions.js';
import { renderClients } from './clients.js';
import { AVATAR_COLORS, STATUSES, STATUS_LABEL, TEMPLATES, TERMS } from './config.js';
import { insp, pageFrame } from './dom.js';
import { addDays, fmtDate, fmtPct, money, todayISO } from './format.js';
import { clientLogoSrc } from './images.js';
import { renderMe } from './me.js';
import { fitStage, renderPage, setDate } from './page.js';
import { ICON, vars } from './render.js';
import { S, accentOf, compute, docStatus, gstOn, isQuote, peekSerial, taxModeOf, ui } from './state.js';
import { renderPayments } from './payments.js';
import { renderServices } from './services.js';
import { $, $$, LS, esc, getPath, hash, parseNum, setPath } from './util.js';

export function renderMiniTotals(t) {
  const rows = [['Subtotal', t.subtotal]];
  if (t.discount) rows.push(['Discount', -t.discount]);
  if (taxModeOf(S.cur) === 'split') rows.push(['CGST + SGST', t.tax]); else if (taxModeOf(S.cur) === 'igst') rows.push(['IGST', t.tax]);
  $('#miniTotals').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v < 0 ? '− ' + money(-v) : money(v)}</b>`).join('')
    + (t.paid > 0 ? `<span>Received</span><b>− ${money(t.paid)}</b>` : '')
    + `<span class="grand">${t.paid > 0 ? 'Balance due' : isQuote(S.cur) ? 'Quoted total' : 'Total due'}</span><b class="grand">${money(t.paid > 0 ? Math.max(0, t.balance) : t.total)}</b>`;
}

export function syncInspector() {
  const quote = isQuote(S.cur), kind = quote ? 'quote' : 'invoice', seg = $('#statusSeg');
  if (seg.dataset.kind !== kind) {
    seg.dataset.kind = kind;
    seg.innerHTML = STATUSES[kind].map(v => `<button data-val="${v}">${STATUS_LABEL[v]}</button>`).join('');
  }
  $('#termsLbl').textContent = quote ? 'Valid for' : 'Payment terms';
  $('#dueLbl').textContent = quote ? 'Valid until' : 'Due';
  $('[data-bind="terms"] [value="0"]', insp).textContent = quote ? 'Same day' : 'Due on receipt';
  $('#quoteSection').hidden = !quote;
  renderPayments();
  const set = (sel, v) => { const el = $(sel, insp); if (el && document.activeElement !== el) el.value = v; };
  set('[data-bind="issueDate"]', S.cur.issueDate);
  set('[data-bind="dueDate"]', S.cur.dueDate);
  const sel = $('[data-bind="terms"]', insp);
  const custom = S.cur.dueManual || !TERMS.includes(+S.cur.terms);
  sel.querySelector('[value="custom"]').hidden = !custom;
  if (document.activeElement !== sel) sel.value = custom ? 'custom' : String(S.cur.terms);
  // GST is off for now: its panel only shows when switched on in Settings, or
  // for an older invoice that already carries tax (so it can be removed).
  $('#taxSection').hidden = !gstOn();
  set('[data-bind="taxRate"]', fmtPct(S.cur.taxRate));
  set('[data-bind="discount.value"]', S.cur.discount.value || '');
  const dv = $('[data-bind="discount.value"]', insp); dv.disabled = S.cur.discount.type === 'none';
  $('#discLbl').textContent = S.cur.discount.type === 'pct' ? 'Percent' : 'Amount (₹)';
  $$('[data-seg]', insp).forEach(seg => {
    const v = String(getPath(S.cur, seg.dataset.seg));
    $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === v)));
  });
}

export function renderClientPanel() {
  const saved = S.clients.find(c => c.id === S.cur.clientId), has = !!(S.cur.client.name || S.cur.client.company);
  const card = $('#clCurrent');
  card.classList.toggle('empty', !has);
  card.innerHTML = has
    ? `${avatarHTML(S.cur.client)}<div><b>${esc(S.cur.client.company || S.cur.client.name)}</b><span class="s">${saved ? 'Saved client' : 'Not in your client list yet'}</span></div>`
    : `No client on this ${isQuote(S.cur) ? 'quote' : 'invoice'} yet`;
  $('#clSave').textContent = saved ? 'Update saved client' : 'Save as client';
  $('#clSave').hidden = !has;
  const src = clientLogoSrc(S.cur);
  const p = $('#clPrev');
  p.classList.toggle('has-logo', !!src);
  p.innerHTML = src ? `<img src="${src}" alt="Client logo">` : 'None';
  $('#clRemove').hidden = !src;
}

export function renderToolbar() {
  $('#tplSeg').innerHTML = Object.entries(TEMPLATES).map(([k, v]) => `<button type="button" data-tpl="${k}" aria-pressed="${S.cur.template === k}">${v.name}</button>`).join('');
  const sw = TEMPLATES[S.cur.template].swatches, active = accentOf(S.cur).toLowerCase();
  const custom = !sw.some(c => c.toLowerCase() === active);
  $('#swatches').innerHTML = sw.map(c => `<button type="button" class="sw" data-sw="${c}" style="background:${c}" aria-pressed="${active === c.toLowerCase()}" title="${c}" aria-label="Colour ${c}"></button>`).join('')
    + `<label class="sw-custom${custom ? ' on' : ''}" title="Custom colour"${custom ? ` style="background:${active}"` : ''}><input type="color" id="swCustom" value="${active}" aria-label="Custom colour"></label>`;
}

export function updateStatusLine() {
  const el = $('#saveState');
  el.className = 'savestate' + (!S.cur.number ? ' draft' : S.dirty ? ' dirty' : '');
  el.innerHTML = `<i></i>${!S.cur.number ? `Draft · becomes ${esc(peekSerial())}` : S.dirty ? `${esc(S.cur.number)} · unsaved` : `${esc(S.cur.number)} · saved`}`;
}

export function initials(c) {
  const w = String(c?.name || c?.company || '').trim().split(/\s+/).filter(Boolean);
  return esc(((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?');
}
export const avatarColor = c => AVATAR_COLORS[parseInt(hash(String(c?.name || c?.company || '')).slice(0, 4), 36) % AVATAR_COLORS.length];
/** Money at a glance: owed, overdue, and this month's received and invoiced. */
export function overview() {
  const month = todayISO().slice(0, 7);
  const o = { outstanding: 0, overdue: 0, overdueCount: 0, received: 0, invoiced: 0 };
  for (const inv of S.invoices) {
    if (isQuote(inv)) continue;
    const t = compute(inv), st = docStatus(inv, t);
    if (st !== 'draft' && st !== 'paid') o.outstanding += Math.max(0, t.balance);
    if (st === 'overdue') { o.overdue += Math.max(0, t.balance); o.overdueCount++; }
    for (const p of inv.payments || []) if ((p.date || '').startsWith(month)) o.received += +p.amount || 0;
    if (inv.status === 'paid' && !(inv.payments || []).length && (inv.paidDate || inv.issueDate || '').startsWith(month)) o.received += t.total;
    if ((inv.issueDate || '').startsWith(month)) o.invoiced += t.total;
  }
  return o;
}
export function renderHistory() {
  const q = $('#hSearch').value.trim().toLowerCase(), filter = ui.docFilter || 'all';
  $$('#docFilter button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  const list = [...S.invoices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .filter(i => filter === 'all' || (filter === 'quote') === isQuote(i))
    .filter(i => !q || [i.number, i.client?.name, i.client?.company, i.project?.title].some(x => String(x || '').toLowerCase().includes(q)));
  const o = overview();
  $('#hSum').innerHTML = S.invoices.length ? `
    <div class="out"><span>Outstanding</span><b>${money(o.outstanding)}</b></div>
    <div class="late"><span>Overdue${o.overdueCount ? ' · ' + o.overdueCount : ''}</span><b>${money(o.overdue)}</b></div>
    <div class="paid"><span>Received this month</span><b>${money(o.received)}</b></div>
    <div><span>Invoiced this month</span><b>${money(o.invoiced)}</b></div>` : '';
  if (!S.invoices.length) { $('#hList').innerHTML = '<div class="h-empty">Nothing saved yet. Invoices and quotes show up here once you save or download one.</div>'; return; }
  if (!list.length) { $('#hList').innerHTML = `<div class="h-empty">${q ? 'Nothing matches that search.' : filter === 'quote' ? 'No quotes yet. Use New → Quote to make one.' : 'No invoices yet.'}</div>`; return; }
  $('#hList').innerHTML = list.map(i => {
    const t = compute(i), st = docStatus(i, t);
    return `
    <div class="h-item${i.id === S.cur.id ? ' active' : ''}" data-open="${i.id}" tabindex="0" role="button">
      ${avatarHTML(i.client)}
      <div>
        <div class="h-row"><span class="h-client">${esc(i.client?.name || i.client?.company || 'Untitled client')}</span><span class="h-total">${money(t.paid > 0 && st !== 'paid' ? t.balance : t.total)}</span></div>
        <div class="h-row"><span class="h-meta">${isQuote(i) ? '<em class="kind">Quote</em> ' : ''}${esc(i.number)} · ${fmtDate(i.issueDate, 'short')}</span>
          <span class="h-end"><button type="button" class="pill pill--${st}" data-status="${i.id}" title="Change status">${STATUS_LABEL[st] || st}</button><button type="button" class="h-del" data-delete="${i.id}" title="Delete" aria-label="Delete ${esc(i.number)}">${ICON.x}</button></span>
        </div>
      </div>
    </div>`;
  }).join('');
}

export function avatarHTML(c) {
  const src = c?.logo && S.logos[c.logo];
  return `<span class="h-av${src ? ' has-logo' : ''}" style="--av:${avatarColor(c)}">${src ? `<img src="${src}" alt="">` : initials(c)}</span>`;
}
export function renderAll() { renderToolbar(); renderPage(); renderHistory(); renderClients(); renderServices(); renderMe(); updateStatusLine(); }

/* ---------- persistence of the working copy (survives refresh, consumes nothing) ---------- */
export let workTimer;
export const persistWorking = () => LS.set('working', { inv: S.cur, dirty: S.dirty });
export function markDirty() { S.dirty = true; clearTimeout(workTimer); workTimer = setTimeout(persistWorking, 300); updateStatusLine(); }
addEventListener('pagehide', persistWorking);

/* =====================================================================
   INSPECTOR + TOOLBAR
   ===================================================================== */
insp.addEventListener('change', e => {
  const b = e.target.dataset.bind; if (!b) return;
  if (b === 'issueDate' || b === 'dueDate') { if (e.target.value) setDate(b, e.target.value); }
  else if (b === 'terms') {
    if (e.target.value === 'custom') return;
    S.cur.terms = +e.target.value; S.cur.dueManual = false; S.cur.dueDate = addDays(S.cur.issueDate, S.cur.terms);
    markDirty(); renderPage();
  }
});
insp.addEventListener('input', e => {
  const b = e.target.dataset.bind;
  if (b === 'taxRate') { S.cur.taxRate = Math.max(0, parseNum(e.target.value)); markDirty(); renderPage(); }
  if (b === 'discount.value') { S.cur.discount.value = Math.max(0, parseNum(e.target.value)); markDirty(); renderPage(); }
});
insp.addEventListener('click', e => {
  const btn = e.target.closest('[data-seg] button'); if (!btn) return;
  const path = btn.parentElement.dataset.seg, v = btn.dataset.val;
  if (path === 'status') { setStatus(S.cur.id, v); return; }
  setPath(S.cur, path, v);
  if (path === 'taxMode' && v !== 'none' && !S.cur.taxRate) S.cur.taxRate = +S.settings.defaultTax || 18;
  markDirty(); renderPage();
});

export function setStatus(id, status) {
  const stored = S.invoices.find(i => i.id === id);
  const paidDate = status === 'paid' ? ((stored || S.cur).paidDate || todayISO()) : '';
  if (stored) { stored.status = status; stored.paidDate = paidDate; stored.updatedAt = Date.now(); LS.set('invoices', S.invoices); }
  if (S.cur.id === id) { S.cur.status = status; S.cur.paidDate = paidDate; if (!stored) markDirty(); else persistWorking(); renderPage(); }
  renderHistory();
}

$('#tplSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-tpl]'); if (!b || b.dataset.tpl === S.cur.template) return;
  S.cur.template = b.dataset.tpl; markDirty(); renderToolbar(); renderPage();
});
$('#swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-sw]'); if (!b) return;
  S.cur.accents[S.cur.template] = b.dataset.sw; markDirty(); renderToolbar(); renderPage();
});
$('#swatches').addEventListener('input', e => {
  if (e.target.id !== 'swCustom') return;
  S.cur.accents[S.cur.template] = e.target.value; markDirty();
  const inv = pageFrame.firstElementChild, z = inv.style.getPropertyValue('--z');
  inv.setAttribute('style', vars(S.cur)); if (z) inv.style.setProperty('--z', z);
});
$('#swatches').addEventListener('change', e => { if (e.target.id === 'swCustom') { renderToolbar(); renderPage(); } });

/* ---------- history panel ---------- */
export const isNarrow = () => matchMedia('(max-width:1180px)').matches;
export function applyHistoryState() { $('#app').classList.toggle('hist-closed', !ui.historyOpen); requestAnimationFrame(fitStage); }
$('#tHist').addEventListener('click', () => {
  if (isNarrow()) $('#app').classList.toggle('hist-mobile');
  else { ui.historyOpen = !ui.historyOpen; LS.set('ui', ui); applyHistoryState(); }
});
$('#hClose').addEventListener('click', () => { if (isNarrow()) $('#app').classList.remove('hist-mobile'); else { ui.historyOpen = false; LS.set('ui', ui); applyHistoryState(); } });
$('#scrim').addEventListener('click', () => $('#app').classList.remove('hist-mobile'));
$('#hSearch').addEventListener('input', renderHistory);

export const nextStatus = inv => { const all = STATUSES[isQuote(inv) ? 'quote' : 'invoice']; return all[(all.indexOf(inv.status) + 1) % all.length]; };
$('#docFilter').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; ui.docFilter = b.dataset.filter; LS.set('ui', ui); renderHistory(); });
$('#hList').addEventListener('click', e => {
  const st = e.target.closest('[data-status]');
  if (st) { const inv = S.invoices.find(i => i.id === st.dataset.status); if (inv) setStatus(inv.id, nextStatus(inv)); return; }
  const del = e.target.closest('[data-delete]');
  if (del) { deleteInvoice(del.dataset.delete); return; }
  const it = e.target.closest('[data-open]'); if (it) openInvoice(it.dataset.open);
});
$('#hList').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open]')) { e.preventDefault(); openInvoice(e.target.dataset.open); }
});
