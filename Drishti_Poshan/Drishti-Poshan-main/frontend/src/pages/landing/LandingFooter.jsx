import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export default function LandingFooter() {
  const navigate = useNavigate()

  const handleAccessPlatform = (e) => {
    e.preventDefault()
    document.body.classList.add('page-exit-active')
    setTimeout(() => {
      navigate('/auth')
      document.body.classList.remove('page-exit-active')
    }, 400)
  }

  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <span className="landing-header__logo-icon">DP</span>
          <span className="landing-footer__name">Drishti-Poshan</span>
        </div>
        <p className="landing-footer__copy">
          Built with <Heart size={13} className="landing-footer__heart" /> for
          child nutrition monitoring
        </p>
        <div className="landing-footer__links">
          <Link to="/auth" onClick={handleAccessPlatform}>Access Platform</Link>
          <a href="#features">Features</a>
        </div>
      </div>
    </footer>
  )
}
