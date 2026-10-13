# ReCreation Studio — Invoices

Invoices and quotes for ReCreation Studio, made in the browser. Everything you save (invoices, quotes, clients, services, your details) stays in this browser on this computer. There is no server.

## Commands

```bash
npm install       # first time, and after pulling changes that add packages
npm run dev       # start the app at http://localhost:8080 (reloads when you save a file)
npm test          # run all checks: unit tests, then browser tests in Chrome (~30 s)
npm run build     # make a deployable copy in dist/
npm run preview   # check the dist/ build at http://localhost:8080
```

The app always runs on port **8080**. Saved data belongs to the address it was saved at, so keep using `localhost:8080`. If `npm run dev` says the port is in use, another copy is already running (Ctrl + C it first).

## Hosting

Every push to `main` builds the app and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). Check progress in the repository's **Actions** tab.

The hosted site and `localhost:8080` each keep their own saved data. To move your invoices across, use **Settings → Backups → Download a backup file** on one, then **Restore from a backup file** on the other.

## Keeping your data safe

- **Settings → Backups → Choose backup folder** (Chrome/Edge): every change is saved to that folder as `recreation-invoices-latest.json`, plus one dated copy per day. Pick a folder synced to Google Drive or OneDrive.
- **Download a backup file** at any time. A reminder appears in the invoice list if you haven't backed up for a week.
- **Restore from a backup file** replaces everything with that backup.
- The first time this version ran, it kept a copy of your earlier data. **Restore the pre-update copy** brings it back.

## How the code is laid out

| File | What it does |
|---|---|
| `index.html` | The page markup: toolbar, side panels, dialogs. |
| `src/main.js` | Start-up: loads fonts, styles and every module, opens the last invoice. |
| `src/config.js` | Defaults and fixed lists: first-run settings, designs, statuses, quote wording. |
| `src/state.js` | Shared data (`S`), numbering, the invoice model, totals (`compute`) and status (`docStatus`). |
| `src/render.js` | The three invoice designs (Bold, Grid, Soft) and their building blocks. |
| `src/page.js` | Live editing on the invoice, line items, dates, the one-page auto-fit. |
| `src/panels.js` | Right-hand options panel, toolbar, invoice list and overview. |
| `src/actions.js` | New, save, duplicate, delete, convert a quote into an invoice. |
| `src/clients.js` · `src/services.js` · `src/payments.js` | Client list, saved services, payments received. |
| `src/me.js` · `src/settings.js` | My details (your business, bank, logo, QR) and Settings. |
| `src/pdf.js` · `src/share.js` · `src/qr.js` | PDF export, WhatsApp/email/share, UPI QR codes. |
| `src/backup.js` | Backup files, folder backups, the pre-update copy, restoring. |
| `src/styles/app.css` · `src/styles/invoice.css` | App styles, and invoice-page styles (what prints). |
| `tests/unit` · `tests/e2e` | Vitest checks for formatting, Playwright checks of the whole app in Chrome. |

GST is built in but switched off: set `GST_FEATURE` to `true` in `src/config.js` to bring it back.
