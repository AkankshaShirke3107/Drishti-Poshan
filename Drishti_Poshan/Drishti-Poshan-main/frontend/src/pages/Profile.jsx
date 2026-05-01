import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, LogIn, UserPlus, LogOut, Loader2, AlertCircle, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

export default function Profile() {
  const { user, login, signup, logout, isAuthenticated, loading: authLoading } = useAuth()
  const { t } = useLanguage()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    username: '', email: '', password: '', confirmPassword: '',
    full_name: '', role: 'anganwadi_worker',
  })

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (isLogin) {
        await login(form.username, form.password)
      } else {
        if (form.password !== form.confirmPassword) {
          setError(t('profile.passwordMismatch'))
          setLoading(false)
          return
        }
        await signup({
          username: form.username, email: form.email,
          password: form.password, full_name: form.full_name, role: form.role,
        })
      }
    } catch (err) {
      setError(isLogin ? t('profile.loginError') : t('profile.signupError') + ': ' + err.message)
    } finally { setLoading(false) }
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Logged in view
  if (isAuthenticated) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: '1.75rem', fontWeight: 800,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4,
          }}>{t('profile.title')}</h1>
        </motion.div>

        <motion.div className="glass-panel" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: 32, textAlign: 'center' }}>
          {/* Avatar */}
          <motion.div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-success))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', fontWeight: 800, color: 'white',
          }} whileHover={{ scale: 1.05, rotate: 3 }}>
            {user.full_name?.[0]?.toUpperCase() || 'U'}
          </motion.div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
            {user.full_name}
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
            @{user.username}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            padding: 20, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            {[
              { label: t('profile.email'), value: user.email },
              { label: t('profile.role'), value: user.role === 'supervisor' ? t('profile.supervisor') : t('profile.worker') },
              { label: t('profile.memberSince'), value: new Date(user.created_at).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 14px',
            background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)' }}>
            <Shield size={16} color="var(--color-success)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-success)' }}>
              {user.role === 'supervisor' ? t('profile.supervisor') : t('profile.worker')}
            </span>
          </div>

          <motion.button onClick={logout} className="btn btn-danger"
            style={{ width: '100%', marginTop: 24 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <LogOut size={18} /> {t('profile.logout')}
          </motion.button>
        </motion.div>
      </div>
    )
  }

  // Login / Signup form
  return (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 800,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4,
        }}>{isLogin ? t('profile.login') : t('profile.signup')}</h1>
      </motion.div>

      <motion.form onSubmit={handleSubmit} className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ padding: 32 }}>

        {!isLogin && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">{t('profile.fullName')}</label>
            <input className="input" value={form.full_name} required
              onChange={(e) => handleChange('full_name', e.target.value)} />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="label">{t('profile.username')}</label>
          <input className="input" value={form.username} required
            onChange={(e) => handleChange('username', e.target.value)} />
        </div>

        {!isLogin && (
          <div style={{ marginBottom: 16 }}>
            <label className="label">{t('profile.email')}</label>
            <input className="input" type="email" value={form.email} required
              onChange={(e) => handleChange('email', e.target.value)} />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label className="label">{t('profile.password')}</label>
          <input className="input" type="password" value={form.password} required minLength={6}
            onChange={(e) => handleChange('password', e.target.value)} />
        </div>

        {!isLogin && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="label">{t('profile.confirmPassword')}</label>
              <input className="input" type="password" value={form.confirmPassword} required
                onChange={(e) => handleChange('confirmPassword', e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="label">{t('profile.role')}</label>
              <select className="input select" value={form.role}
                onChange={(e) => handleChange('role', e.target.value)}>
                <option value="anganwadi_worker">{t('profile.worker')}</option>
                <option value="supervisor">{t('profile.supervisor')}</option>
              </select>
            </div>
          </>
        )}

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.1)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--color-danger)',
              marginBottom: 16 }}>
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}

        <motion.button type="submit" disabled={loading} className="btn btn-primary"
          style={{ width: '100%', padding: '13px', fontSize: '0.9rem' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          {loading ? (
            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {t('common.loading')}</>
          ) : isLogin ? (
            <><LogIn size={18} /> {t('profile.loginBtn')}</>
          ) : (
            <><UserPlus size={18} /> {t('profile.signupBtn')}</>
          )}
        </motion.button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          {isLogin ? t('profile.noAccount') : t('profile.hasAccount')}{' '}
          <button onClick={() => { setIsLogin(!isLogin); setError(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)',
              fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-family)' }}>
            {isLogin ? t('profile.signup') : t('profile.login')}
          </button>
        </p>
      </motion.form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
