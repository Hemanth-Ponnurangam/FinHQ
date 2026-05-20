// Import our separated modules
import { initUI } from './ui.js';
import { initLedger } from './features/ledger.js';

// Boot Sequence
document.addEventListener('DOMContentLoaded', () => {
  console.log("FinHQ Booting Sequence Initiated...");
  
  // 1. Initialize the Interface (Bottom Sheets, etc)
  const uiController = initUI();
  
  // 2. Initialize the Ledger feature, passing the UI controller so it can close the sheet
  initLedger(uiController);
});