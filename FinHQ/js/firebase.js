
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { store } from './store.js';

// Replace with your keys!
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

// Single coordinated load for all modules
export function initGlobalListeners() {
  const collections = ['transactions', 'assets', 'debts', 'budgets', 'goals', 'recurring'];
  collections.forEach(col => {
    onSnapshot(query(collection(db, col), orderBy("timestamp", "desc")), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      store.update(col, data);
    }, (err) => console.error(`Error syncing ${col}:`, err));
  });
}





