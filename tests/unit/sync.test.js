import { describe, expect, it } from 'vitest';
import { COLLECTIONS, createSync, digest, plan, resolve } from '../../src/sync-engine.js';

const copy = o => JSON.parse(JSON.stringify(o));
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

/** A stand-in for Firestore: one shared copy of the data, live listeners, and a switch to make writes fail or hang. */
function fakeCloud() {
  const data = Object.fromEntries(COLLECTIONS.map(c => [c, {}])), subs = [];
  const cloud = {
    data, fail: null, hang: false,
    backend() {
      return {
        listen(coll, onDocs) {
          const sub = { coll, onDocs }; subs.push(sub);
          Promise.resolve().then(() => onDocs(copy(data[coll])));
          return () => subs.splice(subs.indexOf(sub), 1);
        },
        async commit(ops) {
          if (cloud.hang) return new Promise(() => {});
          await Promise.resolve();
          if (cloud.fail) throw new Error(cloud.fail);
          for (const { coll, id, value } of ops) if (value == null) delete data[coll][id]; else data[coll][id] = copy(value);
          for (const coll of new Set(ops.map(o => o.coll))) subs.filter(s => s.coll === coll).forEach(s => s.onDocs(copy(data[coll])));
        },
      };
    },
  };
  return cloud;
}

/** A pretend browser: its own local data and sync memory. */
function device(cloud, seed = {}) {
  const db = Object.fromEntries(COLLECTIONS.map(c => [c, copy(seed[c] || {})]));
  const dev = { db, saved: null, statuses: [] };
  dev.connect = () => {
    dev.sync = createSync({
      local: {
        read: c => copy(db[c]),
        apply: (c, ch) => { for (const [id, v] of Object.entries(ch)) if (v == null) delete db[c][id]; else db[c][id] = copy(v); },
      },
      backend: cloud.backend(),
      base: { load: () => dev.saved && copy(dev.saved), save: b => { dev.saved = copy(b); } },
      onStatus: s => dev.statuses.push(s),
    });
    dev.sync.start();
    return settle();
  };
  dev.edit = async (c, id, v) => { if (v == null) delete db[c][id]; else db[c][id] = v; dev.sync?.flush(); await settle(); };
  dev.disconnect = () => { dev.sync.stop(); dev.sync = null; };
  return dev;
}
const inv = (id, extra = {}) => ({ id, number: 'RCS-' + id, items: [{ id: 'a', qty: 1, rate: 100 }], updatedAt: 1, ...extra });

describe('digest', () => {
  it('ignores key order and undefined values', () => {
    expect(digest({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(digest({ b: { d: [1, 2], c: 2 }, a: 1, z: undefined }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});

describe('plan', () => {
  it('uploads local-only changes and applies cloud-only ones', () => {
    const B = { x: digest({ v: 1 }), y: digest({ v: 1 }) };
    const p = plan('clients', { x: { v: 2 }, y: { v: 1 } }, { x: { v: 1 }, y: { v: 3 } }, B);
    expect(p.toRemote).toEqual({ x: { v: 2 } });
    expect(p.toLocal).toEqual({ y: { v: 3 } });
  });
  it('first sign-in merges both sides', () => {
    const p = plan('clients', { a: { v: 1 } }, { b: { v: 2 } }, {});
    expect(p.toRemote).toEqual({ a: { v: 1 } });
    expect(p.toLocal).toEqual({ b: { v: 2 } });
  });
  it('a delete on one side removes it from the other', () => {
    const B = { a: digest({ v: 1 }) };
    expect(plan('services', {}, { a: { v: 1 } }, B).toRemote).toEqual({ a: null });
    expect(plan('services', { a: { v: 1 } }, {}, B).toLocal).toEqual({ a: null });
  });
});

describe('resolve (both sides changed)', () => {
  it('keeps the newer invoice', () => {
    expect(resolve('invoices', 'x', { updatedAt: 5, n: 'local' }, { updatedAt: 3, n: 'cloud' }).n).toBe('local');
    expect(resolve('invoices', 'x', { updatedAt: 2, n: 'local' }, { updatedAt: 3, n: 'cloud' }).n).toBe('cloud');
  });
  it('keeps an edit over a delete', () => {
    expect(resolve('invoices', 'x', null, { n: 1 })).toEqual({ n: 1 });
    expect(resolve('invoices', 'x', { n: 1 }, null)).toEqual({ n: 1 });
  });
  it('numbering never goes backwards and used numbers are combined', () => {
    expect(resolve('meta', 'counter', { value: { next: 7 } }, { value: { next: 4 } })).toEqual({ value: { next: 7 } });
    expect(resolve('meta', 'used', { value: ['RCS-0002', 'RCS-0001'] }, { value: ['RCS-0003', 'RCS-0001'] }).value).toEqual(['RCS-0001', 'RCS-0002', 'RCS-0003']);
  });
  it('your details: a placeholder or blank never replaces a real value', () => {
    const local = { value: { email: 'me@studio.in', phone: '98765', bank: { upi: 'me@ybl', ifsc: '[IFSC]' } } };
    const cloud = { value: { email: '[YOUR EMAIL]', phone: '91234', bank: { upi: '', ifsc: 'HDFC0001' } } };
    expect(resolve('meta', 'settings', local, cloud).value).toEqual({ email: 'me@studio.in', phone: '91234', bank: { upi: 'me@ybl', ifsc: 'HDFC0001' } });
  });
});

describe('two browsers syncing through the cloud', () => {
  it('the first browser uploads, the second downloads', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { invoices: { i1: inv('i1') }, meta: { counter: { value: { next: 2 } } } });
    await a.connect();
    expect(cloud.data.invoices.i1.number).toBe('RCS-i1');
    expect(a.statuses.at(-1)).toBe('synced');
    const b = device(cloud);
    await b.connect();
    expect(b.db.invoices.i1).toEqual(inv('i1'));
    expect(b.db.meta.counter.value.next).toBe(2);
  });

  it('edits and deletes reach the other browser, including the last item', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { services: { s1: { id: 's1', rate: 1 } } }), b = device(cloud);
    await a.connect(); await b.connect();
    await a.edit('services', 's1', { id: 's1', rate: 2 });
    expect(b.db.services.s1.rate).toBe(2);
    await b.edit('services', 's1', null);
    expect(cloud.data.services).toEqual({});
    expect(a.db.services).toEqual({});
  });

  it('first sign-in on two browsers with different data keeps everything', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { invoices: { i1: inv('i1') }, clients: { c1: { id: 'c1', company: 'Kidooza' } } });
    const b = device(cloud, { invoices: { i2: inv('i2') }, clients: { c2: { id: 'c2', company: 'Northwind' } } });
    await a.connect(); await b.connect(); await settle();
    for (const d of [a, b]) {
      expect(Object.keys(d.db.invoices).sort()).toEqual(['i1', 'i2']);
      expect(Object.keys(d.db.clients).sort()).toEqual(['c1', 'c2']);
    }
  });

  it('changes made while offline merge when back online', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { invoices: { i1: inv('i1'), i2: inv('i2') } }), b = device(cloud);
    await a.connect(); await b.connect();
    b.disconnect();
    await a.edit('invoices', 'i1', inv('i1', { status: 'paid', updatedAt: 5 }));
    await b.edit('invoices', 'i2', inv('i2', { status: 'sent', updatedAt: 6 }));
    await b.edit('invoices', 'i3', inv('i3'));
    await b.connect(); await settle();
    for (const d of [a, b]) {
      expect(d.db.invoices.i1.status).toBe('paid');
      expect(d.db.invoices.i2.status).toBe('sent');
      expect(d.db.invoices.i3).toBeTruthy();
    }
  });

  it('the same invoice edited on both while offline: the newer edit wins everywhere', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { invoices: { i1: inv('i1') } }), b = device(cloud);
    await a.connect(); await b.connect();
    a.disconnect(); b.disconnect();
    await a.edit('invoices', 'i1', inv('i1', { note: 'from A', updatedAt: 10 }));
    await b.edit('invoices', 'i1', inv('i1', { note: 'from B', updatedAt: 20 }));
    await a.connect(); await b.connect(); await settle();
    for (const d of [a, b]) expect(d.db.invoices.i1.note).toBe('from B');
    expect(cloud.data.invoices.i1.note).toBe('from B');
  });

  it('a failed upload reports an error and is retried with the next change', async () => {
    const cloud = fakeCloud();
    const a = device(cloud);
    await a.connect();
    cloud.fail = 'Missing or insufficient permissions.';
    await a.edit('clients', 'c1', { id: 'c1' });
    expect(a.statuses.at(-1)).toBe('error');
    expect(cloud.data.clients).toEqual({});
    cloud.fail = null;
    await a.edit('clients', 'c2', { id: 'c2' });
    expect(Object.keys(cloud.data.clients).sort()).toEqual(['c1', 'c2']);
    expect(a.statuses.at(-1)).toBe('synced');
  });

  it('an upload that never finished is sent again next time, not overwritten by the cloud', async () => {
    const cloud = fakeCloud();
    const a = device(cloud, { invoices: { i1: inv('i1') } });
    await a.connect();
    cloud.hang = true;                                  // e.g. the tab closed while offline
    await a.edit('invoices', 'i1', inv('i1', { status: 'paid', updatedAt: 9 }));
    a.disconnect(); cloud.hang = false;
    await a.connect();
    expect(cloud.data.invoices.i1.status).toBe('paid');
    expect(a.db.invoices.i1.status).toBe('paid');
  });
});
