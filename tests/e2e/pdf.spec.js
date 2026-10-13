import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { ME, UPI_QR, openApp, readQR } from './helpers.js';

/** Pull the page image out of a downloaded PDF (it is one JPEG per page). */
function jpegFromPdf(buf) {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2;
  return buf.subarray(start, end);
}

for (const design of ['bold', 'grid', 'soft']) {
  test(`PDF (${design}): small, named right, logo printed, QR scans`, async ({ page }) => {
    await openApp(page, { settings: { ...ME, payQRData: UPI_QR } });
    await page.locator(`[data-tpl="${design}"]`).click();

    // where the From logo sits on the exported page (export hides editing-only bits)
    const boxes = await page.evaluate(() => {
      const src = document.querySelector('.inv'), c = src.cloneNode(true);
      c.classList.add('exporting'); c.querySelectorAll('.np').forEach(n => n.remove());
      const h = document.createElement('div'); h.className = 'export-host'; h.appendChild(c); document.body.appendChild(h);
      const R = c.getBoundingClientRect();
      const at = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left - R.left, y: b.top - R.top, w: b.width, h: b.height }; };
      const out = { logo: at(c.querySelector('.from-logo img')), qr: at(c.querySelector('.qr')) };
      h.remove();
      return out;
    });

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#tPdf').click()]);
    expect(download.suggestedFilename()).toBe('RCS-0001_AaravMehta.pdf');
    const pdf = fs.readFileSync(await download.path());
    expect(pdf.length).toBeLessThan(400 * 1024);

    const jpegBuf = jpegFromPdf(pdf);
    fs.writeFileSync(test.info().outputPath('page.jpg'), jpegBuf);              // kept with the results for a quick look
    const jpeg = jpegBuf.toString('base64');
    const result = await page.evaluate(async ({ jpeg, logoBox, qrBox }) => {
      const i = new Image(); i.src = 'data:image/jpeg;base64,' + jpeg; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      const k = i.width / 794;
      let logoInk = null;
      if (logoBox) {
        const d = g.getImageData(logoBox.x * k, logoBox.y * k, Math.max(1, logoBox.w * k), Math.max(1, logoBox.h * k)).data;
        logoInk = 0; for (let p = 0; p < d.length; p += 4) if (d[p] < 100) logoInk++;
      }
      const pad = 24, q = g.getImageData(qrBox.x * k - pad, qrBox.y * k - pad, qrBox.w * k + pad * 2, qrBox.h * k + pad * 2);
      return { logoInk, width: i.width, qr: { data: [...q.data], width: q.width, height: q.height } };
    }, { jpeg, logoBox: boxes.logo, qrBox: boxes.qr });

    expect(result.width).toBe(794 * 2);
    if (design !== 'grid') expect(result.logoInk).toBeGreaterThan(100);          // Grid shows your logo in the header instead
    expect(readQR(result.qr)).toBe(`${UPI_QR}&am=183000.00&cu=INR&tn=RCS-0001`);
  });
}
