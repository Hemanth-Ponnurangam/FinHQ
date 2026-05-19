# FinHQ — Lifelong Finance

A personal finance tracker built with React + Vite + Tailwind CSS.

## Local Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Deploy to GitHub Pages

This repo is configured to auto-deploy via GitHub Actions on every push to `main`.

**One-time setup:**
1. Go to your repo → **Settings → Pages**
2. Set **Source** to `Deploy from a branch`
3. Set **Branch** to `gh-pages` / `/ (root)`
4. Push to `main` — the Action will build and deploy automatically

Your site will be live at: `https://<your-username>.github.io/FinHQ/`

## Project Structure

```
FinHQ/
├── index.html
├── vite.config.js          ← base: '/FinHQ/' for GitHub Pages
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── .github/
│   └── workflows/
│       └── deploy.yml      ← auto build + deploy on push
└── src/
    ├── main.jsx
    ├── App.jsx             ← HashRouter (works on static hosts)
    ├── index.css
    ├── seedData.js
    ├── store/
    │   └── useStore.js     ← Zustand store with localStorage persist
    ├── components/
    │   └── Layout.jsx      ← Sidebar navigation
    └── pages/
        ├── Dashboard.jsx
        ├── Ledger.jsx
        └── Accounts.jsx
```
