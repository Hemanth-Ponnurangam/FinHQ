// ==========================================
// 1. DATABASE IMPORTS & INITIALIZATION
// ==========================================
import { db, collection, addDoc } from './firebase.js';
import { onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

console.log("FinHQ Modules Loaded & Booting...");

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
// 3. SCREEN NAVIGATION CONTROLS
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
// 4. LEDGER WRITE LOGIC (Save to Firestore)
// ==========================================
const form = document.getElementById('ledgerForm');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Intercepts the default HTML form submission page-refresh

    const amount = document.getElementById('txnAmount').value;
    const title = document.getElementById('txnTitle').value;
    const type = document.getElementById('txnType').value;
    const tag = document.getElementById('txnTag').value;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "Saving to Cloud...";

    try {
      // Add data directly to our 'transactions' collection
      await addDoc(collection(db, "transactions"), {
        amount: Number(amount),
        title: title,
        type: type,
        tags: tag ? [tag.trim()] : [], // Trim spaces from tags for clean filters later
        date: new Date().toISOString(),
        timestamp: Date.now()
      });
      
      // Clean up UI on a successful cloud write
      form.reset();
      closeSheet();
      submitBtn.innerHTML = originalText;
      console.log("Transaction saved successfully!");

    } catch (error) {
      console.error("Firebase Storage Error: ", error);
      alert("Failed to save transaction. Open developer tools console for details.");
      submitBtn.innerHTML = originalText;
    }
  });
}


// ==========================================
// 5. LEDGER READ LOGIC (Live Real-time Feed)
// ==========================================
const transactionList = document.getElementById('transactionList');

if (transactionList) {
  // Query our collection ordered by timestamps newest first
  const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
  
  // Open an active streaming snapshot listening directly for remote server-side edits
  onSnapshot(q, (snapshot) => {
    transactionList.innerHTML = ''; // Wipe out existing DOM elements to prep clean sync
    
    if (snapshot.empty) {
      transactionList.innerHTML = `
        <div class="text-center text-forest-400 py-12 px-4">
          <p class="text-sm">No transactions registered yet.</p>
          <p class="text-xs text-forest-300 mt-1">Tap the plus button below to append data.</p>
        </div>
      `;
      return;
    }

    // Iterate across active query instances retrieved from Cloud firestore
    snapshot.forEach((doc) => {
      const txn = doc.data();
      
      // Dynamic rendering styles mapping to expense structures
      const isExpense = txn.type === 'expense';
      const amountClass = isExpense ? 'text-red-500' : 'text-forest-500';
      const sign = isExpense ? '-' : '+';
      
      // Parse dates cleanly localized to display profiles
      const dateObj = new Date(txn.date);
      const dateString = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      // Generate chip element layouts conditionally if target records feature attributes
      const tagHTML = txn.tags && txn.tags.length > 0 && txn.tags[0] !== "" 
        ? `<span class="bg-forest-50 text-forest-600 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ml-2">${txn.tags[0]}</span>` 
        : '';

      // Construct live markup tracking elements inside core layouts
      transactionList.innerHTML += `
        <div class="bg-white rounded-2xl p-4 shadow-card border border-forest-50/50 flex items-center justify-between transition-all active:scale-[0.99]">
          <div>
            <div class="flex items-center">
              <p class="font-semibold text-forest-900 text-base line-clamp-1">${txn.title}</p>
              ${tagHTML}
            </div>
            <p class="text-xs text-forest-400 mt-1">${dateString} · <span class="capitalize">${txn.type}</span></p>
          </div>
          <p class="font-display font-semibold text-xl ${amountClass} tracking-tight">${sign}₹${txn.amount.toLocaleString('en-IN')}</p>
        </div>
      `;
    });
    
    // Reparse document tracking layouts to load missing styling vector nodes
    if (window.lucide) {
      lucide.createIcons();
    }
  });
}
