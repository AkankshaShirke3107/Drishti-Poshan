import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, ScanLine, Loader2, CheckCircle, AlertTriangle,
  Trash2, Save, ArrowLeft, FileImage, Users, X, Eye,
} from 'lucide-react'
import { api } from '../lib/api'

// ── Column definitions for the editable grid ─────────────────
const COLUMNS = [
  { key: 'name',             label: 'Name',           type: 'text',   placeholder: 'Child name' },
  { key: 'age_months',       label: 'Age (mo)',       type: 'number', placeholder: '0-72', step: '1' },
  { key: 'sex',              label: 'Sex',            type: 'select', options: ['M', 'F'] },
  { key: 'weight_kg',        label: 'Weight (kg)',    type: 'number', placeholder: 'kg', step: '0.1' },
  { key: 'height_cm',        label: 'Height (cm)',    type: 'number', placeholder: 'cm', step: '0.1' },
  { key: 'muac_cm',          label: 'MUAC (cm)',      type: 'number', placeholder: 'cm', step: '0.1' },
  { key: 'guardian_name',    label: 'Guardian',       type: 'text',   placeholder: 'Guardian name' },
  { key: 'village',          label: 'Village',        type: 'text',   placeholder: 'Village' },
]

export default function BulkAddChild() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scannedData, setScannedData] = useState([])
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [toast, setToast] = useState(null)

  // ── Handle file upload & OCR scan ──────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Preview
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target.result)
    reader.readAsDataURL(file)

    setScanning(true)
    setError(null)
    setWarnings([])
    setScannedData([])

    try {
      const result = await api.bulkScan(file)
      if (result.success && result.entries?.length > 0) {
        // Convert to plain objects for editing
        setScannedData(result.entries.map((entry, i) => ({ ...entry, _rowId: i })))
        setWarnings(result.warnings || [])
        showToast(`✅ ${result.entry_count} entries extracted!`, 'success')
      } else if (result.entries?.length === 0) {
        setError('No entries found in the image. Try a clearer photo of the register page.')
      } else {
        setError(result.detail || 'OCR extraction failed.')
      }
    } catch (err) {
      setError(err.message || 'Failed to process image.')
    } finally {
      setScanning(false)
    }
  }

  // ── Update a cell in the grid ──────────────────────────
  const updateCell = (rowIndex, key, value) => {
    setScannedData(prev => prev.map((row, i) =>
      i === rowIndex ? { ...row, [key]: value } : row
    ))
  }

  // ── Delete a row ──────────────────────────────────────
  const deleteRow = (rowIndex) => {
    setScannedData(prev => prev.filter((_, i) => i !== rowIndex))
  }

  // ── Add empty row ──────────────────────────────────────
  const addEmptyRow = () => {
    setScannedData(prev => [...prev, {
      _rowId: Date.now(), name: '', age_months: '', sex: 'M',
      weight_kg: '', height_cm: '', muac_cm: '', guardian_name: '', village: '',
    }])
  }

  // ── Save all records ──────────────────────────────────
  const handleSaveAll = async () => {
    // Validate: at least name and age required
    const valid = scannedData.filter(r => r.name?.trim() && r.age_months)
    if (valid.length === 0) {
      setError('No valid entries to save. Each record needs at least a name and age.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Clean data for API
      const payload = valid.map(r => ({
        name: r.name?.trim(),
        age_months: parseInt(r.age_months) || 0,
        sex: r.sex || 'M',
        weight_kg: r.weight_kg ? parseFloat(r.weight_kg) : undefined,
        height_cm: r.height_cm ? parseFloat(r.height_cm) : undefined,
        muac_cm: r.muac_cm ? parseFloat(r.muac_cm) : undefined,
        guardian_name: r.guardian_name?.trim() || undefined,
        village: r.village?.trim() || undefined,
      }))

      await api.bulkAddChildren(payload)
      showToast(`🎉 ${payload.length} children saved successfully!`, 'success')
      setTimeout(() => navigate('/children'), 1500)
    } catch (err) {
      setError(err.message || 'Failed to save records.')
    } finally {
      setSaving(false)
    }
  }

  // ── Toast helper ──────────────────────────────────────
  const showToast = (message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Row validity indicator ────────────────────────────
  const isRowValid = (row) => !!(row.name?.trim() && row.age_months)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}
      >
        <motion.button onClick={() => navigate(-1)} className="btn btn-secondary"
          style={{ padding: '8px 12px' }}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <ArrowLeft size={18} />
        </motion.button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
            📋 Bulk Scan & Add
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: 0, marginTop: 2 }}>
            Scan a register page to extract multiple children at once
          </p>
        </div>
      </motion.div>

      {/* Upload Area */}
      <motion.div
        className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ padding: 32, marginBottom: 24, textAlign: 'center' }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="bulk-scan-input"
        />

        {!preview ? (
          <motion.div
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '48px 24px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            whileHover={{
              borderColor: 'var(--color-primary)',
              background: 'rgba(99,102,241,0.04)',
            }}
          >
            <Upload size={40} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
              Upload Register Photo
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Take a photo of the tabular register page or upload an existing image
            </p>
            <div style={{
              display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16,
              fontSize: '0.68rem', color: 'var(--color-text-muted)',
            }}>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-bg-secondary)' }}>PNG</span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-bg-secondary)' }}>JPEG</span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-bg-secondary)' }}>WebP</span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--color-bg-secondary)' }}>Max 15MB</span>
            </div>
          </motion.div>
        ) : (
          <div style={{ position: 'relative' }}>
            <img src={preview} alt="Register scan"
              style={{
                maxWidth: '100%', maxHeight: 200, borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)', objectFit: 'contain',
              }} />
            <motion.button
              onClick={() => { setPreview(null); setScannedData([]); setError(null); fileRef.current.value = '' }}
              className="btn btn-secondary"
              style={{
                position: 'absolute', top: 8, right: 8, padding: '4px 8px',
                fontSize: '0.7rem', background: 'rgba(0,0,0,0.6)', color: '#fff',
                border: 'none',
              }}
              whileHover={{ scale: 1.05 }}>
              <X size={12} /> Change
            </motion.button>
            {scanning && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)',
                  background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 12,
                }}>
                <ScanLine size={32} style={{ color: '#fff', animation: 'spin 2s linear infinite' }} />
                <p style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
                  Scanning register…
                </p>
              </motion.div>
            )}
          </div>
        )}

        {!preview && !scanning && (
          <motion.button
            onClick={() => fileRef.current?.click()}
            className="btn btn-primary"
            style={{ marginTop: 20, padding: '12px 28px', fontSize: '0.9rem' }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <FileImage size={18} /> Select Register Image
          </motion.button>
        )}
      </motion.div>

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

      {/* Warnings */}
      {warnings.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            padding: '10px 16px', marginBottom: 20, borderRadius: 'var(--radius-md)',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: '0.75rem', color: 'var(--color-warning)',
          }}>
          <strong>OCR Warnings:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </motion.div>
      )}

      {/* Editable Data Grid */}
      {scannedData.length > 0 && (
        <motion.div
          className="glass-panel"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}
        >
          {/* Grid header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={18} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {scannedData.length} Entries Extracted
              </span>
              <span style={{
                fontSize: '0.65rem', padding: '2px 8px', borderRadius: 10,
                background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)',
                fontWeight: 600,
              }}>
                Review & Edit
              </span>
            </div>
            <motion.button onClick={addEmptyRow} className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '6px 12px' }}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              + Add Row
            </motion.button>
          </div>

          {/* Scrollable table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
              minWidth: 900,
            }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)' }}>
                  <th style={{ ...thStyle, width: 36 }}>#</th>
                  {COLUMNS.map(col => (
                    <th key={col.key} style={thStyle}>{col.label}</th>
                  ))}
                  <th style={{ ...thStyle, width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {scannedData.map((row, rowIdx) => (
                  <motion.tr key={row._rowId ?? rowIdx}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: rowIdx * 0.02 }}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: isRowValid(row) ? 'transparent' : 'rgba(245,158,11,0.04)',
                    }}>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700,
                      color: 'var(--color-text-muted)', fontSize: '0.7rem',
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', margin: '0 auto',
                        background: isRowValid(row) ? '#10B981' : '#F59E0B',
                      }} />
                    </td>
                    {COLUMNS.map(col => (
                      <td key={col.key} style={tdStyle}>
                        {col.type === 'select' ? (
                          <select
                            value={row[col.key] || 'M'}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            style={inputStyle}
                          >
                            {col.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={col.type}
                            value={row[col.key] ?? ''}
                            onChange={e => updateCell(rowIdx, col.key, e.target.value)}
                            placeholder={col.placeholder}
                            step={col.step}
                            style={{
                              ...inputStyle,
                              color: (col.key === 'name' && !row[col.key]?.trim())
                                ? 'var(--color-danger)' : 'var(--color-text)',
                            }}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <motion.button
                        onClick={() => deleteRow(rowIdx)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--color-text-muted)', padding: 4,
                        }}
                        whileHover={{ scale: 1.2, color: '#EF4444' }}>
                        <Trash2 size={14} />
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save button footer */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {scannedData.filter(isRowValid).length} of {scannedData.length} rows valid
            </span>
            <motion.button
              onClick={handleSaveAll}
              disabled={saving || scannedData.filter(isRowValid).length === 0}
              className="btn btn-primary"
              style={{
                padding: '12px 28px', fontSize: '0.88rem', fontWeight: 700,
                opacity: scannedData.filter(isRowValid).length === 0 ? 0.5 : 1,
              }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {saving ? (
                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              ) : (
                <><Save size={18} /> Save All Records ({scannedData.filter(isRowValid).length})</>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
              padding: '14px 24px', borderRadius: 'var(--radius-md)',
              background: toast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(99,102,241,0.95)',
              color: '#fff', fontSize: '0.88rem', fontWeight: 600,
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <CheckCircle size={16} /> {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Shared styles ───────────────────────────────────────────
const thStyle = {
  padding: '10px 8px',
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
  borderBottom: '2px solid var(--color-border)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '6px 6px',
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: '0.78rem',
  outline: 'none',
  transition: 'border-color 0.2s',
}
