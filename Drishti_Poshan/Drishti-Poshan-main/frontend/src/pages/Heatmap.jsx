import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Map, Download, TrendingUp, TrendingDown, Minus,
  Users, AlertTriangle, Activity, X, ChevronRight, Lightbulb,
  BarChart3, Crosshair, Loader2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend,
  AreaChart, Area,
} from 'recharts'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'
import { CardSkeleton } from '../components/LoadingSkeleton'
import { useLanguage } from '../context/LanguageContext'

/* ═══════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════ */

const AGE_GROUPS = [
  { label: '0-6m', min: 0, max: 6 },
  { label: '7-12m', min: 7, max: 12 },
  { label: '13-24m', min: 13, max: 24 },
  { label: '25-36m', min: 25, max: 36 },
  { label: '37-48m', min: 37, max: 48 },
  { label: '49-60m', min: 49, max: 60 },
]

const RISK_LEVELS = ['normal', 'moderate', 'severe']

// Professional medical dashboard gradient palettes
// Each palette goes from light → dark as intensity increases
const RISK_GRADIENTS = {
  normal: {
    from: 'rgba(16,185,129,0.10)',
    to: 'rgba(5,150,105,0.70)',
    text: '#065f46',
    textDark: '#6ee7b7',
    base: '#10b981',
  },
  moderate: {
    from: 'rgba(245,158,11,0.10)',
    to: 'rgba(180,83,9,0.70)',
    text: '#92400e',
    textDark: '#fcd34d',
    base: '#f59e0b',
  },
  severe: {
    from: 'rgba(239,68,68,0.10)',
    to: 'rgba(153,27,27,0.70)',
    text: '#991b1b',
    textDark: '#fca5a5',
    base: '#ef4444',
  },
}

/* ═══════════════════════════════════════════════════
   Utility helpers
   ═══════════════════════════════════════════════════ */

function getIntensity(count, maxCount) {
  if (maxCount === 0 || count === 0) return 0
  return Math.min(count / maxCount, 1)
}

/** Build radial gradient background for glassmorphic cell */
function cellBg(risk, intensity) {
  const g = RISK_GRADIENTS[risk]
  if (intensity === 0) return undefined
  // Radial gradient: bright center fading outward, intensity scales brightness
  const centerAlpha = Math.max(0.2, intensity * 0.75)
  const edgeAlpha = Math.max(0.06, intensity * 0.3)
  return `radial-gradient(ellipse at 50% 45%, ${g.base}${Math.round(centerAlpha * 255).toString(16).padStart(2, '0')}, ${g.base}${Math.round(edgeAlpha * 255).toString(16).padStart(2, '0')})`
}

/** Percentage with 1 decimal */
function pct(n, total) {
  if (!total) return '0.0'
  return ((n / total) * 100).toFixed(1)
}

/** Get dominant status color for a village */
function villageStatusColor(children, village) {
  const vc = children.filter(c => c.village === village)
  if (vc.length === 0) return '#94a3b8'
  const severe = vc.filter(c => c.risk_level === 'severe').length
  const moderate = vc.filter(c => c.risk_level === 'moderate').length
  if (severe > 0) return '#ef4444'
  if (moderate > 0) return '#f59e0b'
  return '#10b981'
}

/** Tiny SVG sparkline for sidebar cards */
function MiniSparkline({ color, value, max }) {
  // Generate a pseudo-trend from the value ratio
  const ratio = max > 0 ? value / max : 0
  const points = [
    0.3 + Math.random() * 0.2,
    0.4 + Math.random() * 0.15,
    ratio * 0.5 + 0.15,
    ratio * 0.7 + 0.1,
    ratio * 0.85 + 0.05,
    ratio,
    ratio * 0.95 + 0.02,
  ]
  const h = 28
  const w = 70
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - (p * h * 0.85) - 2
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')
  const areaPath = path + ` L${w},${h} L0,${h} Z`

  return (
    <svg width={w} height={h} style={{ display: 'block', margin: '4px auto 0' }}>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace('#', '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════
   Auto-generate Health Insights from data
   ═══════════════════════════════════════════════════ */

function generateInsights(grid, filtered, villages, t) {
  const insights = []
  const totalChildren = filtered.length
  if (totalChildren === 0) return insights

  const severeCount = filtered.filter(c => c.risk_level === 'severe').length
  const moderateCount = filtered.filter(c => c.risk_level === 'moderate').length

  // 1. Find age group with highest concentration of each risk
  for (const risk of ['severe', 'moderate']) {
    const rows = grid.filter(r => r[risk] > 0).sort((a, b) => b[risk] - a[risk])
    if (rows.length > 0) {
      const top = rows[0]
      const riskTotal = risk === 'severe' ? severeCount : moderateCount
      if (riskTotal > 0) {
        const concentration = ((top[risk] / riskTotal) * 100).toFixed(0)
        if (concentration >= 40) {
          insights.push({
            type: risk === 'severe' ? 'danger' : 'warning',
            icon: risk === 'severe' ? '🔴' : '⚠️',
            text: t('heatmap.insightConcentration', {
              pct: concentration,
              risk: t(`common.${risk}`),
              age: top.label,
            }),
          })
        }
      }
    }
  }

  // 2. Village-specific actionable recommendations
  if (villages.length > 1) {
    const villageCounts = {}
    const villageNormal = {}
    filtered.forEach(c => {
      if (!c.village) return
      if (c.risk_level === 'severe' || c.risk_level === 'moderate') {
        villageCounts[c.village] = (villageCounts[c.village] || 0) + 1
      }
      if (c.risk_level === 'normal') {
        villageNormal[c.village] = (villageNormal[c.village] || 0) + 1
      }
    })
    const sorted = Object.entries(villageCounts).sort((a, b) => b[1] - a[1])

    // Find a village with all-normal status for comparison
    const healthyVillage = villages.find(v => !villageCounts[v] && villageNormal[v] > 0)

    if (sorted.length > 0) {
      const [worstVillage, worstCount] = sorted[0]
      if (healthyVillage) {
        insights.push({
          type: 'danger',
          icon: '📍',
          text: t('heatmap.insightVillageRealloc', {
            healthy: healthyVillage,
            worst: worstVillage,
            count: String(worstCount),
          }),
        })
      } else {
        insights.push({
          type: 'danger',
          icon: '📍',
          text: t('heatmap.insightVillageAlert', {
            count: String(worstCount),
            village: worstVillage,
            risk: t('common.moderate') + ' + ' + t('common.severe'),
          }),
        })
      }
    }
  }

  // 3. Highest risk density age group
  const densest = [...grid].sort((a, b) => (b.severe + b.moderate) - (a.severe + a.moderate))[0]
  if (densest && (densest.severe + densest.moderate) > 0) {
    const atRisk = densest.severe + densest.moderate
    const totalInGroup = densest.total
    insights.push({
      type: 'info',
      icon: '📊',
      text: t('heatmap.insightRiskDensity', {
        age: densest.label,
        atRisk: String(atRisk),
        total: String(totalInGroup),
        pct: totalInGroup > 0 ? ((atRisk / totalInGroup) * 100).toFixed(0) : '0',
      }),
    })
  }

  // 4. Overall SAM rate alert
  if (severeCount > 0 && totalChildren > 0) {
    const samPct = ((severeCount / totalChildren) * 100).toFixed(1)
    if (parseFloat(samPct) >= 5) {
      insights.push({
        type: 'danger',
        icon: '🚨',
        text: t('heatmap.insightSamAlert', { pct: samPct }),
      })
    }
  }

  // 5. Positive note if mostly normal
  const normalPct = ((filtered.filter(c => c.risk_level === 'normal').length / totalChildren) * 100).toFixed(0)
  if (parseFloat(normalPct) >= 80) {
    insights.push({
      type: 'success',
      icon: '✅',
      text: t('heatmap.insightPositive', { pct: normalPct }),
    })
  }

  return insights
}

/* ═══════════════════════════════════════════════════
   Export helpers
   ═══════════════════════════════════════════════════ */

async function exportAsPng(ref) {
  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(ref, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
    })
    const link = document.createElement('a')
    link.download = `malnutrition-report-${new Date().toISOString().slice(0, 10)}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    return true
  } catch {
    return false
  }
}

function exportAsCsv(grid, filtered) {
  const header = 'Age Group,Normal,Moderate,Severe,Total\n'
  const rows = grid.map(r => `${r.label},${r.normal},${r.moderate},${r.severe},${r.total}`).join('\n')
  const blob = new Blob([header + rows], { type: 'text/csv' })
  const link = document.createElement('a')
  link.download = `malnutrition-report-${new Date().toISOString().slice(0, 10)}.csv`
  link.href = URL.createObjectURL(blob)
  link.click()
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function Heatmap() {
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [villageFilter, setVillageFilter] = useState('')
  const [villages, setVillages] = useState([])
  const [drillCell, setDrillCell] = useState(null) // { ageGroup, risk, children }
  const [exporting, setExporting] = useState(false)
  const { t } = useLanguage()
  const reportRef = useRef(null)

  // ── Data loading (offline-first) ──────────────────
  useEffect(() => {
    async function load() {
      try {
        const [data, stats] = await Promise.all([
          api.getChildren({ limit: 1000 }),
          api.getStats(),
        ])
        setChildren(data)
        setVillages(stats.villages || [])
        offlineDB.saveChildren(data)
      } catch {
        const cached = await offlineDB.getChildren()
        setChildren(cached || [])
        const vs = [...new Set((cached || []).map(c => c.village).filter(Boolean))]
        setVillages(vs)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  // ── Derived data ──────────────────────────────────
  const filtered = useMemo(() => {
    if (!villageFilter) return children
    return children.filter(c => c.village === villageFilter)
  }, [children, villageFilter])

  const { grid, maxCount } = useMemo(() => {
    const g = AGE_GROUPS.map(ag => {
      const row = {}
      RISK_LEVELS.forEach(rl => {
        row[rl] = filtered.filter(c =>
          c.age_months >= ag.min && c.age_months <= ag.max && c.risk_level === rl
        ).length
      })
      row.total = Object.values(row).reduce((a, b) => a + b, 0)
      return { ...ag, ...row }
    })
    const max = Math.max(...g.flatMap(r => RISK_LEVELS.map(rl => r[rl])), 1)
    return { grid: g, maxCount: max }
  }, [filtered])

  // ── Global stats ──────────────────────────────────
  const stats = useMemo(() => {
    const total = filtered.length
    const severe = filtered.filter(c => c.risk_level === 'severe').length
    const moderate = filtered.filter(c => c.risk_level === 'moderate').length
    const normal = total - severe - moderate
    return { total, severe, moderate, normal }
  }, [filtered])

  // ── Village breakdown chart data ──────────────────
  const villageChartData = useMemo(() => {
    if (villages.length === 0) return []
    const data = villages.map(v => {
      const vc = children.filter(c => c.village === v)
      return {
        village: v.length > 14 ? v.slice(0, 12) + '…' : v,
        fullName: v,
        severe: vc.filter(c => c.risk_level === 'severe').length,
        moderate: vc.filter(c => c.risk_level === 'moderate').length,
        normal: vc.filter(c => c.risk_level === 'normal').length,
        total: vc.length,
      }
    })
    return data.sort((a, b) => (b.severe + b.moderate) - (a.severe + a.moderate))
  }, [children, villages])

  // ── Health insights ───────────────────────────────
  const insights = useMemo(
    () => generateInsights(grid, filtered, villages, t),
    [grid, filtered, villages, t]
  )

  // ── Drill-down: find children for a cell ──────────
  const openDrill = useCallback((ageGroup, risk) => {
    const matches = filtered.filter(c =>
      c.age_months >= ageGroup.min && c.age_months <= ageGroup.max && c.risk_level === risk
    )
    if (matches.length === 0) return
    setDrillCell({ ageLabel: ageGroup.label, risk, children: matches })
  }, [filtered])

  // ── Export handler ────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true)
    const ok = reportRef.current ? await exportAsPng(reportRef.current) : false
    if (!ok) exportAsCsv(grid, filtered)
    setTimeout(() => setExporting(false), 1200)
  }, [grid, filtered])

  // ── Loading ───────────────────────────────────────
  if (loading) {
    return (
      <div className="stats-grid">
        {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div className="matrix-page">
      {/* ═══ Page Title ═════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 8 }}>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 800,
          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Map size={28} style={{ color: '#f59e0b' }} /> {t('heatmap.title')}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {t('heatmap.subtitle')}
        </p>
      </motion.div>

      {/* ═══ Global Statistics Header ═══════════════════ */}
      <motion.div className="matrix-stats-row"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}>

        <div className="stat-pill">
          <span className="stat-pill__label">
            <Users size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
            {t('heatmap.totalScreened')}
          </span>
          <span className="stat-pill__value" style={{ color: 'var(--color-primary)' }}>
            {stats.total}
          </span>
          <span className="stat-pill__sub">{t('heatmap.children')}</span>
        </div>

        <div className="stat-pill">
          <span className="stat-pill__label">
            <AlertTriangle size={13} style={{ marginRight: 4, verticalAlign: -2, color: '#ef4444' }} />
            {t('heatmap.samRate')}
          </span>
          <span className="stat-pill__value" style={{ color: '#ef4444' }}>
            {pct(stats.severe, stats.total)}%
          </span>
          <span className="stat-pill__sub">{stats.severe} {t('common.severe')}</span>
        </div>

        <div className="stat-pill">
          <span className="stat-pill__label">
            <Activity size={13} style={{ marginRight: 4, verticalAlign: -2, color: '#f59e0b' }} />
            {t('heatmap.mamRate')}
          </span>
          <span className="stat-pill__value" style={{ color: '#f59e0b' }}>
            {pct(stats.moderate, stats.total)}%
          </span>
          <span className="stat-pill__sub">{stats.moderate} {t('common.moderate')}</span>
        </div>

        <div className="stat-pill">
          <span className="stat-pill__label">
            {stats.severe > stats.normal
              ? <TrendingUp size={13} style={{ marginRight: 4, verticalAlign: -2, color: '#ef4444' }} />
              : stats.severe === 0
                ? <Minus size={13} style={{ marginRight: 4, verticalAlign: -2, color: '#10b981' }} />
                : <TrendingDown size={13} style={{ marginRight: 4, verticalAlign: -2, color: '#10b981' }} />
            }
            {t('heatmap.trend')}
          </span>
          <span className="stat-pill__value" style={{
            color: stats.severe > stats.normal ? '#ef4444' : '#10b981'
          }}>
            {stats.severe > stats.normal
              ? t('heatmap.trendUp')
              : stats.severe === 0
                ? t('heatmap.trendStable')
                : t('heatmap.trendDown')
            }
          </span>
          <span className="stat-pill__sub">
            {pct(stats.normal, stats.total)}% {t('common.normal')}
          </span>
        </div>
      </motion.div>

      {/* ═══ Village Filter Pill Selector (Scrollable) ═══ */}
      <motion.div className="village-pills"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}>
        <button
          className={`village-pill ${!villageFilter ? 'village-pill--active' : ''}`}
          onClick={() => setVillageFilter('')}
        >
          <Crosshair size={13} /> {t('heatmap.allVillages')}
          <span style={{ opacity: 0.7 }}>({children.length})</span>
        </button>
        {villages.map(v => {
          const vc = children.filter(c => c.village === v).length
          const dotColor = villageStatusColor(children, v)
          return (
            <button key={v}
              className={`village-pill ${villageFilter === v ? 'village-pill--active' : ''}`}
              onClick={() => setVillageFilter(v === villageFilter ? '' : v)}
            >
              <span className="village-pill__dot" style={{ color: dotColor, background: dotColor }} />
              {v} <span style={{ opacity: 0.7 }}>({vc})</span>
            </button>
          )
        })}
      </motion.div>

      {/* ═══ Main Body: Matrix + Sidebar ═══════════════ */}
      <div className="matrix-body">
        {/* ── Left: Matrix + Village Chart ─────────── */}
        <div>
          {/* Export + hint row */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crosshair size={13} /> {t('heatmap.clickToDrill')}
            </span>
            <motion.button className={`btn btn-secondary ${exporting ? 'btn--exporting' : ''}`}
              onClick={handleExport}
              disabled={exporting}
              style={{ fontSize: '0.78rem', padding: '8px 16px', gap: 6 }}
              whileHover={exporting ? {} : { scale: 1.03 }} whileTap={exporting ? {} : { scale: 0.97 }}>
              {exporting
                ? <><span className="export-spinner" /> Generating...</>
                : <><Download size={15} /> {t('heatmap.downloadReport')}</>
              }
            </motion.button>
          </motion.div>

          {/* ── Intensity Matrix ─────────────────── */}
          <motion.div className="glass-panel" ref={reportRef}
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }} style={{ padding: 24, overflow: 'auto' }}>

            {filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <Map size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p>{t('heatmap.noData')}</p>
              </div>
            ) : (
              <>
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>{t('heatmap.ageGroup')}</th>
                      {RISK_LEVELS.map(rl => (
                        <th key={rl} className="risk-col" style={{ color: RISK_GRADIENTS[rl].base }}>
                          {t(`common.${rl}`)}
                        </th>
                      ))}
                      <th className="risk-col">{t('heatmap.count')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row, i) => (
                      <motion.tr key={row.label}
                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + i * 0.06 }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)' }}>
                          {row.label}
                        </td>
                        {RISK_LEVELS.map(rl => {
                          const count = row[rl]
                          const intensity = getIntensity(count, maxCount)
                          const isEmpty = count === 0
                          const isSevere = rl === 'severe' && count > 0
                          return (
                            <td key={rl} style={{ padding: 3 }}>
                              <motion.div
                                className={`matrix-cell ${isEmpty ? 'matrix-cell--empty' : ''} ${isSevere ? 'matrix-cell--severe' : ''}`}
                                style={{
                                  background: isEmpty ? undefined : cellBg(rl, intensity),
                                  color: isEmpty ? undefined : RISK_GRADIENTS[rl].text,
                                }}
                                onClick={() => !isEmpty && openDrill(row, rl)}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.3 + i * 0.06 }}
                                whileHover={!isEmpty ? { scale: 1.08 } : {}}
                              >
                                {count}
                                {!isEmpty && (
                                  <span className="matrix-cell__tooltip">
                                    {row.label} · {t(`common.${rl}`)} · {pct(count, filtered.length)}% of total
                                  </span>
                                )}
                              </motion.div>
                            </td>
                          )
                        })}
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                          {row.total}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>

                {/* Continuous Gradient Legend */}
                <div style={{ marginTop: 24 }}>
                  <div className="matrix-legend-unified">
                    <div className="matrix-legend-unified__bar" />
                  </div>
                  <div className="matrix-legend-unified__labels">
                    <span style={{ color: '#10b981' }}>{t('common.normal')}</span>
                    <span style={{ color: '#f59e0b' }}>{t('common.moderate')}</span>
                    <span style={{ color: '#ef4444' }}>{t('common.severe')}</span>
                    <span>Critical</span>
                  </div>
                </div>
              </>
            )}
          </motion.div>

          {/* ── Village Breakdown Bar Chart ─────── */}
          {villageChartData.length > 1 && (
            <motion.div className="glass-panel"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              style={{ padding: 24, marginTop: 20 }}>
              <h3 style={{
                fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text)',
                marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <BarChart3 size={18} style={{ color: '#f59e0b' }} />
                {t('heatmap.villageBreakdown')}
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(180, villageChartData.length * 42)}>
                <BarChart data={villageChartData} layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="village" width={100}
                    tick={{ fill: 'var(--color-text)', fontSize: 11, fontWeight: 600 }}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: 10, fontSize: '0.8rem', fontFamily: 'var(--font-family)',
                    }}
                    cursor={{ fill: 'rgba(100,116,139,0.08)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.72rem', fontWeight: 600 }} />
                  <Bar dataKey="severe" stackId="risk" name={t('common.severe')} radius={[0, 0, 0, 0]}>
                    {villageChartData.map((_, i) => (
                      <Cell key={i} fill="#ef4444" />
                    ))}
                  </Bar>
                  <Bar dataKey="moderate" stackId="risk" name={t('common.moderate')} radius={[0, 0, 0, 0]}>
                    {villageChartData.map((_, i) => (
                      <Cell key={i} fill="#f59e0b" />
                    ))}
                  </Bar>
                  <Bar dataKey="normal" stackId="risk" name={t('common.normal')} radius={[0, 4, 4, 0]}>
                    {villageChartData.map((_, i) => (
                      <Cell key={i} fill="#10b981" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </div>

        {/* ── Right: Health Insight Sidebar ──────── */}
        <motion.div
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}>
          <div className="glass-panel" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{
              fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text)',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Lightbulb size={18} style={{ color: '#f59e0b' }} />
              {t('heatmap.healthInsights')}
            </h3>

            <div className="insight-sidebar">
              {insights.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                  {t('heatmap.noData')}
                </div>
              ) : (
                insights.map((ins, i) => (
                  <motion.div key={i}
                    className={`insight-card insight-card--${ins.type}`}
                    initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}>
                    <div className="insight-card__icon">{ins.icon}</div>
                    <div style={{ flex: 1 }}>{ins.text}</div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Sparkline Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: t('common.severe'), value: stats.severe, color: '#ef4444' },
              { label: t('common.moderate'), value: stats.moderate, color: '#f59e0b' },
              { label: t('common.normal'), value: stats.normal, color: '#10b981' },
              { label: t('heatmap.ageGroup') + 's', value: AGE_GROUPS.length, color: 'var(--color-primary)' },
            ].map((s, i) => (
              <motion.div key={s.label}
                className="sparkline-card"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.06 }}>
                <div className="sparkline-card__value" style={{ color: s.color }}>{s.value}</div>
                <div className="sparkline-card__label">{s.label}</div>
                {typeof s.value === 'number' && s.color !== 'var(--color-primary)' && (
                  <MiniSparkline color={s.color} value={s.value} max={stats.total || 1} />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ═══ Drill-Down Modal ══════════════════════════ */}
      <AnimatePresence>
        {drillCell && (
          <motion.div className="drill-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDrillCell(null)}>
            <motion.div className="drill-modal"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}>

              <div className="drill-modal__header">
                <div className="drill-modal__title">
                  {drillCell.ageLabel} / {t(`common.${drillCell.risk}`)} — {drillCell.children.length} {t('heatmap.children')}
                </div>
                <button className="drill-modal__close" onClick={() => setDrillCell(null)}>
                  <X size={16} />
                </button>
              </div>

              {drillCell.children.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>
                  {t('heatmap.drillEmpty')}
                </p>
              ) : (
                drillCell.children.map((child, i) => (
                  <motion.div key={child.id || i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}>
                    <Link to={`/children/${child.id}`} className="drill-child-row">
                      <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                        background: `${RISK_GRADIENTS[drillCell.risk].base}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '0.82rem',
                        color: RISK_GRADIENTS[drillCell.risk].base,
                      }}>
                        {(child.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="drill-child-row__name">
                        {child.name || 'Unknown'}
                        <div className="drill-child-row__meta">
                          {child.age_months}m · {child.village || '—'} · {child.weight_kg ? `${child.weight_kg}kg` : ''}
                        </div>
                      </div>
                      <span className={`risk-badge ${drillCell.risk}`} style={{ fontSize: '0.6rem' }}>
                        {t(`common.${drillCell.risk}`)}
                      </span>
                      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                    </Link>
                  </motion.div>
                ))
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}