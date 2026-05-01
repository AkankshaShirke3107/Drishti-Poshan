import './landing.css'
import LandingHeader from './LandingHeader'
import Hero from './Hero'
import Impact from './Impact'
import Features from './Features'
import DashboardTeaser from './DashboardTeaser'
import TechStack from './TechStack'
import LandingFooter from './LandingFooter'

export default function LandingPage() {
  return (
    <div className="landing-page">
      <LandingHeader />
      <Hero />
      <Impact />
      <Features />
      <DashboardTeaser />
      <TechStack />
      <LandingFooter />
    </div>
  )
}
