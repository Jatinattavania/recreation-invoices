import qrcode from 'qrcode-generator';
import { S, serialText } from './state.js';
import { esc } from './util.js';

export const validUPI = () => /^[\w.\-]{2,}@[A-Za-z][\w.]*$/.test((S.settings.bank.upi || '').trim());
S.qrCache = { key: '', url: '' };
export const isUpiLink = t => /^upi:\/\/pay\?/i.test(t || '');
export function upiParam(t, key) {
  const m = new RegExp('[?&]' + key + '=([^&]*)', 'i').exec(t || '');
  try { return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; } catch { return m ? m[1] : ''; }
}
// Your own QR keeps everything it says (UPI ID, name, merchant codes) and gains
// the invoice amount, so the client only has to scan and confirm. Signed QRs are
// left exactly as they are.
export function withAmount(raw, total) {
  if (!isUpiLink(raw) || /[?&]sign=/i.test(raw) || !(total > 0)) return raw;
  const [base, qs = ''] = raw.split('?');
  const kept = qs.split('&').filter(kv => kv && !/^(am|cu|tn)=/i.test(kv));
  kept.push(`am=${total.toFixed(2)}`, 'cu=INR', `tn=${encodeURIComponent(serialText())}`);
  return `${base}?${kept.join('&')}`;
}
export function qrPayload(total) {
  if (S.settings.payQRData) return withAmount(S.settings.payQRData, total);
  if (!validUPI()) return '';
  const b = S.settings.bank;
  return `upi://pay?pa=${b.upi.trim()}&pn=${encodeURIComponent((b.holder || S.settings.studioName).trim())}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(serialText())}`;
}
export const qrData = total => { const t = qrPayload(total); return t ? qrImage(t) : ''; };
export function qrImage(s) {
  if (!s) return '';
  if (S.qrCache.key === s) return S.qrCache.url;
  try {
    const q = qrcode(0, 'M'); q.addData(s); q.make();
    const n = q.getModuleCount(), cell = 10, c = document.createElement('canvas');
    c.width = c.height = n * cell;
    const g = c.getContext('2d'); g.fillStyle = '#111114';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(k * cell, r * cell, cell, cell);
    S.qrCache = { key: s, url: c.toDataURL('image/png') };
  } catch { S.qrCache = { key: s, url: '' }; }
  return S.qrCache.url;
}
export function qrHTML(size, total) {
  if (!S.settings.showQR) return '';
  if (S.settings.payQR && !S.settings.payQRData) return `<img class="qr qr-own" src="${S.settings.payQR}" style="width:${size + 32}px;height:auto;max-height:${size + 70}px" alt="Payment QR code">`;
  const url = qrData(total); if (!url) return '';
  return `<img class="qr" data-c="qr" src="${url}" width="${size}" height="${size}" alt="UPI payment QR code">`;
}
export const upiBlock = (t, size) => {
  const typed = /^\[.*\]$/.test(String(S.settings.bank.upi || '').trim()) ? '' : S.settings.bank.upi;
  const upi = typed || upiParam(S.settings.payQRData, 'pa');
  const own = S.settings.payQR || S.settings.payQRData;
  return `<div class="lbl">${own && !upi ? 'Scan to pay' : 'Pay by UPI'}</div>${upi || !own ? `<div class="upi studio-link" data-settings>${esc(upi || S.settings.bank.upi)}</div>` : ''}${qrHTML(size, t.due)}`;
};

// Read the code inside an uploaded QR picture (handles white-on-black codes,
// logo badges and captions), so it can be redrawn cleanly.
export async function decodeQR(dataUrl) {
  if (!dataUrl) return '';
  try {
    const { default: jsQR } = await import('jsqr');
    const img = new Image(); img.src = dataUrl; await img.decode();
    for (const scale of [1, 0.5, 2]) {
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      if (w < 60 || w > 3000) continue;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (r?.data) return r.data;
    }
  } catch { /* fall through */ }
  return '';
}
