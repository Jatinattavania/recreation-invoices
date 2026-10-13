import { pad2 } from './util.js';

/* ---------- money & words ---------- */
export const NF2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NFQ = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const num2 = n => NF2.format(n || 0);
export const money = n => '₹ ' + NF2.format(n || 0);
export const moneyHTML = n => { const [i, d] = NF2.format(n || 0).split('.'); return `<span class="cur">₹</span>${i}<span class="dec">.${d}</span>`; };
export const fmtQty = n => NFQ.format(n || 0);
export const fmtPct = n => String(+(+n || 0).toFixed(3));

export const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
export const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
export const w2 = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
export const w3 = n => [Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + ' Hundred' : '', n % 100 ? w2(n % 100) : ''].filter(Boolean).join(' ');
export function wIndian(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lk = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) parts.push(wIndian(cr) + ' Crore');
  if (lk) parts.push(w2(lk) + ' Lakh');
  if (th) parts.push(w2(th) + ' Thousand');
  if (n) parts.push(w3(n));
  return parts.join(' ');
}
export function amountInWords(x) {
  const paise = Math.round(Math.max(0, x) * 100), r = Math.floor(paise / 100), p = paise % 100;
  return 'Rupees ' + wIndian(r) + (p ? ' and ' + w2(p) + ' Paise' : '') + ' Only';
}

/* ---------- dates ---------- */
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const thisYear = () => new Date().getFullYear();
export const toISO = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const todayISO = () => toISO(new Date());
export function parseISO(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
export function addDays(iso, n) { const d = parseISO(iso) || new Date(); d.setDate(d.getDate() + n); return toISO(d); }
export function daysBetween(a, b) { const x = parseISO(a), y = parseISO(b); return x && y ? Math.round((y - x) / 864e5) : 0; }
export function fmtDate(iso, style) {
  const d = parseISO(iso); if (!d) return '—';
  const mon = MONTHS[d.getMonth()];
  if (style === 'short') return d.getDate() + ' ' + mon.slice(0, 3) + (d.getFullYear() === thisYear() ? '' : ' ' + d.getFullYear());
  if (style === 'mid') return d.getDate() + ' ' + mon.slice(0, 3) + ' ' + d.getFullYear();
  return d.getDate() + ' ' + mon + ' ' + d.getFullYear();
}
