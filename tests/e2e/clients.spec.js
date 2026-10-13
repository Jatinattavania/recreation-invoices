import { expect, test } from '@playwright/test';
import { ME, newDoc, logoUpload, openApp, save } from './helpers.js';

async function addClient(page, { company, name, address, email, phone, logo }) {
  await page.locator('[data-tab="clients"]').click();
  await page.locator('#cAdd').click();
  await page.locator('[data-cf="company"]').fill(company);
  await page.locator('[data-cf="name"]').fill(name);
  if (address) await page.locator('[data-cf="address"]').fill(address);
  if (email) await page.locator('[data-cf="email"]').fill(email);
  if (phone) await page.locator('[data-cf="phone"]').fill(phone);
  if (logo) await page.locator('#cdLogoFile').setInputFiles(logo), await expect(page.locator('#cdAv img')).toBeVisible();
  await page.locator('#cdSave').click();
}

test('add a client, pick them on an invoice, stats update', async ({ page }) => {
  await openApp(page, { settings: ME });
  await addClient(page, { company: 'Bluepeak Ventures', name: 'Riya Kapoor', address: '21 Linking Road\nMumbai 400050', email: 'riya@bluepeak.in', phone: '+91 99887 76655', logo: logoUpload() });
  await addClient(page, { company: 'Saffron Bistro', name: 'Kabir Shah' });
  await expect(page.locator('#cList .h-item')).toHaveCount(2);

  await newDoc(page);
  await page.locator('.inv [data-pick-client]').click();
  await page.locator('#pickSearch').fill('blue');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-f="client.company"]')).toHaveText('Bluepeak Ventures');
  await expect(page.locator('[data-f="client.email"]')).toHaveText('riya@bluepeak.in');
  await expect(page.locator('.inv .cl-logo img')).toBeVisible();
  await expect(page.locator('#clCurrent')).toContainText('Saved client');

  await save(page);
  await expect(page.locator('#cList .h-item').first()).toContainText('1 invoice');
});

test('save the invoice client into the client list', async ({ page }) => {
  await openApp(page, { settings: ME });
  await newDoc(page);
  await page.locator('[data-f="client.company"]').focus();
  await page.keyboard.type('Orbit Labs');
  await page.locator('[data-f="client.name"]').focus();
  await page.keyboard.type('Dev Patel');
  await page.keyboard.press('Enter');
  await page.locator('#clSave').click();
  await page.locator('[data-tab="clients"]').click();
  await expect(page.locator('#cList')).toContainText('Orbit Labs');
});

test('a client billed before brings their logo along', async ({ page }) => {
  await openApp(page, { settings: ME });
  await page.locator('#clientLogoFile').setInputFiles(logoUpload());
  await expect(page.locator('.inv .cl-logo img')).toBeVisible();
  await save(page);
  await newDoc(page);
  await page.locator('[data-f="client.name"]').focus();
  await page.keyboard.type('Aarav Mehta');
  await page.keyboard.press('Enter');
  await expect(page.locator('.inv .cl-logo img')).toBeVisible();
});
