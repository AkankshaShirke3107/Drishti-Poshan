import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

export default function ConfirmDialog({ isOpen, title, message, confirmLabel, onConfirm, onCancel, variant = 'danger' }) {
  const { t } = useLanguage()
  const colors = {
    danger: { bg: 'rgba(239,68,68,0.15)', border: 'var(--color-danger)', btn: 'btn-danger' },
    warning: { bg: 'rgba(245,158,11,0.15)', border: 'var(--color-warning)', btn: 'btn-primary' },
  }
  const c = colors[variant] || colors.danger

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="glass-panel"
            style={{ padding: 32, maxWidth: 420, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-md)',
                background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.border, flexShrink: 0,
              }}>
                <AlertTriangle size={22} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {title}
              </h3>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              {message}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <motion.button
                onClick={onCancel}
                className="btn btn-secondary"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t('common.cancel')}
              </motion.button>
              <motion.button
                onClick={onConfirm}
                className={`btn ${c.btn}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {confirmLabel || t('common.confirm')}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
