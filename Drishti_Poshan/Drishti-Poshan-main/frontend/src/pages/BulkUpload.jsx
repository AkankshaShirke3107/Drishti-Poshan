import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle, AlertTriangle,
  ArrowLeft, BarChart3, Brain, Users, Activity, TrendingDown,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

const PIE_COLORS = ['#EF4444', '#F59E0B', '#10B981']

export default function BulkUpload() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [strategy, setStrategy] = useState(null)
  const [error, setError] = useState(null)

  // ── Drag & Drop handlers ──────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.toLowerCase().endsWith('.csv')) {
      setFile(f)
      setError(null)
    } else {
      setError('Please upload a .csv file.')
    }
  }, [])

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }

  // ── Process CSV ───────────────────────────────────────
  const handleProcess = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)
    setStrategy(null)

    try {
      const res = await api.uploadCSV(file)
      setResult(res)

      // Auto-trigger batch analysis
      if (res.summary && res.summary.total_children > 0) {
        setAnalyzing(true)
        try {
          const analysis = await api.analyzeBatch({
            total_children: res.summary.total_children,
            sam_count: res.summary.sam_count,
            mam_count: res.summary.mam_count,
            normal_count: res.summary.normal_count,
            avg_muac: res.summary.avg_muac,
            avg_whz: res.summary.avg_whz,
            sam_percent: res.summary.sam_percent,
            mam_percent: res.summary.mam_percent,
          })
          setStrategy(analysis)
        } catch (err) {
          console.warn('Batch analysis failed:', err)
        } finally {
          setAnalyzing(false)
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to process CSV.')
    } finally {
      setUploading(false)
    }
  }

  // ── Classification badge ──────────────────────────────
  const classBadge = (cls) => {
    const colors = { SEVERE: '#EF4444', MODERATE: '#F59E0B', NORMAL: '#10B981', UNKNOWN: '#9CA3AF' }
    return (
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
        background: `${colors[cls] || colors.UNKNOWN}18`,
        color: colors[cls] || colors.UNKNOWN, textTransform: 'uppercase',
      }}>{cls}</span>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}
      >
        <motion.button onClick={() => navigate(-1)} className="btn btn-secondary"
          style={{ padding: '8px 12px' }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <ArrowLeft size={18} />
        </motion.button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
            📊 Bulk CSV Migration
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0, marginTop: 2 }}>
            Upload a CSV register to analyze and import hundreds of child records
          </p>
        </div>
      </motion.div>

      {/* Upload Zone */}
      {!result && (
        <motion.div
          className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: 32, marginBottom: 24 }}
        >
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect}
            style={{ display: 'none' }} id="csv-upload-input" />

          {/* Drag & drop area */}
          <motion.div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !file && fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-primary)' : file ? 'var(--color-success)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: file ? '24px' : '48px 24px',
              cursor: file ? 'default' : 'pointer',
              textAlign: 'center',
              background: dragOver ? 'rgba(99,102,241,0.04)' : file ? 'rgba(16,185,129,0.04)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
                <FileSpreadsheet size={32} style={{ color: 'var(--color-success)' }} />
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                    {file.name}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    {(file.size / 1024).toFixed(1)} KB — Ready to process
                  </p>
                </div>
                <motion.button
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                  whileHover={{ scale: 1.05 }}>
                  Change
                </motion.button>
              </div>
            ) : (
              <>
                <Upload size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                  {dragOver ? 'Drop CSV file here' : 'Drag & Drop CSV File'}
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                  or click to browse. Accepts .csv files up to 10 MB
                </p>
                <p style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                  Required columns: <code>child_name</code>, <code>age_months</code> &nbsp;|&nbsp;
                  Optional: <code>weight_kg</code>, <code>height_cm</code>, <code>muac_cm</code>,
                  <code>gender</code>, <code>village</code>
                </p>
              </>
            )}
          </motion.div>

          {file && (
            <motion.button
              onClick={handleProcess}
              disabled={uploading}
              className="btn btn-primary"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 20, padding: '14px 32px', fontSize: '0.95rem', fontWeight: 700, width: '100%' }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
            >
              {uploading ? (
                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing CSV…</>
              ) : (
                <><Activity size={18} /> Process & Analyze</>
              )}
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            marginBottom: 20, borderRadius: 'var(--radius-md)',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--color-danger)', fontSize: '0.82rem',
          }}>
          <AlertTriangle size={16} /> {error}
        </motion.div>
      )}

      {/* ═══════ Results Dashboard ═══════ */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

          {/* Summary Cards */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24,
          }}>
            {[
              { label: 'Total Processed', value: result.valid_rows, icon: Users, color: '#6366F1' },
              { label: 'SAM Cases', value: result.summary.sam_count,
                sub: `${result.summary.sam_percent}%`, icon: AlertTriangle, color: '#EF4444' },
              { label: 'MAM Cases', value: result.summary.mam_count,
                sub: `${result.summary.mam_percent}%`, icon: TrendingDown, color: '#F59E0B' },
              { label: 'Avg WHZ', value: result.summary.avg_whz?.toFixed(2) ?? 'N/A',
                icon: BarChart3, color: '#10B981' },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <motion.div key={label} className="glass-panel"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ padding: 20, textAlign: 'center' }}>
                <Icon size={22} style={{ color, marginBottom: 8 }} />
                <p style={{ fontSize: '1.6rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{label}</p>
                {sub && <p style={{ fontSize: '0.65rem', color, marginTop: 2 }}>{sub}</p>}
              </motion.div>
            ))}
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Pie Chart */}
            <motion.div className="glass-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              style={{ padding: 24 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={16} /> Classification Distribution
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'SAM', value: result.summary.sam_count },
                      { name: 'MAM', value: result.summary.mam_count },
                      { name: 'Normal', value: result.summary.normal_count },
                    ]}
                    cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {PIE_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Bar Chart */}
            <motion.div className="glass-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              style={{ padding: 24 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} /> Key Metrics
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { metric: 'Avg MUAC', value: result.summary.avg_muac || 0, fill: '#6366F1' },
                  { metric: 'Avg WHZ', value: Math.abs(result.summary.avg_whz || 0), fill: '#F59E0B' },
                  { metric: 'Min WHZ', value: Math.abs(result.summary.min_whz || 0), fill: '#EF4444' },
                  { metric: 'Max WHZ', value: result.summary.max_whz || 0, fill: '#10B981' },
                ]}>
                  <XAxis dataKey="metric" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 8, fontSize: '0.78rem',
                  }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {['#6366F1', '#F59E0B', '#EF4444', '#10B981'].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Preview Table */}
          {result.preview?.length > 0 && (
            <motion.div className="glass-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
                fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <FileSpreadsheet size={16} /> Data Preview (first 5 rows)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-secondary)' }}>
                      {['#', 'Name', 'Age', 'Sex', 'Weight', 'Height', 'MUAC', 'WHZ', 'Status'].map(h => (
                        <th key={h} style={{
                          padding: '8px 10px', textAlign: 'left', fontSize: '0.68rem',
                          fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase',
                          letterSpacing: '0.05em', borderBottom: '2px solid var(--color-border)',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row) => (
                      <tr key={row.row_num} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={tdS}>{row.row_num}</td>
                        <td style={{ ...tdS, fontWeight: 600 }}>{row.name || '—'}</td>
                        <td style={tdS}>{row.age_months ?? '—'}m</td>
                        <td style={tdS}>{row.sex || '—'}</td>
                        <td style={tdS}>{row.weight_kg ?? '—'}</td>
                        <td style={tdS}>{row.height_cm ?? '—'}</td>
                        <td style={tdS}>{row.muac_cm ?? '—'}</td>
                        <td style={tdS}>
                          {row.whz != null ? (
                            <span style={{
                              fontWeight: 700,
                              color: row.whz < -3 ? '#EF4444' : row.whz < -2 ? '#F59E0B' : '#10B981',
                            }}>{row.whz.toFixed(2)}</span>
                          ) : '—'}
                        </td>
                        <td style={tdS}>{classBadge(row.classification || 'UNKNOWN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* XAI Batch Strategy */}
          <motion.div className="glass-panel"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            style={{ padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={18} /> AI Public Health Strategy
              {strategy && (
                <span style={{
                  fontSize: '0.6rem', padding: '2px 8px', borderRadius: 10, marginLeft: 8,
                  background: strategy.source === 'groq-llama3' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
                  color: strategy.source === 'groq-llama3' ? '#6366F1' : '#F59E0B',
                  fontWeight: 600,
                }}>
                  {strategy.source}
                </span>
              )}
            </h3>

            {analyzing ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 20, color: 'var(--color-text-muted)', fontSize: '0.85rem',
              }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Generating district-level intervention strategy…
              </div>
            ) : strategy?.strategy ? (
              <div style={{
                fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap',
              }}>
                {strategy.strategy}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Strategy generation pending…
              </p>
            )}
          </motion.div>

          {/* Warnings */}
          {result.warnings?.length > 0 && (
            <motion.div className="glass-panel"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              style={{ padding: 16, marginBottom: 24 }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-warning)', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> Processing Warnings ({result.warnings.length})
              </h4>
              <ul style={{
                fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: 0,
                paddingLeft: 16, maxHeight: 150, overflowY: 'auto',
              }}>
                {result.warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
              </ul>
            </motion.div>
          )}

          {/* Upload Another */}
          <div style={{ display: 'flex', gap: 12 }}>
            <motion.button onClick={() => { setFile(null); setResult(null); setStrategy(null) }}
              className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: '0.85rem' }}
              whileHover={{ scale: 1.02 }}>
              Upload Another CSV
            </motion.button>
            <motion.button onClick={() => navigate('/children')}
              className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.85rem' }}
              whileHover={{ scale: 1.02 }}>
              <Users size={16} /> View All Children
            </motion.button>
          </div>

          {/* Insert summary */}
          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 12 }}>
            <CheckCircle size={12} style={{ verticalAlign: 'middle' }} />{' '}
            {result.inserted} records saved to database | {result.skipped} rows skipped
          </p>
        </motion.div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const tdS = { padding: '8px 10px', color: 'var(--color-text-secondary)' }
