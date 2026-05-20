// Initialize the Lucide Icons
lucide.createIcons();

// --- Mobile Menu Toggle Logic ---
const menuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');

menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
  sidebar.classList.toggle('flex');
});

// --- Mock Data to replicate the UI screenshot ---
const mockCards = [
  { label: 'NET WORTH', value: '₹1,35,370', sub: 'across all accounts' },
  { label: 'INCOME (MONTH)', value: '₹90,000', sub: 'this month' },
  { label: 'SPENT (MONTH)', value: '₹7,729', sub: 'this month' }
];

const mockAccounts = [
  { name: 'HDFC Savings', balance: '₹1,31,400', color: '#1B5E3B' },
  { name: 'Cash Wallet', balance: '₹3,970', color: '#C8963E' },
  { name: 'SBI Credit Card', balance: '-₹1,099', color: '#7C3AED' }
];

const mockTransactions = [
  { title: 'Apollo Pharmacy', sub: 'Medicines · 2026-05-18', amount: '-₹850', color: '#DC2626', type: 'expense' },
  { title: 'Transfer to Cash', sub: 'Transfer · 2026-05-17', amount: '↔₹3,000', color: '#6B7280', type: 'transfer' },
  { title: 'Cult.fit Membership', sub: 'Gym & Fitness · 2026-05-15', amount: '-₹2,000', color: '#DC2626', type: 'expense' },
  { title: 'Electricity Bill', sub: 'Electricity · 2026-05-14', amount: '-₹1,200', color: '#7C3AED', type: 'expense' }
];

// --- Injecting Data into the HTML DOM ---
const kpiContainer = document.getElementById('kpiContainer');
mockCards.forEach(card => {
  kpiContainer.innerHTML += `
    <div class="bg-white rounded-2xl shadow-card p-6">
      <p class="text-xs text-forest-400 font-semibold tracking-wider uppercase mb-2">${card.label}</p>
      <p class="font-display text-3xl font-semibold text-forest-900 mb-1">${card.value}</p>
      <p class="text-sm text-forest-300">${card.sub}</p>
    </div>
  `;
});

const accountsContainer = document.getElementById('accountsContainer');
mockAccounts.forEach(acc => {
  accountsContainer.innerHTML += `
    <div class="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
      <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${acc.color}"></span>
      <div>
        <p class="text-base font-medium text-forest-900">${acc.name}</p>
        <p class="text-sm text-forest-400 mt-0.5">${acc.balance}</p>
      </div>
    </div>
  `;
});

const transactionsContainer = document.getElementById('transactionsContainer');
mockTransactions.forEach(txn => {
  const amountClass = txn.type === 'expense' ? 'text-red-500' : 'text-forest-400';
  transactionsContainer.innerHTML += `
    <div class="flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-4">
        <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${txn.color}"></span>
        <div>
          <p class="text-base font-medium text-forest-900">${txn.title}</p>
          <p class="text-sm text-forest-300 mt-0.5">${txn.sub}</p>
        </div>
      </div>
      <span class="text-base font-medium ${amountClass}">${txn.amount}</span>
    </div>
  `;
});

// --- Firebase Connection Test ---
// Delete this block once you confirm it works!
db.collection("test").add({
    message: "Hello from FinHQ!",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
})
.then((docRef) => {
    console.log("Success! Test document written with ID: ", docRef.id);
    alert("Firebase is connected successfully!");
})
.catch((error) => {
    console.error("Error adding document: ", error);
});