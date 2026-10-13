import { S } from './state.js';
import { LS, hash } from './util.js';

/* ---------- images ---------- */
export const readAsDataURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
// Downscale an uploaded logo to what the page can show (at 3× for the PDF) so
// it doesn't eat the ~5 MB localStorage budget.
export async function fitImage(file, maxW, maxH) {
  const url = await readAsDataURL(file);
  const img = new Image(); img.src = url; await img.decode();
  const w0 = img.naturalWidth || maxW, h0 = img.naturalHeight || maxH;
  const s = Math.min(1, maxW / w0, maxH / h0);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
export const clientLogoSrc = inv => (inv.client?.logo && S.logos[inv.client.logo]) || '';
export function storeLogo(dataUrl) {
  const id = 'L' + hash(dataUrl);
  if (!S.logos[id]) { S.logos[id] = dataUrl; if (!LS.set('logos', S.logos)) { delete S.logos[id]; return ''; } }
  return id;
}
// A client billed before brings their logo with them.
export function logoForClient(name) {
  const key = String(name || '').trim().toLowerCase(); if (!key) return '';
  const saved = S.clients.find(c => c.logo && S.logos[c.logo] && [c.name, c.company].some(x => String(x || '').trim().toLowerCase() === key));
  if (saved) return saved.logo;
  const hit = [...S.invoices].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .find(i => i.client?.logo && S.logos[i.client.logo] && [i.client.name, i.client.company].some(x => String(x || '').trim().toLowerCase() === key));
  return hit ? hit.client.logo : '';
}
