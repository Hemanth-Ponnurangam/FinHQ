// A simple observable store for all FinHQ data
export const store = {
  transactions: [],
  assets: [],
  debts: [],
  budgets: [],
  goals: [],
  recurring: [],
  subscribers: [],
  
  subscribe(callback) {
    this.subscribers.push(callback);
    callback(this);
  },
  
  update(key, data) {
    this[key] = data;
    this.subscribers.forEach(sub => sub(this));
  }
};
