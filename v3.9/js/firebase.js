import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from './store.js';

const firebaseConfig = {
  apiKey: "AIzaSyB1fCtAmK2KqdIxHDuq9B4S99rjY0dVKGo",
  authDomain: "finhq-ac746.firebaseapp.com",
  databaseURL: "https://finhq-ac746-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "finhq-ac746",
  storageBucket: "finhq-ac746.firebasestorage.app",
  messagingSenderId: "911113256083",
  appId: "1:911113256083:web:e6ae330df96d95de71e166",
  measurementId: "G-FB35WP6QNW"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Priority-tiered Firestore loading ─────────────────────────────────────────
//
//  Tier 1 — CRITICAL  (transactions, assets, debts)
//    The dashboard net-worth card needs all three. We call store.setLoaded()
//    only after all three arrive, so the hub renders correctly on first paint.
//
//  Tier 2 — SECONDARY  (events, recurring)
//    Needed by the Events module and SIP/Auto module. Opened as soon as
//    Tier 1 is done so they're ready by the time the user navigates there.
//
//  Tier 3 — BACKGROUND  (fuel, serviceLog, budgets, goals, realisedGains)
//    Vehicle logs, export planning data — rarely urgent. Opened last to keep
//    network contention low during initial load.

function openListener(col) {
  onSnapshot(
    query(collection(db, col), orderBy('timestamp', 'desc')),
    snap => store.update(col, snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error(`Sync error [${col}]:`, err)
  );
}

export function initGlobalListeners() {
  // ── Tier 1: open all three, mark loaded once all three have responded ────
  const tier1 = ['transactions', 'assets', 'debts'];
  const tier1Done = new Set();

  tier1.forEach(col => {
    onSnapshot(
      query(collection(db, col), orderBy('timestamp', 'desc')),
      snap => {
        store.update(col, snap.docs.map(d => ({ id: d.id, ...d.data() })));
        tier1Done.add(col);

        if (!store.isLoaded && tier1Done.size === tier1.length) {
          store.setLoaded();         // ← hub renders here, typically <1 s
          openTier2();
        }
      },
      err => console.error(`Sync error [${col}]:`, err)
    );
  });

  // ── Tier 2: opened after Tier 1 resolves ────────────────────────────────
  function openTier2() {
    ['events', 'recurring'].forEach(openListener);
    setTimeout(openTier3, 800); // give Tier 2 a head start before Tier 3
  }

  // ── Tier 3: background, no rush ─────────────────────────────────────────
  function openTier3() {
    ['fuel', 'serviceLog', 'realisedGains'].forEach(openListener);
  }
}

export { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, onSnapshot, query, orderBy };
