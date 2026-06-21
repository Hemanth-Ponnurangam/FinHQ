import { authLogin, authRegister, authSetName, authLogout } from './firebase.js';

// ── Error message map ─────────────────────────────────────────────────────────
// Firebase auth error codes → human-readable messages
const AUTH_ERRORS = {
  'auth/user-not-found':       'No account found with this email.',
  'auth/wrong-password':       'Incorrect password.',
  'auth/invalid-credential':   'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password':        'Password must be at least 6 characters.',
  'auth/invalid-email':        'Please enter a valid email address.',
  'auth/too-many-requests':    'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

function friendlyError(code) {
  return AUTH_ERRORS[code] || 'Something went wrong. Please try again.';
}

// ── Module state ──────────────────────────────────────────────────────────────
let _mode = 'login'; // 'login' | 'register'

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screen     = document.getElementById('authScreen');
const tabLogin   = document.getElementById('authTabLogin');
const tabRegister= document.getElementById('authTabRegister');
const nameRow    = document.getElementById('authNameRow');
const nameInput  = document.getElementById('authName');
const emailInput = document.getElementById('authEmail');
const passInput  = document.getElementById('authPassword');
const errorEl    = document.getElementById('authError');
const submitBtn  = document.getElementById('authSubmitBtn');

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}
function clearError() {
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}
function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading
    ? (_mode === 'login' ? 'Signing in…' : 'Creating account…')
    : (_mode === 'login' ? 'Sign In' : 'Create Account');
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function setMode(mode) {
  _mode = mode;
  clearError();
  const isReg = mode === 'register';

  tabLogin?.classList.toggle('bg-forest-900', !isReg);
  tabLogin?.classList.toggle('text-white',    !isReg);
  tabLogin?.classList.toggle('text-gray-400',  isReg);
  tabLogin?.classList.toggle('dark:text-gray-500', isReg);

  tabRegister?.classList.toggle('bg-forest-900', isReg);
  tabRegister?.classList.toggle('text-white',    isReg);
  tabRegister?.classList.toggle('text-gray-400', !isReg);
  tabRegister?.classList.toggle('dark:text-gray-500', !isReg);

  nameRow?.classList.toggle('hidden', !isReg);
  if (submitBtn) submitBtn.textContent = isReg ? 'Create Account' : 'Sign In';
  if (isReg) nameInput?.focus();
  else       emailInput?.focus();
}

tabLogin?.addEventListener('click',    () => setMode('login'));
tabRegister?.addEventListener('click', () => setMode('register'));

// ── Submit ────────────────────────────────────────────────────────────────────
async function handleSubmit() {
  clearError();
  const email = emailInput?.value.trim() || '';
  const pass  = passInput?.value         || '';

  if (!email || !pass) { showError('Please enter your email and password.'); return; }
  if (_mode === 'register' && pass.length < 6) {
    showError('Password must be at least 6 characters.'); return;
  }

  setLoading(true);
  try {
    if (_mode === 'login') {
      await authLogin(email, pass);
    } else {
      const name = nameInput?.value.trim() || '';
      if (!name) { showError('Please enter your name.'); setLoading(false); return; }
      await authRegister(email, pass);
      await authSetName(name);
    }
    // Success — watchAuth in app.js will call onLogin() which hides this screen
  } catch (err) {
    showError(friendlyError(err.code));
    setLoading(false);
  }
}

submitBtn?.addEventListener('click', handleSubmit);

// Allow pressing Enter in any field to submit
[nameInput, emailInput, passInput].forEach(el => {
  el?.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
});

// ── Public API ────────────────────────────────────────────────────────────────
export function showAuthScreen() {
  screen?.classList.remove('hidden');
  clearError();
  setLoading(false);
  emailInput?.focus();
}

export function hideAuthScreen() {
  // Slide out gracefully
  if (!screen) return;
  screen.style.transition = 'opacity 0.3s ease';
  screen.style.opacity    = '0';
  setTimeout(() => {
    screen.classList.add('hidden');
    screen.style.opacity    = '';
    screen.style.transition = '';
    // Clear password field for security — email stays for convenience
    if (passInput) passInput.value = '';
  }, 300);
}

// ── Header user button (avatar → logout) ─────────────────────────────────────
export function initHeaderUser(user) {
  const btn     = document.getElementById('headerUserBtn');
  const initial = document.getElementById('headerUserInitial');
  if (!btn || !initial) return;

  const name   = user.displayName || user.email || '?';
  initial.textContent = name.charAt(0).toUpperCase();
  btn.title    = `${name}\nTap to sign out`;
  btn.classList.remove('hidden');

  // Remove any previously attached listener by cloning
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async () => {
    const confirmed = confirm(`Sign out of FinHQ?\n\nSigned in as ${user.email}`);
    if (!confirmed) return;
    try { await authLogout(); }
    catch (err) { console.error('Logout failed:', err); }
  });
}

export function hideHeaderUser() {
  document.getElementById('headerUserBtn')?.classList.add('hidden');
}
