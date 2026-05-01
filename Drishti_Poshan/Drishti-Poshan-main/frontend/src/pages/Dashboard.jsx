import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Users, AlertTriangle, ShieldCheck, Activity,
  UserPlus, Mic, FileText, TrendingUp, Map, RefreshCw, User,
} from 'lucide-react'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'
import HealthCard from '../components/HealthCard'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { useLanguage } from '../context/LanguageContext'
import { useSync } from '../context/SyncContext'

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const { t } = useLanguage()
  const { syncNow } = useSync()

  useEffect(() => {
    async function load() {
      try {
        const [statsData, childrenData] = await Promise.all([
          api.getStats(),
          api.getChildren({ limit: 5 }),
        ])
        setStats(statsData)
        setChildren(childrenData)
        if (childrenData) offlineDB.saveChildren(childrenData)
      } catch (err) {
        console.warn('Offline mode — loading from cache:', err.message)
        const cached = await offlineDB.getChildren()
        setChildren(cached?.slice(0, 5) || [])
        setStats({
          total_children: cached?.length || 0,
          severe: cached?.filter(c => c.risk_level === 'severe').length || 0,
          moderate: cached?.filter(c => c.risk_level === 'moderate').length || 0,
          normal: cached?.filter(c => c.risk_level === 'normal').length || 0,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const quickActions = [
    { to: '/add-child', icon: UserPlus, label: t('dashboard.addChild'), color: '#3b82f6' },
    { to: '/add-child?mode=voice', icon: Mic, label: t('dashboard.voiceEntry'), color: '#8b5cf6' },
    { to: '/add-child?mode=ocr', icon: FileText, label: t('dashboard.ocrScan'), color: '#06b6d4' },
    { to: '/children?risk_level=severe', icon: AlertTriangle, label: t('dashboard.riskAlerts'), color: '#ef4444' },
    { to: '#sync', icon: RefreshCw, label: t('dashboard.syncData'), color: '#10b981', onClick: syncNow },
    { to: '/heatmap', icon: Map, label: t('dashboard.openHeatmap'), color: '#f59e0b' },
    { to: '/profile', icon: User, label: t('dashboard.openProfile'), color: '#64748b' },
  ]

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 800,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-success))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4,
        }}>
          {t('dashboard.title')}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {t('dashboard.subtitle')}
        </p>
      </motion.div>

      {/* Stats Cards */}
      {loading ? (
        <div className="stats-grid">{[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}</div>
      ) : (
        <motion.div className="stats-grid" variants={staggerContainer} initial="initial" animate="animate">
          <HealthCard title={t('dashboard.totalChildren')} value={stats?.total_children || 0} icon={Users} delay={0} riskLevel="normal" />
          <HealthCard title={t('dashboard.severeRisk')} value={stats?.severe || 0} icon={AlertTriangle} delay={1} riskLevel="severe" trend={stats?.severe > 0 ? 'down' : undefined} />
          <HealthCard title={t('dashboard.moderateRisk')} value={stats?.moderate || 0} icon={Activity} delay={2} riskLevel="moderate" />
          <HealthCard title={t('dashboard.normal')} value={stats?.normal || 0} icon={ShieldCheck} delay={3} riskLevel="normal" trend="up" />
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>
          ⚡ {t('dashboard.quickActions')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {quickActions.map(({ to, icon: Icon, label, color, onClick }) => {
            const content = (
              <motion.div
                className="glass-card"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  padding: '18px 14px', cursor: 'pointer', textAlign: 'center',
                }}
                whileHover={{ y: -4, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onClick}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: 'var(--radius-md)',
                  background: `color-mix(in srgb, ${color} 15%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color,
                }}>
                  <Icon size={20} />
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text)', lineHeight: 1.3 }}>
                  {label}
                </span>
              </motion.div>
            )
            return onClick ? (
              <div key={label}>{content}</div>
            ) : (
              <Link key={to} to={to} style={{ textDecoration: 'none' }}>{content}</Link>
            )
          })}
        </div>
      </motion.div>

      {/* Recent Children */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>
          {t('dashboard.recentChildren')}
        </h2>
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          {children.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p>{t('dashboard.noChildren')}</p>
              <Link to="/add-child" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                <UserPlus size={16} /> {t('dashboard.registerFirst')}
              </Link>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {[t('common.name'), t('common.age'), t('common.weight'), t('common.height'), t('common.risk')].map(h => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem',
                      fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {children.map((child, i) => (
                  <motion.tr key={child.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.05 }}
                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link to={`/children/${child.id}`} style={{ fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>
                        {child.name}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{child.age_months}m</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{child.weight_kg ? `${child.weight_kg} kg` : '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{child.height_cm ? `${child.height_cm} cm` : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`risk-badge ${child.risk_level || 'normal'}`}>{child.risk_level || 'normal'}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  )
}
