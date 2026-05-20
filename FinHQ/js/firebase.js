import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from './store.js';

// ⚠️ PASTE YOUR CONFIG HERE ⚠️
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

// Single coordinated load for the entire application
export function initGlobalListeners() {
  const collections = ['transactions', 'assets', 'debts', 'budgets', 'goals', 'recurring'];
  let loadedCount = 0;

  collections.forEach(col => {
    onSnapshot(query(collection(db, col), orderBy("timestamp", "desc")), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      store.update(col, data);
      
      // Only reveal the UI once the initial data load is complete
      if (!store.isLoaded) {
        loadedCount++;
        if (loadedCount === collections.length) store.setLoaded();
      }
    }, (err) => console.error(`Offline or Error syncing ${col}:`, err));
  });
}

export { collection, addDoc, doc, updateDoc, deleteDoc };





