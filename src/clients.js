import { GST_FEATURE } from './config.js';
import { cdlg, pdlg } from './dom.js';
import { money } from './format.js';
import { fitImage, storeLogo } from './images.js';
import { renderPage } from './page.js';
import { avatarHTML, markDirty, renderAll, renderClientPanel, renderHistory } from './panels.js';
import { S, compute, newInvoice, ui } from './state.js';
import { toast } from './ui.js';
import { $, $$, LS, clone, esc, uid } from './util.js';

/* =====================================================================
   CLIENTS — the client book, its edit dialog, and the picker
   ===================================================================== */
export const clientLabel = c => c.company || c.name || 'Untitled client';
export const sameClient = (a, b) => [a.company, a.name].some(x => x && [b.company, b.name].some(y => y && String(x).trim().toLowerCase() === String(y).trim().toLowerCase()));
export function clientStats(c) {
  const mine = S.invoices.filter(i => i.clientId ? i.clientId === c.id : sameClient(i.client || {}, c));
  return { count: mine.length, total: mine.reduce((s, i) => s + compute(i).total, 0) };
}
export const byLabel = (a, b) => clientLabel(a).localeCompare(clientLabel(b));
export const matches = (c, q) => !q || [c.name, c.company, c.email, c.phone, c.address].some(x => String(x || '').toLowerCase().includes(q));
export function clientRow(c, attr) {
  const st = clientStats(c), sub = c.company ? c.name : (c.email || c.phone || '');
  return `<div class="h-item" ${attr}="${c.id}" tabindex="0" role="button">${avatarHTML(c)}<div>
    <div class="h-row"><span class="h-client">${esc(clientLabel(c))}</span><span class="c-count">${st.count} invoice${st.count === 1 ? '' : 's'}</span></div>
    <div class="h-row"><span class="h-meta">${esc(sub || '—')}</span><span class="h-total">${st.count ? money(st.total) : ''}</span></div></div></div>`;
}

export function setSideTab(tab) {
  if (!$(`.side .pane[data-pane="${tab}"]`)) tab = 'invoices';
  ui.sideTab = tab; LS.set('ui', ui);
  $$('#sideTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  $$('.side .pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
}
$('#sideTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setSideTab(b.dataset.tab); });

export function renderClients() {
  const q = $('#cSearch').value.trim().toLowerCase();
  const list = [...S.clients].sort(byLabel).filter(c => matches(c, q));
  $('#cList').innerHTML = !S.clients.length
    ? '<div class="h-empty">No clients yet. Add your clients once, then pick them on any invoice and all their details fill in.</div>'
    : list.length ? list.map(c => clientRow(c, 'data-client')).join('') : '<div class="h-empty">No clients match that search.</div>';
}
$('#cSearch').addEventListener('input', renderClients);
$('#cAdd').addEventListener('click', () => openClientDialog(null));
$('#cList').addEventListener('click', e => { const it = e.target.closest('[data-client]'); if (it) openClientDialog(S.clients.find(c => c.id === it.dataset.client)); });
$('#cList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-client]')) { e.preventDefault(); e.target.click(); } });
export let editing = null;
export const CLIENT_FIELDS = [
  ['company', 'Company', {}], ['name', 'Contact person', {}],
  ['address', 'Billing address', { area: true, wide: true }],
  ['email', 'Email', { type: 'email' }], ['phone', 'Phone', { type: 'tel' }],
  ...(GST_FEATURE ? [['gstin', 'GSTIN', { wide: true }]] : []),
];
export function openClientDialog(c, opts = {}) {
  editing = c ? clone(c) : { id: '', name: '', company: '', address: '', email: '', phone: '', gstin: '', logo: '' };
  editing.applyAfter = !!opts.applyAfter;
  $('#clientDlgTitle').textContent = c ? 'Edit client' : 'New client';
  $('#cdFields').innerHTML = CLIENT_FIELDS.map(([k, label, o]) => `<label class="field${o.wide ? ' wide' : ''}"><span>${label}</span>${o.area
    ? `<textarea class="inp" data-cf="${k}" rows="3">${esc(editing[k])}</textarea>`
    : `<input class="inp" data-cf="${k}" type="${o.type || 'text'}" value="${esc(editing[k])}">`}</label>`).join('');
  $('#cdDelete').hidden = !c; $('#cdInvoice').hidden = !c;
  renderCdLogo();
  cdlg.showModal();
  setTimeout(() => $('[data-cf="company"]', cdlg).focus(), 30);
}
export function renderCdLogo() {
  $('#cdAv').outerHTML = avatarHTML(editing).replace('class="h-av', 'id="cdAv" class="h-av h-av--lg');
  $('#cdLogoRm').hidden = !(editing.logo && S.logos[editing.logo]);
}
export function readClientForm() { $$('[data-cf]', cdlg).forEach(el => { editing[el.dataset.cf] = el.value.trim(); }); }
cdlg.addEventListener('input', () => { readClientForm(); if (!(editing.logo && S.logos[editing.logo])) renderCdLogo(); });
cdlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) cdlg.close(); });
$('#cdLogo').addEventListener('click', () => $('#cdLogoFile').click());
$('#cdLogoRm').addEventListener('click', () => { editing.logo = ''; renderCdLogo(); });
$('#cdLogoFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, SVG, JPG or WebP image.'); return; }
  try { const id = storeLogo(await fitImage(f, 480, 160)); if (id) { editing.logo = id; renderCdLogo(); } } catch { toast('That image could not be read.'); }
});
$('#cdSave').addEventListener('click', () => {
  readClientForm();
  if (!editing.name && !editing.company) { toast('Add a company or a contact name.'); $('[data-cf="company"]', cdlg).focus(); return; }
  const { applyAfter, ...data } = editing;
  const i = S.clients.findIndex(c => c.id === data.id);
  if (i >= 0) S.clients[i] = { ...S.clients[i], ...data };
  else { data.id = 'C' + uid(); data.createdAt = Date.now(); S.clients.push(data); }
  if (!LS.set('clients', S.clients)) return;
  const saved = S.clients.find(c => c.id === data.id);
  cdlg.close();
  // A draft that's billing this client picks up the edit; issued invoices keep what they were sent with.
  if (applyAfter || (S.cur.clientId === saved.id && !S.cur.number)) applyClient(saved, !applyAfter);
  renderClients(); renderClientPanel();
  if (!applyAfter) toast(i >= 0 ? 'Client updated' : `${clientLabel(saved)} added to your clients`);
});
$('#cdDelete').addEventListener('click', () => {
  if (!confirm(`Delete ${clientLabel(editing)} from your clients?\n\nInvoices already made for them are not changed.`)) return;
  S.clients = S.clients.filter(c => c.id !== editing.id); LS.set('clients', S.clients);
  if (S.cur.clientId === editing.id) { S.cur.clientId = ''; markDirty(); }
  cdlg.close(); renderClients(); renderClientPanel(); toast('Client deleted');
});
$('#cdInvoice').addEventListener('click', () => {
  const c = S.clients.find(x => x.id === editing.id); if (!c) return;
  if (S.dirty && !confirm('Discard unsaved changes to the current invoice?')) return;
  cdlg.close();
  S.cur = newInvoice(); S.dirty = false; applyClient(c); renderAll();
  $('#app').classList.remove('hist-mobile');
});

/* ---------- applying a client to the invoice ---------- */
export function applyClient(c, quiet) {
  S.cur.clientId = c.id;
  S.cur.client = { ...S.cur.client, name: c.name || '', company: c.company || '', address: c.address || '', email: c.email || '', gstin: c.gstin || '', logo: c.logo || '' };
  markDirty(); renderPage(); renderHistory();
  if (!quiet) toast(`Invoice made out to ${clientLabel(c)}`);
}
export function saveCurrentAsClient() {
  const cc = S.cur.client;
  if (!cc.name && !cc.company) { toast('Add the client name on the invoice first.'); return; }
  const fields = { name: cc.name, company: cc.company, address: cc.address, email: cc.email || '', gstin: cc.gstin || '', logo: cc.logo || '' };
  const saved = S.clients.find(c => c.id === S.cur.clientId);
  if (saved) Object.assign(saved, fields);
  else { const c = { id: 'C' + uid(), phone: '', createdAt: Date.now(), ...fields }; S.clients.push(c); S.cur.clientId = c.id; markDirty(); }
  LS.set('clients', S.clients);
  renderClients(); renderClientPanel();
  toast(saved ? 'Saved client updated' : `${clientLabel(cc)} added to your clients`);
}
export function openPicker() {
  if (!S.clients.length) { openClientDialog(null, { applyAfter: true }); toast('No saved clients yet — add the first one'); return; }
  $('#pickSearch').value = ''; renderPicker(); pdlg.showModal();
  setTimeout(() => $('#pickSearch').focus(), 30);
}
export function renderPicker() {
  const q = $('#pickSearch').value.trim().toLowerCase();
  const list = [...S.clients].sort(byLabel).filter(c => matches(c, q));
  $('#pickList').innerHTML = list.length ? list.map(c => clientRow(c, 'data-pick')).join('') : '<div class="h-empty">No clients match. Use “+ New client” to add one.</div>';
}
$('#pickSearch').addEventListener('input', renderPicker);
$('#pickSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('[data-pick]', pdlg); if (first) { e.preventDefault(); first.click(); } } });
pdlg.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { pdlg.close(); return; }
  const it = e.target.closest('[data-pick]');
  if (it) { pdlg.close(); applyClient(S.clients.find(c => c.id === it.dataset.pick)); }
});
pdlg.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-pick]')) { e.preventDefault(); e.target.click(); } });
$('#pickNew').addEventListener('click', () => { pdlg.close(); openClientDialog(null, { applyAfter: true }); });
