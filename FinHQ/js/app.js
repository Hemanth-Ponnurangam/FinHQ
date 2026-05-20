// 1. IMPORT DATABASE CONNECTION
import { db, collection, addDoc } from './firebase.js';

// ==========================================
// 2. UI CONTROLS (Bottom Sheet Animations)
// ==========================================
const fabBtn = document.getElementById('fabBtn');
const bottomSheet = document.getElementById('bottomSheet');
const overlay = document.getElementById('bottomSheetOverlay');
const closeBtn = document.getElementById('closeSheetBtn');

function openSheet() {
  overlay.classList.remove('hidden');
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    bottomSheet.classList.remove('translate-y-full');
  }, 10);
}

function closeSheet() {
  overlay.classList.add('opacity-0');
  bottomSheet.classList.add('translate-y-full');
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 300);
}

if(fabBtn) fabBtn.addEventListener('click', openSheet);
if(closeBtn) closeBtn.addEventListener('click', closeSheet);
if(overlay) overlay.addEventListener('click', closeSheet);


// ==========================================
// 3. CORE LOGIC (Save to Firebase)
// ==========================================
const form = document.getElementById('ledgerForm');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Stops the page from refreshing

    const amount = document.getElementById('txnAmount').value;
    const title = document.getElementById('txnTitle').value;
    const type = document.getElementById('txnType').value;
    const tag = document.getElementById('txnTag').value;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "Saving to Cloud...";

    try {
      // Uses the db connection imported from firebase.js!
      await addDoc(collection(db, "transactions"), {
        amount: Number(amount),
        title: title,
        type: type,
        tags: tag ? [tag] : [],
        date: new Date().toISOString(),
        timestamp: Date.now()
      });
      
      form.reset();
      closeSheet();
      submitBtn.innerHTML = originalText;
      console.log("Transaction successfully saved!");

    } catch (error) {
      console.error("Firebase Error: ", error);
      alert("Failed to save. Check browser console.");
      submitBtn.innerHTML = originalText;
    }
  });
}
