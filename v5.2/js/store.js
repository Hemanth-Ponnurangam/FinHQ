export const store = {
  transactions: [],
  assets: [],
  debts: [],
  recurring: [],
  fuel: [],
  serviceLog: [],
  events: [],
  realisedGains: [],

  subscribers: [],
  isLoaded: false,

  // ── Canonical liquid-cash definition ─────────────────────────────────────
  // Investment-tagged expenses are transfers to the Wealth module, not cash
  // outflows, so they are excluded from the running cash balance.  This is the
  // single authoritative implementation; dashboard.js, analytics.js, and
  // export.js all import and call this rather than each maintaining their own.
  // Memoised on the transactions array reference: same array → same result,
  // no re-scan needed (store.update() always creates a new reference).
  _liquidMemo: { ref: null, value: 0 },
  getLiquidCash(transactions) {
    if (transactions === this._liquidMemo.ref) return this._liquidMemo.value;
    const value = transactions.reduce((cash, txn) => {
      const amt = txn.amount || 0;
      const isInvestmentExpense =
        txn.type === 'expense' &&
        txn.tags?.some(t => t.toLowerCase() === 'investments');
      if (txn.type === 'income')   return cash + amt;
      if (!isInvestmentExpense)    return cash - amt;
      return cash;                 // investment-tagged expense → skip
    }, 0);
    this._liquidMemo = { ref: transactions, value };
    return value;
  },

  // deps: array of collection keys this subscriber cares about.
  // Omit (or pass null) to always be called — backward-compatible.
  subscribe(callback, deps = null) {
    const entry = { callback, deps };
    this.subscribers.push(entry);
    // FIX (arch): defer the immediate-fire to the next tick so that lazy-loaded
    // view modules whose DOM is injected by loadViewHTML() and then init'd by
    // initViewModule() always have their canvas/element refs available when the
    // callback fires. Without this, a module that subscribes during init can
    // receive the callback synchronously before its own DOM is ready.
    if (this.isLoaded) setTimeout(() => callback(this), 0);
    return () => {
      const idx = this.subscribers.indexOf(entry);
      if (idx > -1) this.subscribers.splice(idx, 1);
    };
  },

  update(key, data) {
    this[key] = data;
    this.notify(key);
  },

  setLoaded() {
    this.isLoaded = true;
    this.notify(null); // null = initial boot, call every subscriber once
  },

  notify(changedKey) {
    // changedKey === null → initial load, fan out to all
    // otherwise only call subscribers whose deps include the changed collection
    [...this.subscribers].forEach(({ callback, deps }) => {
      if (changedKey === null || deps === null || deps.includes(changedKey)) {
        callback(this);
      }
    });
  }
};
