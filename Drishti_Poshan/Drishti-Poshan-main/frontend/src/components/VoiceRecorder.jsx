import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'

const STATES = { IDLE: 'idle', RECORDING: 'recording', PROCESSING: 'processing', SUCCESS: 'success', ERROR: 'error' }

export default function VoiceRecorder({ onTranscription, language = null }) {
  const [state, setState] = useState(STATES.IDLE)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []
      setDuration(0)
      setResult(null)
      setError(null)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setState(STATES.PROCESSING)

        try {
          // Use the new Groq two-step pipeline (Whisper → Llama structuring)
          const res = await api.processVoice(blob)
          console.log('Voice Raw Response:', res)

          if (!res || !res.success) {
            throw new Error(res?.detail || res?.error || 'Voice processing failed')
          }

          setResult(res)
          setState(STATES.SUCCESS)
          if (onTranscription) onTranscription(res)
        } catch (err) {
          console.error('Voice Error:', err)
          setError(err?.message || 'Failed to process voice recording')
          setState(STATES.ERROR)
        }
      }

      mediaRecorder.start(250)
      setState(STATES.RECORDING)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      setError('Microphone access denied. Please allow microphone permissions.')
      setState(STATES.ERROR)
    }
  }, [language, onTranscription])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const reset = () => {
    setState(STATES.IDLE)
    setResult(null)
    setError(null)
    setDuration(0)
  }

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const confidencePercent = result?.overall_confidence != null
    ? Math.round(result.overall_confidence * 100)
    : null

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mic size={18} /> Voice Input (Groq Whisper)
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Record Button */}
        <motion.button
          onClick={state === STATES.RECORDING ? stopRecording : state === STATES.IDLE ? startRecording : reset}
          disabled={state === STATES.PROCESSING}
          className="btn"
          style={{
            width: 72, height: 72, borderRadius: '50%',
            background: state === STATES.RECORDING
              ? 'linear-gradient(135deg, var(--color-danger), #dc2626)'
              : state === STATES.PROCESSING
                ? 'var(--color-surface)'
                : 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
            color: 'white',
            boxShadow: state === STATES.RECORDING
              ? '0 0 0 8px rgba(239,68,68,0.2), 0 4px 20px rgba(239,68,68,0.3)'
              : '0 4px 20px rgba(37,99,235,0.3)',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={state === STATES.RECORDING ? { scale: [1, 1.05, 1] } : {}}
          transition={state === STATES.RECORDING ? { repeat: Infinity, duration: 1.5 } : {}}
        >
          {state === STATES.RECORDING ? <Square size={24} /> :
           state === STATES.PROCESSING ? <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /> :
           state === STATES.SUCCESS ? <CheckCircle size={24} /> :
           state === STATES.ERROR ? <XCircle size={24} /> :
           <Mic size={24} />}
        </motion.button>

        {/* Timer */}
        <AnimatePresence>
          {state === STATES.RECORDING && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger)', animation: 'pulse-danger 1.5s infinite' }} />
              <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {formatTime(duration)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Processing indicator */}
        {state === STATES.PROCESSING && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Transcribing & extracting data with AI...
          </motion.p>
        )}

        {/* Structured Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ width: '100%', marginTop: 8 }}
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

                {/* Transcript */}
                {result?.raw_text && (
                  <div style={{
                    padding: 10, marginBottom: 10, borderRadius: 'var(--radius-sm)',
                    background: 'rgba(37,99,235,0.05)', fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)', fontStyle: 'italic',
                  }}>
                    🎤 "{result.raw_text}"
                  </div>
                )}

                {/* Extracted fields */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
                  fontSize: '0.8rem', color: 'var(--color-text-secondary)',
                }}>
                  {result?.extracted_child?.name && <span>👤 Name: <b>{result.extracted_child.name}</b></span>}
                  {result?.extracted_child?.age_months != null && <span>📅 Age: <b>{result.extracted_child.age_months} months</b></span>}
                  {result?.extracted_child?.sex && <span>⚧ Sex: <b>{result.extracted_child.sex === 'M' ? 'Male' : 'Female'}</b></span>}
                  {result?.extracted_child?.weight_kg != null && <span>⚖️ Weight: <b>{result.extracted_child.weight_kg} kg</b></span>}
                  {result?.extracted_child?.height_cm != null && <span>📏 Height: <b>{result.extracted_child.height_cm} cm</b></span>}
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              width: '100%', fontSize: '0.8rem', color: 'var(--color-danger)',
              padding: 12, borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
            <AlertTriangle size={14} />
            {error}
          </motion.div>
        )}

        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          {state === STATES.IDLE ? 'Click to record. Speak child data in Hindi, English, or mixed.' :
           state === STATES.SUCCESS || state === STATES.ERROR ? 'Click to record again.' : ''}
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
