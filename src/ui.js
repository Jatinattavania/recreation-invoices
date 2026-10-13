import { $ } from './util.js';

/* ---------- toast ---------- */
export let toastTimer;
export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- small drop-down menus (New ▾, Share ▾) ---------- */
export function setupMenu(button, menu, onPick) {
  const open = show => { menu.hidden = !show; button.setAttribute('aria-expanded', String(show)); if (show) menu.querySelector('button:not([hidden])')?.focus(); };
  button.addEventListener('click', e => { e.stopPropagation(); open(menu.hidden); });
  menu.addEventListener('click', e => { const item = e.target.closest('button'); if (!item) return; open(false); onPick(item); });
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('button:not([hidden])')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Escape') { open(false); button.focus(); }
  });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) open(false); });
}
