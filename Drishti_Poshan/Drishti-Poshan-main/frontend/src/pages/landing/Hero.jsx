import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState } from 'react'
import { ArrowRight, Sparkles, Shield, Zap, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/* ── animation variants ───────────────────────────────────── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.3 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

/* ── Shimmer button ───────────────────────────────────────── */
function ShimmerButton({ children, primary, onClick, ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      className={`landing-btn ${primary ? 'landing-btn--primary' : 'landing-btn--secondary'}`}
      onClick={onClick}
      {...props}
    >
      <span className="landing-btn__content">{children}</span>
      {primary && <span className="landing-btn__shimmer" />}
    </motion.button>
  )
}

/* ── Floating particle dot ────────────────────────────────── */
function FloatingDot({ delay, x, y, size = 4 }) {
  return (
    <motion.span
      className="landing-hero__dot"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      animate={{
        y: [0, -18, 0],
        opacity: [0.25, 0.6, 0.25],
      }}
      transition={{
        duration: 4 + Math.random() * 2,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
      }}
    />
  )
}

/* ── Trust metric pill ────────────────────────────────────── */
function MetricPill({ icon: Icon, label, value }) {
  return (
    <motion.div variants={fadeUp} className="landing-hero__metric">
      <Icon size={14} strokeWidth={2.5} />
      <span className="landing-hero__metric-value">{value}</span>
      <span className="landing-hero__metric-label">{label}</span>
    </motion.div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function Hero() {
  const ref = useRef(null)
  const navigate = useNavigate()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const [docHovered, setDocHovered] = useState(false)

  const handleInitMonitoring = () => {
    // Add an exit animation class to body before navigating
    document.body.classList.add('page-exit-active')
    setTimeout(() => {
      navigate('/auth')
      document.body.classList.remove('page-exit-active')
    }, 400) // matches CSS transition duration
  }

  const handleDocs = () => {
    const el = document.getElementById('tech-specs')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section ref={ref} className="landing-hero" id="hero">
      {/* parallax bg glow */}
      <motion.div className="landing-hero__glow" style={{ y: bgY, opacity }} />

      {/* floating dots */}
      <div className="landing-hero__particles">
        <FloatingDot delay={0} x={12} y={20} size={5} />
        <FloatingDot delay={0.8} x={85} y={15} size={4} />
        <FloatingDot delay={1.5} x={70} y={65} size={6} />
        <FloatingDot delay={2.2} x={25} y={75} size={3} />
        <FloatingDot delay={0.4} x={50} y={35} size={4} />
        <FloatingDot delay={1.8} x={92} y={55} size={5} />
      </div>

      <motion.div
        className="landing-hero__inner"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* badge */}
        <motion.div variants={fadeUp} className="landing-hero__badge">
          <Sparkles size={14} />
          <span>AI-Powered · Offline-First · Health-Tech PWA</span>
        </motion.div>

        {/* headline */}
        <motion.h1 variants={fadeUp} className="landing-hero__title">
          Precision Nutrition.
          <br />
          <span className="landing-hero__title--accent">Powered by Intelligence.</span>
        </motion.h1>

        {/* subtext */}
        <motion.p variants={fadeUp} className="landing-hero__sub">
          A seamless platform integrating OCR, Voice-AI, and advanced Growth Engines
          to optimize child health outcomes.
        </motion.p>

        {/* cta row */}
        <motion.div variants={fadeUp} className="landing-hero__ctas">
          <ShimmerButton primary onClick={handleInitMonitoring}>
            Initialize Monitoring <ArrowRight size={16} />
          </ShimmerButton>
          <ShimmerButton
            onMouseEnter={() => setDocHovered(true)}
            onMouseLeave={() => setDocHovered(false)}
            onClick={handleDocs}
          >
            <motion.div
              initial={false}
              animate={{ width: docHovered ? 'auto' : 0, opacity: docHovered ? 1 : 0, marginRight: docHovered ? 6 : 0 }}
              style={{ overflow: 'hidden', display: 'flex', alignItems: 'center' }}
            >
              <FileText size={16} />
            </motion.div>
            Technical Specs
          </ShimmerButton>
        </motion.div>

        {/* trust metrics */}
        <motion.div variants={stagger} className="landing-hero__metrics">
          <MetricPill icon={Shield} label="Uptime" value="99.9%" />
          <MetricPill icon={Zap} label="Avg Response" value="<120ms" />
          <MetricPill icon={Sparkles} label="AI Accuracy" value="97.4%" />
        </motion.div>
      </motion.div>
    </section>
  )
}
