import { expect } from '@playwright/test';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';

// Real-looking details so invoices render the way they do for you.
export const ME = {
  studioName: 'ReCreation Studio',
  address: 'Delhi, New Delhi', email: 'hello@example.com', phone: '9876500000',
  website: 'https://studio.example.com/work/',
  bank: { holder: 'Test Studio', name: 'HDFC Bank', account: '50200012345678', ifsc: 'HDFC0001234', branch: '', upi: 'studio@okaxis' },
};
export const UPI_QR = 'upi://pay?pa=studio@okaxis&pn=TEST%20STUDIO&mc=0000&mode=02&purpose=00';

/** Open the app with a clean browser seeded with `seed` (rcs.* localStorage keys). */
export async function openApp(page, seed = {}) {
  page.on('dialog', d => d.accept());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(data => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(data)) localStorage.setItem('rcs.' + k, JSON.stringify(v));
  }, { ui: { meNudged: true }, ...seed });
  await page.goto('/');
  await page.locator('.inv').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

export const total = page => page.locator('.inv [data-c="total"]').first().textContent();
export const status = page => page.locator('#saveState').textContent();
export const store = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem('rcs.' + k)), key);

/** New ▾ → Invoice or Quote. */
export async function newDoc(page, kind = 'invoice') {
  await page.locator('#tNew').click();
  await page.locator(`#newMenu [data-new="${kind}"]`).click();
}

export async function save(page) {
  await page.keyboard.press('Control+s');
  await expect(page.locator('#saveState')).toContainText('saved');
}

/** Type into an inline-editable field on the invoice (replaces numbers, appends text). */
export async function typeInto(page, locator, text) {
  await locator.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Tab');
}

/** A QR image like the PhonePe one (white on black, with a caption), as an SVG upload. */
export function qrUpload(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = 9, pad = 30, w = n * cell + pad * 2, h = w + 50;
  let cells = '';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) cells += `<rect x="${pad + k * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/><g fill="#fff">${cells}</g><text x="${w / 2}" y="${h - 20}" fill="#fff" font-family="Arial" font-size="22" font-weight="bold" text-anchor="middle">TEST USER</text></svg>`;
  return { name: 'qr.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
}

/** A small client logo, as an SVG upload. */
export function logoUpload(label = 'NORTHWIND') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120"><circle cx="60" cy="60" r="44" fill="#1f7a5a"/><text x="120" y="74" fill="#16352b" font-family="Arial" font-size="40" font-weight="bold">${label}</text></svg>`;
  return { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
}

/** Decode the first QR found in RGBA pixels (from canvas getImageData). */
export const readQR = ({ data, width, height }) => jsQR(Uint8ClampedArray.from(data), width, height)?.data ?? null;
