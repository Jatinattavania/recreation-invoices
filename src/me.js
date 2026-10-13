import { BRAND } from './brand.js';
import { GST_FEATURE } from './config.js';
import { insp, mdlg } from './dom.js';
import { fitImage } from './images.js';
import { renderAll } from './panels.js';
import { decodeQR, isUpiLink, qrData, qrImage, upiParam, validUPI } from './qr.js';
import { S, compute } from './state.js';
import { toast } from './ui.js';
import { $, $$, LS, clone, esc, getPath, setPath } from './util.js';

export let meLogo = '', meQr = '', meQrData = '';
// First-run values are bracketed placeholders like "[YOUR ADDRESS]".
export const isPlaceholder = v => /^\[.*\]$/.test(String(v ?? '').trim());
export const realVal = v => isPlaceholder(v) ? '' : String(v ?? '');
export const ME_FIELDS = {
  business: [
    ['studioName', 'Business name', { wide: true, ph: 'ReCreation Studio' }],
    ['address', 'Address', { area: true, wide: true, ph: 'Street, area\nCity, State PIN' }],
    ['email', 'Email', { type: 'email', ph: 'hello@yourstudio.com' }],
    ['phone', 'Phone', { type: 'tel', ph: '+91 98765 43210' }],
    ['website', 'Website (optional)', { ph: 'yourstudio.com' }],
    ['pan', 'PAN (optional)', { ph: 'ABCDE1234F' }],
    ...(GST_FEATURE ? [['gstin', 'GSTIN', { ph: '29ABCDE1234F1Z5' }]] : []),
  ],
  bank: [
    ['bank.holder', 'Account holder name', { ph: 'As on your bank account' }],
    ['bank.name', 'Bank', { ph: 'HDFC Bank' }],
    ['bank.account', 'Account number', { ph: '50200012345678' }],
    ['bank.ifsc', 'IFSC', { ph: 'HDFC0001234' }],
    ['bank.branch', 'Branch (optional)', { ph: 'Indiranagar' }],
    ['bank.upi', 'UPI ID', { ph: 'name@okhdfcbank' }],
  ],
};
export const REQUIRED = [['address', 'address'], ['email', 'email'], ['phone', 'phone'], ['bank.holder', 'account holder'], ['bank.name', 'bank'], ['bank.account', 'account number'], ['bank.ifsc', 'IFSC'], ['bank.upi', 'UPI ID']];
// With your own QR uploaded, a UPI ID is optional.
export const missingDetails = () => REQUIRED.filter(([k]) => !(k === 'bank.upi' && (S.settings.payQR || S.settings.payQRData)) && !realVal(getPath(S.settings, k)).trim()).map(([, l]) => l);

export const meField = ([k, label, o]) => `<label class="field${o.wide ? ' wide' : ''}"><span>${label}</span>${o.area
  ? `<textarea class="inp" data-m="${k}" rows="3" placeholder="${esc(o.ph || '')}">${esc(realVal(getPath(S.settings, k)))}</textarea>`
  : `<input class="inp" data-m="${k}" type="${o.type || 'text'}" placeholder="${esc(o.ph || '')}" value="${esc(realVal(getPath(S.settings, k)))}">`}</label>`;
export function openMe() {
  meLogo = S.settings.logo; meQr = S.settings.payQR || ''; meQrData = S.settings.payQRData || '';
  $('#meBody').innerHTML = `
  <div class="m-sec"><span class="kicker">Logo</span>
    <div class="logo-box">
      <div class="logo-prev" id="meLogoPrev"></div>
      <button class="btn btn--sm" type="button" id="meLogoPick">Upload a different logo</button>
      <button class="btn btn--ghost btn--sm" type="button" id="meLogoReset">Use the ReCreation logo</button>
      <input type="file" id="meLogoFile" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden>
    </div>
    <p class="hint" style="margin-top:10px">The built-in ReCreation Studio logo switches between dark and light versions to suit each design. An uploaded logo is used as-is, so a transparent PNG works best.</p>
  </div>
  <div class="m-sec"><span class="kicker">Business</span><div class="m-grid">${ME_FIELDS.business.map(meField).join('')}</div></div>
  <div class="m-sec"><span class="kicker">Bank details</span><div class="m-grid">${ME_FIELDS.bank.map(meField).join('')}</div></div>
  <div class="m-sec"><span class="kicker">Payment QR code</span>
    <div class="logo-box">
      <div class="qr-prev" id="meQrPrev"></div>
      <div>
        <div class="cl-btns">
          <button class="btn btn--sm" type="button" id="meQrPick">Upload my QR code</button>
          <button class="btn btn--ghost btn--sm btn--danger" type="button" id="meQrRm">Remove</button>
        </div>
        <p class="hint" style="margin-top:8px;max-width:420px" id="meQrHint"></p>
      </div>
      <input type="file" id="meQrFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" data-m="showQR"${S.settings.showQR ? ' checked' : ''}> Print the QR code on invoices</label>
  </div>`;
  renderMeLogo(); renderMeQr();
  mdlg.showModal();
  setTimeout(() => { const first = $$('[data-m]', mdlg).find(el => el.type !== 'checkbox' && !el.value); (first || $('[data-m="studioName"]', mdlg)).focus(); }, 30);
}
export function renderMeQr() {
  const own = meQrData ? qrImage(meQrData) : meQr;
  const auto = !own && validUPI() ? qrData(compute(S.cur).total) : '';
  $('#meQrPrev').innerHTML = own ? `<img src="${own}" alt="Your payment QR code">` : auto ? `<img src="${auto}" alt="Generated UPI QR code">` : 'No QR yet';
  $('#meQrRm').hidden = !own;
  const pa = upiParam(meQrData, 'pa'), pn = upiParam(meQrData, 'pn');
  $('#meQrHint').textContent = meQrData
    ? (isUpiLink(meQrData)
      ? `Read from your QR: pays ${pa || 'your account'}${pn ? ' (' + pn + ')' : ''}. It's redrawn as a clean code on every invoice, with that invoice's amount filled in.`
      : 'Your QR was read and is redrawn as a clean code on every invoice.')
    : meQr
    ? "This QR couldn't be read, so it's printed exactly as uploaded. A sharper, straight-on screenshot usually reads fine."
    : 'Upload the QR from GPay, PhonePe, Paytm or your bank app and it prints on every invoice. Until then, a QR is made from your UPI ID with the invoice amount filled in' + (auto ? ' (shown here).' : ' — add a UPI ID above to get one.');
}
export function renderMeLogo() {
  const src = meLogo || BRAND.lockup;
  $('#meLogoPrev').innerHTML = src ? `<img src="${src}" alt="Logo preview">` : 'No logo';
  $('#meLogoReset').hidden = !meLogo;
}
mdlg.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) mdlg.close();
  if (e.target.id === 'meLogoPick') $('#meLogoFile').click();
  if (e.target.id === 'meLogoReset') { meLogo = ''; renderMeLogo(); }
  if (e.target.id === 'meQrPick') $('#meQrFile').click();
  if (e.target.id === 'meQrRm') { meQr = ''; meQrData = ''; renderMeQr(); }
});
mdlg.addEventListener('change', async e => {
  if (e.target.id === 'meQrFile') {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, JPG, WebP or SVG image.'); return; }
    try {
      const text = await decodeQR(await fitImage(f, 1400, 1600));
      if (text) {
        meQrData = text; meQr = '';
        const upiField = $('[data-m="bank.upi"]', mdlg), pa = upiParam(text, 'pa');
        if (upiField && pa && !upiField.value.trim()) upiField.value = pa;
        toast('QR read — it will print as a clean, sharp code');
      } else {
        meQrData = ''; meQr = await fitImage(f, 720, 960);     // kept large enough to stay scannable in the PDF
        toast("Couldn't read that QR — it will print as uploaded");
      }
      renderMeQr();
    } catch { toast('That image could not be read.'); }
    return;
  }
  if (e.target.id !== 'meLogoFile') return;
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) { toast('Please choose a PNG, SVG, JPG or WebP image.'); return; }
  try { meLogo = await fitImage(f, 1200, 300); renderMeLogo(); } catch { toast('That image could not be read.'); }
});
$('#meSave').addEventListener('click', () => {
  const next = clone(S.settings);
  $$('[data-m]', mdlg).forEach(el => setPath(next, el.dataset.m, el.type === 'checkbox' ? el.checked : el.value.trim()));
  if (!next.studioName) { toast('Add your business name.'); $('[data-m="studioName"]', mdlg).focus(); return; }
  next.logo = meLogo || '';
  next.payQR = meQr || '';
  next.payQRData = meQrData || '';
  S.settings = next;
  if (!LS.set('settings', S.settings)) return;
  S.qrCache = { key: '', url: '' };
  mdlg.close(); renderAll();
  const miss = missingDetails();
  toast(miss.length ? `Saved — still missing: ${miss.join(', ')}` : 'Your details are saved and on every invoice');
});

export function renderMe() {
  const s = S.settings, line = [realVal(s.email), realVal(s.phone)].filter(Boolean).join(' · ');
  const logo = s.logo || BRAND.mark;
  $('#meCard').innerHTML = `${logo ? `<img src="${logo}" alt="">` : ''}<div><b>${esc(s.studioName)}</b><span>${esc(line || 'Contact details not added yet')}</span></div>`;
  const miss = missingDetails();
  $('#meMissing').innerHTML = miss.length ? `<div class="me-missing">Still to fill in: <b>${miss.join(', ')}</b>. These print on every invoice.</div>` : '';
  $('#meDot').hidden = !miss.length;
}
$('#tMe').addEventListener('click', openMe);
insp.addEventListener('click', e => { if (e.target.closest('[data-open-me]')) openMe(); });
