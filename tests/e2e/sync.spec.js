import { expect, test } from '@playwright/test';
import { ME, SAMPLE, openApp, store } from './helpers.js';

// Firebase is swapped for a stand-in: the cloud data lives here in the test, and two
// separate browsers (each with its own storage) sync through it.
const FAKE_CLOUD = `
const user = () => JSON.parse(localStorage.getItem('fake.user') || 'null');
let onChange = () => {};
export const onUser = cb => { onChange = cb; setTimeout(() => cb(user())); return () => {}; };
export async function signIn() { localStorage.setItem('fake.user', JSON.stringify({ uid: 'u1', email: 'studio@example.com', displayName: 'Studio' })); onChange(user()); }
export async function signOutUser() { localStorage.removeItem('fake.user'); onChange(null); }
export function backend(uid) {
  return {
    listen(coll, onDocs) {
      (window.__listeners ??= []).push({ coll, onDocs });
      window.cloudGet(uid, coll).then(onDocs);
      return () => { window.__listeners = window.__listeners.filter(l => l.onDocs !== onDocs); };
    },
    commit: ops => window.cloudCommit(uid, ops),
  };
}`;

function cloudFor(browserPages) {
  const data = {};
  const docs = (uid, coll) => JSON.parse(JSON.stringify(data[uid]?.[coll] || {}));
  return {
    data,
    async attach(page) {
      browserPages.push(page);
      await page.route('**/src/cloud.js*', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_CLOUD }));
      await page.exposeFunction('cloudGet', (uid, coll) => docs(uid, coll));
      await page.exposeFunction('cloudCommit', async (uid, ops) => {
        for (const { coll, id, value } of ops) {
          const c = ((data[uid] ??= {})[coll] ??= {});
          if (value == null) delete c[id]; else c[id] = value;
        }
        for (const coll of new Set(ops.map(o => o.coll))) for (const p of browserPages) {
          await p.evaluate(([coll, d]) => (window.__listeners || []).filter(l => l.coll === coll).forEach(l => l.onDocs(d)), [coll, docs(uid, coll)]).catch(() => {});
        }
      });
    },
  };
}

test('two browsers share invoices, details and changes', async ({ browser }) => {
  const pages = [], cloud = cloudFor(pages);
  const saved = { ...SAMPLE, id: 'inv1', number: 'RCS-0001', status: 'sent', issueDate: '2026-10-01', dueDate: '2099-01-01', createdAt: 1, updatedAt: 1 };

  // Laptop: has a saved invoice and your details. Signing in uploads them.
  const laptop = await (await browser.newContext()).newPage();
  await cloud.attach(laptop);
  const errA = await openApp(laptop, { settings: ME, invoices: [saved], counter: { next: 2, year: 2026 }, used: ['RCS-0001'] });
  await expect(laptop.locator('#tSync')).toHaveText('Sign in to sync');
  await laptop.locator('#tSync').click();
  await expect(laptop.locator('#tSync')).toHaveText('Synced');
  await expect(laptop.locator('#toast')).toContainText('Signed in');
  expect(cloud.data.u1.invoices.inv1.number).toBe('RCS-0001');
  expect(cloud.data.u1.meta.settings.value.email).toBe(ME.email);

  // Phone: a fresh browser. Signing in brings everything down.
  const phone = await (await browser.newContext()).newPage();
  await cloud.attach(phone);
  const errB = await openApp(phone, { fresh: true });
  await phone.locator('#tSync').click();
  await expect(phone.locator('#tSync')).toHaveText('Synced');
  await expect(phone.locator('#hList .h-item')).toHaveCount(1);
  await expect(phone.locator('#hList')).toContainText('RCS-0001');
  expect((await store(phone, 'settings')).email).toBe(ME.email);
  await expect(phone.locator('#saveState')).toContainText('RCS-0002');      // numbering carries on

  // Marking it paid on the laptop shows on the phone.
  await laptop.locator('#statusSeg [data-val="paid"]').click();
  await expect(phone.locator('#hList .pill')).toHaveText('Paid');

  // Still signed in after a reload; signing out keeps the data here.
  await phone.reload();
  await expect(phone.locator('#tSync')).toHaveText('Synced');
  await phone.locator('#tSync').click();
  await phone.locator('#syncMenu [data-sync="out"]').click();
  await expect(phone.locator('#tSync')).toHaveText('Sign in to sync');
  await expect(phone.locator('#hList .h-item')).toHaveCount(1);

  expect([...errA, ...errB]).toEqual([]);
});
