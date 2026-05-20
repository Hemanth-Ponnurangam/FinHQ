export function initUI() {
  const fabBtn = document.getElementById('fabBtn');
  const bottomSheet = document.getElementById('bottomSheet');
  const overlay = document.getElementById('bottomSheetOverlay');
  const closeBtn = document.getElementById('closeSheetBtn');

  function openSheet() {
    overlay.classList.remove('hidden');
    // slight delay for animation to trigger
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
    }, 300); // Wait for transition
  }

  // Event Listeners
  if(fabBtn) fabBtn.addEventListener('click', openSheet);
  if(closeBtn) closeBtn.addEventListener('click', closeSheet);
  if(overlay) overlay.addEventListener('click', closeSheet);

  return { closeSheet };
}