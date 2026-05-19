import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Ledger from './pages/Ledger'
import Accounts from './pages/Accounts'

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
