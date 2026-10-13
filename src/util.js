import { toast } from './ui.js';

/* ---------- utilities ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clone = o => JSON.parse(JSON.stringify(o));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const escBr = s => esc(String(s ?? '').trim()).replace(/\n/g, '<br>');
export const pad2 = n => String(n).padStart(2, '0');
export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const parseNum = s => { const v = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : 0; };
export const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
export function setPath(o, p, v) { const ks = p.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]] ??= {}; x[ks[ks.length - 1]] = v; }
export function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (over && typeof over === 'object') for (const k in over) {
    const b = base?.[k], o = over[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o)) ? merge(b, o) : o;
  }
  return out;
}
export const isHex = h => /^#[0-9a-f]{6}$/i.test(h || '');
export const rgbOf = hex => { const n = parseInt((isHex(hex) ? hex : '#6D5EF5').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export const toHex = rgb => '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
export const hexA = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
export const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(x.map((c, i) => c * t + y[i] * (1 - t))); };
export const darken = (hex, k) => toHex(rgbOf(hex).map(c => c * (1 - k)));
export function luminance(hex) { return rgbOf(hex).map(c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0); }
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); }

// Called with the key after any successful save (the backup module listens here).
export const onSaved = new Set();
export const LS = {
  get(k, fb) { try { const v = localStorage.getItem('rcs.' + k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) {
    try { localStorage.setItem('rcs.' + k, JSON.stringify(v)); }
    catch { toast('Could not save — browser storage is full. Try a smaller logo file.'); return false; }
    onSaved.forEach(fn => fn(k));
    return true;
  },
};
