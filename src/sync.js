import { DATA_KEYS, DEFAULT_SETTINGS, TEMPLATES } from './config.js';
import { persistWorking, renderAll } from './panels.js';
import { S, migrate, used } from './state.js';
import { createSync } from './sync-engine.js';
import { toast } from './ui.js';
import { $, LS, clone, esc, merge, onSaved } from './util.js';

/* =====================================================================
   CLOUD SYNC — sign in with Google and the same invoices, clients,
   services and details appear on every device. This browser keeps its
   own full copy, so the app works offline and syncs when it can.
   ===================================================================== */

const COLL_OF = { invoices: 'invoices', clients: 'clients', services: 'services', logos: 'logos', settings: 'meta', counter: 'meta', counterQ: 'meta', used: 'meta' };
const META = ['settings', 'counter', 'counterQ', 'used'];
const LISTS = ['invoices', 'clients', 'services'];

let cloud = null, engine = null, account = LS.get('sync', null), state = 'off', problem = '', applying = false, dupWarned = false;
const loadCloud = () => (cloud ??= import('./cloud.js').catch(e => { cloud = null; throw e; }));

/* ---------- this browser's data, as documents ---------- */
const local = {
  read(coll) {
    if (LISTS.includes(coll)) return Object.fromEntries(S[coll].map(x => [x.id, x]));
    if (coll === 'logos') return Object.fromEntries(Object.entries(S.logos).map(([id, data]) => [id, { data }]));
    // Only settings you've actually saved: a new browser's defaults never overwrite your real details.
    const value = { settings: S.settings, counter: S.counter, counterQ: S.counterQ, used: [...used].sort() };
    return Object.fromEntries(META.filter(k => localStorage.getItem('rcs.' + k) != null).map(k => [k, { value: value[k] }]));
  },
  apply(coll, changes) {
    applying = true;
    try {
      if (LISTS.includes(coll)) {
        for (const [id, v] of Object.entries(changes)) {
          const i = S[coll].findIndex(x => x.id === id);
          if (v == null) { if (i >= 0) S[coll].splice(i, 1); } else if (i >= 0) S[coll][i] = v; else S[coll].push(v);
        }
        LS.set(coll, S[coll]);
      } else if (coll === 'logos') {
        for (const [id, v] of Object.entries(changes)) if (v == null) delete S.logos[id]; else S.logos[id] = v.data;
        LS.set('logos', S.logos);
      } else {
        for (const [k, v] of Object.entries(changes)) {
          if (v == null || !META.includes(k)) continue;
          if (k === 'settings') {
            S.settings = merge(DEFAULT_SETTINGS, v.value);
            if (!TEMPLATES[S.settings.defaultTemplate]) S.settings.defaultTemplate = 'bold';
            S.qrCache = { key: '', url: '' };
          } else if (k === 'used') { used.clear(); v.value.forEach(n => used.add(n)); }
          else S[k] = v.value;
          LS.set(k, k === 'used' ? [...used] : S[k]);
        }
      }
    } finally { applying = false; }
  },
};

// After changes arrive from another device: refresh the open invoice (unless you're
// editing it) and redraw.
let redraw = 0;
function applied(coll, changes) {
  if (coll === 'invoices' && S.cur.id in changes && !S.dirty) {
    const fresh = S.invoices.find(i => i.id === S.cur.id);
    if (fresh) { S.cur = migrate(clone(fresh)); persistWorking(); }
  }
  if (coll === 'invoices' && !dupWarned) {
    const seen = new Set(), dup = S.invoices.map(i => i.number).find(n => n && (seen.has(n) || !seen.add(n)));
    if (dup) { dupWarned = true; toast(`Two saved documents both use ${dup} — check them in the list`); }
  }
  cancelAnimationFrame(redraw); redraw = requestAnimationFrame(renderAll);
}

onSaved.add(k => { if (!applying && engine && DATA_KEYS.includes(k)) engine.changed(COLL_OF[k]); });

/* ---------- signing in and out ---------- */
function start(user, c) {
  if (engine && account?.uid === user.uid) return;           // already syncing this account
  let announce = account?.uid !== user.uid;
  account = { uid: user.uid, email: user.email || '', name: user.displayName || '' };
  LS.set('sync', account);
  engine?.stop();
  engine = createSync({
    local, backend: c.backend(user.uid), onApplied: applied,
    // What was last in step with the cloud, for this account only.
    base: { load: () => { const b = LS.get('syncBase', null); return b?.uid === user.uid ? b.base : null; }, save: base => LS.set('syncBase', { uid: user.uid, base }) },
    onStatus: (s, detail) => {
      state = s; problem = detail || ''; render();
      if (announce && s === 'synced') { announce = false; toast('Signed in — your invoices now sync across your devices'); }
    },
  });
  engine.start();
}
function stop() { engine?.stop(); engine = null; state = 'off'; }
function forget() { stop(); account = null; localStorage.removeItem('rcs.sync'); localStorage.removeItem('rcs.syncBase'); render(); }

// Follow the Firebase sign-in state (set up once, the first time Firebase loads).
let watching = false, leaving = false;
async function watch() {
  const c = await loadCloud();
  if (watching) return c;
  watching = true;
  c.onUser(user => {
    if (user) start(user, c);
    else if (account && !leaving) { forget(); toast('You were signed out — sign in again to keep syncing'); }
  });
  return c;
}

async function signIn() {
  state = 'signing-in'; render();
  try { await (await watch()).signIn(); }
  catch (e) {
    state = 'off'; render();
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) return;
    toast(e.code === 'auth/popup-blocked' ? 'The browser blocked the sign-in window — allow pop-ups for this site and try again.' : 'Could not sign in: ' + (e.message || e));
  }
}
async function signOut(clearBrowser) {
  if (engine?.pending && !confirm('Some changes are still uploading. Sign out anyway? They stay in this browser.')) return;
  if (clearBrowser && !confirm('Sign out and remove all invoices, clients and details from this browser?\n\nEverything stays in your account — sign in again to get it back.')) return;
  leaving = true;
  try { await (await loadCloud()).signOutUser(); } finally { leaving = false; }
  forget();
  if (clearBrowser) {
    for (const k of Object.keys(localStorage)) if (k.startsWith('rcs.')) localStorage.removeItem(k);
    location.reload();
  } else toast('Signed out — your data stays in this browser');
}

// Signed in before → reconnect quietly on start-up.
if (account) watch().catch(() => { state = 'error'; problem = 'Could not load sync — check your connection.'; render(); });
addEventListener('online', render); addEventListener('offline', render);
// Firebase takes several seconds to notice a sign-in window closed without signing in;
// back in the app, show the button as ready again sooner.
addEventListener('focus', () => setTimeout(() => { if (state === 'signing-in' && !account) { state = 'off'; render(); } }, 1500));

/* ---------- toolbar button and menu ---------- */
const btn = $('#tSync'), menu = $('#syncMenu');
const LABEL = { off: 'Sign in to sync', 'signing-in': 'Signing in…', connecting: 'Connecting…', syncing: 'Syncing…', synced: 'Synced', error: 'Sync problem', offline: 'Offline' };
function friendly(msg) {
  return /insufficient permissions|permission-denied/i.test(msg) ? 'Firebase is refusing access. Publish the rules (Firebase console → Firestore Database → Rules), then click Sync now — it also keeps retrying by itself.' : msg;
}
export function render() {
  const shown = account && state !== 'off' && !navigator.onLine ? 'offline' : account ? (state === 'off' ? 'connecting' : state) : state;
  btn.dataset.state = shown;
  $('#syncLabel').textContent = LABEL[shown];
  btn.title = account ? `Syncing as ${account.email}` : 'Sign in with Google to keep your invoices on all your devices';
  $('#syncWho').innerHTML = account
    ? `Signed in as <b>${esc(account.email)}</b>${shown === 'error' ? `<em>${esc(friendly(problem))}</em>` : ''}`
    : '';
}
btn.addEventListener('pointerenter', () => { if (!account) loadCloud().catch(() => {}); }, { once: true });   // get Firebase ready before the click
btn.addEventListener('click', e => {
  e.stopPropagation();
  if (!account) { signIn(); return; }
  menu.classList.toggle('menu--right', btn.getBoundingClientRect().left > innerWidth / 2);   // open towards the room
  menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
});
menu.addEventListener('click', e => {
  const b = e.target.closest('[data-sync]'); if (!b) return;
  menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
  if (b.dataset.sync === 'now') { engine?.flush(); toast('Syncing…'); }
  else signOut(b.dataset.sync === 'clear');
});
document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
render();
