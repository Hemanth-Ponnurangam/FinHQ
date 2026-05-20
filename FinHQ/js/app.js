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
    // ==========================================
// 4. SCREEN NAVIGATION
// ==========================================
const hubView = document.getElementById('hubView');
const ledgerView = document.getElementById('ledgerView');
const openLedgerBtn = document.getElementById('openLedgerBtn');
const backToHubBtn = document.getElementById('backToHubBtn');

if(openLedgerBtn) openLedgerBtn.addEventListener('click', () => {
  hubView.classList.add('hidden');
  ledgerView.classList.remove('hidden');
});

if(backToHubBtn) backToHubBtn.addEventListener('click', () => {
  ledgerView.classList.add('hidden');
  hubView.classList.remove('hidden');
});

// ==========================================
// 5. LIVE LEDGER SYNC (Read from Firebase)
// ==========================================
// We import the extra tools at the top of the file:
import { onSnapshot, query, orderBy } from './firebase.js';

const transactionList = document.getElementById('transactionList');

if (transactionList) {
  // Query Firebase: Get transactions, ordered newest first
  const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
  
  // onSnapshot listens forever. If the DB changes, this runs automatically!
  onSnapshot(q, (snapshot) => {
    transactionList.innerHTML = ''; // Clear the old list
    
    if (snapshot.empty) {
      transactionList.innerHTML = '<p class="text-center text-forest-400 mt-10 text-sm">No transactions yet. Click + to add one.</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const txn = doc.data();
      const amountClass = txn.type === 'expense' ? 'text-red-500' : 'text-forest-500';
      const sign = txn.type === 'expense' ? '-' : '+';
      
      // Parse the date nicely (e.g., "May 18")
      const dateObj = new Date(txn.date);
      const dateString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Build the tag HTML if it exists
      const tagHTML = txn.tags && txn.tags.length > 0 && txn.tags[0] !== "" 
        ? `<span class="bg-forest-50 text-forest-600 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ml-2">${txn.tags[0]}</span>` 
        : '';

      // Inject the HTML card
      transactionList.innerHTML += `
        <div class="bg-white rounded-2xl p-4 shadow-card border border-forest-50/50 flex items-center justify-between">
          <div>
            <p class="font-semibold text-forest-900 text-lg flex items-center">${txn.title} ${tagHTML}</p>
            <p class="text-xs text-forest-400 mt-1">${dateString} · ${txn.type}</p>
          </div>
          <p class="font-display font-semibold text-xl ${amountClass}">${sign}₹${txn.amount.toLocaleString('en-IN')}</p>
        </div>
      `;
    });
    
    lucide.createIcons(); // Refresh the icons if we added any
  });
}

    
  });
}
