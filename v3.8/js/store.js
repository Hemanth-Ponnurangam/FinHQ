export const store = {
  transactions: [],
  assets: [],
  debts: [],
  recurring: [],
  fuel: [],
  serviceLog: [],
  events: [],
  realisedGains: [],

  _subscribers: [],   // [{ keys: Set|null, cb: fn }]
  isLoaded: false,

  // ── Derived cache ──────────────────────────────────────────────────────────
  // liquidCash is maintained incrementally inside update() whenever
  // 'transactions' changes. Subscribers that need liquid cash read this
  // directly instead of re-summing all transactions on every update.
  liquidCash: 0,

  /**
   * Subscribe to store changes.
   *
   * @param {Function} callback  - called with (state) on matching updates
   * @param {string[]} [keys]    - store keys this subscriber cares about.
   *                               Omit (or pass null) to fire on every update
   *                               (use sparingly — prefer explicit keys).
   * @returns {Function} unsubscribe
   */
  subscribe(callback, keys) {
    const entry = { keys: keys ? new Set(keys) : null, cb: callback };
    this._subscribers.push(entry);
    if (this.isLoaded) callback(this);
    return () => {
      const idx = this._subscribers.indexOf(entry);
      if (idx > -1) this._subscribers.splice(idx, 1);
    };
  },

  update(key, data) {
    this[key] = data;
    if (key === 'transactions') this._recomputeLiquidCash();
    this._notify(key);
  },

  setLoaded() {
    this.isLoaded = true;
    this._recomputeLiquidCash();
    this._notifyAll();   // first-load fires everyone once
  },

  /** Fire only subscribers that declared an interest in `key`. */
  _notify(key) {
    const snap = [...this._subscribers];
    for (const { keys, cb } of snap) {
      if (keys === null || keys.has(key)) cb(this);
    }
  },

  /** Fire every subscriber unconditionally (used by setLoaded). */
  _notifyAll() {
    [...this._subscribers].forEach(({ cb }) => cb(this));
  },

  /**
   * Recompute liquidCash from the current transactions array.
   * Called once on setLoaded() and again on every transactions update.
   * O(n) over transactions, but runs only when transactions actually change —
   * not on fuel, debt, asset, or any other update.
   */
  _recomputeLiquidCash() {
    let cash = 0;
    for (const txn of this.transactions) {
      const amt = txn.amount || 0;
      const isInvestmentExpense =
        txn.type === 'expense' &&
        txn.tags?.some(t => t.toLowerCase() === 'investments');

      if (txn.type === 'income') {
        cash += amt;
      } else if (!isInvestmentExpense) {
        cash -= amt;
      }
    }
    this.liquidCash = cash;
  },
};
