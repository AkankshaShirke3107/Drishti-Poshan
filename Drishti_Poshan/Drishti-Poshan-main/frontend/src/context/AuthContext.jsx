import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext()

/**
 * Save auth credentials to localStorage for offline access.
 * Called on every successful online login/signup.
 */
function persistAuthLocally(token, hashedPin, userData) {
  localStorage.setItem('drishti-token', token)
  if (hashedPin) {
    localStorage.setItem('drishti-hashed-pin', hashedPin)
  }
  if (userData) {
    localStorage.setItem('drishti-user', JSON.stringify(userData))
  }
}

/**
 * Clear all auth data from localStorage.
 */
function clearAuthLocally() {
  localStorage.removeItem('drishti-token')
  localStorage.removeItem('drishti-hashed-pin')
  localStorage.removeItem('drishti-user')
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Restore user from localStorage on mount (offline support)
    try {
      const cached = localStorage.getItem('drishti-user')
      return cached ? JSON.parse(cached) : null
    } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('drishti-token'))
  const [loading, setLoading] = useState(!!localStorage.getItem('drishti-token'))

  // Verify token on mount (only if online)
  useEffect(() => {
    if (!token) { setLoading(false); return }

    if (navigator.onLine) {
      api.getProfile(token)
        .then(u => {
          setUser(u)
          localStorage.setItem('drishti-user', JSON.stringify(u))
        })
        .catch(() => {
          // Token expired or invalid — but don't clear if offline
          // User can still use PIN auth
          if (navigator.onLine) {
            clearAuthLocally()
            setToken(null)
            setUser(null)
          }
        })
        .finally(() => setLoading(false))
    } else {
      // Offline: trust the cached user
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await api.login({ username, password })
    persistAuthLocally(res.access_token, res.hashed_pin, res.user)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const signup = useCallback(async (data) => {
    const res = await api.signup(data)
    persistAuthLocally(res.access_token, res.hashed_pin, res.user)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    clearAuthLocally()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, signup, logout,
      isAuthenticated: !!user || !!token,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
