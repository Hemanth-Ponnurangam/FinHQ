// --- Firebase Initialization ---
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create the database reference (this becomes globally available to app.js)
const db = firebase.firestore();