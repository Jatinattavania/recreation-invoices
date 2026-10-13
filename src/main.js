// Entry point: fonts and styles, every feature module, then start-up.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/app.css';
import './styles/invoice.css';
import './actions.js';
import './backup.js';
import './clients.js';
import './me.js';
import './page.js';
import './panels.js';
import './payments.js';
import './pdf.js';
import './services.js';
import './settings.js';
import './share.js';
import './sync.js';
import { BRAND } from './brand.js';
import { convertQuote, duplicate, newDocument, save } from './actions.js';
import { setSideTab } from './clients.js';
import { pageFrame, stage } from './dom.js';
import { missingDetails, openMe, realVal } from './me.js';
import { checkOverflow, fitStage } from './page.js';
import { applyHistoryState, renderAll } from './panels.js';
import { downloadPDF, printInvoice } from './pdf.js';
import { decodeQR, upiParam } from './qr.js';
import { openSettings } from './settings.js';
import { S, gstOn, migrate, newInvoice, newItem, ui } from './state.js';
import { setupMenu, toast } from './ui.js';
import { $, LS, clone } from './util.js';

setupMenu($('#tNew'), $('#newMenu'), item => newDocument(item.dataset.new));
$('#convertQuote').addEventListener('click', convertQuote);
$('#tSave').addEventListener('click', () => save());
$('#tDup').addEventListener('click', duplicate);
$('#tPdf').addEventListener('click', downloadPDF);
$('#tPrint').addEventListener('click', printInvoice);
$('#tSettings').addEventListener('click', openSettings);
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
});

/* =====================================================================
   BOOT
   ===================================================================== */
export const working = LS.get('working', null);
if (working?.inv) { S.cur = migrate(working.inv); S.dirty = !!working.dirty; dropSample(S.cur); }
else if (S.invoices.length) { S.cur = migrate(clone([...S.invoices].sort((a, b) => b.createdAt - a.createdAt)[0])); }
else { S.cur = newInvoice(); }
// Earlier versions opened with a filled-in example. Clear its project and untouched
// example lines from an unsaved draft, keeping anything you changed or added.
function dropSample(inv) {
  if (inv.number) return;
  const EXAMPLE = { 'Discovery & UX research': 45000, 'UI design — marketing website': 6500, 'Webflow development': 60000 };
  const items = inv.items.filter(it => EXAMPLE[it.desc] !== +it.rate);
  if (inv.client?.company === 'Northwind Foods Pvt. Ltd.' && inv.client.name === 'Aarav Mehta' && inv.client.address?.startsWith('4th Floor, Prestige Meridian') && !inv.clientId) inv.client = { ...inv.client, name: '', company: '', address: '' };
  if (inv.project?.title === 'Website redesign' && inv.project.desc?.startsWith('Brand-led redesign')) inv.project = { title: '', desc: '' };
  if (items.length !== inv.items.length) inv.items = items.length ? items : [newItem()];
}
// GST is off: an unsaved draft drops its tax. Saved invoices keep what they were issued with.
if (!gstOn() && !S.cur.number) S.cur.taxMode = 'none';

if (BRAND.mark) { $('#brandMark').src = BRAND.mark; $('#favicon').href = BRAND.mark; } else $('#brandMark').remove();
applyHistoryState();
setSideTab(ui.sideTab);
renderAll();
new ResizeObserver(fitStage).observe(stage);
new ResizeObserver(fitStage).observe(pageFrame);
document.fonts?.ready.then(checkOverflow);
if (S.settings.payQR && !S.settings.payQRData) decodeQR(S.settings.payQR).then(text => {
  if (!text) return;
  S.settings.payQRData = text; S.settings.payQR = '';
  if (!realVal(S.settings.bank.upi).trim() && upiParam(text, 'pa')) S.settings.bank.upi = upiParam(text, 'pa');
  LS.set('settings', S.settings); S.qrCache = { key: '', url: '' }; renderAll();
  toast('Your payment QR has been redrawn as a clean code');
});
if (missingDetails().length && !ui.meNudged) { ui.meNudged = true; LS.set('ui', ui); setTimeout(openMe, 400); }
