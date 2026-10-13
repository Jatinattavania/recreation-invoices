import { openPicker, renderClients, saveCurrentAsClient } from './clients.js';
import { PAGE_H, PAGE_W, TERMS } from './config.js';
import { holder, insp, pageFrame, picker, stage } from './dom.js';
import { addDays, amountInWords, daysBetween, fmtPct, fmtQty, money, moneyHTML, num2, parseISO, todayISO } from './format.js';
import { clientLogoSrc, fitImage, logoForClient, storeLogo } from './images.js';
import { openMe } from './me.js';
import { markDirty, renderClientPanel, renderMiniTotals, syncInspector } from './panels.js';
import { prepareExportClone } from './pdf.js';
import { openServicePicker, saveLineAsService } from './services.js';
import { qrData } from './qr.js';
import { TPL, amountLabel, termsLabel } from './render.js';
import { S, compute, newItem } from './state.js';
import { toast } from './ui.js';
import { $, $$, LS, parseNum, setPath } from './util.js';

export function renderPage() {
  const a = document.activeElement;
  if (a && pageFrame.contains(a)) a.blur();
  if (!TPL[S.cur.template]) S.cur.template = 'bold';
  const t = compute(S.cur);
  pageFrame.innerHTML = TPL[S.cur.template](S.cur, t);
  updateComputed(t);
  checkOverflow();
  renderClientPanel();
}

export function updateComputed(t = compute(S.cur)) {
  const setC = (k, v) => $$(`[data-c="${k}"]`, pageFrame).forEach(e => { e.textContent = v; });
  for (const id in t.lines) { const el = $(`[data-c="amt"][data-id="${id}"]`, pageFrame); if (el) el.textContent = money(t.lines[id]); }
  setC('subtotal', money(t.subtotal)); setC('discount', '− ' + money(t.discount));
  setC('cgst', money(t.cgst)); setC('sgst', money(t.sgst)); setC('igst', money(t.igst));
  setC('total', money(t.total)); setC('words', amountInWords(t.total)); setC('sgstPct', fmtPct(S.cur.taxRate / 2));
  setC('terms', termsLabel());
  setC('paid', '− ' + money(t.paid)); setC('balance', money(t.balance)); setC('dueLabel', amountLabel(S.cur, t));
  $$('[data-ch="due"]', pageFrame).forEach(e => { e.innerHTML = moneyHTML(t.due); });
  $$('.t-row.disc', pageFrame).forEach(r => r.classList.toggle('is-zero', t.discount === 0));
  scheduleQR(t.due);
  scheduleOverflow();
  renderMiniTotals(t);
  syncInspector();
  renderClientPanel();
}

export let qrTimer;
export function scheduleQR(total) {
  clearTimeout(qrTimer);
  qrTimer = setTimeout(() => { const img = $('[data-c="qr"]', pageFrame); if (img) { const u = qrData(total); if (u && img.src !== u) img.src = u; } }, 200);
}

// Measure the page exactly as it will export (no editing controls, empty fields
// removed). If it overflows A4 at full spacing, find the smallest --z (spacing
// compression, 0–1) that fits; past 1 it runs onto a second page.
export const measureHost = document.createElement('div');
 measureHost.className = 'export-host';
 measureHost.setAttribute('aria-hidden', 'true');
export function fitPage(inv) {
  const c = prepareExportClone(inv); c.style.minHeight = '0';
  measureHost.replaceChildren(c); document.body.appendChild(measureHost);
  const height = z => { c.style.setProperty('--z', z); return c.offsetHeight; };
  let z = 0, over = false;
  if (height(0) > PAGE_H) {
    if (height(1) > PAGE_H) { z = 1; over = true; }
    else {
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (height(m) > PAGE_H) lo = m; else hi = m; }
      z = Math.round(hi * 1000) / 1000;
    }
  }
  measureHost.replaceChildren(); measureHost.remove();
  inv.style.setProperty('--z', z);
  return { z, over };
}
export let fitTimer;
export function scheduleOverflow() { clearTimeout(fitTimer); fitTimer = setTimeout(checkOverflow, 120); }
export function checkOverflow() {
  const inv = pageFrame.firstElementChild; if (!inv) return;
  $('.page-break', inv)?.remove();
  const { z, over } = fitPage(inv);
  if (over) inv.insertAdjacentHTML('beforeend', '<div class="page-break np"><span>Page 2</span></div>');
  $('#overflowWarn').innerHTML = over
    ? '<div class="warn">This invoice runs past one A4 page even at the tightest spacing. The PDF will continue on a second page — consider shortening descriptions or notes.</div>'
    : z > 0 ? '<p class="hint" style="margin-top:10px">Spacing tightened slightly to keep this on one A4 page.</p>' : '';
  fitStage();
}

export function fitStage() {
  const inv = pageFrame.firstElementChild; if (!inv) return;
  const cs = getComputedStyle(stage);
  const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const s = Math.min(1, Math.max(.2, avail / PAGE_W));
  pageFrame.style.transform = s < 1 ? `scale(${s})` : '';
  holder.style.width = PAGE_W * s + 'px';
  holder.style.height = inv.offsetHeight * s + 'px';
}

/* =====================================================================
   INLINE EDITING
   ===================================================================== */
export const readEd = el => el.hasAttribute('data-multi') ? el.innerText.replace(/ /g, ' ') : el.textContent.replace(/ /g, ' ').replace(/\n/g, ' ');
export const itemOf = el => S.cur.items.find(i => i.id === el.dataset.item);

export function setField(path, val) {
  if (path === 'taxHalf') S.cur.taxRate = parseNum(val) * 2;
  else if (path === 'taxRate') S.cur.taxRate = parseNum(val);
  else if (path === 'discount.value') S.cur.discount.value = parseNum(val);
  else setPath(S.cur, path, val);
}
export function rawNum(el) {
  if (el.dataset.item) return itemOf(el)?.[el.dataset.k] ?? 0;
  const f = el.dataset.f;
  return f === 'taxHalf' ? S.cur.taxRate / 2 : f === 'taxRate' ? S.cur.taxRate : f === 'discount.value' ? S.cur.discount.value : 0;
}
export function fmtNum(el, v) {
  switch (el.dataset.fmt) {
    case 'qty': return fmtQty(v);
    case 'rate': return v ? num2(v) : '';
    case 'money': return num2(v);
    default: return fmtPct(v);
  }
}
export function selectAll(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
export function caretEnd(el) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

pageFrame.addEventListener('input', e => {
  const el = e.target.closest('.ed'); if (!el) return;
  if (el.textContent === '' && el.innerHTML !== '') el.innerHTML = '';
  const val = readEd(el);
  if (el.dataset.item) { const it = itemOf(el); if (!it) return; it[el.dataset.k] = el.hasAttribute('data-num') ? parseNum(val) : val; }
  else setField(el.dataset.f, val);
  markDirty(); updateComputed();
});

// Numeric cells show their raw value while focused and select it, so typing replaces it.
// A mouse click places the caret after focus, so the selection is re-applied on that mouseup.
export let selectOnMouseUp = null;
pageFrame.addEventListener('focusin', e => {
  const el = e.target.closest('.ed[data-num]'); if (!el) return;
  const v = rawNum(el);
  el.textContent = v ? String(v) : '';
  selectAll(el);
  selectOnMouseUp = el;
});
pageFrame.addEventListener('mouseup', () => {
  if (selectOnMouseUp && document.activeElement === selectOnMouseUp) selectAll(selectOnMouseUp);
  selectOnMouseUp = null;
});
pageFrame.addEventListener('keydown', () => { selectOnMouseUp = null; }, true);

pageFrame.addEventListener('focusout', e => {
  const el = e.target.closest('.ed'); if (!el) return;
  if (el.hasAttribute('data-num')) { el.textContent = fmtNum(el, rawNum(el)); }
  else {
    const v = readEd(el), trimmed = el.hasAttribute('data-multi') ? v.replace(/\s+$/, '').replace(/^\n+/, '') : v.trim();
    if (trimmed !== v || (trimmed === '' && el.innerHTML !== '')) {
      el.textContent = trimmed;
      if (el.dataset.item) { const it = itemOf(el); if (it) it[el.dataset.k] = trimmed; } else setField(el.dataset.f, trimmed);
    }
  }
  if (el.textContent === '') el.innerHTML = '';
  // Typing a client billed before brings their logo along.
  if ((el.dataset.f === 'client.name' || el.dataset.f === 'client.company') && !clientLogoSrc(S.cur)) {
    const id = logoForClient(S.cur.client.name) || logoForClient(S.cur.client.company);
    if (id) { S.cur.client.logo = id; markDirty(); setTimeout(renderPage, 0); toast('Client logo added from a previous invoice'); return; }
  }
  updateComputed();
});

pageFrame.addEventListener('keydown', e => {
  const dateEl = e.target.closest('.ed-date');
  if (dateEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDatePicker(dateEl); return; }
  const el = e.target.closest('.ed'); if (!el) return;
  if (el.dataset.item && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); moveRow(el.dataset.item, e.key === 'ArrowUp' ? -1 : 1, el.dataset.k); return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    if (el.dataset.item) { e.preventDefault(); enterInRow(el); return; }
    if (!el.hasAttribute('data-multi')) { e.preventDefault(); el.blur(); return; }
  }
  if (e.key === 'Escape') { el.blur(); return; }
  if (el.hasAttribute('data-num') && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/[0-9.,\-]/.test(e.key)) e.preventDefault();
});

pageFrame.addEventListener('paste', e => {
  const el = e.target.closest('.ed'); if (!el) return;
  e.preventDefault();
  let txt = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
  if (!el.hasAttribute('data-multi')) txt = txt.replace(/\s*\n\s*/g, ' ');
  document.execCommand('insertText', false, txt);
});

pageFrame.addEventListener('click', e => {
  if (e.target.closest('[data-del]')) { deleteRow(e.target.closest('.it-row').dataset.row); return; }
  if (e.target.closest('[data-add]')) { addRow(S.cur.items.length - 1); return; }
  if (e.target.closest('[data-add-svc]')) { openServicePicker(); return; }
  if (e.target.closest('[data-save-svc]')) { saveLineAsService(e.target.closest('.it-row').dataset.row); return; }
  if (e.target.closest('[data-cl-remove]')) { removeClientLogo(); return; }
  if (e.target.closest('[data-pick-client]')) { openPicker(); return; }
  if (e.target.closest('[data-cl-add]')) { $('#clientLogoFile').click(); return; }
  const d = e.target.closest('.ed-date'); if (d) { openDatePicker(d); return; }
  if (e.target.closest('[data-settings]')) { openMe(); return; }
  const cf = e.target.closest('.cf');
  if (cf && !e.target.closest('.ed')) { const ed = $('.ed', cf); ed?.focus(); }
});

/* ---------- client logo ---------- */
$('#clientLogoFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, SVG, JPG or WebP image.'); return; }
  try {
    const id = storeLogo(await fitImage(f, 480, 160));
    if (!id) return;
    S.cur.client.logo = id; markDirty();
    const saved = S.clients.find(c => c.id === S.cur.clientId);
    if (saved) { saved.logo = id; LS.set('clients', S.clients); renderClients(); }
    renderPage();
    toast('Client logo added');
  } catch { toast('That image could not be read.'); }
});
export function removeClientLogo() { S.cur.client.logo = ''; markDirty(); renderPage(); }
insp.addEventListener('click', e => {
  if (e.target.closest('[data-cl-remove]')) removeClientLogo();
  else if (e.target.closest('[data-cl-add]')) $('#clientLogoFile').click();
  else if (e.target.closest('[data-pick-client]')) openPicker();
  else if (e.target.id === 'clSave') saveCurrentAsClient();
});

/* ---------- line items ---------- */
export function focusItem(id, k, end) {
  const el = $(`[data-item="${id}"][data-k="${k}"]`, pageFrame);
  if (el) { el.focus(); if (end && !el.hasAttribute('data-num')) caretEnd(el); }
}
export function addRow(afterIdx) {
  const it = newItem(); S.cur.items.splice(afterIdx + 1, 0, it);
  markDirty(); renderPage(); focusItem(it.id, 'desc');
}
export function deleteRow(id) {
  const i = S.cur.items.findIndex(x => x.id === id); if (i < 0) return;
  if (S.cur.items.length === 1) S.cur.items[0] = newItem(); else S.cur.items.splice(i, 1);
  markDirty(); renderPage();
}
export function enterInRow(el) {
  const i = S.cur.items.findIndex(x => x.id === el.dataset.item);
  if (i === S.cur.items.length - 1) addRow(i);
  else focusItem(S.cur.items[i + 1].id, el.dataset.k, true);
}
export function moveRow(id, dir, k) {
  const i = S.cur.items.findIndex(x => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= S.cur.items.length) return;
  [S.cur.items[i], S.cur.items[j]] = [S.cur.items[j], S.cur.items[i]];
  markDirty(); renderPage(); focusItem(id, k, true);
}

// Pointer-based drag (works with the scaled page and on touch screens).
pageFrame.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]'); if (!h || e.button > 0) return;
  e.preventDefault();
  const row = h.closest('.it-row'), wrap = row.parentElement;
  const rows = $$('.it-row', wrap), from = rows.indexOf(row);
  let to = from;
  const ind = document.createElement('div'); ind.className = 'drop-ind np'; ind.style.display = 'none'; wrap.appendChild(ind);
  row.classList.add('dragging');
  h.setPointerCapture(e.pointerId);
  const move = ev => {
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { idx = i; break; } }
    to = idx;
    const last = rows[rows.length - 1];
    ind.style.display = '';
    ind.style.top = (rows[idx] ? rows[idx].offsetTop : last.offsetTop + last.offsetHeight) + 'px';
  };
  const up = () => {
    h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    row.classList.remove('dragging'); ind.remove();
    const target = to > from ? to - 1 : to;
    if (target !== from) { const [it] = S.cur.items.splice(from, 1); S.cur.items.splice(target, 0, it); markDirty(); renderPage(); }
  };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
});
/* ---------- dates ---------- */
let pickerKey = null;
export function openDatePicker(el) {
  pickerKey = el.dataset.date;
  const r = el.getBoundingClientRect();
  picker.style.left = r.left + 'px'; picker.style.top = r.bottom + 'px';
  picker.value = S.cur[pickerKey] || todayISO();
  try { picker.showPicker(); }
  catch { const f = $(`[data-bind="${pickerKey}"]`, insp); f?.focus(); f?.scrollIntoView({ block: 'center' }); }
}
picker.addEventListener('change', () => { if (pickerKey && picker.value) setDate(pickerKey, picker.value); });

export function setDate(key, val) {
  if (!parseISO(val)) return;
  if (key === 'issueDate') {
    S.cur.issueDate = val;
    if (!S.cur.dueManual) S.cur.dueDate = addDays(val, S.cur.terms);
  } else {
    S.cur.dueDate = val;
    const diff = daysBetween(S.cur.issueDate, val);
    if (TERMS.includes(diff)) { S.cur.terms = diff; S.cur.dueManual = false; } else S.cur.dueManual = true;
  }
  markDirty(); renderPage();
}
