import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useLanguage } from '../context/LanguageContext'

export default function EditChild() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [form, setForm] = useState({
    name: '', age_months: '', sex: 'M', weight_kg: '', height_cm: '',
    muac_cm: '', guardian_name: '', anganwadi_center: '', village: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const child = await api.getChild(id)
        setForm({
          name: child.name || '',
          age_months: child.age_months != null ? String(child.age_months) : '',
          sex: child.sex || 'M',
          weight_kg: child.weight_kg != null ? String(child.weight_kg) : '',
          height_cm: child.height_cm != null ? String(child.height_cm) : '',
          muac_cm: child.muac_cm != null ? String(child.muac_cm) : '',
          guardian_name: child.guardian_name || '',
          anganwadi_center: child.anganwadi_center || '',
          village: child.village || '',
        })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      age_months: parseInt(form.age_months),
      sex: form.sex,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : undefined,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : undefined,
      muac_cm: form.muac_cm ? parseFloat(form.muac_cm) : undefined,
      guardian_name: form.guardian_name.trim() || undefined,
      anganwadi_center: form.anganwadi_center.trim() || undefined,
      village: form.village.trim() || undefined,
    }

    try {
      await api.updateChild(id, payload)
      setSuccess(true)
      setTimeout(() => navigate(`/children/${id}`), 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link to={`/children/${id}`}>
          <motion.div className="btn btn-icon btn-secondary"
            whileHover={{ scale: 1.05, x: -2 }} whileTap={{ scale: 0.95 }}>
            <ArrowLeft size={20} />
          </motion.div>
        </Link>
        <div>
          <h1 style={{
            fontSize: '1.5rem', fontWeight: 800,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-warning))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Edit Child
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            Update {form.name || 'child'}'s information
          </p>
        </div>
      </motion.div>

      {/* Success */}
      {success && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          style={{
            padding: 20, borderRadius: 'var(--radius-lg)',
            background: 'rgba(16,185,129,0.15)', border: '1px solid var(--color-success)',
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
          }}>
          <CheckCircle size={22} color="var(--color-success)" />
          <div>
            <p style={{ fontWeight: 700, color: 'var(--color-success)' }}>Updated successfully!</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Redirecting to profile…</p>
          </div>
        </motion.div>
      )}

      {/* Form */}
      <motion.form onSubmit={handleSubmit} className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }} style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {fields.map(({ key, label, type, required, fullWidth, options, ...rest }, i) => (
            <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
              <label className="label" htmlFor={`edit-${key}`}>{label}</label>
              {type === 'select' ? (
                <select id={`edit-${key}`} className="input select" value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)}>
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={`edit-${key}`} className="input" type={type} value={form[key]}
                  onChange={(e) => handleChange(key, e.target.value)} required={required} {...rest} />
              )}
            </motion.div>
          ))}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{
              margin: '16px 0 0', padding: 12, borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: '0.8rem', color: 'var(--color-danger)',
            }}>
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}

        <motion.button type="submit" disabled={saving || success} className="btn btn-primary"
          style={{ width: '100%', marginTop: 20, padding: '13px', fontSize: '0.9rem' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          {saving ? (
            <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
          ) : (
            <><Save size={18} /> Save Changes</>
          )}
        </motion.button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.form>
    </div>
  )
}
