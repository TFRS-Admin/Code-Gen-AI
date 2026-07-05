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
import ComponentHarvester from './pages/ComponentHarvester';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <Routes>
          {/* Dashboard renders its own full-screen Base44-pattern shell
              (sidebar + top nav), so it deliberately skips the tactical
              Layout wrapper used by the rest of the app. */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/Projects" element={<Layout currentPageName="Projects"><Projects /></Layout>} />
          <Route path="/Assistant" element={<Layout currentPageName="Assistant"><Assistant /></Layout>} />
          <Route path="/Settings" element={<Layout currentPageName="Settings"><Settings /></Layout>} />
          <Route path="/Harvester" element={<Layout currentPageName="Harvester"><ComponentHarvester /></Layout>} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
