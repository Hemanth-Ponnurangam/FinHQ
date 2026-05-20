import { db, collection, addDoc } from '../firebase.js';

export function initLedger(uiController) {
  const form = document.getElementById('ledgerForm');
  
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = document.getElementById('txnAmount').value;
    const title = document.getElementById('txnTitle').value;
    const type = document.getElementById('txnType').value;
    const tag = document.getElementById('txnTag').value;

    const transactionData = {
      amount: Number(amount),
      title: title,
      type: type,
      tags: tag ? [tag] : [], // Saves as an array for our dimensional filtering later!
      date: new Date().toISOString(),
      timestamp: Date.now()
    };

    try {
      // 1. Save to Firebase
      await addDoc(collection(db, "transactions"), transactionData);
      
      // 2. Reset the form and close the sheet
      form.reset();
      uiController.closeSheet();
      
      console.log("Transaction Saved successfully!");
      // Later we will add a Toast notification here

    } catch (error) {
      console.error("Error adding document: ", error);
      alert("Failed to save transaction.");
    }
  });
}