import { save } from './actions.js';
import { fmtDate, money } from './format.js';
import { realVal } from './me.js';
import { buildPdf, downloadPDF } from './pdf.js';
import { upiParam } from './qr.js';
import { S, compute, isQuote } from './state.js';
import { setupMenu, toast } from './ui.js';
import { $ } from './util.js';

/* =====================================================================
   SHARE — WhatsApp, email, the system share sheet, or just the payment details
   ===================================================================== */

/** Your payment details as plain lines (only the ones you've filled in). */
export function paymentLines() {
  const s = S.settings, b = s.bank;
  const upi = realVal(b.upi).trim() || upiParam(s.payQRData, 'pa');
  const lines = [
    upi && `UPI: ${upi}`,
    realVal(b.holder).trim() && `Account name: ${realVal(b.holder).trim()}`,
    realVal(b.name).trim() && `Bank: ${[realVal(b.name), realVal(b.branch)].map(x => x.trim()).filter(Boolean).join(', ')}`,
    realVal(b.account).trim() && `A/C: ${realVal(b.account).trim()}`,
    realVal(b.ifsc).trim() && `IFSC: ${realVal(b.ifsc).trim()}`,
  ].filter(Boolean);
  return lines.length ? ['Payment details:', ...lines] : [];
}

/** The message that goes with the PDF. */
export function shareMessage(inv = S.cur) {
  const t = compute(inv), s = S.settings, first = (inv.client.name || '').trim().split(/\s+/)[0];
  const what = inv.project?.title ? ` (${inv.project.title})` : '';
  const lines = [`Hi ${first || 'there'},`, ''];
  if (isQuote(inv)) lines.push(`Here is quotation ${inv.number} from ${s.studioName} for ${money(t.total)}${what}, valid until ${fmtDate(inv.dueDate, 'mid')}.`);
  else lines.push(`Here is invoice ${inv.number} from ${s.studioName} for ${money(t.due)}${what}, due ${fmtDate(inv.dueDate, 'mid')}.`);
  const pay = isQuote(inv) ? [] : paymentLines();
  if (pay.length) lines.push('', ...pay);
  lines.push('', 'The PDF is attached.', '', 'Thank you,', s.studioName);
  return lines.join('\n');
}

/** The saved client's mobile number in WhatsApp's format (country code, digits only), if we have one. */
export function clientWhatsApp() {
  const c = S.clients.find(x => x.id === S.cur.clientId);
  let d = String(c?.phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d.length >= 11 ? d : '';
}

async function viaWhatsApp() {
  if (!save(true)) return;
  // Open the chat first, while the click still counts as yours (pop-up blockers), then make the PDF.
  window.open(`https://wa.me/${clientWhatsApp()}?text=${encodeURIComponent(shareMessage())}`, '_blank', 'noopener');
  await downloadPDF();
  toast('WhatsApp opened and the PDF downloaded — attach it to the message');
}
async function viaEmail() {
  if (!save(true)) return;
  const subject = `${isQuote(S.cur) ? 'Quotation' : 'Invoice'} ${S.cur.number} from ${S.settings.studioName}`;
  const a = document.createElement('a');
  a.href = `mailto:${encodeURIComponent(S.cur.client.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareMessage())}`;
  a.click();
  await downloadPDF();
  toast('Email opened and the PDF downloaded — attach it to the email');
}
async function viaShareSheet() {
  const out = await buildPdf(); if (!out) return;
  const file = new File([out.pdf.output('blob')], out.name, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: out.name, text: shareMessage() }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  out.pdf.save(out.name);
  toast("Sharing isn't available in this browser — the PDF was downloaded instead");
}
async function copyDetails() {
  if (isQuote(S.cur)) { toast('Quotes have no payment details to copy.'); return; }
  const t = compute(S.cur), lines = paymentLines();
  if (!lines.length) { toast('Add your bank or UPI details in My details first.'); return; }
  const text = [`Amount: ${money(t.due)}${S.cur.number ? ` (${S.cur.number})` : ''}`, ...lines.slice(1)].join('\n');
  try { await navigator.clipboard.writeText(text); toast('Payment details copied'); }
  catch { toast('Could not copy — your browser blocked the clipboard.'); }
}

const ACTIONS = { whatsapp: viaWhatsApp, email: viaEmail, sheet: viaShareSheet, copy: copyDetails };
setupMenu($('#tShare'), $('#shareMenu'), item => ACTIONS[item.dataset.share]?.());
// The system share sheet only exists in some browsers (Edge/Chrome on Windows, phones).
if (!navigator.canShare) $('[data-share="sheet"]').hidden = true;
