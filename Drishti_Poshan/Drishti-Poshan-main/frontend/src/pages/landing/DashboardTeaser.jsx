import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  Activity,
  TrendingUp,
  Ruler,
  Weight,
  Calendar,
  Heart,
} from 'lucide-react'

const fadeUp = {
  hidden: { opacity: 0, y: 30, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
}

/* ── Pulsing badge ────────────────────────────────────────── */
function StatusBadge() {
  return (
    <span className="dash-status">
      <span className="dash-status__dot" />
      Healthy
    </span>
  )
}

/* ── Mini stat card ───────────────────────────────────────── */
function MiniStat({ icon: Icon, label, value, trend }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__icon">
        <Icon size={16} />
      </div>
      <div className="dash-stat__info">
        <span className="dash-stat__value">{value}</span>
        <span className="dash-stat__label">{label}</span>
      </div>
      {trend && (
        <span className="dash-stat__trend dash-stat__trend--up">
          <TrendingUp size={12} /> {trend}
        </span>
      )}
    </div>
  )
}

/* ── Mini growth sparkline ────────────────────────────────── */
function Sparkline() {
  const points = '0,28 15,24 30,26 45,20 60,22 75,16 90,18 105,12 120,14 135,8'
  return (
    <svg viewBox="0 0 135 36" className="dash-sparkline" fill="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,36 ${points} 135,36`} fill="url(#sparkGrad)" />
      <polyline
        points={points}
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="135" cy="8" r="3" fill="#10B981" />
    </svg>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function DashboardTeaser() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="landing-dash" id="dashboard">
      <motion.div
        ref={ref}
        className="landing-dash__inner"
        variants={stagger}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        <motion.div variants={fadeUp} className="landing-dash__header">
          <span className="landing-features__label">Dashboard Preview</span>
          <h2 className="landing-features__heading">
            Everything at a glance
          </h2>
          <p className="landing-features__sub">
            A unified view of every child's health profile—real-time metrics,
            growth trends, and AI-generated insights.
          </p>
        </motion.div>

        {/* browser frame */}
        <motion.div variants={fadeUp} className="browser-frame">
          {/* browser chrome */}
          <div className="browser-frame__chrome">
            <div className="browser-frame__dots">
              <span className="browser-frame__dot browser-frame__dot--red" />
              <span className="browser-frame__dot browser-frame__dot--yellow" />
              <span className="browser-frame__dot browser-frame__dot--green" />
            </div>
            <div className="browser-frame__url">
              <span>drishti-poshan.app/children/ananya</span>
            </div>
          </div>

          {/* dashboard content */}
          <div className="browser-frame__body">
            {/* profile header */}
            <div className="dash-profile">
              <div className="dash-profile__avatar">AS</div>
              <div className="dash-profile__info">
                <h3 className="dash-profile__name">
                  Ananya Sharma
                  <StatusBadge />
                </h3>
                <p className="dash-profile__meta">
                  <Calendar size={13} /> 2 years 4 months &nbsp;·&nbsp; Female
                  &nbsp;·&nbsp; ID: DP-2024-0847
                </p>
              </div>
            </div>

            {/* stats row */}
            <div className="dash-stats-row">
              <MiniStat icon={Weight} label="Weight" value="10.2 kg" trend="+0.4" />
              <MiniStat icon={Ruler} label="Height" value="84 cm" trend="+1.2" />
              <MiniStat icon={Activity} label="BMI" value="14.5" />
              <MiniStat icon={Heart} label="MUAC" value="14.1 cm" />
            </div>

            {/* growth section */}
            <div className="dash-growth">
              <div className="dash-growth__header">
                <h4 className="dash-growth__title">Weight-for-Age Trend</h4>
                <span className="dash-growth__range">Last 9 months</span>
              </div>
              <Sparkline />
            </div>

            {/* AI insight */}
            <div className="dash-insight">
              <div className="dash-insight__icon">
                <Activity size={14} />
              </div>
              <div>
                <p className="dash-insight__title">AI Insight</p>
                <p className="dash-insight__text">
                  Growth trajectory is on the 45th percentile curve. Recommend
                  increasing protein intake by ~15% to target the 50th
                  percentile within 3 months.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
