export const store = {
  transactions: [],
  assets: [],
  debts: [],
  budgets: [],
  goals: [],
  recurring: [],
  fuel: [],
  serviceLog: [],
  events: [],

  subscribers: [],
  isLoaded: false,

  // FIX: Returns an unsubscribe function to prevent subscriber memory leaks
  subscribe(callback) {
    this.subscribers.push(callback);
    if (this.isLoaded) callback(this);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx > -1) this.subscribers.splice(idx, 1);
    };
  },

  update(key, data) {
    this[key] = data;
    this.notify();
  },

  setLoaded() {
    this.isLoaded = true;
    this.notify();
  },

  notify() {
    // Snapshot the array before iterating so mid-notify unsubscribes are safe
    [...this.subscribers].forEach(sub => sub(this));
  }
};
