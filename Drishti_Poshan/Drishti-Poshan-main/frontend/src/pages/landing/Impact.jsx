import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { AlertTriangle, Users, TrendingDown, HeartPulse } from 'lucide-react'

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
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
}

const stats = [
  {
    icon: AlertTriangle,
    value: '35.5%',
    label: 'Children under 5 are stunted in India',
    source: 'NFHS-5, 2021',
    accent: 'warning',
  },
  {
    icon: TrendingDown,
    value: '32.1%',
    label: 'Are underweight, affecting cognitive development',
    source: 'NFHS-5, 2021',
    accent: 'danger',
  },
  {
    icon: Users,
    value: '1.2M+',
    label: 'Anganwadi workers lack digital monitoring tools',
    source: 'Ministry of WCD',
    accent: 'slate',
  },
  {
    icon: HeartPulse,
    value: '< 30%',
    label: 'Of cases detected early enough for intervention',
    source: 'WHO Growth Standards',
    accent: 'indigo',
  },
]

export default function Impact() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="landing-impact" id="impact">
      <motion.div
        ref={ref}
        className="landing-impact__inner"
        variants={stagger}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        <motion.div variants={fadeUp} className="landing-impact__header">
          <span className="landing-features__label">Why This Matters</span>
          <h2 className="landing-features__heading">
            The gap between data and
            <br />
            child health outcomes
          </h2>
          <p className="landing-features__sub">
            Millions of children fall through the cracks of paper-based monitoring.
            Early detection requires digital precision—not guesswork.
          </p>
        </motion.div>

        <div className="impact-grid">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="impact-card"
            >
              <div className={`impact-card__icon impact-card__icon--${stat.accent}`}>
                <stat.icon size={20} strokeWidth={2} />
              </div>
              <div className="impact-card__value">{stat.value}</div>
              <p className="impact-card__label">{stat.label}</p>
              <span className="impact-card__source">{stat.source}</span>
            </motion.div>
          ))}
        </div>

        <motion.div variants={fadeUp} className="impact-cta-strip">
          <p className="impact-cta-strip__text">
            Drishti-Poshan bridges this gap with AI-powered early detection,
            enabling health workers to act <em>before</em> malnutrition sets in.
          </p>
        </motion.div>
      </motion.div>
    </section>
  )
}
