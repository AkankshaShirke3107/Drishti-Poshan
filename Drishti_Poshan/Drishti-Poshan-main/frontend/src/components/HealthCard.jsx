import { motion } from 'framer-motion'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * MUAC-specific classification (WHO thresholds, children > 6 months).
 * Returns 'SEVERE' | 'MODERATE' | 'NORMAL' | null
 */
function classifyMuac(muacCm) {
  if (muacCm == null) return null
  if (muacCm < 11.5) return 'SEVERE'
  if (muacCm < 12.5) return 'MODERATE'
  return 'NORMAL'
}

export default function HealthCard({
  title, value, unit, icon: Icon, trend,
  riskLevel, status, muacValue, delay = 0,
}) {
  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const TrendIcon = trendIcon

  // ── WHO Status color map (exact hex per spec) ──────────────
  const STATUS_COLORS = {
    SEVERE:   { bg: 'rgba(239, 68, 68, 0.1)',  accent: '#EF4444', label: 'SEVERE' },
    MODERATE: { bg: 'rgba(245, 158, 11, 0.1)', accent: '#F59E0B', label: 'MODERATE' },
    NORMAL:   { bg: 'rgba(16, 185, 129, 0.1)', accent: '#10B981', label: 'NORMAL' },
  }

  // Legacy riskLevel fallback (lowercase → uppercase mapping)
  const RISK_COLORS = {
    normal:   STATUS_COLORS.NORMAL,
    moderate: STATUS_COLORS.MODERATE,
    severe:   STATUS_COLORS.SEVERE,
  }

  // ── Determine card colors ──────────────────────────────────
  // If a muacValue is provided, use MUAC-specific thresholds for THIS card
  const muacStatus = muacValue != null ? classifyMuac(muacValue) : null
  const resolvedStatus = muacStatus || status || (riskLevel ? riskLevel.toUpperCase() : null)
  const colors = STATUS_COLORS[resolvedStatus] || RISK_COLORS[riskLevel] || STATUS_COLORS.NORMAL

  // Badge label — add "(MUAC)" qualifier when MUAC-specific classification is active
  const badgeLabel = muacStatus
    ? `${colors.label} (MUAC)`
    : colors.label

  return (
    <motion.div
      className="glass-card"
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: delay * 0.1,
        type: 'spring',
        stiffness: 100,
      }}
      whileHover={{ y: -4, scale: 1.02 }}
      style={{ padding: 24, position: 'relative', overflow: 'hidden' }}
    >
      {/* Accent glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 80,
          height: 80,
          background: `radial-gradient(circle, ${colors.accent}22 0%, transparent 70%)`,
          borderRadius: '0 0 0 100%',
        }}
      />

      {/* Left accent bar — color-coded by status */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '10%',
          bottom: '10%',
          width: 3,
          borderRadius: 2,
          background: colors.accent,
          opacity: resolvedStatus && resolvedStatus !== 'NORMAL' ? 1 : 0.3,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}>
            {title}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <motion.span
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: muacStatus && muacStatus !== 'NORMAL' ? colors.accent : 'var(--color-text)',
                lineHeight: 1,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay * 0.1 + 0.3 }}
            >
              {value ?? '—'}
            </motion.span>
            {unit && (
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {unit}
              </span>
            )}
          </div>
        </div>

        <motion.div
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: colors.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.accent,
          }}
          whileHover={{ rotate: 5 }}
        >
          {Icon && <Icon size={22} />}
        </motion.div>
      </div>

      {/* Trend indicator */}
      {trend && (
        <motion.div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 12,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : 'var(--color-text-muted)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay * 0.1 + 0.5 }}
        >
          <TrendIcon size={14} />
          <span>{trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Stable'}</span>
        </motion.div>
      )}

      {/* Clinical status badge */}
      {resolvedStatus && (
        <div style={{ marginTop: trend ? 4 : 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: colors.bg,
              color: colors.accent,
              border: `1px solid ${colors.accent}33`,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: colors.accent,
              display: 'inline-block',
            }} />
            {badgeLabel}
          </span>
        </div>
      )}
    </motion.div>
  )
}