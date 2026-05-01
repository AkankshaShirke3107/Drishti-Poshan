import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Weight, Ruler, Activity, Brain, Plus,
  Calendar, AlertTriangle, ShieldCheck, Loader2, CloudOff, Edit3,
  CheckCircle, Clock, FlaskConical,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { api, isPendingId } from '../lib/api'
import { useIdReconciliation } from '../hooks/useSyncQueue'
import HealthCard from '../components/HealthCard'
import XAIChart from '../components/XAIChart'
import { CardSkeleton } from '../components/LoadingSkeleton'


// ── Status color helpers ─────────────────────────────────────
const STATUS_ACCENT = {
  SEVERE: '#EF4444', MODERATE: '#F59E0B', NORMAL: '#10B981',
}
const statusBg = (s) => `${STATUS_ACCENT[s] || '#10B981'}18`

export default function ChildProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isPending = isPendingId(id)
  useIdReconciliation(id)

  const [child, setChild] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [history, setHistory] = useState([])
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  // Observation form
  const [showObsForm, setShowObsForm] = useState(false)
  const [obsForm, setObsForm] = useState({ weight_kg: '', height_cm: '', muac_cm: '', notes: '' })
  const [obsSaving, setObsSaving] = useState(false)
  const [obsSuccess, setObsSuccess] = useState(false)

  // Lab diagnostics
  const [labs, setLabs] = useState([])
  const [showLabForm, setShowLabForm] = useState(false)
  const [labForm, setLabForm] = useState({ serum_albumin_g_dl: '', prealbumin_mg_dl: '', crp_mg_l: '', notes: '' })
  const [labSaving, setLabSaving] = useState(false)
  const [labSuccess, setLabSuccess] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [childData, historyData, obsData, labData] = await Promise.all([
          api.getChild(id),
          api.getAnalysisHistory(id).catch(() => ({ history: [] })),
          api.getObservations(id).catch(() => []),
          api.getLabs(id).catch(() => []),
        ])
        setChild(childData)
        setHistory(historyData.history || historyData || [])
        setObservations(Array.isArray(obsData) ? obsData : [])
        setLabs(Array.isArray(labData) ? labData : [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const runAnalysis = async () => {
    setAnalyzing(true)
    setAnalysis(null)   // force unmount → remount of charts for clean re-render
    try {
      const raw = await api.analyzeChild(id)
      console.debug('[Analysis] Raw response:', raw)

      // Build z_scores with triple fallback:
      //   1. Flat top-level fields (analysis.waz) ← most reliable
      //   2. Nested z_scores object (analysis.z_scores.waz)
      //   3. Child's own cached Z-scores (childData.waz) ← last resort
      const nested = raw.z_scores || {}
      const resolveZ = (key, UPPER) =>
        raw[key]           ?? raw[UPPER]           ??   // flat field
        nested[key]        ?? nested[UPPER]         ??   // nested
        child?.[key]       ?? child?.[UPPER]        ??   // child cache
        null

      const normalizedAnalysis = {
        ...raw,
        risk_level: raw.risk_level || 'unknown',
        z_scores: {
          waz:   resolveZ('waz',   'WAZ'),
          haz:   resolveZ('haz',   'HAZ'),
          whz:   resolveZ('whz',   'WHZ'),
          bmi_z: resolveZ('bmi_z', 'BMI_Z'),
        },
        impact_map:           raw.impact_map || {},
        recommendations:      raw.recommendations || [],
        data_quality_warning: raw.data_quality_warning || null,
      }

      console.debug('[Analysis] Resolved z_scores:', normalizedAnalysis.z_scores)
      setAnalysis(normalizedAnalysis)

      // Refresh history + child metric cards
      const [h, freshChild] = await Promise.all([
        api.getAnalysisHistory(id).catch(() => ({ history: [] })),
        api.getChild(id).catch(() => null),
      ])
      setHistory(h.history || h || [])
      if (freshChild) setChild(freshChild)

    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Submit new observation ──────────────────────────
  const handleObsSubmit = async (e) => {
    e.preventDefault()
    setObsSaving(true)
    try {
      const payload = {
        weight_kg: obsForm.weight_kg ? parseFloat(obsForm.weight_kg) : undefined,
        height_cm: obsForm.height_cm ? parseFloat(obsForm.height_cm) : undefined,
        muac_cm: obsForm.muac_cm ? parseFloat(obsForm.muac_cm) : undefined,
        notes: obsForm.notes.trim() || undefined,
      }
      const obs = await api.addObservation(id, payload)
      setObservations(prev => [obs, ...prev])

      // Update child's latest values locally
      setChild(prev => {
        if (!prev) return prev
        const updated = { ...prev }
        if (payload.weight_kg) updated.weight_kg = payload.weight_kg
        if (payload.height_cm) updated.height_cm = payload.height_cm
        if (payload.muac_cm) updated.muac_cm = payload.muac_cm
        if (obs.status) updated.status = obs.status
        if (obs.risk_level) updated.risk_level = obs.risk_level
        return updated
      })

      setObsSuccess(true)
      setObsForm({ weight_kg: '', height_cm: '', muac_cm: '', notes: '' })
      setTimeout(() => { setObsSuccess(false); setShowObsForm(false) }, 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setObsSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="stats-grid">{[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}</div>
      </div>
    )
  }

  if (error && !child) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-muted)' }}>
        <AlertTriangle size={40} style={{ margin: '0 auto 12px', color: 'var(--color-danger)' }} />
        <p>Error loading child profile: {error}</p>
        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Dashboard</Link>
      </div>
    )
  }

  // Build chart data from observations (oldest first for proper timeline)
  const chartData = [...observations].reverse().map(o => ({
    date: o.timestamp
      ? new Date(o.timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      : '',
    weight: o.weight_kg,
    height: o.height_cm,
    muac: o.muac_cm,
    waz: o.waz,
  }))

  return (
    <div>
      {/* Pending sync banner */}
      {isPending && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', marginBottom: 20,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.3)',
            fontSize: '0.82rem', color: 'var(--color-warning)',
          }}
        >
          <CloudOff size={18} />
          <div>
            <strong>Pending Sync</strong> — This record was created offline and hasn't synced yet.
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}
      >
        <motion.div className="btn btn-icon btn-secondary"
          onClick={() => navigate(-1)}
          style={{ cursor: 'pointer' }}
          whileHover={{ scale: 1.05, x: -2 }} whileTap={{ scale: 0.95 }}>
          <ArrowLeft size={20} />
        </motion.div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: 2 }}>
            {child?.name}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            <span>{child?.age_months} months</span>
            <span>•</span>
            <span>{child?.sex === 'M' ? 'Male' : 'Female'}</span>
            {child?.anganwadi_center && (<><span>•</span><span>{child.anganwadi_center}</span></>)}
            {child?.village && (<><span>•</span><span>🏘 {child.village}</span></>)}
            <span className={`risk-badge ${child?.risk_level || 'normal'}`}>
              {child?.risk_level || 'normal'}
            </span>
          </div>
        </div>
        <Link to={`/children/${id}/edit`}>
          <motion.div className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.82rem' }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Edit3 size={16} /> Edit
          </motion.div>
        </Link>
      </motion.div>

      {/* Metrics */}
      <div className="stats-grid">
        <HealthCard title="Weight" value={child?.weight_kg} unit="kg" icon={Weight} delay={0} riskLevel={child?.risk_level} status={child?.status} />
        <HealthCard title="Height" value={child?.height_cm} unit="cm" icon={Ruler} delay={1} status={child?.status} />
        <HealthCard title="MUAC" value={child?.muac_cm} unit="cm" icon={Activity} delay={2} status={child?.status} muacValue={child?.muac_cm} />
        <HealthCard title="Observations" value={observations.length} icon={Calendar} delay={3} />
      </div>

      {/* Record New Observation Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ marginBottom: 24, display: 'flex', gap: 12 }}
      >
        <motion.button
          onClick={() => setShowObsForm(prev => !prev)}
          className="btn btn-primary"
          style={{ fontSize: '0.9rem', padding: '12px 24px' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        >
          <Plus size={18} /> Record New Measurement
        </motion.button>
        <motion.button
          onClick={runAnalysis}
          disabled={analyzing || isPending}
          className="btn btn-secondary"
          style={{ fontSize: '0.9rem', padding: '12px 24px', opacity: isPending ? 0.5 : 1 }}
          whileHover={isPending ? {} : { scale: 1.02 }}
          whileTap={isPending ? {} : { scale: 0.98 }}
          title={isPending ? 'Analysis requires a synced record' : undefined}
        >
          {analyzing ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
            : <><Brain size={18} /> AI Analysis</>}
        </motion.button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>

      {/* Observation Form (collapsible) */}
      <AnimatePresence>
        {showObsForm && (
          <motion.form
            onSubmit={handleObsSubmit}
            className="glass-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ padding: 24, marginBottom: 24, overflow: 'hidden' }}
          >
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--color-text)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} /> New Observation
            </h3>

            {obsSuccess && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12,
                  borderRadius: 'var(--radius-sm)', background: 'rgba(16,185,129,0.15)',
                  color: 'var(--color-success)', marginBottom: 16, fontSize: '0.85rem' }}>
                <CheckCircle size={16} /> Observation recorded successfully!
              </motion.div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label className="label" htmlFor="obs-weight">Weight (kg)</label>
                <input id="obs-weight" className="input" type="number" step="0.1" min="0.5" max="50"
                  value={obsForm.weight_kg}
                  onChange={e => setObsForm(p => ({ ...p, weight_kg: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="obs-height">Height (cm)</label>
                <input id="obs-height" className="input" type="number" step="0.1" min="30" max="150"
                  value={obsForm.height_cm}
                  onChange={e => setObsForm(p => ({ ...p, height_cm: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="obs-muac">MUAC (cm)</label>
                <input id="obs-muac" className="input" type="number" step="0.1" min="5" max="30"
                  value={obsForm.muac_cm}
                  onChange={e => setObsForm(p => ({ ...p, muac_cm: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="label" htmlFor="obs-notes">Notes</label>
              <input id="obs-notes" className="input" type="text" placeholder="Optional notes…"
                value={obsForm.notes}
                onChange={e => setObsForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <motion.button type="submit" disabled={obsSaving || obsSuccess} className="btn btn-primary"
              style={{ marginTop: 16, padding: '10px 24px', fontSize: '0.85rem' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {obsSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <><CheckCircle size={16} /> Save Observation</>}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Analysis Results */}
      {analysis && (() => {
        // ── Bulletproof Z-score resolution ────────────────────────
        // Priority: analysis flat → analysis.z_scores → latest observation → child
        const latestObs = observations?.[0] || {}
        const src = (key) => {
          // 1. Flat top-level from analysis response
          const flat = analysis[key]
          if (flat !== null && flat !== undefined && flat !== '') return parseFloat(flat)
          // 2. Nested z_scores object
          const nested = analysis.z_scores?.[key]
          if (nested !== null && nested !== undefined && nested !== '') return parseFloat(nested)
          // 3. Uppercase variant (WAZ, HAZ, WHZ, BMI_Z)
          const upper = key.toUpperCase()
          const flatU = analysis[upper] ?? analysis.z_scores?.[upper]
          if (flatU !== null && flatU !== undefined && flatU !== '') return parseFloat(flatU)
          // 4. Latest observation
          const obs = latestObs[key] ?? latestObs[upper]
          if (obs !== null && obs !== undefined && obs !== '') return parseFloat(obs)
          // 5. Child model cache
          const ch = child?.[key] ?? child?.[upper]
          if (ch !== null && ch !== undefined && ch !== '') return parseFloat(ch)
          return null
        }

        const waz   = src('waz')
        const haz   = src('haz')
        const whz   = src('whz')
        const bmi_z = src('bmi_z')

        console.debug('[Z-Score Cards] Resolved values:', { waz, haz, whz, bmi_z })
        console.debug('[Z-Score Cards] Sources — analysis:', analysis, '| latestObs:', latestObs, '| child:', child)

        // ── Derive badge from ACTUAL Z-score values, not backend risk_level ──
        const allZ = [waz, haz, whz].filter(v => v !== null)
        let derivedStatus = analysis.risk_level || 'unknown'
        if (allZ.length > 0) {
          const minZ = Math.min(...allZ)
          if (minZ < -3) derivedStatus = 'severe'
          else if (minZ < -2) derivedStatus = 'moderate'
          else derivedStatus = 'normal'
        }

        const cards = [
          { label: 'WAZ', sub: 'Weight-for-Age',    value: waz },
          { label: 'HAZ', sub: 'Height-for-Age',    value: haz },
          { label: 'WHZ', sub: 'Weight-for-Height', value: whz },
          { label: 'BMI-Z', sub: 'Body Mass Index', value: bmi_z },
        ]

        // WHZ severity color
        const whzColor = whz === null ? 'var(--color-text-muted)'
          : whz < -3 ? '#EF4444'
          : whz < -2 ? '#F59E0B'
          : '#10B981'
        const whzLabel = whz === null ? 'N/A'
          : whz < -3 ? 'Severe Acute Malnutrition'
          : whz < -2 ? 'Moderate Acute Malnutrition'
          : 'Normal'

        return (
          <motion.div
            key={`analysis-${waz}-${haz}-${whz}-${bmi_z}`}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ marginBottom: 32 }}
          >
            {/* ── Verified WHO WHZ Badge ──────────────── */}
            {whz !== null && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 24px', marginBottom: 20,
                  borderRadius: 'var(--radius-md)',
                  background: `${whzColor}12`,
                  border: `2px solid ${whzColor}40`,
                }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `${whzColor}20`, border: `3px solid ${whzColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem', fontWeight: 900, color: whzColor,
                }}>
                  {whz.toFixed(1)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>
                    Weight-for-Height Z-Score (WHZ)
                  </p>
                  <p style={{ fontSize: '1rem', fontWeight: 800, color: whzColor, lineHeight: 1.2 }}>
                    {whzLabel}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)', background: `${whzColor}20`,
                  color: whzColor, letterSpacing: '0.05em', textTransform: 'uppercase',
                  border: `1px solid ${whzColor}40`,
                }}>✓ WHO LMS Verified</span>
              </motion.div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="glass-panel" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} /> WHO Z-Scores
                <span className={`risk-badge ${derivedStatus}`} style={{ marginLeft: 'auto', fontSize: '0.65rem' }}>
                  {derivedStatus}
                </span>
              </h3>

              {/* Data quality warning banner */}
              {analysis.data_quality_warning && (
                <div style={{
                  display: 'flex', gap: 8, padding: '8px 12px', marginBottom: 12,
                  borderRadius: 'var(--radius-sm)', background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.72rem',
                  color: 'var(--color-warning)', lineHeight: 1.4,
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{analysis.data_quality_warning}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {cards.map(({ label, sub, value }) => {
                  const isAvailable = value !== null && !isNaN(value)
                  const num = isAvailable ? value : null
                  const color = !isAvailable
                    ? 'var(--color-text-muted)'
                    : num < -3 ? 'var(--color-danger)'
                    : num < -2 ? 'var(--color-warning)'
                    : 'var(--color-success)'
                  return (
                    <div key={label} style={{
                      padding: 14, borderRadius: 'var(--radius-sm)',
                      background: 'var(--color-bg-secondary)',
                      borderLeft: `3px solid ${color}`,
                    }}>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                        color: 'var(--color-text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>
                        {label}
                      </p>
                      <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                        {sub}
                      </p>
                      <p style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>
                        {isAvailable ? num.toFixed(2) : 'N/A'}
                      </p>
                      {isAvailable && (
                        <p style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                          {num < -3 ? '⚠ Severe' : num < -2 ? '⚡ Moderate' : '✓ Normal'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={18} /> SHAP Risk Factor Analysis
              </h3>
              <XAIChart impactMap={analysis.impact_map} chartType="bar" />
            </div>
            </div>
          </motion.div>
        )
      })()}


      {/* Recommendations */}
      {analysis?.recommendations?.length > 0 && (
        <motion.div className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }} style={{ padding: 24, marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 12 }}>
            📋 AI Recommendations
          </h3>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analysis.recommendations.map((rec, i) => (
              <motion.li key={i}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                style={{
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg-secondary)', fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)', lineHeight: 1.5,
                }}>
                {rec}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Observation History Timeline */}
      {observations.length > 0 && (
        <motion.div className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }} style={{ padding: 24, marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} /> Observation History ({observations.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {observations.map((obs, i) => {
              const accent = STATUS_ACCENT[obs.status] || '#10B981'
              return (
                <motion.div key={obs.id || i}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  {/* Date */}
                  <div style={{ minWidth: 90, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {obs.timestamp
                      ? new Date(obs.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                      : '—'}
                  </div>

                  {/* Measurements */}
                  <div style={{ flex: 1, display: 'flex', gap: 16, fontSize: '0.82rem' }}>
                    {obs.weight_kg != null && (
                      <span style={{ color: 'var(--color-text)' }}>
                        <strong>{obs.weight_kg}</strong> <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>kg</span>
                      </span>
                    )}
                    {obs.height_cm != null && (
                      <span style={{ color: 'var(--color-text)' }}>
                        <strong>{obs.height_cm}</strong> <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>cm</span>
                      </span>
                    )}
                    {obs.muac_cm != null && (
                      <span style={{ color: 'var(--color-text)' }}>
                        MUAC <strong>{obs.muac_cm}</strong> <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>cm</span>
                      </span>
                    )}
                  </div>

                  {/* Status badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: statusBg(obs.status),
                    color: accent,
                    border: `1px solid ${accent}33`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, display: 'inline-block' }} />
                    {obs.status || 'NORMAL'}
                  </span>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Growth Chart — Weight vs Time */}
      {chartData.length > 1 && (
        <motion.div className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }} style={{ padding: 24, marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 20 }}>
            📈 Weight vs. Time
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 8, fontSize: '0.8rem',
                }}
              />
              <Area type="monotone" dataKey="weight" stroke="var(--color-primary)"
                fill="url(#weightGrad)" strokeWidth={2} name="Weight (kg)"
                animationDuration={1200} dot={{ r: 3, fill: 'var(--color-primary)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Height + MUAC trend (if we have data) */}
      {chartData.length > 1 && chartData.some(d => d.muac != null) && (
        <motion.div className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }} style={{ padding: 24 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 20 }}>
            📊 Height & MUAC Trend
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 8, fontSize: '0.8rem',
                }}
              />
              <Line type="monotone" dataKey="height" stroke="#6366F1" strokeWidth={2}
                name="Height (cm)" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="muac" stroke="#F59E0B" strokeWidth={2}
                name="MUAC (cm)" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* ── Lab Results (NRC Only) ────────────────────── */}
      <motion.div className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }} style={{ padding: 24, marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{
            fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <FlaskConical size={18} /> 🏥 Lab Results (NRC Only)
          </h3>
          <motion.button
            onClick={() => setShowLabForm(prev => !prev)}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          >
            <Plus size={14} /> Add Lab Result
          </motion.button>
        </div>

        {/* Lab form */}
        <AnimatePresence>
          {showLabForm && (
            <motion.form
              onSubmit={async (e) => {
                e.preventDefault()
                setLabSaving(true)
                try {
                  const payload = {
                    serum_albumin_g_dl: labForm.serum_albumin_g_dl ? parseFloat(labForm.serum_albumin_g_dl) : undefined,
                    prealbumin_mg_dl: labForm.prealbumin_mg_dl ? parseFloat(labForm.prealbumin_mg_dl) : undefined,
                    crp_mg_l: labForm.crp_mg_l ? parseFloat(labForm.crp_mg_l) : undefined,
                    notes: labForm.notes.trim() || undefined,
                  }
                  const result = await api.addLab(id, payload)
                  setLabs(prev => [result, ...prev])
                  setLabSuccess(true)
                  setLabForm({ serum_albumin_g_dl: '', prealbumin_mg_dl: '', crp_mg_l: '', notes: '' })
                  setTimeout(() => { setLabSuccess(false); setShowLabForm(false) }, 1500)
                } catch (err) {
                  setError(err.message)
                } finally { setLabSaving(false) }
              }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: 16 }}
            >
              {labSuccess && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10,
                    borderRadius: 'var(--radius-sm)', background: 'rgba(16,185,129,0.15)',
                    color: 'var(--color-success)', marginBottom: 12, fontSize: '0.82rem' }}>
                  <CheckCircle size={14} /> Lab result recorded!
                </motion.div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label" htmlFor="lab-albumin">Serum Albumin (g/dL)</label>
                  <input id="lab-albumin" className="input" type="number" step="0.1" min="0.5" max="10"
                    placeholder="Normal: 3.4-5.4"
                    value={labForm.serum_albumin_g_dl}
                    onChange={e => setLabForm(p => ({ ...p, serum_albumin_g_dl: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor="lab-prealbumin">Prealbumin (mg/dL)</label>
                  <input id="lab-prealbumin" className="input" type="number" step="0.1" min="0.5" max="60"
                    placeholder="Normal: 15-36"
                    value={labForm.prealbumin_mg_dl}
                    onChange={e => setLabForm(p => ({ ...p, prealbumin_mg_dl: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor="lab-crp">CRP (mg/L)</label>
                  <input id="lab-crp" className="input" type="number" step="0.1" min="0" max="500"
                    placeholder="Normal: <5.0"
                    value={labForm.crp_mg_l}
                    onChange={e => setLabForm(p => ({ ...p, crp_mg_l: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label className="label" htmlFor="lab-notes">Notes</label>
                <input id="lab-notes" className="input" type="text" placeholder="Lab technician notes…"
                  value={labForm.notes}
                  onChange={e => setLabForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <motion.button type="submit" disabled={labSaving || labSuccess} className="btn btn-primary"
                style={{ marginTop: 12, padding: '8px 20px', fontSize: '0.82rem' }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                {labSaving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                  : <><CheckCircle size={14} /> Save Lab Result</>}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Lab history */}
        {labs.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>
            No lab results recorded yet. Lab data is typically collected at NRC / health facilities.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {labs.map((lab, i) => {
              const albColor = lab.serum_albumin_g_dl == null ? 'var(--color-text-muted)'
                : lab.serum_albumin_g_dl < 3.0 ? '#ef4444'
                : lab.serum_albumin_g_dl < 3.4 ? '#f59e0b' : '#10b981'
              const preColor = lab.prealbumin_mg_dl == null ? 'var(--color-text-muted)'
                : lab.prealbumin_mg_dl < 10 ? '#ef4444'
                : lab.prealbumin_mg_dl < 15 ? '#f59e0b' : '#10b981'
              const crpColor = lab.crp_mg_l == null ? 'var(--color-text-muted)'
                : lab.crp_mg_l > 10 ? '#ef4444'
                : lab.crp_mg_l > 5 ? '#f59e0b' : '#10b981'

              return (
                <motion.div key={lab.id || i}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    borderLeft: '3px solid #6366f1',
                  }}>
                  <div style={{ minWidth: 85, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {lab.collected_at
                      ? new Date(lab.collected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                      : '—'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: 18, fontSize: '0.8rem' }}>
                    {lab.serum_albumin_g_dl != null && (
                      <span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>ALB </span>
                        <strong style={{ color: albColor }}>{lab.serum_albumin_g_dl}</strong>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}> g/dL</span>
                      </span>
                    )}
                    {lab.prealbumin_mg_dl != null && (
                      <span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>PRE </span>
                        <strong style={{ color: preColor }}>{lab.prealbumin_mg_dl}</strong>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}> mg/dL</span>
                      </span>
                    )}
                    {lab.crp_mg_l != null && (
                      <span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>CRP </span>
                        <strong style={{ color: crpColor }}>{lab.crp_mg_l}</strong>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}> mg/L</span>
                      </span>
                    )}
                  </div>
                  {lab.notes && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lab.notes}
                    </span>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}