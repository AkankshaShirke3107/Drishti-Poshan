import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Wifi, WifiOff, Eye, EyeOff, UserPlus, LogIn,
  Loader2, CheckCircle, AlertCircle, Lock, Smartphone,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Auth() {
  const navigate = useNavigate()
  const { login, signup, isAuthenticated } = useAuth()

  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Online form state
  const [form, setForm] = useState({
    username: '', email: '', password: '', full_name: '', pin: '', role: 'anganwadi_worker',
  })

  // Offline PIN state
  const [pin, setPin] = useState(['', '', '', ''])
  const pinRefs = [useRef(), useRef(), useRef(), useRef()]

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  // Network detection
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  // ── Online Login ────────────────────────────────────
  const handleOnlineSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'login') {
        await login(form.username, form.password)
      } else {
        if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
          setError('PIN must be exactly 4 digits')
          setLoading(false)
          return
        }
        await signup({
          username: form.username,
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          pin: form.pin,
          role: form.role,
        })
      }
      setSuccess(mode === 'login' ? 'Login successful!' : 'Account created!')
      setTimeout(() => navigate('/dashboard'), 600)
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Offline PIN Auth ────────────────────────────────
  const handlePinInput = useCallback((index, value) => {
    if (!/^\d?$/.test(value)) return
    const newPin = [...pin]
    newPin[index] = value
    setPin(newPin)
    setError(null)

    // Auto-focus next input
    if (value && index < 3) {
      pinRefs[index + 1].current?.focus()
    }

    // If all 4 digits entered, attempt auth
    if (value && index === 3) {
      const fullPin = newPin.join('')
      if (fullPin.length === 4) {
        verifyOfflinePin(fullPin)
      }
    }
  }, [pin])

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus()
    }
  }

  const verifyOfflinePin = async (enteredPin) => {
    setLoading(true)
    setError(null)

    const hashedPin = localStorage.getItem('drishti-hashed-pin')
    const token = localStorage.getItem('drishti-token')

    if (!hashedPin || !token) {
      setError('No offline credentials found. Please login online first.')
      setLoading(false)
      setPin(['', '', '', ''])
      pinRefs[0].current?.focus()
      return
    }

    try {
      // Dynamic import bcryptjs for offline comparison
      const bcryptjs = await import('bcryptjs')
      const match = bcryptjs.compareSync(enteredPin, hashedPin)

      if (match) {
        setSuccess('PIN verified! Entering offline mode...')
        setTimeout(() => navigate('/dashboard'), 600)
      } else {
        setError('Incorrect PIN. Try again.')
        setPin(['', '', '', ''])
        pinRefs[0].current?.focus()
      }
    } catch (err) {
      setError('PIN verification failed. Try again.')
      setPin(['', '', '', ''])
      pinRefs[0].current?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: 20,
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
      }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
          borderRadius: '50%', filter: 'blur(80px)',
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          width: '100%', maxWidth: isOnline ? 440 : 380,
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Logo + Title */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ textAlign: 'center', marginBottom: 32 }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #2563eb, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(37,99,235,0.3)',
          }}>
            <Shield size={28} color="white" />
          </div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', marginBottom: 4,
          }}>
            Drishti Poshan
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {isOnline ? 'Sign in to access the platform' : 'Offline Mode — Enter your PIN'}
          </p>
        </motion.div>

        {/* Network status badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 999, margin: '0 auto 24px',
            width: 'fit-content',
            background: isOnline ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
          }}
        >
          {isOnline ? <Wifi size={14} color="#10b981" /> : <WifiOff size={14} color="#f59e0b" />}
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isOnline ? '#10b981' : '#f59e0b' }}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </motion.div>

        {/* Main Card */}
        <motion.div
          layout
          style={{
            background: 'rgba(30,41,59,0.8)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(148,163,184,0.1)',
            borderRadius: 20,
            padding: 32,
            boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
          }}
        >
          {/* Success banner */}
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 12, borderRadius: 10, marginBottom: 20,
                  background: 'rgba(16,185,129,0.12)', color: '#10b981', fontSize: '0.82rem',
                }}
              >
                <CheckCircle size={16} /> {success}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: 12, borderRadius: 10, marginBottom: 20,
                  background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: '0.82rem',
                }}
              >
                <AlertCircle size={16} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isOnline ? (
              /* ═══════════════════════════════════════════════
                 ONLINE MODE — Email + Password Form
                 ═══════════════════════════════════════════════ */
              <motion.div key="online" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>

                {/* Login / Signup toggle */}
                <div style={{
                  display: 'flex', gap: 4, padding: 4, borderRadius: 12, marginBottom: 24,
                  background: 'rgba(15,23,42,0.6)',
                }}>
                  {['login', 'signup'].map(m => (
                    <button key={m} onClick={() => { setMode(m); setError(null) }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                        fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                        background: mode === m ? 'rgba(37,99,235,0.2)' : 'transparent',
                        color: mode === m ? '#60a5fa' : '#94a3b8',
                        transition: 'all 0.2s',
                      }}
                    >
                      {m === 'login' ? 'Sign In' : 'Create Account'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleOnlineSubmit}>
                  {/* Username */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Username</label>
                    <input style={inputStyle} type="text" placeholder="e.g. anganwadi_worker_1"
                      value={form.username} onChange={e => handleChange('username', e.target.value)}
                      required autoComplete="username" />
                  </div>

                  {/* Signup-only fields */}
                  <AnimatePresence>
                    {mode === 'signup' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ marginBottom: 16 }}>
                          <label style={labelStyle}>Full Name</label>
                          <input style={inputStyle} type="text" placeholder="Priya Sharma"
                            value={form.full_name} onChange={e => handleChange('full_name', e.target.value)}
                            required={mode === 'signup'} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <label style={labelStyle}>Email</label>
                          <input style={inputStyle} type="email" placeholder="priya@icds.gov.in"
                            value={form.email} onChange={e => handleChange('email', e.target.value)}
                            required={mode === 'signup'} autoComplete="email" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Password */}
                  <div style={{ marginBottom: 16, position: 'relative' }}>
                    <label style={labelStyle}>Password</label>
                    <input style={inputStyle} type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 6 characters"
                      value={form.password} onChange={e => handleChange('password', e.target.value)}
                      required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      style={{
                        position: 'absolute', right: 12, top: 34, background: 'none', border: 'none',
                        color: '#94a3b8', cursor: 'pointer', padding: 4,
                      }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* PIN (signup only) */}
                  <AnimatePresence>
                    {mode === 'signup' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: 16 }}>
                        <label style={labelStyle}>
                          <Lock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                          Offline PIN (4 digits)
                        </label>
                        <input style={inputStyle} type="password" inputMode="numeric" maxLength={4}
                          placeholder="e.g. 1234" pattern="\d{4}"
                          value={form.pin} onChange={e => handleChange('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          required={mode === 'signup'} />
                        <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 6 }}>
                          This PIN allows offline access when there's no internet.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <motion.button type="submit" disabled={loading}
                    style={{
                      width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: 'white', fontSize: '0.88rem', fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: loading ? 0.7 : 1, transition: 'all 0.2s',
                      boxShadow: '0 4px 20px rgba(37,99,235,0.3)',
                    }}
                    whileHover={{ scale: 1.02, boxShadow: '0 6px 24px rgba(37,99,235,0.4)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <><Loader2 size={18} className="spin" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                    ) : (
                      <>{mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
                        {mode === 'login' ? 'Sign In' : 'Create Account'}</>
                    )}
                  </motion.button>
                </form>
              </motion.div>
            ) : (
              /* ═══════════════════════════════════════════════
                 OFFLINE MODE — 4-digit PIN Input
                 ═══════════════════════════════════════════════ */
              <motion.div key="offline" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>

                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, margin: '0 auto 14px',
                    background: 'rgba(245,158,11,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Smartphone size={22} color="#f59e0b" />
                  </div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                    Offline Access
                  </h2>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    Enter your 4-digit PIN to access<br />the app in offline mode.
                  </p>
                </div>

                {/* PIN Input Boxes */}
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28,
                }}>
                  {pin.map((digit, i) => (
                    <motion.input
                      key={i}
                      ref={pinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handlePinInput(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      style={{
                        width: 56, height: 64, textAlign: 'center',
                        fontSize: '1.5rem', fontWeight: 800,
                        background: digit ? 'rgba(37,99,235,0.1)' : 'rgba(15,23,42,0.6)',
                        border: `2px solid ${digit ? 'rgba(37,99,235,0.4)' : 'rgba(148,163,184,0.15)'}`,
                        borderRadius: 14, color: '#f8fafc', outline: 'none',
                        transition: 'all 0.2s',
                        caretColor: '#2563eb',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(37,99,235,0.6)'; e.target.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.1)' }}
                      onBlur={e => { e.target.style.borderColor = digit ? 'rgba(37,99,235,0.4)' : 'rgba(148,163,184,0.15)'; e.target.style.boxShadow = 'none' }}
                      whileFocus={{ scale: 1.05 }}
                    />
                  ))}
                </div>

                {loading && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
                    Verifying PIN…
                  </div>
                )}

                {!localStorage.getItem('drishti-hashed-pin') && (
                  <div style={{
                    textAlign: 'center', padding: 16, borderRadius: 12,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: '0.75rem', color: '#f59e0b', lineHeight: 1.5,
                  }}>
                    ⚠️ No offline credentials stored.<br />
                    Please connect to the internet and login once.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Back to Landing link */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ textAlign: 'center', marginTop: 20, fontSize: '0.78rem' }}
        >
          <a href="/" style={{ color: '#64748b', textDecoration: 'none' }}>
            ← Back to Drishti Poshan
          </a>
        </motion.p>
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ── Shared inline styles ──────────────────────────────
const labelStyle = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: '#94a3b8', marginBottom: 6, letterSpacing: '0.03em',
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(148,163,184,0.15)',
  color: '#f8fafc', fontSize: '0.88rem', outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
}
