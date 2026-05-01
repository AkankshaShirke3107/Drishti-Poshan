import { motion } from 'framer-motion'

export default function LoadingSkeleton({ lines = 3, height = 20, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          style={{
            height,
            width: i === lines - 1 ? '60%' : '100%',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <LoadingSkeleton lines={1} height={14} style={{ marginBottom: 12, width: '40%' }} />
      <LoadingSkeleton lines={1} height={32} style={{ marginBottom: 8, width: '60%' }} />
      <LoadingSkeleton lines={1} height={12} style={{ width: '80%' }} />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          className="skeleton"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          style={{ height: 48, borderRadius: 'var(--radius-sm)' }}
        />
      ))}
    </div>
  )
}
