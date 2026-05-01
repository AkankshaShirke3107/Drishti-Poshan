import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const FEATURE_LABELS = {
  age_months: 'Age',
  weight_kg: 'Weight',
  height_cm: 'Height',
  muac_cm: 'MUAC',
  waz: 'WAZ',
  haz: 'HAZ',
  whz: 'WHZ',
  bmi_z: 'BMI-Z',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="glass-card" style={{ padding: '10px 14px', fontSize: '0.8rem' }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--color-text)' }}>{d.label}</p>
      <p style={{ color: d.impact >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
        Impact: {d.impact > 0 ? '+' : ''}{d.impact.toFixed(3)}
      </p>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 200 }}>
        {d.impact < -0.3
          ? '⚠️ This factor increases malnutrition risk.'
          : d.impact > 0.3
            ? '✅ This factor is protective.'
            : 'Neutral impact on risk assessment.'}
      </p>
    </div>
  )
}

export default function XAIChart({ impactMap, chartType = 'bar' }) {
  const data = useMemo(() => {
    if (!impactMap || Object.keys(impactMap).length === 0) return []

    // Normalize keys to lowercase so WAZ / waz / Waz all work
    const normalized = Object.fromEntries(
      Object.entries(impactMap).map(([k, v]) => [k.toLowerCase(), v])
    )

    const entries = Object.entries(normalized).map(([key, value]) => ({
      feature: key,
      label: FEATURE_LABELS[key] || key.toUpperCase(),
      impact: Number(value) || 0,
      absImpact: Math.abs(Number(value) || 0),
    })).sort((a, b) => b.absImpact - a.absImpact)

    // If every bar is zero it means features were all null — treat as empty
    if (entries.every(e => e.absImpact < 0.0001)) return []

    return entries
  }, [impactMap])

  if (data.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 200, color: 'var(--color-text-muted)', fontSize: '0.875rem',
      }}>
        No SHAP data available. Run analysis first.
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring' }}
    >
      {chartType === 'radar' ? (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="var(--color-border)" />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            />
            <PolarRadiusAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
            <Radar
              name="Impact"
              dataKey="absImpact"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.25}
              strokeWidth={2}
              animationDuration={1200}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500 }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="impact" radius={[0, 6, 6, 0]} animationDuration={1200}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.impact >= 0
                    ? 'var(--color-success)'
                    : 'var(--color-danger)'}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12,
        fontSize: '0.75rem', color: 'var(--color-text-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-success)' }} />
          Protective Factor
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-danger)' }} />
          Risk Factor
        </span>
      </div>
    </motion.div>
  )
}