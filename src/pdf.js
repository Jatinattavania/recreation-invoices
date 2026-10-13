import { save } from './actions.js';
import { PAGE_H, PAGE_W } from './config.js';
import { pageFrame } from './dom.js';
import { checkOverflow } from './page.js';
import { S } from './state.js';
import { toast } from './ui.js';
import { $, $$ } from './util.js';

/* ---------- export ---------- */
export function fileBase() {
  const who = (S.cur.client.name || S.cur.client.company || 'Client').normalize('NFKD').replace(/[^\w\s-]/g, '')
    .split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('') || 'Client';
  return `${S.cur.number}_${who}`;
}
export function markEmpties(root) {
  $$('.ed', root).forEach(e => e.toggleAttribute('data-empty', !e.textContent.trim()));
  $$('[data-opt]', root).forEach(n => { const eds = $$('.ed', n); n.toggleAttribute('data-empty', eds.length > 0 && eds.every(x => !x.textContent.trim())); });
}
export function prepareExportClone(src) {
  const c = src.cloneNode(true);
  c.classList.add('exporting');
  markEmpties(c);
  $$('.np, [data-empty], .is-zero, input', c).forEach(n => n.remove());
  $$('[contenteditable]', c).forEach(n => n.removeAttribute('contenteditable'));
  $$('[tabindex]', c).forEach(n => n.removeAttribute('tabindex'));
  return c;
}
export const waitImages = root => Promise.all($$('img', root).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));

export async function downloadPDF() {
  const out = await buildPdf();
  if (!out) return;
  out.pdf.save(out.name);
  toast(`Downloaded ${out.name}`);
}

/** Save the document, then render it to a PDF. Returns { pdf, name } or null (with a message shown). */
export async function buildPdf() {
  if (!save(true)) return null;
  const name = fileBase() + '.pdf';
  let html2canvas, jsPDF;
  try { [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]); }
  catch { toast('Could not load the PDF tools — opening the print dialog instead'); window.print(); return null; }
  const busy = $('#busy'); busy.classList.add('show');
  const host = document.createElement('div'); host.className = 'export-host';
  try {
    await document.fonts.ready;
    checkOverflow();
    const src = pageFrame.firstElementChild, c = prepareExportClone(src);
    host.appendChild(c); document.body.appendChild(host);
    await waitImages(c);
    // 2× resolution with JPEG at 0.82 keeps text sharp and the QR scannable at about a third of the 3× file size.
    const H = Math.max(PAGE_H, Math.ceil(c.scrollHeight)), scale = 2;
    const bg = getComputedStyle(c).backgroundColor;
    const canvas = await html2canvas(c, { scale, backgroundColor: bg, useCORS: true, logging: false, width: PAGE_W, height: H, windowWidth: 1440, scrollX: 0, scrollY: 0 });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    pdf.setProperties({ title: `${S.cur.number} — ${S.settings.studioName}`, subject: S.cur.kind === 'quote' ? 'Quotation' : 'Invoice', author: S.settings.studioName, creator: S.settings.studioName });
    const sliceH = Math.round(PAGE_H * scale), pages = Math.max(1, Math.ceil((canvas.height - scale * 2) / sliceH));
    for (let p = 0; p < pages; p++) {
      if (p) pdf.addPage();
      const s = document.createElement('canvas'); s.width = canvas.width; s.height = sliceH;
      const g = s.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, s.width, s.height);
      const h = Math.min(sliceH, canvas.height - p * sliceH);
      g.drawImage(canvas, 0, p * sliceH, canvas.width, h, 0, 0, canvas.width, h);
      pdf.addImage(s.toDataURL('image/jpeg', 0.82), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    return { pdf, name };
  } catch (err) {
    console.error(err);
    toast('PDF export failed — use Print → Save as PDF instead');
    return null;
  } finally { host.remove(); busy.classList.remove('show'); }
}

export let prevTitle = document.title;
addEventListener('beforeprint', () => {
  const a = document.activeElement; if (a && pageFrame.contains(a)) a.blur();
  const inv = pageFrame.firstElementChild; inv?.classList.add('exporting'); if (inv) markEmpties(inv);
  prevTitle = document.title; if (S.cur.number) document.title = fileBase();
});
addEventListener('afterprint', () => { pageFrame.firstElementChild?.classList.remove('exporting'); document.title = prevTitle; });
export function printInvoice() { if (save(true)) window.print(); }
