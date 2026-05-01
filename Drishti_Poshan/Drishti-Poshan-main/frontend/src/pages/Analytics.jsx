import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter, ZAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  BarChart3, AlertTriangle, Users, TrendingUp, Activity,
  MapPin, Loader2, ShieldCheck,
} from 'lucide-react'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'
import { CardSkeleton } from '../components/LoadingSkeleton'

/* ── Color Palette ──────────────────────────────────────────── */
const STATUS_COLORS = {
  SEVERE: '#EF4444',
  MODERATE: '#F59E0B',
  NORMAL: '#10B981',
}

const CHART_ACCENT = {
  primary: '#6366F1',
  secondary: '#06B6D4',
  tertiary: '#8B5CF6',
  warm: '#F97316',
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: '0.78rem',
  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
}

/* ── Custom Tooltip for Scatter ─────────────────────────────── */
function GrowthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ ...tooltipStyle, padding: '10px 14px' }}>
      <p style={{ fontWeight: 700, fontSize: '0.72rem', color: STATUS_COLORS[d.status] || '#10B981', marginBottom: 4 }}>
        {d.status || 'NORMAL'}
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
        Weight: <strong>{d.weight_kg} kg</strong> · Height: <strong>{d.height_cm} cm</strong>
      </p>
    </div>
  )
}

/* ── KPI Card ───────────────────────────────────────────────── */
function KPICard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <motion.div
      className="glass-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.08 }}
      style={{
        padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${color}18`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
          {label}
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{value}</p>
      </div>
    </motion.div>
  )
}

/* ── Chart Wrapper ──────────────────────────────────────────── */
function ChartPanel({ icon: Icon, title, delay, children }) {
  return (
    <motion.div
      className="glass-panel"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: delay * 0.1 }}
      style={{ padding: 24 }}
    >
      <h3 style={{
        fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Icon size={18} /> {title}
      </h3>
      {children}
    </motion.div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const summary = await api.getAnalyticsSummary()
        setData(summary)
      } catch (err) {
        console.warn('Analytics fetch failed, building from cache:', err.message)
        setError(err.message)

        // Offline fallback: build KPIs from cached children
        try {
          const cached = await offlineDB.getChildren()
          if (cached?.length) {
            setData({
              kpis: {
                total: cached.length,
                sam: cached.filter(c => c.status === 'SEVERE' || c.risk_level === 'severe').length,
                mam: cached.filter(c => c.status === 'MODERATE' || c.risk_level === 'moderate').length,
                normal: cached.filter(c => !c.status || c.status === 'NORMAL' || c.risk_level === 'normal').length,
              },
              risk_distribution: [
                { status: 'NORMAL', count: cached.filter(c => !c.status || c.status === 'NORMAL').length },
                { status: 'MODERATE', count: cached.filter(c => c.status === 'MODERATE').length },
                { status: 'SEVERE', count: cached.filter(c => c.status === 'SEVERE').length },
              ].filter(d => d.count > 0),
              hotspots: [],
              trends: [],
              growth_data: cached
                .filter(c => c.weight_kg && c.height_cm)
                .slice(0, 500)
                .map(c => ({ weight_kg: c.weight_kg, height_cm: c.height_cm, status: c.status || 'NORMAL' })),
            })
            setError(null) // clear error if we got fallback data
          }
        } catch { /* no cache either */ }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div>
        <div className="stats-grid">{[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
        <AlertTriangle size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p>Failed to load analytics data.</p>
        {error && <p style={{ fontSize: '0.78rem', marginTop: 8 }}>{error}</p>}
      </div>
    )
  }

  const { kpis, risk_distribution, hotspots, trends, growth_data } = data

  // Build pie chart data with colors
  const pieData = risk_distribution
    .map(d => ({
      name: d.status,
      value: d.count,
      color: STATUS_COLORS[d.status] || '#10B981',
    }))
    .filter(d => d.value > 0)

  return (
    <div>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: '1.6rem', fontWeight: 800,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4,
        }}>
          Analytics Dashboard
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
          Population health insights and nutrition trends
        </p>
      </motion.div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPICard icon={Users} label="Total Children" value={kpis.total} color={CHART_ACCENT.primary} delay={0} />
        <KPICard icon={AlertTriangle} label="SAM (Severe)" value={kpis.sam} color={STATUS_COLORS.SEVERE} delay={1} />
        <KPICard icon={Activity} label="MAM (Moderate)" value={kpis.mam} color={STATUS_COLORS.MODERATE} delay={2} />
        <KPICard icon={ShieldCheck} label="Normal" value={kpis.normal} color={STATUS_COLORS.NORMAL} delay={3} />
      </div>

      {/* Charts Grid — Top Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Donut: Risk Distribution */}
        <ChartPanel icon={BarChart3} title="Risk Distribution" delay={1}>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={100} innerRadius={60}
                  paddingAngle={4} animationDuration={1200}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: '0.72rem', paddingTop: 12 }}
                  formatter={(val) => <span style={{ color: 'var(--color-text-secondary)' }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No risk data available yet
            </div>
          )}
        </ChartPanel>

        {/* Bar: Village Hotspots */}
        <ChartPanel icon={MapPin} title="Village Hotspots (Severe Cases)" delay={2}>
          {hotspots.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hotspots} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="village" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} width={90} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="severe_count" name="Severe Cases" fill={STATUS_COLORS.SEVERE}
                  radius={[0, 6, 6, 0]} animationDuration={1200} barSize={24}>
                  {hotspots.map((_, i) => (
                    <Cell key={i} fill={`hsl(0, ${70 + i * 5}%, ${50 - i * 3}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No severe cases reported yet — great news! 🎉
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Charts Grid — Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Line: Monthly Trends */}
        <ChartPanel icon={TrendingUp} title="Monthly Screening Trends" delay={3}>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trends}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_ACCENT.primary} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={CHART_ACCENT.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone" dataKey="screenings" name="Screenings"
                  stroke={CHART_ACCENT.primary} strokeWidth={2.5}
                  dot={{ r: 4, fill: CHART_ACCENT.primary, strokeWidth: 2, stroke: 'var(--color-surface)' }}
                  activeDot={{ r: 6 }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No trend data available yet
            </div>
          )}
        </ChartPanel>

        {/* Scatter: Growth Distribution */}
        <ChartPanel icon={Activity} title="Growth Distribution (Weight vs Height)" delay={4}>
          {growth_data.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  type="number" dataKey="height_cm" name="Height"
                  unit=" cm" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  domain={['dataMin - 5', 'dataMax + 5']}
                />
                <YAxis
                  type="number" dataKey="weight_kg" name="Weight"
                  unit=" kg" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
                <ZAxis range={[35, 35]} />
                <Tooltip content={<GrowthTooltip />} />
                <Scatter name="Children" data={growth_data} animationDuration={1200}>
                  {growth_data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={STATUS_COLORS[entry.status] || STATUS_COLORS.NORMAL}
                      fillOpacity={0.7}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
              No growth measurements recorded yet
            </div>
          )}
        </ChartPanel>
      </div>
    </div>
  )
}
