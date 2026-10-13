import { BRAND } from './brand.js';
import { DOC_TEXT } from './config.js';
import { amountInWords, fmtDate, fmtPct, fmtQty, money, moneyHTML, num2 } from './format.js';
import { clientLogoSrc } from './images.js';
import { upiBlock } from './qr.js';
import { S, accentOf, docStatus, gstOn, isQuote, serialText, taxModeOf } from './state.js';
import { contrast, darken, esc, escBr, hexA, mix, pad2 } from './util.js';

/* =====================================================================
   INVOICE DESIGNS
   ===================================================================== */
export const CE = (() => { const d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch { return 'true'; } return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; })();
export const ICON = {
  grip: '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11" r="1.2"/><circle cx="7" cy="11" r="1.2"/></svg>',
  x: '<svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg>',
  star: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M6 1.2l1.5 3.1 3.3.4-2.4 2.3.6 3.3L6 8.7 3 10.3l.6-3.3L1.2 4.7l3.3-.4z"/></svg>',
};

// Editable field bound to an invoice path.
export function E(path, val, o = {}) {
  const tag = o.tag || (o.multi ? 'div' : 'span');
  const attrs = [
    `class="ed${o.multi ? ' ml' : ''}${o.cls ? ' ' + o.cls : ''}"`, `data-f="${path}"`,
    o.multi ? 'data-multi' : '', o.fmt ? `data-num data-fmt="${o.fmt}" inputmode="decimal"` : '',
    `contenteditable="${CE}"`, 'spellcheck="false"', `data-ph="${esc(o.ph || '')}"`,
  ].filter(Boolean).join(' ');
  return `<${tag} ${attrs}>${esc(val)}</${tag}>`;
}
// Editable field bound to a line item.
export function EI(it, k, o = {}) {
  const tag = o.tag || 'div';
  const isNum = k === 'qty' || k === 'rate';
  const val = k === 'qty' ? fmtQty(it.qty) : k === 'rate' ? (it.rate ? num2(it.rate) : '') : it[k];
  return `<${tag} class="ed${o.cls ? ' ' + o.cls : ''}" data-item="${it.id}" data-k="${k}"${isNum ? ` data-num data-fmt="${k}" inputmode="decimal"` : ''} contenteditable="${CE}" spellcheck="false" data-ph="${esc(o.ph || '')}">${esc(val)}</${tag}>`;
}
export const D = (key, style) => `<span class="ed-date" tabindex="0" role="button" aria-label="Change ${key === 'issueDate' ? 'issue' : 'due'} date" data-date="${key}">${fmtDate(S.cur[key], style)}</span>`;
// The built-in logo comes in two inks; a custom upload is used as-is.
export function studioLogo(cls, onDark) {
  const src = S.settings.logo || (onDark ? BRAND.lockupLight : BRAND.lockup);
  return src ? `<img class="${cls}" src="${src}" alt="${esc(S.settings.studioName)}">` : `<div class="${cls} big">${esc(S.settings.studioName)}</div>`;
}
export function studioLines({ gstin = true, email = true, phone = true } = {}) {
  const s = S.settings, out = [];
  if (s.address) out.push(`<div>${escBr(s.address)}</div>`);
  if (email && s.email) out.push(`<div>${esc(s.email)}</div>`);
  if (phone && s.phone) out.push(`<div>${esc(s.phone)}</div>`);
  if (s.website) out.push(`<div>${esc(s.website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</div>`);
  if (gstin && gstOn() && s.gstin) out.push(`<div>GSTIN ${esc(s.gstin)}</div>`);
  if (s.pan) out.push(`<div>PAN ${esc(s.pan)}</div>`);
  return out.join('');
}
export function bankRows() {
  const b = S.settings.bank;
  return [['Name', b.holder], ['Bank', [b.name, b.branch].filter(x => x && x.trim()).join(', ')], ['A/C', b.account], ['IFSC', b.ifsc]]
    .filter(r => r[1] && String(r[1]).trim());
}
export const bankDL = () => `<dl class="dl studio-link" data-settings title="Edit my details">${bankRows().map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

export const rowCtl = () => `<button class="row-h np" type="button" tabindex="-1" data-drag title="Drag to reorder" aria-label="Drag to reorder">${ICON.grip}</button><button class="row-x np" type="button" tabindex="-1" data-del title="Remove line" aria-label="Remove line">${ICON.x}</button><button class="row-s np" type="button" tabindex="-1" data-save-svc title="Save as a service" aria-label="Save line as a service">${ICON.star}</button>`;

export function itemsBlock(inv, t) {
  const head = ['#', 'Description', 'Qty', 'Rate', 'Amount'].map((h, i) => `<div class="lbl${i >= 2 ? ' num' : ''}">${h}</div>`).join('');
  const rows = inv.items.map((it, i) => `
    <div class="it-row" data-row="${it.id}">
      <div class="it-no">${pad2(i + 1)}</div>
      <div class="it-main">${EI(it, 'desc', { cls: 'it-d', ph: 'Service or deliverable' })}${EI(it, 'sub', { cls: 'it-s', ph: 'Details (optional)' })}</div>
      <div class="num cf">${EI(it, 'qty', { ph: '0' })}</div>
      <div class="num cf"><span class="cur">₹ </span>${EI(it, 'rate', { tag: 'span', ph: '0.00' })}</div>
      <div class="num" data-c="amt" data-id="${it.id}">${money(t.lines[it.id])}</div>
      ${rowCtl()}
    </div>`).join('');
  return `<section class="items"><div class="it-head">${head}</div><div class="it-rows">${rows}</div><div class="add-rows np"><button class="add-row" type="button" data-add>+ Add line item</button><button class="add-row" type="button" data-add-svc>+ From saved services</button></div></section>`;
}

export function totalsRows(t) {
  const row = (l, v, cls = '') => `<div class="t-row ${cls}"><span class="t-l">${l}</span><span class="t-v">${v}</span></div>`;
  const out = [row('Subtotal', `<span data-c="subtotal">${money(t.subtotal)}</span>`)];
  const d = S.cur.discount;
  if (d.type === 'pct') out.push(row(`Discount (${E('discount.value', fmtPct(d.value), { fmt: 'pct', ph: '0' })}%)`, `<span data-c="discount">− ${money(t.discount)}</span>`, 'disc'));
  if (d.type === 'flat') out.push(row('Discount', `− ₹ ${E('discount.value', num2(d.value), { fmt: 'money', ph: '0.00' })}`, 'disc'));
  if (taxModeOf(S.cur) === 'split') {
    out.push(row(`CGST ${E('taxHalf', fmtPct(S.cur.taxRate / 2), { fmt: 'pct', ph: '0' })}%`, `<span data-c="cgst">${money(t.cgst)}</span>`));
    out.push(row(`SGST <span data-c="sgstPct">${fmtPct(S.cur.taxRate / 2)}</span>%`, `<span data-c="sgst">${money(t.sgst)}</span>`));
  } else if (taxModeOf(S.cur) === 'igst') {
    out.push(row(`IGST ${E('taxRate', fmtPct(S.cur.taxRate), { fmt: 'pct', ph: '0' })}%`, `<span data-c="igst">${money(t.igst)}</span>`));
  }
  return out.join('');
}
export const words = t => `<div class="words" data-c="words">${amountInWords(t.total)}</div>`;
export const notes = inv => `<div class="lbl n-lbl">Notes</div>${E('notes', inv.notes, { multi: true, cls: 'notes-txt', ph: 'Notes' })}${E('termsText', inv.termsText, { multi: true, cls: 'notes-txt', ph: 'Terms & conditions' })}`;
export function clientLogo(inv) {
  const src = clientLogoSrc(inv);
  const acts = `<div class="np cl-acts"><button class="cl-logo-add cl-pick" type="button" data-pick-client>${inv.client.name || inv.client.company ? 'Change client' : 'Choose saved client'}</button>${src ? '' : '<button class="cl-logo-add" type="button" data-cl-add>+ Client logo</button>'}</div>`;
  if (src) return acts + `<div class="cl-logo" data-cl-add title="Click to replace"><img src="${src}" alt="${esc(inv.client.name || inv.client.company)} logo"><button class="cl-logo-x np" type="button" data-cl-remove title="Remove client logo" aria-label="Remove client logo">×</button></div>`;
  return acts;
}
export function clientBlock(inv) {
  return clientLogo(inv)
    + E('client.name', inv.client.name, { tag: 'div', cls: 'big', ph: 'Client name' })
    + E('client.company', inv.client.company, { tag: 'div', cls: 'sub', ph: 'Company' })
    + E('client.address', inv.client.address, { multi: true, ph: 'Billing address' })
    + E('client.email', inv.client.email, { tag: 'div', cls: 'sub', ph: 'Email (optional)' })
    + (gstOn() ? `<div class="muted" data-opt>GSTIN ${E('client.gstin', inv.client.gstin, { ph: 'optional' })}</div>` : '');
}
export const projectBlock = inv => E('project.title', inv.project.title, { tag: 'div', cls: 'big', ph: 'Project title' })
  + E('project.desc', inv.project.desc, { multi: true, cls: 'body', ph: 'Short description of the work' });
// Your logo sits above your name, mirroring the client logo in "Billed to".
export function fromBlock(cls) {
  const src = S.settings.logo || BRAND.mark;
  const logo = src ? `<div class="from-logo"><img src="${src}" alt="${esc(S.settings.studioName)} logo"></div>` : '';
  return `<div class="${cls} studio-link" data-settings title="Edit my details">${logo}<div class="big">${esc(S.settings.studioName)}</div>${studioLines()}</div>`;
}
export const termsLabel = () => isQuote(S.cur)
  ? (S.cur.dueManual ? 'Custom' : `Valid ${S.cur.terms} days`)
  : (S.cur.dueManual ? 'Custom' : +S.cur.terms ? `Net ${S.cur.terms} days` : 'On receipt');
const L = inv => DOC_TEXT[isQuote(inv) ? 'quote' : 'invoice'];
// After a payment: what came in and what is still owed.
export const paidRows = t => t.paid > 0
  ? `<div class="t-paid"><div class="t-row"><span class="t-l">Received</span><span class="t-v" data-c="paid">− ${money(t.paid)}</span></div><div class="t-row t-bal"><span class="t-l">Balance due</span><span class="t-v" data-c="balance">${money(t.balance)}</span></div></div>`
  : '';
// A quote has no payment details; its footer says how long it stands and how to accept.
export const quoteFoot = (inv, cell = '') => `<div class="${cell}"><div class="lbl">Valid until</div><div class="big">${fmtDate(inv.dueDate, 'mid')}</div></div>
      <div class="${cell}"><div class="lbl">To accept</div>${E('acceptText', inv.acceptText, { multi: true, cls: 'notes-txt', ph: 'How the client accepts' })}</div>`;
export const amountLabel = (inv, t) => t.paid > 0 ? 'Balance due' : L(inv).amount;

export function vars(inv) {
  const a = accentOf(inv);
  const onA = contrast(a, '#111114') >= contrast(a, '#ffffff') ? '#111114' : '#ffffff';
  const ink = contrast(a, '#ffffff') >= 4.5 ? a : darken(a, .5);
  let v = `--accent:${a};--on-accent:${onA};--on-accent-soft:${hexA(onA, .74)};--on-accent-line:${hexA(onA, .28)};--accent-ink:${ink};--ui:${ink};--ui-soft:${hexA(a, .45)}`;
  if (inv.template === 'grid') v += ';--ui:#111111;--ui-soft:rgba(17,17,17,.3)';
  if (inv.template === 'soft') v += `;--bg:${mix(a, '#F6F6F9', .07)};--accent-soft:${mix(a, '#FFFFFF', .13)}`;
  return v;
}
export const onDarkAccent = inv => contrast(accentOf(inv), '#ffffff') > contrast(accentOf(inv), '#111114');

export const TPL = {
  bold(inv, t) {
    return `
<div class="inv inv--bold" style="${vars(inv)}">
  <header class="bd-hero">
    <div class="bd-top">${studioLogo('bd-logo', onDarkAccent(inv))}<span class="bd-pill">${L(inv).title} ${esc(serialText())}</span></div>
    <div class="bd-amount">
      <div class="bd-amt-l" data-c="dueLabel">${amountLabel(inv, t)}</div>
      <div class="bd-amt" data-ch="due">${moneyHTML(t.due)}</div>
    </div>
    <div class="bd-meta">
      <div><span>${L(inv).short} no.</span><b>${esc(serialText())}</b></div>
      <div><span>Issued</span><b>${D('issueDate', 'mid')}</b></div>
      <div><span>${L(inv).due}</span><b>${D('dueDate', 'mid')}</b></div>
      <div><span>Terms</span><b data-c="terms">${termsLabel()}</b></div>
    </div>
  </header>
  <div class="bd-body">
    <section class="bd-parties">
      <div><div class="lbl">Billed to</div>${clientBlock(inv)}</div>
      <div><div class="lbl">From</div>${fromBlock('bd-from')}</div>
      <div><div class="lbl">Project</div>${projectBlock(inv)}</div>
    </section>
    ${itemsBlock(inv, t)}
    <section class="bd-sum">
      <div class="bd-left"><div class="lbl">In words</div>${words(t)}${notes(inv)}</div>
      <div>${totalsRows(t)}<div class="bd-total"><span>${L(inv).total}</span><b data-c="total">${money(t.total)}</b></div>${paidRows(t)}</div>
    </section>
    <div class="spacer"></div>
    <footer class="bd-foot">
      ${isQuote(inv) ? quoteFoot(inv) : `<div><div class="lbl">Bank transfer</div>${bankDL()}</div>
      <div>${upiBlock(t, 92)}</div>`}
      <div class="bd-thanks"><div class="ty">Thank you!</div>${E('thanks', inv.thanks, { tag: 'div', ph: 'Closing line' })}</div>
    </footer>
  </div>
</div>`;
  },

  grid(inv, t) {
    return `
<div class="inv inv--grid" style="${vars(inv)}">
  <div class="gd-frame">
    <div class="gd-row">
      <div class="gd-cell gd-brand span2">${studioLogo('gd-logo', false)}<div class="gd-studio studio-link" data-settings title="Edit my details">${studioLines()}</div></div>
      <div class="gd-cell gd-title"><div class="gd-inv"><span>${L(inv).title}</span></div><div class="mono gd-no">№ ${esc(serialText())}</div></div>
    </div>
    <div class="gd-row gd-parties">
      <div class="gd-cell"><div class="lbl">Billed to</div>${clientBlock(inv)}</div>
      <div class="gd-cell"><div class="lbl">Project</div>${projectBlock(inv)}</div>
      <div class="gd-cell gd-dates">
        <div class="lbl">Issued</div><div class="v">${D('issueDate', 'mid')}</div>
        <div class="lbl">${isQuote(inv) ? 'Valid' : 'Due'}</div><div class="v">${D('dueDate', 'mid')}</div>
        <div class="lbl">Terms</div><div class="v mono" data-c="terms">${termsLabel()}</div>
      </div>
    </div>
    <div class="gd-items">${itemsBlock(inv, t)}<div class="spacer"></div></div>
    <div class="gd-row">
      <div class="gd-cell gd-left span2"><div class="lbl">Amount in words</div>${words(t)}${notes(inv)}</div>
      <div class="gd-cell gd-totals">${totalsRows(t)}<div class="gd-total"><span>${L(inv).total}</span><b data-c="total">${money(t.total)}</b></div>${paidRows(t)}</div>
    </div>
    <div class="gd-row gd-foot">
      ${isQuote(inv) ? quoteFoot(inv, 'gd-cell') : `<div class="gd-cell"><div class="lbl">Bank transfer</div>${bankDL()}</div>
      <div class="gd-cell">${upiBlock(t, 92)}</div>`}
      <div class="gd-cell gd-ty"><div class="ty">Thank you.</div>${E('thanks', inv.thanks, { tag: 'div', ph: 'Closing line' })}</div>
    </div>
  </div>
</div>`;
  },

  soft(inv, t) {
    const st = docStatus(inv, t), chip = isQuote(inv)
      ? (st === 'accepted' ? ['paid', 'Accepted'] : ['', 'Valid until ' + fmtDate(inv.dueDate, 'mid')])
      : st === 'paid' ? ['paid', 'Paid'] : st === 'partial' ? ['', 'Part paid · ' + money(t.balance) + ' due'] : ['', 'Payment due ' + fmtDate(inv.dueDate, 'mid')];
    return `
<div class="inv inv--soft" style="${vars(inv)}">
  <section class="sf-card">
    <div class="sf-top">${studioLogo('sf-logo', false)}<span class="sf-chip ${chip[0]}"><i></i>${chip[1]}</span></div>
    <div class="sf-titlerow">
      <div><h1 class="sf-title">${L(inv).title}</h1><div class="sf-no">${esc(serialText())}</div></div>
      <div class="sf-dates">
        <div><div class="lbl">Issued</div><b>${D('issueDate', 'mid')}</b></div>
        <div><div class="lbl">${L(inv).due}</div><b>${D('dueDate', 'mid')}</b></div>
      </div>
    </div>
  </section>
  <section class="sf-two">
    <div class="sf-card"><div class="lbl">Billed to</div>${clientBlock(inv)}</div>
    <div class="sf-card"><div class="lbl">From</div>${fromBlock('sf-from')}</div>
  </section>
  <section class="sf-card">
    <div class="sf-proj"><div class="lbl">Project</div><div>${projectBlock(inv)}</div></div>
    ${itemsBlock(inv, t)}
  </section>
  <section class="sf-sum">
    <div class="sf-card sf-left"><div class="lbl">Amount in words</div>${words(t)}${notes(inv)}</div>
    <div class="sf-total">${totalsRows(t)}<div class="sf-grand"><span>${L(inv).total}</span><b data-c="total">${money(t.total)}</b></div>${paidRows(t)}</div>
  </section>
  <div class="spacer"></div>
  <section class="sf-card sf-foot">
    ${isQuote(inv) ? quoteFoot(inv) : `<div><div class="lbl">Bank transfer</div>${bankDL()}</div>
    <div>${upiBlock(t, 92)}</div>`}
    <div class="sf-thanks"><div class="ty">Thank you!</div>${E('thanks', inv.thanks, { tag: 'div', ph: 'Closing line' })}</div>
  </section>
</div>`;
  },
};
