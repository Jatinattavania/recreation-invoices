/* =====================================================================
   SYNC ENGINE — keeps this browser's data and the cloud copy in step.
   No DOM and no Firebase here: the app passes in how to read/apply local
   data (`local`) and how to talk to the cloud (`backend`), so the logic can
   be tested on its own.

   Data is grouped into collections of documents ({ id: value }). For every
   document we remember the version both sides last agreed on (`base`, as a
   hash). Comparing local and cloud against it tells us who changed what:
     only local changed  → upload        only cloud changed → apply here
     both changed        → resolve (newest invoice wins, numbers never go backwards…)
   ===================================================================== */

export const COLLECTIONS = ['invoices', 'clients', 'services', 'logos', 'meta'];

// JSON with sorted keys, so the same data always hashes the same (the cloud
// returns fields in its own order). Undefined values are dropped, as JSON and Firestore do.
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
// cyrb53: a fast 53-bit string hash.
export function digest(v) {
  const s = stable(v); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const blank = s => typeof s !== 'string' || !s.trim() || /^\[[^\]]*\]$/.test(s.trim());   // '' or a [PLACEHOLDER]
// Your details changed on both sides: keep the cloud's, but never let an empty or
// placeholder field wipe a real one.
function preferReal(r, l) {
  if (r && l && typeof r === 'object' && typeof l === 'object' && !Array.isArray(r)) {
    const out = { ...l, ...r };
    for (const k of Object.keys(r)) out[k] = preferReal(r[k], l[k]);
    return out;
  }
  return typeof r === 'string' && blank(r) && !blank(l) ? l : r;
}
const stamp = d => +(d?.updatedAt || d?.createdAt || 0);

/** Both sides changed the same document since they last agreed. Returns the value to keep. */
export function resolve(coll, id, l, r) {
  if (l == null) return r;                       // edited on one side, deleted on the other → keep the edit
  if (r == null) return l;
  if (coll === 'meta') {
    if (id === 'used') return { value: [...new Set([...(r.value || []), ...(l.value || [])])].sort() };
    if (id === 'counter' || id === 'counterQ') return (+l.value?.next || 0) > (+r.value?.next || 0) ? l : r;
    if (id === 'settings') return { value: preferReal(r.value, l.value) };
    return r;
  }
  return stamp(l) > stamp(r) ? l : r;
}

/**
 * Work out what to do for one collection.
 * L, R: { id: value } for local and cloud. B: { id: hash } last agreed.
 * Returns { toLocal: {id: value|null}, toRemote: {id: value|null}, agreed: {id: hash|null} }.
 */
export function plan(coll, L, R, B = {}) {
  const toLocal = {}, toRemote = {}, agreed = {};
  for (const id of new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(B)])) {
    const l = L[id], r = R[id], hl = l == null ? null : digest(l), hr = r == null ? null : digest(r), b = B[id] ?? null;
    if (hl === hr) { agreed[id] = hl; continue; }
    const localChanged = hl !== b, remoteChanged = hr !== b;
    if (!localChanged) { toLocal[id] = r ?? null; agreed[id] = hr; }
    else if (!remoteChanged) toRemote[id] = l ?? null;
    else {
      const v = resolve(coll, id, l, r), hv = digest(v);
      if (hv !== hl) toLocal[id] = v;
      if (hv !== hr) toRemote[id] = v; else agreed[id] = hv;
    }
  }
  return { toLocal, toRemote, agreed };
}

/**
 * local:   { read(coll) → {id: value}, apply(coll, {id: value|null}) }
 * backend: { listen(coll, onDocs({id: value}), onError) → unsubscribe, commit([{ coll, id, value|null }]) → Promise }
 * base:    { load() → {coll: {id: hash}}, save(obj) } — kept with the local data, so a browser
 *          whose data is cleared also forgets it, and simply merges with the cloud again.
 * onStatus(state, detail): 'connecting' | 'syncing' | 'synced' | 'error'
 * After an error (e.g. the cloud refusing access) it tries again by itself, waiting
 * `retryDelay` at first and up to a minute between tries.
 */
export function createSync({ local, backend, base: store, onStatus = () => {}, onApplied = () => {}, delay = 600, retryDelay = 5000 }) {
  const base = store.load() || {};
  const remote = {};                      // latest cloud state per collection (from the server)
  const inflight = {};                    // coll → id → hash being uploaded
  const timers = {}, unsubs = {};
  const listenErr = {};                   // coll → why the cloud stopped sending it
  let pending = 0, commitErr = '', stopped = false, retryTimer = 0, wait = retryDelay;

  const error = () => commitErr || Object.values(listenErr)[0] || '';
  const status = () => onStatus(error() ? 'error' : COLLECTIONS.some(c => !remote[c]) ? 'connecting' : pending ? 'syncing' : 'synced', error());
  const saveBase = () => store.save(base);
  const message = e => e?.message || String(e);

  function retryLater() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = 0; wait = Math.min(wait * 2, 60000); retry(); }, wait);
  }
  function retry() {
    clearTimeout(retryTimer); retryTimer = 0;
    for (const coll of Object.keys(listenErr)) listen(coll);
    COLLECTIONS.forEach(reconcile);       // re-sends uploads that failed
  }

  // A cloud listener that hits an error stops for good, so start a fresh one to retry.
  function listen(coll) {
    unsubs[coll]?.();
    unsubs[coll] = backend.listen(coll, docs => {
      remote[coll] = docs;
      if (coll in listenErr) { delete listenErr[coll]; if (!error()) wait = retryDelay; }
      reconcile(coll);
    }, e => { listenErr[coll] = message(e); status(); retryLater(); });
  }

  function reconcile(coll) {
    if (stopped || !remote[coll]) return;
    const L = local.read(coll), R = remote[coll], B = (base[coll] ??= {});
    const { toLocal, toRemote, agreed } = plan(coll, L, R, B);
    const busy = inflight[coll] ??= {};
    // A document still uploading isn't agreed until the cloud confirms it.
    for (const [id, h] of Object.entries(agreed)) if (!(id in busy)) { if (h == null) delete B[id]; else B[id] = h; }
    if (Object.keys(toLocal).length) { local.apply(coll, toLocal); onApplied(coll, toLocal); }
    const ops = Object.entries(toRemote).filter(([id, v]) => busy[id] !== (v == null ? null : digest(v))).map(([id, value]) => ({ coll, id, value }));
    saveBase();
    if (!ops.length) return status();
    ops.forEach(o => { busy[o.id] = o.value == null ? null : digest(o.value); });
    pending++; status();
    backend.commit(ops).then(() => {
      for (const o of ops) {
        const h = o.value == null ? null : digest(o.value);
        if (busy[o.id] === h) delete busy[o.id];
        if (h == null) delete B[o.id]; else B[o.id] = h;
      }
      commitErr = ''; if (!error()) wait = retryDelay;
      saveBase();
    }, e => {
      for (const o of ops) delete busy[o.id];
      commitErr = message(e); retryLater();
    }).finally(() => { pending--; status(); });
  }

  return {
    start() { status(); COLLECTIONS.forEach(listen); },
    /** Local data in `coll` changed: upload it shortly. */
    changed(coll) { clearTimeout(timers[coll]); timers[coll] = setTimeout(() => reconcile(coll), delay); },
    /** Reconnect anything that failed and upload anything waiting, right now. */
    flush() { COLLECTIONS.forEach(c => clearTimeout(timers[c])); wait = retryDelay; retry(); },
    stop() { stopped = true; clearTimeout(retryTimer); Object.values(unsubs).forEach(u => u()); COLLECTIONS.forEach(c => clearTimeout(timers[c])); },
    get pending() { return pending; },
  };
}
