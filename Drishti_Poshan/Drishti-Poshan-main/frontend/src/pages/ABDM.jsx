import { motion } from 'framer-motion'
import { Shield, Link2, Users, Globe, Sparkles } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

export default function ABDM() {
  const { t } = useLanguage()

  const cards = [
    { icon: Link2, title: t('abdm.abhaId'), desc: t('abdm.abhaDesc'), color: '#3b82f6' },
    { icon: Users, title: t('abdm.identity'), desc: t('abdm.identityDesc'), color: '#10b981' },
    { icon: Globe, title: t('abdm.interop'), desc: t('abdm.interopDesc'), color: '#8b5cf6' },
  ]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <h1 style={{
            fontSize: '1.75rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <Shield size={28} style={{ color: '#3b82f6' }} /> {t('abdm.title')}
          </h1>
          <motion.span
            style={{
              padding: '4px 12px', borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
              fontSize: '0.65rem', fontWeight: 700, color: '#8b5cf6',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            {t('abdm.futureReady')}
          </motion.span>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t('abdm.subtitle')}</p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cards.map(({ icon: Icon, title, desc, color }, i) => (
          <motion.div key={i} className="glass-card"
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            style={{ padding: 24, display: 'flex', gap: 20 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--radius-md)',
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color, flexShrink: 0,
            }}>
              <Icon size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>{title}</h3>
                <span style={{
                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  background: 'rgba(245,158,11,0.12)', fontSize: '0.6rem',
                  fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase',
                }}>
                  {t('abdm.comingSoon')}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                {desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Info card */}
      <motion.div className="glass-panel"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{ padding: 24, marginTop: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Sparkles size={24} color="var(--color-accent)" />
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          This module is designed to integrate with India's ABDM ecosystem when APIs become available.
          The architecture is modular — no refactoring needed when connecting to live ABHA services.
        </div>
      </motion.div>
    </div>
  )
}
