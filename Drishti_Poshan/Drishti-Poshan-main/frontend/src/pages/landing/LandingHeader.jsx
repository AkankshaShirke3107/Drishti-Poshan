import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Dashboard', href: '#dashboard' },
]

export default function LandingHeader() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = scrollY.on('change', (v) => {
      setScrolled(v > 40)
    })
    return unsubscribe
  }, [scrollY])

  const handleAccessPlatform = (e) => {
    e.preventDefault()
    document.body.classList.add('page-exit-active')
    setTimeout(() => {
      navigate('/auth')
      document.body.classList.remove('page-exit-active')
    }, 400)
  }

  return (
    <>
      <motion.header
        className={`landing-header ${scrolled ? 'landing-header--scrolled' : ''}`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="landing-header__inner">
          {/* logo */}
          <a href="#hero" className="landing-header__logo">
            <span className="landing-header__logo-icon">DP</span>
            <span className="landing-header__logo-text">Drishti-Poshan</span>
          </a>

          {/* desktop nav */}
          <nav className="landing-header__nav">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="landing-header__link">
                {link.label}
              </a>
            ))}
          </nav>

          {/* cta */}
          <div className="landing-header__actions">
            <Link to="/auth" className="landing-header__cta" onClick={handleAccessPlatform}>
              Access Platform
            </Link>
            <button
              className="landing-header__menu"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="landing-mobile-nav"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="landing-mobile-nav__link"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/auth"
              className="landing-header__cta landing-header__cta--full"
              onClick={(e) => {
                setMobileOpen(false)
                handleAccessPlatform(e)
              }}
            >
              Access Platform
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
