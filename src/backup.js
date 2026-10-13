import { del, get, set } from 'idb-keyval';
import { DATA_KEYS, DEFAULT_SETTINGS, TEMPLATES } from './config.js';
import { dlg } from './dom.js';
import { todayISO } from './format.js';
import { persistWorking, renderAll } from './panels.js';
import { S, clientsFromInvoices, migrate, newInvoice, ui, used } from './state.js';
import { toast } from './ui.js';
import { $, LS, clone, esc, merge, onSaved } from './util.js';

/* =====================================================================
   BACKUPS — everything lives in this browser, so keep copies elsewhere
   ===================================================================== */

// A one-time copy of all your data as it was before this version first ran,
// kept in the browser's IndexedDB (separate from localStorage).
const SNAPSHOT = 'snapshot:before-v3';
const before = {};
for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('rcs.')) before[k] = localStorage.getItem(k); }
let snapshotAt = 0;
get(SNAPSHOT).then(have => {
  if (have) { snapshotAt = have.at; return; }
  if (!Object.keys(before).length) return;       // brand-new browser: nothing to protect
  return set(SNAPSHOT, { at: Date.now(), data: before }).then(() => { snapshotAt = Date.now(); });
}).catch(() => { /* IndexedDB unavailable (private window) */ }).finally(renderBackupStatus);

export function backupData() {
  return {
    app: 'rcs-invoices', version: 3, exportedAt: new Date().toISOString(),
    settings: S.settings, invoices: S.invoices, counter: S.counter, counterQ: S.counterQ, used: [...used],
    logos: S.logos, clients: S.clients, services: S.services,
  };
}
const ago = ts => {
  const m = Math.round((Date.now() - ts) / 6e4);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const markBackedUp = () => { ui.lastBackup = Date.now(); LS.set('ui', ui); renderBackupStatus(); };

export function downloadBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(backupData(), null, 2)], { type: 'application/json' }));
  a.download = `rcs-invoices-backup-${todayISO()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  markBackedUp();
  toast('Backup downloaded — keep a copy somewhere safe, like Google Drive');
}

/* ---------- automatic backups to a folder (Chrome / Edge) ---------- */
const canUseFolder = 'showDirectoryPicker' in window;
let dir = null, permission = 'none', timer, lastError = '';
get('backupDir').then(async h => {
  if (!h) return;
  dir = h;
  try { permission = await dir.queryPermission({ mode: 'readwrite' }); } catch { permission = 'prompt'; }
}).catch(() => {}).finally(renderBackupStatus);

async function chooseFolder() {
  try { dir = await window.showDirectoryPicker({ id: 'rcs-backups', mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Could not use that folder.'); return; }
  await set('backupDir', dir).catch(() => {});
  permission = 'granted';
  if (await writeFolderBackup()) toast(`Backing up to “${dir.name}” after every change`);
}
async function resumeFolder() {
  if (!dir) return;
  try { permission = await dir.requestPermission({ mode: 'readwrite' }); } catch { permission = 'denied'; }
  if (permission === 'granted' && await writeFolderBackup()) toast('Automatic backups resumed');
  renderBackupStatus();
}
async function stopFolder() {
  dir = null; permission = 'none';
  await del('backupDir').catch(() => {});
  renderBackupStatus(); toast('Automatic backups stopped');
}
export async function writeFolderBackup() {
  if (!dir || permission !== 'granted') return false;
  try {
    const json = JSON.stringify(backupData(), null, 2);
    for (const name of ['recreation-invoices-latest.json', `recreation-invoices-${todayISO()}.json`]) {
      const file = await dir.getFileHandle(name, { create: true });
      const w = await file.createWritable(); await w.write(json); await w.close();
    }
    lastError = ''; markBackedUp(); return true;
  } catch (e) { lastError = e.message || String(e); renderBackupStatus(); return false; }
}
// Any change to your data → back up to the folder a moment later.
onSaved.add(k => {
  if (!DATA_KEYS.includes(k)) return;
  if (dir && permission === 'granted') { clearTimeout(timer); timer = setTimeout(writeFolderBackup, 1500); }
  else renderNudge();
});

/* ---------- status: reminder in the list, details in Settings ---------- */
export function renderNudge() {
  const n = $('#backupNudge'); if (!n) return;
  const paused = dir && permission !== 'granted', stale = !ui.lastBackup || Date.now() - ui.lastBackup > 7 * 864e5;
  const show = S.invoices.length > 0 && (paused || (!dir && stale));
  n.hidden = !show; if (!show) return;
  n.innerHTML = paused
    ? '<span>Automatic backups are paused.</span><button class="btn btn--sm" type="button" data-backup="resume">Resume</button>'
    : `<span>${ui.lastBackup ? `Last backup ${ago(ui.lastBackup)}.` : 'Your invoices have never been backed up.'}</span><button class="btn btn--sm" type="button" data-backup="download">Back up now</button>`;
}
export function renderBackupStatus() {
  renderNudge();
  const box = $('#backupBox'); if (!box) return;
  let folder;
  if (!canUseFolder) folder = '<p class="hint">Automatic folder backups need Chrome or Edge. Here, download a backup now and then instead.</p>';
  else if (!dir) folder = '<p class="hint">Choose a folder — ideally one synced to Google Drive or OneDrive — and every change is saved there automatically: a latest copy, plus one copy per day.</p><button class="btn btn--sm btn--primary" type="button" data-backup="folder" style="margin-top:10px">Choose backup folder</button>';
  else if (permission !== 'granted') folder = `<p class="hint">Backups to “<b>${esc(dir.name)}</b>” are paused — the browser asks again after a restart.</p><div class="cl-btns" style="margin-top:10px"><button class="btn btn--sm btn--primary" type="button" data-backup="resume">Resume backups</button><button class="btn btn--ghost btn--sm" type="button" data-backup="stop">Stop</button></div>`;
  else folder = `<p class="hint">Backing up automatically to “<b>${esc(dir.name)}</b>”.${lastError ? ` The last try failed: ${esc(lastError)}` : ''}</p><button class="btn btn--ghost btn--sm" type="button" data-backup="stop" style="margin-top:6px">Stop automatic backups</button>`;
  box.innerHTML = `<p class="hint" style="margin-bottom:8px"><b>${ui.lastBackup ? `Last backup ${ago(ui.lastBackup)}.` : 'No backup yet.'}</b></p>${folder}
    <div class="cl-btns" style="margin-top:14px">
      <button class="btn btn--sm" type="button" data-backup="download">Download a backup file</button>
      <button class="btn btn--sm" type="button" data-backup="import">Restore from a backup file</button>
      ${snapshotAt ? '<button class="btn btn--ghost btn--sm" type="button" data-backup="snapshot">Restore the pre-update copy</button>' : ''}
    </div>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-backup]'); if (!b) return;
  ({
    download: downloadBackup, folder: chooseFolder, resume: resumeFolder, stop: stopFolder,
    import: () => $('#importFile').click(), snapshot: restoreSnapshot,
  })[b.dataset.backup]?.();
});

/* ---------- restoring ---------- */
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.app !== 'rcs-invoices' || !Array.isArray(d.invoices)) throw new Error('bad file');
      if (!confirm(`Replace all current data with this backup (${d.invoices.length} invoices and quotes)?`)) return;
      S.settings = merge(DEFAULT_SETTINGS, d.settings || {}); S.invoices = d.invoices; S.counter = d.counter || S.counter; S.counterQ = d.counterQ || S.counterQ;
      S.logos = d.logos || {}; S.clients = Array.isArray(d.clients) ? d.clients : clientsFromInvoices(); S.services = Array.isArray(d.services) ? d.services : [];
      if (!TEMPLATES[S.settings.defaultTemplate]) S.settings.defaultTemplate = 'bold';
      used.clear(); (d.used || []).forEach(x => used.add(x)); S.invoices.forEach(i => i.number && used.add(i.number));
      for (const k of ['settings', 'invoices', 'counter', 'counterQ', 'logos', 'clients', 'services']) LS.set(k, S[k]);
      LS.set('used', [...used]);
      S.cur = S.invoices.length ? migrate(clone(S.invoices[S.invoices.length - 1])) : newInvoice(); S.dirty = false; persistWorking();
      dlg.close(); renderAll(); toast('Backup restored');
    } catch { toast('That file is not a valid invoice backup.'); }
  };
  r.readAsText(f);
});
async function restoreSnapshot() {
  const snap = await get(SNAPSHOT).catch(() => null); if (!snap) return;
  if (!confirm(`Go back to your data as it was on ${new Date(snap.at).toLocaleString()}, before this update?\n\nAnything you changed since then will be replaced.`)) return;
  for (const k of Object.keys(localStorage)) if (k.startsWith('rcs.')) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(snap.data)) localStorage.setItem(k, v);
  location.reload();
}
