// Firebase: Google sign-in and the Firestore copy of your data. Loaded only when
// you sign in (or were signed in before), so the app stays light without it.
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, initializeFirestore, onSnapshot, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

export const onUser = cb => onAuthStateChanged(auth, cb);
export function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
export const signOutUser = () => signOut(auth);

const MAX_DOC = 1_000_000;   // Firestore's limit is 1 MiB per document

/** Each person's data lives under users/{their id}/…, one document per invoice, client, service, logo and setting. */
export function backend(uid) {
  const ref = (coll, id) => doc(db, 'users', uid, coll, id);
  return {
    listen(coll, onDocs, onError) {
      return onSnapshot(collection(db, 'users', uid, coll), { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache) return;          // only trust what the server has confirmed
        const docs = {};
        snap.forEach(d => { docs[d.id] = d.data(); });
        onDocs(docs);
      }, onError);
    },
    async commit(ops) {
      for (const o of ops) if (o.value != null && JSON.stringify(o.value).length > MAX_DOC) throw new Error(`One ${o.coll === 'meta' ? 'setting' : o.coll.replace(/s$/, '')} is too large to sync — try a smaller logo or QR image.`);
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        for (const { coll, id, value } of ops.slice(i, i + 400)) value == null ? batch.delete(ref(coll, id)) : batch.set(ref(coll, id), value);
        await batch.commit();
      }
    },
  };
}
