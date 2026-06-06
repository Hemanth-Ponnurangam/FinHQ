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
    if (this.isLoaded) callback(this);
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
