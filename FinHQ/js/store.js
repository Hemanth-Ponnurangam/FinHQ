export const store = {
  transactions: [],
  assets: [],
  debts: [],
  budgets: [],
  goals: [],
  recurring: [],
  
  subscribers: [],
  isLoaded: false,
  
  // Modules subscribe to state changes here
  subscribe(callback) {
    this.subscribers.push(callback);
    if (this.isLoaded) callback(this);
  },
  
  // Firebase pushes new data here
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
