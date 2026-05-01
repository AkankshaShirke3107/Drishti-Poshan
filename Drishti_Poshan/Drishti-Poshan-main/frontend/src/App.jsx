import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import useOfflineSync from './hooks/useOfflineSync'
import Layout from './components/Layout'
import LandingPage from './pages/landing/LandingPage'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import ChildrenList from './pages/ChildrenList'
import ChildProfile from './pages/ChildProfile'
import Analytics from './pages/Analytics'
import AddChild from './pages/AddChild'
import EditChild from './pages/EditChild'
import Heatmap from './pages/Heatmap'
import Profile from './pages/Profile'
import ABDM from './pages/ABDM'
import BulkAddChild from './pages/BulkAddChild'
import BulkUpload from './pages/BulkUpload'

/**
 * ProtectedRoute — redirects to /auth if not authenticated.
 * Allows offline users with a valid token/PIN to pass through.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  // Debug logging — remove once routing is confirmed working
  console.log('🔒 Auth Guard:', { isAuthenticated, loading })

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--color-bg)',
      }}>
        <div style={{
          width: 32, height: 32, border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  return children
}

/**
 * SmartLanding — shows landing page for visitors, redirects auth users to dashboard.
 */
function SmartLanding() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}

/**
 * SyncManager — invisible component that runs the offline sync engine globally.
 * Placed inside ProtectedRoute so it only syncs for authenticated users.
 */
function SyncManager() {
  useOfflineSync()
  return null // Renders nothing — pure side-effect hook
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<SmartLanding />} />
      <Route path="/auth" element={<Auth />} />

      {/* Protected app routes — inside Layout with sidebar */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Layout>
              {/* SyncManager runs globally for all protected routes */}
              <SyncManager />
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/children" element={<ChildrenList />} />
                <Route path="/children/:id" element={<ChildProfile />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/add-child" element={<AddChild />} />
                <Route path="/children/:id/edit" element={<EditChild />} />
                <Route path="/heatmap" element={<Heatmap />} />
                <Route path="/bulk-add" element={<BulkAddChild />} />
                <Route path="/bulk-upload" element={<BulkUpload />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/abdm" element={<ABDM />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}