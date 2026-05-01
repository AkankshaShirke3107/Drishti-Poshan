import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, CheckCircle, AlertCircle, Loader2, Keyboard, Mic, FileText, Heart, FlaskConical } from 'lucide-react'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'
import VoiceRecorder from '../components/VoiceRecorder'
import OCRUploader from '../components/OCRUploader'
import { useLanguage } from '../context/LanguageContext'

function parseChildData(text) {
  const data = {}
  const nameMatch = text.match(/(?:name|naam|नाम|नाव)[:\s]+([A-Za-zÀ-ÿ\u0900-\u097F\s]+)/i)
  if (nameMatch) data.name = nameMatch[1].trim()
  const ageMatch = text.match(/(?:age|umar|उम्र|वय)[:\s]*(\d+)/i)
  if (ageMatch) data.age_months = ageMatch[1]
  const weightMatch = text.match(/(?:weight|wajan|वज़न|वजन)[:\s]*([\d.]+)/i)
  if (weightMatch) data.weight_kg = weightMatch[1]
  const heightMatch = text.match(/(?:height|lambai|ऊंचाई|उंची)[:\s]*([\d.]+)/i)
  if (heightMatch) data.height_cm = heightMatch[1]
  const sexMatch = text.match(/(?:sex|gender|लिंग)[:\s]*(male|female|M|F|लड़का|लड़की|मुलगा|मुलगी)/i)
  if (sexMatch) {
    const val = sexMatch[1].toLowerCase()
    data.sex = (val === 'female' || val === 'f' || val === 'लड़की' || val === 'मुलगी') ? 'F' : 'M'
  }
  const guardianMatch = text.match(/(?:guardian|mother|father|पालक|अभिभावक|माता|पिता)[:\s]+([A-Za-zÀ-ÿ\u0900-\u097F\s]+)/i)
  if (guardianMatch) data.guardian_name = guardianMatch[1].trim()
  const villageMatch = text.match(/(?:village|gaon|गाँव|गाव)[:\s]+([A-Za-zÀ-ÿ\u0900-\u097F\s]+)/i)
  if (villageMatch) data.village = villageMatch[1].trim()
  return data
}

const MODES = [
  { key: 'manual', icon: Keyboard },
  { key: 'ocr', icon: FileText },
  { key: 'voice', icon: Mic },
]

export default function AddChild() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useLanguage()
  const [mode, setMode] = useState(searchParams.get('mode') || 'manual')
  const [form, setForm] = useState({
    name: '', age_months: '', sex: 'M', weight_kg: '', height_cm: '',
    muac_cm: '', guardian_name: '', anganwadi_center: '', village: '',
    hemoglobin_g_dl: '', severe_palmar_pallor: false,
    temperature_celsius: '', breaths_per_minute: '',
    serum_albumin_g_dl: '', prealbumin_mg_dl: '', crp_mg_l: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [autoFilled, setAutoFilled] = useState(false)

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m && ['manual', 'ocr', 'voice'].includes(m)) setMode(m)
  }, [searchParams])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleAutoFill = (data, source) => {
    let parsed = {}

    if (data?.extracted_child) {
      // Both OCR and Voice now return structured extracted_child from Groq
      const child = data.extracted_child
      parsed = {
        name: child.name || '',
        age_months: child.age_months != null ? String(child.age_months) : '',
        sex: child.sex || 'M',
        weight_kg: child.weight_kg != null ? String(child.weight_kg) : '',
        height_cm: child.height_cm != null ? String(child.height_cm) : '',
        muac_cm: child.muac_cm != null ? String(child.muac_cm) : '',
        guardian_name: child.guardian_name || '',
        anganwadi_center: child.anganwadi_center || '',
        village: child.village || '',
      }
    } else {
      // Fallback: regex parsing for raw text input
      const text = typeof data === 'string' ? data : data?.raw_text || data?.text || ''
      parsed = parseChildData(text)
    }

    // Only overwrite fields that have a truthy value
    setForm(prev => ({
      ...prev,
      ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v))
    }))
    setAutoFilled(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      age_months: parseInt(form.age_months),
      sex: form.sex,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : undefined,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : undefined,
      muac_cm: form.muac_cm ? parseFloat(form.muac_cm) : undefined,
      hemoglobin_g_dl: form.hemoglobin_g_dl ? parseFloat(form.hemoglobin_g_dl) : undefined,
      severe_palmar_pallor: form.severe_palmar_pallor || false,
      temperature_celsius: form.temperature_celsius ? parseFloat(form.temperature_celsius) : undefined,
      breaths_per_minute: form.breaths_per_minute ? parseInt(form.breaths_per_minute) : undefined,
      guardian_name: form.guardian_name.trim() || undefined,
      anganwadi_center: form.anganwadi_center.trim() || undefined,
      village: form.village.trim() || undefined,
    }

    // Lab values go to a separate table (LabDiagnostic)
    const hasLabData = form.serum_albumin_g_dl || form.prealbumin_mg_dl || form.crp_mg_l
    const labPayload = hasLabData ? {
      serum_albumin_g_dl: form.serum_albumin_g_dl ? parseFloat(form.serum_albumin_g_dl) : undefined,
      prealbumin_mg_dl: form.prealbumin_mg_dl ? parseFloat(form.prealbumin_mg_dl) : undefined,
      crp_mg_l: form.crp_mg_l ? parseFloat(form.crp_mg_l) : undefined,
    } : null

    try {
      const child = await api.createChild(payload)
      await offlineDB.saveChild(child)

      // If lab data was entered, create a lab record for this child
      if (labPayload && child.id) {
        try { await api.addLab(child.id, labPayload) } catch (e) {
          console.warn('Lab data save failed (child was still created):', e)
        }
      }

      setSuccess(true)
      setTimeout(() => navigate(`/children/${child.id}`), 1500)
    } catch (err) {
      if (err.message.includes('Network') || err.message.includes('offline')) {
        await offlineDB.addToSyncQueue({ type: 'CREATE_CHILD', data: payload })
        setSuccess(true)
        setTimeout(() => navigate('/dashboard'), 1500)
      } else { setError(err.message) }
    } finally { setLoading(false) }
  }

  const fields = [
    { key: 'name', label: t('addChild.name') + ' *', type: 'text', required: true, fullWidth: true },
    { key: 'age_months', label: t('addChild.age') + ' *', type: 'number', required: true, min: 0, max: 72 },
    { key: 'sex', label: t('addChild.sex') + ' *', type: 'select', options: [{ value: 'M', label: t('addChild.male') }, { value: 'F', label: t('addChild.female') }] },
    { key: 'weight_kg', label: t('addChild.weight'), type: 'number', step: '0.1' },
    { key: 'height_cm', label: t('addChild.height'), type: 'number', step: '0.1' },
    { key: 'muac_cm', label: t('addChild.muac'), type: 'number', step: '0.1' },
    { key: 'guardian_name', label: t('addChild.guardian'), type: 'text' },
    { key: 'anganwadi_center', label: t('addChild.center'), type: 'text' },
    { key: 'village', label: t('addChild.village'), type: 'text' },
  ]

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: '1.75rem', fontWeight: 800,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-success))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <UserPlus size={28} style={{ color: 'var(--color-primary)' }} /> {t('addChild.title')}
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t('addChild.subtitle')}</p>
      </motion.div>

      {/* Mode Selector */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {MODES.map(({ key, icon: Icon }) => (
          <motion.button key={key} onClick={() => setMode(key)}
            className={mode === key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ flex: 1, padding: '12px', fontSize: '0.82rem', gap: 8 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Icon size={17} /> {t(`addChild.${key === 'manual' ? 'manual' : key === 'ocr' ? 'ocrMode' : 'voiceMode'}`)}
          </motion.button>
        ))}
      </motion.div>

      {/* Success */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            style={{ padding: 24, borderRadius: 'var(--radius-lg)', background: 'rgba(16,185,129,0.15)',
              border: '1px solid var(--color-success)', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <CheckCircle size={24} color="var(--color-success)" />
            <div>
              <p style={{ fontWeight: 700, color: 'var(--color-success)' }}>{t('addChild.success')}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{t('addChild.redirecting')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR / Voice input area */}
      <AnimatePresence mode="wait">
        {mode === 'ocr' && (
          <motion.div key="ocr" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 20, overflow: 'hidden' }}>
            <OCRUploader onExtracted={(data) => handleAutoFill(data, 'OCR')} />
          </motion.div>
        )}
        {mode === 'voice' && (
          <motion.div key="voice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} style={{ marginBottom: 20, overflow: 'hidden' }}>
            <VoiceRecorder onTranscription={(data) => handleAutoFill(data, 'Voice')} />
          </motion.div>
        )}
      </AnimatePresence>

      {autoFilled && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'rgba(37,99,235,0.1)',
            fontSize: '0.8rem', color: 'var(--color-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} />
          {t('addChild.fieldsAutoFilled', { mode: mode === 'ocr' ? 'OCR' : 'Voice' })}
        </motion.div>
      )}

      {/* Form */}
      <motion.form onSubmit={handleSubmit} className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {fields.map(({ key, label, type, required, fullWidth, options, ...rest }, i) => (
            <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
              <label className="label" htmlFor={`field-${key}`}>{label}</label>
              {type === 'select' ? (
                <select id={`field-${key}`} className="input select" value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}>
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={`field-${key}`} className="input" type={type} value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)} required={required} {...rest} />
              )}
            </motion.div>
          ))}
        </div>

        {/* Clinical Vitals (Optional) */}
        <div style={{
          marginTop: 24, padding: 20, borderRadius: 'var(--radius-md)',
          background: 'rgba(239, 68, 68, 0.04)',
          border: '1px solid rgba(239, 68, 68, 0.12)',
        }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 700, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--color-text)',
          }}>
            <Heart size={16} style={{ color: '#ef4444' }} />
            {t('addChild.clinicalVitals')}
            <span style={{
              fontSize: '0.65rem', fontWeight: 500, color: 'var(--color-text-muted)',
              background: 'var(--color-bg-secondary)', padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}>{t('addChild.optional')}</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label" htmlFor="field-hb">{t('addChild.hemoglobin')}</label>
              <input id="field-hb" className="input" type="number" step="0.1" min="1" max="25"
                placeholder="e.g. 11.5"
                value={form.hemoglobin_g_dl}
                onChange={(e) => handleChange('hemoglobin_g_dl', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="field-temp">{t('addChild.temperature')}</label>
              <input id="field-temp" className="input" type="number" step="0.1" min="30" max="43"
                placeholder="e.g. 36.5"
                value={form.temperature_celsius}
                onChange={(e) => handleChange('temperature_celsius', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="field-resp">{t('addChild.respRate')}</label>
              <input id="field-resp" className="input" type="number" min="5" max="120"
                placeholder="e.g. 28"
                value={form.breaths_per_minute}
                onChange={(e) => handleChange('breaths_per_minute', e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label className="label" style={{ marginBottom: 8 }}>{t('addChild.palmarPallor')}</label>
              <motion.button
                type="button"
                onClick={() => handleChange('severe_palmar_pallor', !form.severe_palmar_pallor)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${form.severe_palmar_pallor ? '#ef4444' : 'var(--color-border)'}`,
                  background: form.severe_palmar_pallor ? 'rgba(239,68,68,0.12)' : 'var(--color-bg-secondary)',
                  color: form.severe_palmar_pallor ? '#ef4444' : 'var(--color-text-muted)',
                  cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                  transition: 'all 0.2s ease',
                }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 4,
                  border: `2px solid ${form.severe_palmar_pallor ? '#ef4444' : 'var(--color-border)'}`,
                  background: form.severe_palmar_pallor ? '#ef4444' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.7rem', transition: 'all 0.2s',
                }}>
                  {form.severe_palmar_pallor && '✓'}
                </span>
                {form.severe_palmar_pallor ? t('addChild.pallorYes') : t('addChild.pallorNo')}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Lab Values (NRC / Facility) */}
        <div style={{
          marginTop: 20, padding: 20, borderRadius: 'var(--radius-md)',
          background: 'rgba(99, 102, 241, 0.04)',
          border: '1px solid rgba(99, 102, 241, 0.12)',
        }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 700, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--color-text)',
          }}>
            <FlaskConical size={16} style={{ color: '#6366f1' }} />
            Lab Values (NRC Only)
            <span style={{
              fontSize: '0.65rem', fontWeight: 500, color: 'var(--color-text-muted)',
              background: 'var(--color-bg-secondary)', padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}>Optional</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label className="label" htmlFor="field-albumin">Serum Albumin (g/dL)</label>
              <input id="field-albumin" className="input" type="number" step="0.1" min="0.5" max="10"
                placeholder="Normal: 3.4–5.4"
                value={form.serum_albumin_g_dl}
                onChange={(e) => handleChange('serum_albumin_g_dl', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="field-prealbumin">Prealbumin (mg/dL)</label>
              <input id="field-prealbumin" className="input" type="number" step="0.1" min="0.5" max="60"
                placeholder="Normal: 15–36"
                value={form.prealbumin_mg_dl}
                onChange={(e) => handleChange('prealbumin_mg_dl', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="field-crp">CRP (mg/L)</label>
              <input id="field-crp" className="input" type="number" step="0.1" min="0" max="500"
                placeholder="Normal: <5.0"
                value={form.crp_mg_l}
                onChange={(e) => handleChange('crp_mg_l', e.target.value)} />
            </div>
          </div>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ margin: '16px 0 0', padding: 12, borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: '0.8rem', color: 'var(--color-danger)' }}>
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}
        <motion.button type="submit" disabled={loading || success} className="btn btn-primary"
          style={{ width: '100%', marginTop: 20, padding: '13px', fontSize: '0.9rem' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          {loading ? (<><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {t('addChild.saving')}</>) :
            (<><UserPlus size={18} /> {t('addChild.submit')}</>)}
        </motion.button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.form>
    </div>
  )
}
