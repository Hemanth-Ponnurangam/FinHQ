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
