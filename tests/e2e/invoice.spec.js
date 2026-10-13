import { expect, test } from '@playwright/test';
import { ME, SAMPLE, newDoc, openApp, save, status, store, total, typeInto } from './helpers.js';

test('sample invoice totals, words and no GST', async ({ page }) => {
  const errors = await openApp(page, { settings: ME });
  expect(await total(page)).toBe('₹ 1,83,000.00');
  await expect(page.locator('.inv [data-c="words"]').first()).toHaveText('Rupees One Lakh Eighty-Three Thousand Only');
  await expect(page.locator('.inv .t-row')).toHaveCount(1);                 // just Subtotal
  await expect(page.locator('.inv')).not.toContainText(/CGST|SGST|IGST|GSTIN/);
  await expect(page.locator('#taxSection')).toBeHidden();
  expect(errors).toEqual([]);
});

test('first run starts with an empty invoice', async ({ page }) => {
  const errors = await openApp(page, { fresh: true, settings: ME });
  expect(await total(page)).toBe('₹ 0.00');
  await expect(page.locator('.inv .it-row')).toHaveCount(1);
  await expect(page.locator('.inv')).not.toContainText(/Aarav|Northwind|Website redesign|Discovery/);
  await expect(page.locator('#saveState')).toContainText('RCS-0001');
  expect(errors).toEqual([]);
});

// The example earlier versions opened with.
const OLD_EXAMPLE = {
  ...SAMPLE,
  client: { name: 'Aarav Mehta', company: 'Northwind Foods Pvt. Ltd.', address: '4th Floor, Prestige Meridian\nMG Road, Bengaluru 560001' },
  project: { title: 'Website redesign', desc: 'Brand-led redesign of the marketing site, from research through launch.' },
  items: [
    { id: 'i1', desc: 'Discovery & UX research', sub: '', qty: 1, rate: 45000 },
    { id: 'i2', desc: 'UI design — marketing website', sub: '', qty: 12, rate: 6500 },
    { id: 'i3', desc: 'Webflow development', sub: '', qty: 1, rate: 60000 },
  ],
};

test('an old example draft is cleared on start', async ({ page }) => {
  await openApp(page, { settings: ME, working: { inv: OLD_EXAMPLE, dirty: false } });
  expect(await total(page)).toBe('₹ 0.00');
  await expect(page.locator('.inv')).not.toContainText(/Aarav|Northwind|Website redesign|Discovery/);
});

test('clearing an old example draft keeps your client and your own lines', async ({ page }) => {
  const inv = { ...OLD_EXAMPLE, client: { name: '', company: 'Kidooza', address: 'Bengaluru' },
    items: [...OLD_EXAMPLE.items, { id: 'mine', desc: 'Logo design', sub: '', qty: 1, rate: 15000 }] };
  await openApp(page, { settings: ME, working: { inv, dirty: true } });
  await expect(page.locator('.inv .it-row')).toHaveCount(1);
  await expect(page.locator('.inv')).toContainText('Logo design');
  await expect(page.locator('.inv')).toContainText('Kidooza');
  await expect(page.locator('.inv')).not.toContainText(/Website redesign|Discovery/);
  expect(await total(page)).toBe('₹ 15,000.00');
});

test('live calculation, keyboard flow and discount', async ({ page }) => {
  await openApp(page, { settings: ME });
  await typeInto(page, page.locator('[data-k="qty"]').nth(1), '10');           // 10 × 6,500
  await expect(page.locator('[data-c="amt"]').nth(1)).toHaveText('₹ 65,000.00');
  expect(await total(page)).toBe('₹ 1,70,000.00');

  // Enter on the last row adds a row and focuses its description
  await page.locator('[data-k="rate"]').nth(2).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.inv .it-row')).toHaveCount(4);
  await page.keyboard.type('Hosting setup');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');          // → qty
  await page.keyboard.type('2'); await page.keyboard.press('Tab'); await page.keyboard.type('2500.5'); await page.keyboard.press('Tab');
  await expect(page.locator('[data-c="amt"]').nth(3)).toHaveText('₹ 5,001.00');

  // Alt+↑ moves a row
  await page.locator('[data-k="desc"]').nth(3).click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator('[data-k="desc"]').nth(2)).toHaveText('Hosting setup');

  await page.locator('[data-seg="discount.type"] [data-val="pct"]').click();
  await page.locator('[data-bind="discount.value"]').fill('10');
  await expect(page.locator('.inv .t-row.disc')).toContainText('− ₹ 17,500.10');
  expect(await total(page)).toBe('₹ 1,57,500.90');
});

test('numbers: used only on save, never reused, duplicate gets a fresh one', async ({ page }) => {
  await openApp(page, { settings: ME });
  expect(await status(page)).toContain('becomes RCS-0001');
  await save(page);
  expect(await status(page)).toContain('RCS-0001 · saved');

  await newDoc(page);
  expect(await status(page)).toContain('becomes RCS-0002');
  await newDoc(page);                                         // abandoned draft
  expect(await status(page)).toContain('becomes RCS-0002');

  await page.locator('[data-open]').first().click();
  await page.locator('#tDup').click();
  expect(await status(page)).toContain('becomes RCS-0002');
  await save(page);
  await expect(page.locator('#hList .h-item')).toHaveCount(2);
  expect((await store(page, 'counter')).next).toBe(3);
});

test('restart numbering clears saved invoices but keeps clients and details', async ({ page }) => {
  await openApp(page, { settings: ME, clients: [{ id: 'C1', name: 'Riya', company: 'Bluepeak' }] });
  await save(page);
  await page.locator('#tSettings').click();
  await page.locator('#resetNumbering').click();
  expect(await status(page)).toContain('becomes RCS-0001');
  expect(await store(page, 'invoices')).toEqual([]);
  expect((await store(page, 'clients')).length).toBe(1);
  expect((await store(page, 'settings')).email).toBe(ME.email);
});

test('designs switch and keep the same totals', async ({ page }) => {
  await openApp(page, { settings: ME });
  for (const t of ['grid', 'soft', 'bold']) {
    await page.locator(`[data-tpl="${t}"]`).click();
    await expect(page.locator('.inv')).toHaveClass(new RegExp(`inv--${t}`));
    expect(await total(page)).toBe('₹ 1,83,000.00');
  }
});

test('existing saved data loads after the update', async ({ page }) => {
  const old = {
    id: 'x1', number: 'RCS-0007', status: 'sent', template: 'soft', accents: { soft: '#10B981' }, clientId: 'C1',
    issueDate: '2026-10-01', terms: 15, dueDate: '2026-10-16', dueManual: false,
    client: { name: 'Riya Kapoor', company: 'Bluepeak Ventures', address: 'Mumbai', email: 'riya@bluepeak.in', gstin: '', logo: '' },
    project: { title: 'Brand refresh', desc: '' }, items: [{ id: 'a', desc: 'Logo design', sub: '', qty: 1, rate: 40000 }],
    discount: { type: 'none', value: 0 }, taxRate: 18, taxMode: 'split', notes: '', termsText: '', thanks: '', createdAt: 1, updatedAt: 1,
  };
  const errors = await openApp(page, {
    settings: { ...ME, payQRData: 'upi://pay?pa=studio@okaxis&pn=TEST%20STUDIO' },
    invoices: [old], counter: { next: 8, year: 2026 }, used: ['RCS-0007'],
    clients: [{ id: 'C1', name: 'Riya Kapoor', company: 'Bluepeak Ventures' }],
    working: { inv: old, dirty: false },
  });
  await expect(page.locator('.inv')).toHaveClass(/inv--soft/);
  expect(await total(page)).toBe('₹ 40,000.00');                              // GST switched off everywhere
  await expect(page.locator('#hList .h-item')).toContainText('RCS-0007');
  expect(errors).toEqual([]);
});
