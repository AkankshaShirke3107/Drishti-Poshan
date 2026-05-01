import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
}

/* ── SVG tech icons (grayscale, minimalist) ───────────────── */
const techStack = [
  {
    name: 'FastAPI',
    svg: (
      <svg viewBox="0 0 40 40" fill="none" className="tech-icon__svg">
        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M22 10L16 22h6l-2 8 8-14h-6l2-6z" fill="currentColor" fillOpacity="0.8" />
      </svg>
    ),
  },
  {
    name: 'React',
    svg: (
      <svg viewBox="0 0 40 40" fill="none" className="tech-icon__svg">
        <ellipse cx="20" cy="20" rx="16" ry="6" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="20" cy="20" rx="16" ry="6" stroke="currentColor" strokeWidth="1.2" transform="rotate(60 20 20)" />
        <ellipse cx="20" cy="20" rx="16" ry="6" stroke="currentColor" strokeWidth="1.2" transform="rotate(120 20 20)" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    name: 'Whisper AI',
    svg: (
      <svg viewBox="0 0 40 40" fill="none" className="tech-icon__svg">
        <path d="M12 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 20c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="20" r="1.5" fill="currentColor" />
        <path d="M20 22v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 30h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Python 3.13',
    svg: (
      <svg viewBox="0 0 40 40" fill="none" className="tech-icon__svg">
        <path d="M20 8c-5 0-5 2.5-5 5v2.5h5v1H13c-3 0-5 2-5 5s2 5 5 5h2v-3c0-2 2-4 4-4h6c2 0 3-1 3-3v-5c0-2-2-3.5-5-3.5h-3z" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="16.5" cy="12.5" r="1.2" fill="currentColor" />
        <path d="M20 32c5 0 5-2.5 5-5v-2.5h-5v-1h7c3 0 5-2 5-5s-2-5-5-5h-2v3c0 2-2 4-4 4h-6c-2 0-3 1-3 3v5c0 2 2 3.5 5 3.5h3z" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="23.5" cy="27.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
]

export default function TechStack() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <section className="landing-tech" id="tech-specs">
      <motion.div
        ref={ref}
        className="landing-tech__inner"
        variants={stagger}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
      >
        <motion.p variants={fadeUp} className="landing-tech__label">
          Built with
        </motion.p>
        <div className="landing-tech__grid">
          {techStack.map((tech) => (
            <motion.div key={tech.name} variants={fadeUp} className="tech-icon">
              {tech.svg}
              <span className="tech-icon__name">{tech.name}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
