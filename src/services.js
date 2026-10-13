import { money } from './format.js';
import { renderPage } from './page.js';
import { markDirty } from './panels.js';
import { S, newItem } from './state.js';
import { toast } from './ui.js';
import { $, LS, esc, parseNum, uid } from './util.js';

/* =====================================================================
   SAVED SERVICES — line items you bill often, with their price
   ===================================================================== */
const sdlg = $('#svcDlg'), spick = $('#svcPick');
let editing = null;
const persist = () => LS.set('services', S.services);
const byName = (a, b) => a.desc.localeCompare(b.desc);
const matches = (s, q) => !q || [s.desc, s.sub].some(x => String(x || '').toLowerCase().includes(q));
const TAG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8.6V2.8c0-.4.4-.8.8-.8h5.8L14 7.4 8.4 13 2 8.6z"/><circle cx="5.4" cy="5.4" r="1.1"/></svg>';

function serviceRow(s, attr) {
  return `<div class="h-item" ${attr}="${s.id}" tabindex="0" role="button"><span class="h-av s-av">${TAG}</span><div>
    <div class="h-row"><span class="h-client">${esc(s.desc)}</span><span class="h-total">${money(s.rate)}</span></div>
    <div class="h-row"><span class="h-meta">${esc(s.sub || 'No details')}</span></div></div></div>`;
}

export function renderServices() {
  const q = $('#sSearch').value.trim().toLowerCase();
  const list = [...S.services].sort(byName).filter(s => matches(s, q));
  $('#sList').innerHTML = !S.services.length
    ? '<div class="h-empty">No saved services yet. Add the work you bill often — or press the ★ on any line of an invoice — then drop them into invoices in one click.</div>'
    : list.length ? list.map(s => serviceRow(s, 'data-svc')).join('') : '<div class="h-empty">No services match that search.</div>';
}
$('#sSearch').addEventListener('input', renderServices);
$('#sAdd').addEventListener('click', () => openServiceDialog(null));
$('#sList').addEventListener('click', e => { const it = e.target.closest('[data-svc]'); if (it) openServiceDialog(S.services.find(s => s.id === it.dataset.svc)); });
$('#sList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-svc]')) { e.preventDefault(); e.target.click(); } });

/* ---------- add / edit ---------- */
export function openServiceDialog(svc, opts = {}) {
  editing = svc ? { ...svc } : { id: '', desc: '', sub: '', rate: 0 };
  editing.addAfter = !!opts.addAfter;
  $('#svcTitle').textContent = svc ? 'Edit service' : 'New service';
  $('[data-sf="desc"]', sdlg).value = editing.desc;
  $('[data-sf="sub"]', sdlg).value = editing.sub || '';
  $('[data-sf="rate"]', sdlg).value = editing.rate || '';
  $('#svcDelete').hidden = !svc;
  sdlg.showModal();
  setTimeout(() => $('[data-sf="desc"]', sdlg).focus(), 30);
}
sdlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) sdlg.close(); });
$('#svcSave').addEventListener('click', () => {
  const desc = $('[data-sf="desc"]', sdlg).value.trim();
  if (!desc) { toast('Give the service a name.'); $('[data-sf="desc"]', sdlg).focus(); return; }
  const data = { desc, sub: $('[data-sf="sub"]', sdlg).value.trim(), rate: Math.max(0, parseNum($('[data-sf="rate"]', sdlg).value)) };
  const i = S.services.findIndex(s => s.id === editing.id);
  const saved = i >= 0 ? Object.assign(S.services[i], data) : (S.services.push({ id: 'S' + uid(), ...data }), S.services[S.services.length - 1]);
  if (!persist()) return;
  sdlg.close(); renderServices();
  if (editing.addAfter) insertService(saved);
  else toast(i >= 0 ? 'Service updated' : `${desc} saved to your services`);
});
$('#svcDelete').addEventListener('click', () => {
  if (!confirm(`Delete “${editing.desc}” from your services?\n\nInvoices that already use it are not changed.`)) return;
  S.services = S.services.filter(s => s.id !== editing.id); persist();
  sdlg.close(); renderServices(); toast('Service deleted');
});

/* ---------- on the invoice ---------- */
export function insertService(svc) {
  const last = S.cur.items[S.cur.items.length - 1];
  const row = newItem({ desc: svc.desc, sub: svc.sub || '', qty: 1, rate: +svc.rate || 0 });
  // Fill the empty starter line instead of leaving it dangling above the new one.
  if (last && !last.desc && !last.sub && !(+last.rate)) S.cur.items[S.cur.items.length - 1] = row;
  else S.cur.items.push(row);
  markDirty(); renderPage();
  toast(`Added ${svc.desc}`);
}
export function saveLineAsService(rowId) {
  const it = S.cur.items.find(i => i.id === rowId); if (!it) return;
  if (!it.desc.trim()) { toast('Give the line a description first.'); return; }
  const same = S.services.find(s => s.desc.trim().toLowerCase() === it.desc.trim().toLowerCase());
  if (same) Object.assign(same, { sub: it.sub, rate: +it.rate || 0 });
  else S.services.push({ id: 'S' + uid(), desc: it.desc.trim(), sub: it.sub || '', rate: +it.rate || 0 });
  persist(); renderServices();
  toast(same ? `Updated “${it.desc}” in your services` : `“${it.desc}” saved to your services`);
}

/* ---------- picker ---------- */
export function openServicePicker() {
  if (!S.services.length) { openServiceDialog(null, { addAfter: true }); toast('No saved services yet — add the first one'); return; }
  $('#svcPickSearch').value = ''; renderServicePicker(); spick.showModal();
  setTimeout(() => $('#svcPickSearch').focus(), 30);
}
function renderServicePicker() {
  const q = $('#svcPickSearch').value.trim().toLowerCase();
  const list = [...S.services].sort(byName).filter(s => matches(s, q));
  $('#svcPickList').innerHTML = list.length ? list.map(s => serviceRow(s, 'data-pick-svc')).join('') : '<div class="h-empty">No services match. Use “+ New service” to add one.</div>';
}
$('#svcPickSearch').addEventListener('input', renderServicePicker);
$('#svcPickSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('[data-pick-svc]', spick); if (first) { e.preventDefault(); first.click(); } } });
spick.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { spick.close(); return; }
  const it = e.target.closest('[data-pick-svc]');
  if (it) { spick.close(); insertService(S.services.find(s => s.id === it.dataset.pickSvc)); }
});
spick.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-pick-svc]')) { e.preventDefault(); e.target.click(); } });
$('#svcPickNew').addEventListener('click', () => { spick.close(); openServiceDialog(null, { addAfter: true }); });
