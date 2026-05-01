import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import { AuthProvider } from './context/AuthContext'
import { SyncProvider } from './context/SyncContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <SyncProvider>
              <App />
              {/* Global toast container — renders sync notifications */}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#0f172a',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontFamily: "'Inter', sans-serif",
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(12px)',
                  },
                  success: {
                    iconTheme: { primary: '#22c55e', secondary: '#0f172a' },
                    style: { border: '1px solid #22c55e33' },
                  },
                  error: {
                    iconTheme: { primary: '#ef4444', secondary: '#0f172a' },
                    style: { border: '1px solid #ef444433' },
                  },
                  loading: {
                    iconTheme: { primary: '#3b82f6', secondary: '#0f172a' },
                    style: { border: '1px solid #3b82f633' },
                  },
                }}
              />
            </SyncProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
