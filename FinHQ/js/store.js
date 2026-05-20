export const store = {
  transactions: [],
  assets: [],
  debts: [],
  budgets: [],
  goals: [],
  recurring: [],
  fuel: [], // NEW: Commute tracking array
  
  subscribers: [],
  isLoaded: false,
  
  subscribe(callback) {
    this.subscribers.push(callback);
    if (this.isLoaded) callback(this);
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
    this.subscribers.forEach(sub => sub(this));
  }
};
