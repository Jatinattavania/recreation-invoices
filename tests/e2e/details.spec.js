import { expect, test } from '@playwright/test';
import { ME, UPI_QR, openApp, qrUpload, readQR, save, store } from './helpers.js';

/** Decode the QR printed on the invoice right now. */
async function invoiceQR(page) {
  const px = await page.evaluate(async () => {
    const img = document.querySelector('.inv .qr'); if (!img) return null;
    const i = new Image(); i.src = img.src; await i.decode();
    // shrink to ~3px per module: plenty for the reader, and fast to hand back to the test
    const w = Math.round(i.naturalWidth / 3), pad = 12, c = document.createElement('canvas'); c.width = c.height = w + pad * 2;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false; g.drawImage(i, pad, pad, w, w);
    const d = g.getImageData(0, 0, c.width, c.height); return { data: [...d.data], width: d.width, height: d.height };
  });
  return px && readQR(px);
}

test('My details opens on first visit and prints everywhere', async ({ page }) => {
  await openApp(page, { ui: {} });                                             // placeholders, not nudged yet
  await expect(page.locator('#meDlg')).toBeVisible();
  await expect(page.locator('#meMissing')).toContainText('address');
  await page.locator('[data-m="address"]').fill(ME.address);
  await page.locator('[data-m="email"]').fill(ME.email);
  await page.locator('[data-m="phone"]').fill(ME.phone);
  await page.locator('[data-m="website"]').fill(ME.website);
  for (const [k, v] of Object.entries(ME.bank)) if (v) await page.locator(`[data-m="bank.${k}"]`).fill(v);
  await page.locator('#meSave').click();
  await expect(page.locator('#meMissing')).toBeEmpty();
  for (const t of ['bold', 'grid', 'soft']) {
    await page.locator(`[data-tpl="${t}"]`).click();
    const text = await page.locator('.inv').innerText();
    for (const s of ['Delhi, New Delhi', ME.email, ME.phone, 'studio.example.com/work', 'HDFC0001234']) expect(text).toContain(s);
    expect(text).not.toContain('[YOUR');
  }
  await page.reload();
  await expect(page.locator('#meDlg')).toBeHidden();                           // only once
});

test('editing My details updates saved invoices too', async ({ page }) => {
  await openApp(page, { settings: ME });
  await save(page);
  await page.locator('.inv [data-settings]').first().click();
  await page.locator('[data-m="phone"]').fill('+91 90000 11111');
  await page.locator('#meSave').click();
  await page.locator('[data-open]').first().click();
  await expect(page.locator('.inv')).toContainText('+91 90000 11111');
});

test('an uploaded QR is read, redrawn cleanly and carries the amount', async ({ page }) => {
  await openApp(page, { settings: { ...ME, bank: { ...ME.bank, upi: '' } } });
  await page.locator('#tMe').click();
  await page.locator('#meQrFile').setInputFiles(qrUpload(UPI_QR));
  await expect(page.locator('#meQrHint')).toContainText('pays studio@okaxis (TEST STUDIO)');
  await expect(page.locator('[data-m="bank.upi"]')).toHaveValue('studio@okaxis');
  await page.locator('#meSave').click();
  expect((await store(page, 'settings')).payQRData).toBe(UPI_QR);
  expect(await invoiceQR(page)).toBe(`${UPI_QR}&am=183000.00&cu=INR&tn=RCS-0001`);

  await page.locator('[data-k="qty"]').nth(0).click();
  await page.keyboard.type('2'); await page.keyboard.press('Tab');
  await expect(page.locator('.inv [data-c="total"]').first()).toHaveText('₹ 2,28,000.00');
  await expect.poll(() => invoiceQR(page)).toContain('am=228000.00');
});

test('a QR uploaded before this feature is cleaned up on load', async ({ page }) => {
  const legacy = 'data:image/svg+xml;base64,' + qrUpload(UPI_QR).buffer.toString('base64');
  await openApp(page, { settings: { ...ME, payQR: legacy, bank: { ...ME.bank, upi: '[UPI ID]' } } });
  await expect.poll(async () => (await store(page, 'settings')).payQRData).toBe(UPI_QR);
  const s = await store(page, 'settings');
  expect(s.payQR).toBe('');
  expect(s.bank.upi).toBe('studio@okaxis');
  await expect(page.locator('.inv .qr[data-c="qr"]')).toBeVisible();
});
