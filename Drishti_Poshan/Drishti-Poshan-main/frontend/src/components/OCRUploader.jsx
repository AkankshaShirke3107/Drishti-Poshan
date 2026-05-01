import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Upload, Loader2, FileText, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

export default function OCRUploader({ onExtracted }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(f)
  }

  const handleExtract = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await api.extractText(file)
      console.log('OCR Raw Response:', res)

      // api.extractText returns the parsed JSON directly (no .data wrapper)
      if (!res || !res.success) {
        throw new Error(res?.detail || res?.error || 'OCR extraction failed')
      }

      setResult(res)
      if (onExtracted) onExtracted(res)
    } catch (err) {
      console.error('OCR Error:', err)
      setError(err?.message || 'Failed to extract text from image')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const confidencePercent = result?.overall_confidence != null
    ? Math.round(result.overall_confidence * 100)
    : null

  const extractedName = result?.extracted_child?.name
  const extractedWeight = result?.extracted_child?.weight_kg
  const extractedHeight = result?.extracted_child?.height_cm

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={18} /> Form OCR (Groq Vision)
      </h3>

      {/* Upload area */}
      {!preview ? (
        <motion.label
          htmlFor="ocr-upload"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: 32, borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--color-border)', cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          whileHover={{ borderColor: 'var(--color-primary)', background: 'rgba(37,99,235,0.05)' }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-primary)',
          }}>
            <Camera size={24} />
          </div>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Upload Anganwadi form photo
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            PNG, JPEG — Click or drop image
          </p>
          <input
            id="ocr-upload"
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </motion.label>
      ) : (
        <div>
          {/* Preview */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <img
              src={preview}
              alt="Handwritten form preview"
              style={{
                width: '100%', maxHeight: 220, objectFit: 'contain',
                borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)',
              }}
            />
            <motion.button
              onClick={reset}
              className="btn btn-icon"
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', color: 'white',
                width: 32, height: 32, borderRadius: '50%', padding: 0,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* Extract button */}
          {!result && (
            <motion.button
              onClick={handleExtract}
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Extracting with AI...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Extract Form Data
                </>
              )}
            </motion.button>
          )}

          {/* Result */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ marginTop: 16 }}
              >
                <div style={{
                  padding: 16, background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)', fontSize: '0.875rem',
                }}>
                  {/* Confidence badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <CheckCircle size={16} color="var(--color-success)" />
                    <p style={{ fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                      Extraction Complete
                      {confidencePercent != null && ` — ${confidencePercent}% confidence`}
                    </p>
                  </div>

                  {/* Extracted fields summary */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                    fontSize: '0.8rem', color: 'var(--color-text-secondary)',
                  }}>
                    {extractedName && <span>👤 Name: <b>{extractedName}</b></span>}
                    {result?.extracted_child?.age_months != null && <span>📅 Age: <b>{result.extracted_child.age_months} months</b></span>}
                    {result?.extracted_child?.sex && <span>⚧ Sex: <b>{result.extracted_child.sex === 'M' ? 'Male' : 'Female'}</b></span>}
                    {extractedWeight != null && <span>⚖️ Weight: <b>{extractedWeight} kg</b></span>}
                    {extractedHeight != null && <span>📏 Height: <b>{extractedHeight} cm</b></span>}
                    {result?.extracted_child?.muac_cm != null && <span>💪 MUAC: <b>{result.extracted_child.muac_cm} cm</b></span>}
                    {result?.extracted_child?.guardian_name && <span>👨‍👩‍👧 Guardian: <b>{result.extracted_child.guardian_name}</b></span>}
                    {result?.extracted_child?.anganwadi_center && <span>🏥 Center: <b>{result.extracted_child.anganwadi_center}</b></span>}
                    {result?.extracted_child?.village && <span>🏘️ Village: <b>{result.extracted_child.village}</b></span>}
                  </div>

                  {/* Risk Status Badge */}
                  {result?.risk_status && (
                    <div style={{
                      marginTop: 10, padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700,
                      background: result.risk_status === 'SEVERE' ? 'rgba(239,68,68,0.15)'
                        : result.risk_status === 'MODERATE' ? 'rgba(245,158,11,0.15)'
                        : 'rgba(16,185,129,0.15)',
                      color: result.risk_status === 'SEVERE' ? '#dc2626'
                        : result.risk_status === 'MODERATE' ? '#d97706'
                        : '#059669',
                    }}>
                      {result.risk_status === 'SEVERE' ? '🔴' : result.risk_status === 'MODERATE' ? '🟡' : '🟢'}
                      Risk: {result.risk_status}
                    </div>
                  )}

                  {/* Warnings */}
                  {result?.warnings?.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--color-warning)' }}>
                      {result.warnings.map((w, i) => (
                        <p key={i} style={{ margin: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={12} /> {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={reset} className="btn btn-secondary" style={{ width: '100%', marginTop: 12 }}>
                  Upload Another Image
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Error */}
      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: 12,
            padding: 12, borderRadius: 'var(--radius-sm)',
            background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
          <AlertTriangle size={14} />
          {error}
        </motion.div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
