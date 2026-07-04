import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Layout from '@/components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Assistant from './pages/Assistant';
import Settings from './pages/Settings';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout currentPageName="Dashboard"><Dashboard /></Layout>} />
          <Route path="/Dashboard" element={<Layout currentPageName="Dashboard"><Dashboard /></Layout>} />
          <Route path="/Projects" element={<Layout currentPageName="Projects"><Projects /></Layout>} />
          <Route path="/Assistant" element={<Layout currentPageName="Assistant"><Assistant /></Layout>} />
          <Route path="/Settings" element={<Layout currentPageName="Settings"><Settings /></Layout>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
