import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, Search, UserPlus, Trash2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'
import { TableSkeleton } from '../components/LoadingSkeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import { useLanguage } from '../context/LanguageContext'

/**
 * Resolve a child's risk level using a priority chain:
 *   1. risk_level from server (if not 'unknown')
 *   2. status field (WHO clinical classification)
 *   3. local MUAC thresholds (MUAC > 50 assumed to be mm → ÷10)
 *   4. 'unknown' as last resort
 */
function resolveRisk(child) {
  const rl = child.risk_level?.toLowerCase()
  if (rl && rl !== 'unknown') return rl

  // Try status field (SEVERE/MODERATE/NORMAL)
  const st = child.status?.toUpperCase()
  if (st === 'SEVERE') return 'severe'
  if (st === 'MODERATE') return 'moderate'
  if (st === 'NORMAL') return 'normal'

  // Local MUAC fallback
  const rawMuac = child.muac_cm
  if (rawMuac != null) {
    const muac = rawMuac > 50 ? rawMuac / 10 : rawMuac
    if (muac < 11.5) return 'severe'
    if (muac < 12.5) return 'moderate'
    return 'normal'
  }

  return 'unknown'
}

export default function ChildrenList() {
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { t } = useLanguage()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const paramFilter = searchParams.get('risk_level')
    if (paramFilter) setFilter(paramFilter)
  }, [searchParams])

  useEffect(() => {
    async function load() {
      try {
        const params = {}
        if (search) params.search = search
        if (filter) params.risk_level = filter
        const data = await api.getChildren(params)
        setChildren(data)
        offlineDB.saveChildren(data)
      } catch {
        const cached = await offlineDB.getChildren()
        let result = cached || []
        if (search) result = result.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        if (filter) result = result.filter(c => c.risk_level === filter)
        setChildren(result)
      } finally { setLoading(false) }
    }
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [search, filter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteChild(deleteTarget.id)
      await offlineDB.deleteChild(deleteTarget.id)
      setChildren(prev => prev.filter(c => c.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      // If offline, queue for sync
      if (err.message.includes('Network') || err.message.includes('offline')) {
        await offlineDB.addToSyncQueue({ type: 'DELETE_CHILD', data: { id: deleteTarget.id } })
        await offlineDB.deleteChild(deleteTarget.id)
        setChildren(prev => prev.filter(c => c.id !== deleteTarget.id))
        setDeleteTarget(null)
      } else {
        alert(t('children.deleteError') + ': ' + err.message)
      }
    } finally { setDeleting(false) }
  }


  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{
            fontSize: '1.75rem', fontWeight: 800,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4,
          }}>{t('children.title')}</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {children.length} {t('children.registered')}
          </p>
        </div>
        <Link to="/add-child" className="btn btn-primary">
          <UserPlus size={16} /> {t('nav.addChild')}
        </Link>
      </motion.div>

      {/* Search & Filter */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder={t('children.search')}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input select" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{t('children.allRisk')}</option>
          <option value="normal">{t('common.normal')}</option>
          <option value="moderate">{t('common.moderate')}</option>
          <option value="severe">{t('common.severe')}</option>
        </select>
      </motion.div>

      {/* Children List */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : children.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel"
          style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>{t('children.noFound')}</p>
          <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {search || filter ? t('children.adjustSearch') : t('children.getStarted')}
          </p>
        </motion.div>
      ) : (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {[t('common.name'), t('common.age'), 'Sex', t('common.weight'), t('common.height'), 'MUAC', t('common.risk'), t('common.village'), t('children.actions')].map(h => (
                  <th key={h} style={{
                    padding: '12px 14px', textAlign: 'left', fontSize: '0.7rem',
                    fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {children.map((child, i) => (
                <motion.tr key={child.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px' }}>
                    <Link to={`/children/${child.id}`} style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
                      {child.name}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{child.age_months}m</td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{child.sex === 'M' ? '♂' : '♀'}</td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{child.weight_kg || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{child.height_cm || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{child.muac_cm || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {(() => {
                      const risk = resolveRisk(child)
                      const fromMuac = (child.risk_level === 'unknown' || !child.risk_level) && child.muac_cm != null
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={`risk-badge ${risk}`}>{risk}</span>
                          {fromMuac && (
                            <span title="Risk derived from MUAC (Z-scores unavailable)"
                              style={{ fontSize: '0.65rem', color: 'var(--color-warning)', cursor: 'help' }}>
                              ⚠ MUAC
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{child.village || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <motion.button onClick={() => setDeleteTarget(child)}
                      className="btn btn-icon" style={{
                        background: 'rgba(239,68,68,0.08)', color: 'var(--color-danger)',
                        width: 32, height: 32, padding: 0,
                      }}
                      whileHover={{ scale: 1.15, background: 'rgba(239,68,68,0.18)' }}
                      whileTap={{ scale: 0.9 }}>
                      <Trash2 size={15} />
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('children.confirmDelete')}
        message={t('children.confirmDeleteMsg', { name: deleteTarget?.name || '' })}
        confirmLabel={t('common.delete')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  )
}