import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { ME, UPI_QR, newDoc, openApp, save, status, store, total } from './helpers.js';

const amounts = page => page.locator('[data-c="amt"]').allTextContents();

test.describe('saved services', () => {
  test('add a service, drop it into an invoice, save a line with ★', async ({ page }) => {
    await openApp(page, { settings: ME });
    await page.locator('[data-tab="services"]').click();
    await page.locator('#sAdd').click();
    await page.locator('[data-sf="desc"]').fill('Logo design');
    await page.locator('[data-sf="sub"]').fill('3 concepts, 2 revisions');
    await page.locator('[data-sf="rate"]').fill('25000');
    await page.locator('#svcSave').click();
    await expect(page.locator('#sList')).toContainText('Logo design');
    await expect(page.locator('#sList')).toContainText('₹ 25,000.00');

    await newDoc(page);                                                         // one empty starter line
    await page.locator('[data-add-svc]').click();
    await page.locator('#svcPickSearch').fill('logo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.inv .it-row')).toHaveCount(1);                  // filled the empty line, not added below it
    await expect(page.locator('[data-k="desc"]').first()).toHaveText('Logo design');
    expect(await total(page)).toBe('₹ 25,000.00');

    // ★ on a line saves it as a service
    await page.locator('[data-add]').click();
    await page.keyboard.type('Brand guidelines');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await page.keyboard.type('40000'); await page.keyboard.press('Tab');
    await page.locator('.inv .it-row').nth(1).hover();
    await page.locator('.inv .it-row').nth(1).locator('[data-save-svc]').click();
    expect((await store(page, 'services')).map(s => s.desc).sort()).toEqual(['Brand guidelines', 'Logo design']);
  });
});

test.describe('payments', () => {
  test('part payment, then paid in full; QR asks for the balance', async ({ page }) => {
    await openApp(page, { settings: { ...ME, payQRData: UPI_QR } });
    await save(page);                                                           // RCS-0001, ₹1,83,000
    await page.locator('#payAmt').fill('50000');
    await page.locator('#payNote').fill('Advance via UPI');
    await page.locator('#payForm button[type="submit"]').click();

    await expect(page.locator('#paySum')).toContainText('₹ 1,33,000.00');
    await expect(page.locator('.inv .t-bal')).toContainText('₹ 1,33,000.00');
    await expect(page.locator('.inv [data-c="dueLabel"]')).toHaveText('Balance due');
    await expect(page.locator('#hList .pill')).toHaveText('Part paid');
    await expect(page.locator('#hSum')).toContainText('₹ 50,000.00');           // received this month
    const qr = await page.locator('.inv .qr').getAttribute('src');
    expect(qr).toBeTruthy();
    const stored = (await store(page, 'invoices'))[0];
    expect(stored.payments).toHaveLength(1);
    expect(stored.status).toBe('sent');

    await page.locator('#payForm button[type="submit"]').click();              // amount defaults to the balance
    await expect(page.locator('#payDone')).toContainText('Paid in full');
    await expect(page.locator('#hList .pill')).toHaveText('Paid');
    expect((await store(page, 'invoices'))[0].status).toBe('paid');
    await expect(page.locator('#hSum .out')).toContainText('₹ 0.00');
  });

  test('a sent invoice past its due date shows as overdue', async ({ page }) => {
    const late = {
      id: 'late1', kind: 'invoice', number: 'RCS-0003', status: 'sent', template: 'bold', issueDate: '2026-08-01', terms: 15, dueDate: '2026-08-16',
      client: { name: 'Kabir Shah', company: 'Saffron Bistro' }, project: { title: '', desc: '' },
      items: [{ id: 'a', desc: 'Menu design', sub: '', qty: 1, rate: 12000 }], discount: { type: 'none', value: 0 }, payments: [], createdAt: 5, updatedAt: 5,
    };
    await openApp(page, { settings: ME, invoices: [late], used: ['RCS-0003'] });
    await expect(page.locator('#hList .pill')).toHaveText('Overdue');
    await expect(page.locator('#hSum .late')).toContainText('₹ 12,000.00');
  });
});

test.describe('quotes', () => {
  test('make a quote, then convert it into an invoice', async ({ page }) => {
    await openApp(page, { settings: ME });
    await newDoc(page, 'quote');
    expect(await status(page)).toContain('becomes RCS-Q-0001');
    await expect(page.locator('.inv')).toContainText('Quotation');
    await expect(page.locator('.inv .qr')).toHaveCount(0);                      // no payment details on a quote
    await expect(page.locator('.inv')).toContainText('To accept');
    await expect(page.locator('#paySection')).toBeHidden();
    await expect(page.locator('#statusSeg')).toContainText('Accepted');

    await page.locator('[data-k="desc"]').first().click();
    await page.keyboard.type('Website redesign');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await page.keyboard.type('150000'); await page.keyboard.press('Tab');
    await save(page);
    expect(await status(page)).toContain('RCS-Q-0001 · saved');

    await page.locator('#convertQuote').click();
    expect(await status(page)).toContain('becomes RCS-0001');                  // invoice series is separate
    await expect(page.locator('.inv')).not.toContainText('Quotation');
    expect(await amounts(page)).toEqual(['₹ 1,50,000.00']);
    await save(page);
    const all = await store(page, 'invoices');
    expect(all.find(i => i.number === 'RCS-Q-0001').status).toBe('accepted');
    expect(all.find(i => i.number === 'RCS-0001').quoteRef).toBe('RCS-Q-0001');

    await page.locator('#docFilter [data-filter="quote"]').click();
    await expect(page.locator('#hList .h-item')).toHaveCount(1);
    await expect(page.locator('#hList .pill')).toHaveText('Accepted');
  });
});

test.describe('sharing', () => {
  test('WhatsApp opens the client chat with the message; the PDF downloads', async ({ page }) => {
    await openApp(page, {
      settings: { ...ME, payQRData: UPI_QR },
      clients: [{ id: 'C1', name: 'Aarav Mehta', company: 'Northwind Foods Pvt. Ltd.', phone: '98765 43210' }],
    });
    await page.locator('.inv [data-pick-client]').click();
    await page.locator('#pickList [data-pick]').first().click();
    await page.locator('#tShare').click();
    const [popup, download] = await Promise.all([
      page.waitForEvent('popup'), page.waitForEvent('download'), page.locator('[data-share="whatsapp"]').click(),
    ]);
    expect(popup.url()).toContain('919876543210');
    const text = decodeURIComponent(popup.url().split('text=')[1].split('&')[0].replace(/\+/g, ' '));
    expect(text).toContain('Hi Aarav,');
    expect(text).toContain('invoice RCS-0001');
    expect(text).toContain('₹ 1,83,000.00');
    expect(text).toContain('UPI: studio@okaxis');
    expect(download.suggestedFilename()).toBe('RCS-0001_AaravMehta.pdf');
  });

  test('copy payment details', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page, { settings: ME });
    await page.locator('#tShare').click();
    await page.locator('[data-share="copy"]').click();
    await expect(page.locator('#toast')).toContainText('copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Amount: ₹ 1,83,000.00');
    expect(text).toContain('A/C: 50200012345678');
    expect(text).toContain('IFSC: HDFC0001234');
  });
});

test.describe('backups', () => {
  test('reminder, download, and automatic folder backups', async ({ page }) => {
    // Stand in for the folder picker with the browser's private file system.
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('backups', { create: true });
    });
    await openApp(page, { settings: ME, services: [{ id: 'S1', desc: 'Logo design', sub: '', rate: 25000 }] });
    await save(page);
    await expect(page.locator('#backupNudge')).toContainText('never been backed up');

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#backupNudge [data-backup="download"]').click()]);
    const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(data.version).toBe(3);
    expect(data.invoices[0].number).toBe('RCS-0001');
    expect(data.services[0].desc).toBe('Logo design');
    await expect(page.locator('#backupNudge')).toBeHidden();

    await page.locator('#tSettings').click();
    await page.locator('[data-backup="folder"]').click();
    await expect(page.locator('#backupBox')).toContainText('Backing up automatically');
    await page.locator('#settingsDlg [data-close]').first().click();

    await page.locator('[data-k="qty"]').first().click();
    await page.keyboard.type('3'); await page.keyboard.press('Tab');
    await save(page);
    const read = () => page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('backups');
      const files = []; for await (const [name] of dir.entries()) files.push(name);
      const latest = JSON.parse(await (await (await dir.getFileHandle('recreation-invoices-latest.json')).getFile()).text());
      return { files: files.sort(), qty: latest.invoices[0].items[0].qty };
    });
    await expect.poll(async () => (await read()).qty, { timeout: 8000 }).toBe(3);
    expect((await read()).files).toContain('recreation-invoices-latest.json');
  });

  test('a copy of existing data is kept before the update runs', async ({ page }) => {
    await openApp(page, { settings: ME, invoices: [], clients: [{ id: 'C1', name: 'Riya', company: 'Bluepeak' }] });
    await page.locator('#tSettings').click();
    await expect(page.locator('[data-backup="snapshot"]')).toBeVisible();
    const snap = await page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => { const g = r.result.transaction('keyval').objectStore('keyval').get('snapshot:before-v3'); g.onsuccess = () => res(g.result); };
    }));
    expect(JSON.parse(snap.data['rcs.clients'])[0].company).toBe('Bluepeak');
  });
});
