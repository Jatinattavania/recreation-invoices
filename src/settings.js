import { GST_FEATURE, TEMPLATES, TERMS } from './config.js';
import { renderBackupStatus } from './backup.js';
import { dlg } from './dom.js';
import { thisYear } from './format.js';
import { openMe } from './me.js';
import { markDirty, persistWorking, renderAll } from './panels.js';
import { S, fmtSerial, gstOn, newInvoice, nextFree, peekSerial, used } from './state.js';
import { toast } from './ui.js';
import { $, $$, LS, clone, esc, parseNum, setPath } from './util.js';

export const opt = (v, l, sel) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${l}</option>`;
export const fld = (key, label, val, o = {}) => `<label class="field${o.wide ? ' wide' : ''}"><span>${label}</span>${o.area
  ? `<textarea class="inp" data-s="${key}" rows="${o.rows || 3}">${esc(val)}</textarea>`
  : `<input class="inp" data-s="${key}" type="${o.type || 'text'}" value="${esc(val)}"${o.attrs || ''}>`}</label>`;
export const chk = (key, label, val) => `<label class="check"><input type="checkbox" data-s="${key}"${val ? ' checked' : ''}> ${label}</label>`;

export function openSettings() {
  const s = S.settings;
  $('#settingsBody').innerHTML = `
  <div class="m-sec"><span class="kicker">Your details</span>
    <p class="hint">Your logo, business details and bank details are in <b>My details</b>.</p>
    <button class="btn btn--sm" type="button" data-open-me style="margin-top:10px">Open My details</button>
  </div>
  <div class="m-sec"${GST_FEATURE ? '' : ' hidden'}><span class="kicker">GST</span>
    ${chk('gstEnabled', 'Charge GST — shows the tax controls, CGST/SGST or IGST rows, and GSTIN lines on new invoices', s.gstEnabled)}
    <div class="m-grid" id="gstFields"${s.gstEnabled ? '' : ' hidden'}>
      ${fld('defaultTax', 'GST %', s.defaultTax, { type: 'number', attrs: ' min="0" step="0.01"' })}
      <label class="field"><span>Tax split</span><select class="inp" data-s="defaultTaxMode">${opt('split', 'CGST + SGST (intra-state)', s.defaultTaxMode)}${opt('igst', 'IGST (inter-state)', s.defaultTaxMode)}</select></label>
    </div>
  </div>
  <div class="m-sec"><span class="kicker">Numbering</span><div class="m-grid">
    ${fld('serial.prefix', 'Invoice prefix', s.serial.prefix)}
    ${fld('counter.next', 'Next invoice number', nextFree('invoice'), { type: 'number', attrs: ' min="1" step="1"' })}
    ${fld('serial.quotePrefix', 'Quote prefix', s.serial.quotePrefix)}
    ${fld('counterQ.next', 'Next quote number', nextFree('quote'), { type: 'number', attrs: ' min="1" step="1"' })}
  </div>
  ${chk('serial.yearly', 'Include the year and restart numbering each January (RCS-2026-0001)', s.serial.yearly)}
  <p class="hint" style="margin-top:4px">Next invoice will be <span class="preview-serial" id="serialPrev"></span>, next quote <span class="preview-serial" id="serialPrevQ"></span>. Numbers are only used up when you save or download, and are never reused.</p>
  <button class="btn btn--sm btn--danger" type="button" id="resetNumbering" style="margin-top:12px">Restart numbering from the beginning</button>
  </div>
  <div class="m-sec"><span class="kicker">Backups</span><div id="backupBox"></div></div>
  <div class="m-sec"><span class="kicker">Defaults for new invoices</span><div class="m-grid">
    <label class="field"><span>Payment terms</span><select class="inp" data-s="defaultTerms">${TERMS.map(d => opt(d, d ? d + ' days' : 'Due on receipt', s.defaultTerms)).join('')}</select></label>
    <label class="field"><span>Design</span><select class="inp" data-s="defaultTemplate">${Object.entries(TEMPLATES).map(([k, v]) => opt(k, v.name, s.defaultTemplate)).join('')}</select></label>
    ${fld('defaultNotes', 'Notes', s.defaultNotes, { area: true, wide: true })}
    ${fld('defaultTermsText', 'Terms & conditions', s.defaultTermsText, { area: true, wide: true })}
    ${fld('thanks', 'Closing line (after “Thank you”)', s.thanks, { wide: true })}
  </div></div>
  <div class="m-sec"><span class="kicker">Defaults for new quotes</span><div class="m-grid">
    <label class="field"><span>Valid for</span><select class="inp" data-s="quoteValidDays">${[7, 15, 30, 45, 60, 90].map(d => opt(d, d + ' days', s.quoteValidDays)).join('')}</select></label>
    <span></span>
    ${fld('defaultQuoteNotes', 'Notes', s.defaultQuoteNotes, { area: true, wide: true })}
    ${fld('defaultQuoteTerms', 'Terms', s.defaultQuoteTerms, { area: true, wide: true })}
    ${fld('defaultAcceptText', 'How to accept', s.defaultAcceptText, { area: true, wide: true, rows: 2 })}
  </div></div>`;
  updateSerialPreview(); renderBackupStatus();
  dlg.showModal();
}
export function readSettingsForm() {
  const v = {};
  $$('[data-s]', dlg).forEach(el => { v[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value; });
  return v;
}
export function updateSerialPreview() {
  const v = readSettingsForm(), yr = v['serial.yearly'] ? thisYear() + '-' : '';
  const num = k => String(Math.max(1, parseInt(v[k], 10) || 1)).padStart(4, '0');
  $('#serialPrev').textContent = (v['serial.prefix'] || '') + yr + num('counter.next');
  $('#serialPrevQ').textContent = (v['serial.quotePrefix'] || '') + yr + num('counterQ.next');
}
dlg.addEventListener('input', e => { if (e.target.matches('[data-s^="serial"],[data-s$=".next"]')) updateSerialPreview(); });
dlg.addEventListener('change', async e => {
  if (e.target.matches('[data-s="serial.yearly"]')) updateSerialPreview();
  if (e.target.matches('[data-s="gstEnabled"]')) $('#gstFields').hidden = !e.target.checked;
});
dlg.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) dlg.close();
  if (e.target.closest('[data-open-me]')) { dlg.close(); openMe(); }
  if (e.target.id === 'resetNumbering') resetNumbering();
});

// Numbers are never reused, so starting again from 0001 means clearing the saved
// invoices that hold them. Clients, your details and your QR are kept.
export function resetNumbering() {
  const n = S.invoices.length, first = fmtSerial(1);
  const list = [...S.invoices].sort((a, b) => (a.number || '').localeCompare(b.number || '')).map(i => i.number);
  const msg = n
    ? `Restart numbering at ${first} (and quotes at ${fmtSerial(1, 'quote')})?

Your ${n} saved invoice${n > 1 ? 's and quotes' : ''} (${list.slice(0, 5).join(', ')}${n > 5 ? ', …' : ''}) will be deleted so the numbers can be used again.

Your clients, services, your details and your QR code are kept. Download a backup first if you might need them.`
    : `Restart numbering at ${first}?`;
  if (!confirm(msg)) return;
  S.invoices = []; used.clear(); S.counter = { next: 1, year: thisYear() }; S.counterQ = { next: 1, year: thisYear() };
  LS.set('invoices', S.invoices); LS.set('used', []); LS.set('counter', S.counter); LS.set('counterQ', S.counterQ);
  S.cur = newInvoice(); S.dirty = false; persistWorking();
  dlg.close(); renderAll();
  toast(`Numbering restarted — your next invoice is ${peekSerial('invoice')}`);
}

$('#bSaveSettings').addEventListener('click', () => {
  const v = readSettingsForm(), next = clone(S.settings);
  for (const [k, val] of Object.entries(v)) {
    if (k.endsWith('.next')) continue;
    setPath(next, k, ['defaultTax', 'defaultTerms', 'quoteValidDays'].includes(k) ? parseNum(val) : val);
  }
  const prevPrefix = S.settings.serial.prefix, prevQ = S.settings.serial.quotePrefix, prevYearly = S.settings.serial.yearly, gstWas = gstOn();
  S.settings = next;
  if (!LS.set('settings', S.settings)) return;
  const n = Math.max(1, parseInt(v['counter.next'], 10) || 1);
  const formatChanged = prevPrefix !== S.settings.serial.prefix || prevYearly !== S.settings.serial.yearly;
  if (n !== S.counter.next || formatChanged) { S.counter = { next: n, year: thisYear() }; LS.set('counter', S.counter); }
  const nq = Math.max(1, parseInt(v['counterQ.next'], 10) || 1);
  if (nq !== S.counterQ.next || prevQ !== S.settings.serial.quotePrefix || prevYearly !== S.settings.serial.yearly) { S.counterQ = { next: nq, year: thisYear() }; LS.set('counterQ', S.counterQ); }
  // Switching GST on or off applies to the invoice being drafted, not to saved ones.
  if (gstWas !== gstOn() && !S.cur.number) { S.cur.taxMode = gstOn() ? S.settings.defaultTaxMode : 'none'; S.cur.taxRate = +S.settings.defaultTax || 18; markDirty(); }
  S.qrCache = { key: '', url: '' };
  dlg.close(); renderAll();
  const skipped = nextFree('invoice') !== n;
  toast(skipped ? `Settings saved — ${fmtSerial(n)} is already used, next is ${peekSerial('invoice')}` : 'Settings saved');
});
