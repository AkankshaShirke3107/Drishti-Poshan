import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import { ScanEye, Mic, BrainCircuit, TrendingUp } from 'lucide-react'

/* ── animation helpers ────────────────────────────────────── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15, delayChildren: 0.2 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
}

const scaleUp = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
}

/* ── Animated SVG line chart ──────────────────────────────── */
function GrowthChart() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const pathRef = useRef(null)
  const [length, setLength] = useState(0)

  useEffect(() => {
    if (pathRef.current) {
      setLength(pathRef.current.getTotalLength())
    }
  }, [])

  const chartPoints = '20,120 60,95 100,100 140,78 180,82 220,55 260,60 300,38 340,42 380,22'
  const areaPoints = `20,140 ${chartPoints} 380,140`

  return (
    <div ref={ref} className="growth-chart">
      <svg viewBox="0 0 400 160" fill="none" className="growth-chart__svg">
        {/* grid lines */}
        {[35, 70, 105, 140].map((y) => (
          <line
            key={y}
            x1="20"
            y1={y}
            x2="380"
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeDasharray="4 4"
          />
        ))}

        {/* gradient fill */}
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {/* area fill */}
        <motion.polygon
          points={areaPoints}
          fill="url(#chartGrad)"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, delay: 0.5 }}
        />

        {/* animated line */}
        <motion.polyline
          ref={pathRef}
          points={chartPoints}
          fill="none"
          stroke="#6366F1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={length || 600}
          strokeDashoffset={length || 600}
          animate={inView ? { strokeDashoffset: 0 } : {}}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Endpoint glow */}
        <motion.circle
          cx="380"
          cy="22"
          r="5"
          fill="#6366F1"
          initial={{ opacity: 0, scale: 0 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 1.6, duration: 0.4 }}
        />
        <motion.circle
          cx="380"
          cy="22"
          r="10"
          fill="#6366F1"
          fillOpacity="0.2"
          initial={{ opacity: 0, scale: 0 }}
          animate={inView ? { opacity: [0, 0.6, 0], scale: [0.5, 2, 2.5] } : {}}
          transition={{ delay: 1.6, duration: 2, repeat: Infinity }}
        />
      </svg>

      {/* labels */}
      <div className="growth-chart__labels">
        <span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span>
      </div>
    </div>
  )
}

/* ── Bento Card ───────────────────────────────────────────── */
function BentoCard({ icon: Icon, title, description, accent, children, span }) {
  return (
    <motion.div
      variants={scaleUp}
      whileHover={{ y: -4 }}
      className={`bento-card ${span === 2 ? 'bento-card--wide' : ''}`}
    >
      <div className="bento-card__header">
        <div className={`bento-card__icon bento-card__icon--${accent}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
        <div>
          <h3 className="bento-card__title">{title}</h3>
          <p className="bento-card__desc">{description}</p>
        </div>
      </div>
      {children && <div className="bento-card__body">{children}</div>}
    </motion.div>
  )
}

/* ── OCR visual ───────────────────────────────────────────── */
function OCRVisual() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  const lines = [
    { w: '88%', label: 'Name: Ananya Sharma' },
    { w: '72%', label: 'Age: 2 years 4 months' },
    { w: '80%', label: 'Weight: 10.2 kg' },
    { w: '64%', label: 'Height: 84 cm' },
  ]

  return (
    <div ref={ref} className="ocr-visual">
      <div className="ocr-visual__doc">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            className="ocr-visual__line"
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
          >
            <span className="ocr-visual__scanline" style={{ width: line.w }} />
            <motion.span
              className="ocr-visual__text"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.6 + i * 0.15, duration: 0.4 }}
            >
              {line.label}
            </motion.span>
          </motion.div>
        ))}
      </div>
      {/* scanning overlay */}
      {inView && (
        <motion.div
          className="ocr-visual__scanner"
          initial={{ top: '0%' }}
          animate={{ top: '100%' }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

/* ── Voice waveform visual ────────────────────────────────── */
function VoiceVisual() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  const bars = Array.from({ length: 24 }, (_, i) => {
    const height = 12 + Math.sin(i * 0.6) * 18 + Math.random() * 10
    return height
  })

  return (
    <div ref={ref} className="voice-visual">
      <div className="voice-visual__bars">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="voice-visual__bar"
            style={{ height: 4 }}
            animate={
              inView
                ? {
                    height: [4, h, h * 0.6, h * 0.9, h * 0.5],
                  }
                : {}
            }
            transition={{
              duration: 1.6,
              delay: i * 0.04,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <motion.p
        className="voice-visual__transcript"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        <span className="voice-visual__quote">"</span>
        Baby had 200ml milk and half a banana this morning...
        <span className="voice-visual__quote">"</span>
      </motion.p>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function Features() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="landing-features" id="features">
      <motion.div
        ref={ref}
        className="landing-features__inner"
        variants={stagger}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        {/* section header */}
        <motion.div variants={fadeUp} className="landing-features__header">
          <span className="landing-features__label">Features</span>
          <h2 className="landing-features__heading">
            Intelligence at every touchpoint
          </h2>
          <p className="landing-features__sub">
            Three AI engines working in concert to deliver comprehensive child
            nutrition monitoring—from data capture to predictive insights.
          </p>
        </motion.div>

        {/* bento grid */}
        <div className="bento-grid">
          <BentoCard
            icon={ScanEye}
            title="The Eye — OCR Engine"
            description="Instant health record digitization. Point, scan, structured data."
            accent="indigo"
          >
            <OCRVisual />
          </BentoCard>

          <BentoCard
            icon={Mic}
            title="The Voice — Whisper AI"
            description="Natural language dietary logging powered by OpenAI Whisper."
            accent="slate"
          >
            <VoiceVisual />
          </BentoCard>

          <BentoCard
            icon={BrainCircuit}
            title="The Engine — Growth Forecasting"
            description="AI-driven growth analytics with nutritional corrective actions and SHAP explainability."
            accent="emerald"
            span={2}
          >
            <GrowthChart />
          </BentoCard>
        </div>
      </motion.div>
    </section>
  )
}
