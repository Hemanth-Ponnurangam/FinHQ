# Transaction Ledger

A full-featured personal finance transaction ledger built with React 18 + Vite + Tailwind CSS + Zustand.

## Features

- **Double-entry accounting** — every transaction has balanced debit/credit entries
- **Expense / Income / Transfer** transaction types
- **Split transactions** — split one payment across multiple categories
- **AI categorization** — powered by Claude (Anthropic API) — auto-suggests categories as you type
- **SMS import** — paste a bank SMS and AI parses it into a transaction
- **Search & filters** — full-text search, date range, type, status, account, amount range
- **Persistent state** — all data saved to `localStorage`
- **Dark fintech UI** — responsive, mobile-first with bottom sheets

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## AI Features (Optional)

Click **⚡ AI Off** in the top nav and enter your Anthropic API key (`sk-ant-…`).

- Auto-categorizes transactions as you type the merchant name
- Parses Indian bank SMS messages into structured transactions

The key is stored in `localStorage` only — never sent to any server other than Anthropic's API.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| State | Zustand (with localStorage persistence) |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Icons | Lucide React |
| Date utils | date-fns |

## Project Structure

```
src/
  api/
    ai.js                  # Anthropic API calls (categorize + SMS parse)
  components/
    ledger/
      LedgerPage.jsx       # Main page layout
      TransactionList.jsx  # Date-grouped list
      TransactionRow.jsx   # Single transaction row + context menu
      TransactionDetailSheet.jsx  # Detail side panel / bottom sheet
      AddTransactionModal.jsx     # Add transaction form (Quick / Split / SMS)
      FilterPanel.jsx      # Slide-in filter panel
      SummaryCards.jsx     # Income / Expense / Net / Count cards
      SmsImportFlow.jsx    # SMS import UI
  store/
    useLedgerStore.js      # Zustand store (all state + CRUD)
  utils/
    formatCurrency.js      # INR formatter using Intl.NumberFormat
    doubleEntry.js         # Entry validation helpers
    mockData.js            # Seed accounts, categories, transactions
```

## Next Steps (Backend)

Per the spec, the backend should be:
- **FastAPI** (Python) with PostgreSQL 15 + SQLAlchemy 2.0
- Auth via Supabase Auth or Auth0
- Replace the Zustand mock store with React Query hooks hitting `/api/v1/…`
- Redis caching for AI category predictions (7-day TTL)

See `transaction_ledger_spec.md` for the full API contract and DB schema.
