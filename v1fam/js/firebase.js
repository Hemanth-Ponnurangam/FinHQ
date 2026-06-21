import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { store } from './store.js';

const firebaseConfig = {
  apiKey: "AIzaSyB1fCtAmK2KqdIxHDuq9B4S99rjY0dVKGo",
  authDomain: "finhq-ac746.firebaseapp.com",
  databaseURL: "https://finhq-ac746-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "finhq-ac746",
  storageBucket: "finhq-ac746.firebasestorage.app",
  messagingSenderId: "911113256083",
  appId: "1:911113256083:web:e6ae330df96d95de71e166",
  measurementId: "G-FB35WP6QNW",
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── Auth helpers ─────────────────────────────────────────────────────────────
export const authLogin    = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const authRegister = (email, pw) => createUserWithEmailAndPassword(auth, email, pw);
export const authSetName  = (name)      => updateProfile(auth.currentUser, { displayName: name });
export const authLogout   = ()          => signOut(auth);

// ── Active Firestore listeners — stored so they can be torn down on logout ───
let _activeUnsubs = [];

function killListeners() {
  _activeUnsubs.forEach(u => u());
  _activeUnsubs = [];
}

// ── Per-user collection path ─────────────────────────────────────────────────
// All user data lives under  users/{uid}/{collection}
// Family data lives under  families/{familyId}/{collection}  (read-only here)
function userCol(col) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return collection(db, 'users', uid, col);
}

function openUserListener(col) {
  const q = query(userCol(col), orderBy('timestamp', 'desc'));
  const unsub = onSnapshot(
    q,
    snap => store.update(col, snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error(`Sync error [${col}]:`, err)
  );
  _activeUnsubs.push(unsub);
}

// ── Priority-tiered Firestore loading ────────────────────────────────────────
//  Tier 1 — CRITICAL  (transactions, assets, debts) — setLoaded() after all three
//  Tier 2 — SECONDARY (events, recurring)
//  Tier 3 — BACKGROUND (fuel, serviceLog, realisedGains)

export function initGlobalListeners() {
  const tier1 = ['transactions', 'assets', 'debts'];
  const tier1Done = new Set();

  tier1.forEach(col => {
    const q = query(userCol(col), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => {
        store.update(col, snap.docs.map(d => ({ id: d.id, ...d.data() })));
        tier1Done.add(col);
        if (!store.isLoaded && tier1Done.size === tier1.length) {
          store.setLoaded();
          openTier2();
        }
      },
      err => console.error(`Sync error [${col}]:`, err)
    );
    _activeUnsubs.push(unsub);
  });

  function openTier2() {
    ['events', 'recurring'].forEach(openUserListener);
    setTimeout(openTier3, 800);
  }
  function openTier3() {
    ['fuel', 'serviceLog', 'realisedGains'].forEach(openUserListener);
  }
}

// ── Auth state machine ───────────────────────────────────────────────────────
// Called once from app.js.  Fires the appropriate callback whenever the
// signed-in user changes (login / logout / page refresh with session cookie).
export function watchAuth({ onLogin, onLogout }) {
  onAuthStateChanged(auth, user => {
    if (user) {
      onLogin(user);
    } else {
      // Tear down all Firestore listeners and reset store before showing login
      killListeners();
      store.reset();
      onLogout();
    }
  });
}

// Family module listener — opened by initFamily()
export function openFamilyListener(familyId, onData) {
  const q = query(collection(db, 'families', familyId, 'members'));
  const unsub = onSnapshot(q, snap => {
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
  _activeUnsubs.push(unsub);
  return unsub;
}

export {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot, query, orderBy, where,
  userCol,
};
