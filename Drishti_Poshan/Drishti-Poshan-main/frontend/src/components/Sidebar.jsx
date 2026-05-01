import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, BarChart3, UserPlus,
  Activity, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Map, User, Shield, Mic, FileText, RefreshCw, Globe, Loader2, ScanLine,
} from 'lucide-react'
import { useState } from 'react'
import { useSync } from '../context/SyncContext'
import { useLanguage } from '../context/LanguageContext'
import ThemeToggle from './ThemeToggle'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { isOffline, syncStatus, pendingCount, syncNow } = useSync()
  const { language, setLanguage, t } = useLanguage()
  const location = useLocation()
  const [aiOpen, setAiOpen] = useState(false)

  const NAV_MAIN = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/children', label: t('nav.children'), icon: Users },
    { path: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    { path: '/add-child', label: t('nav.addChild'), icon: UserPlus },
  ]

  const NAV_ADVANCED = [
    { path: '/heatmap', label: t('nav.heatmap'), icon: Map },
  ]

  const NAV_SYSTEM = [
    { path: '/profile', label: t('nav.profile'), icon: User },
    { path: '/abdm', label: t('nav.abdm'), icon: Shield },
  ]

  const renderNavItem = ({ path, label, icon: Icon }) => {
    const isActive = location.pathname === path || (path === '/dashboard' && location.pathname === '/')
    return (
      <NavLink key={path} to={path} style={{ textDecoration: 'none' }}>
        <motion.div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: collapsed ? '10px' : '9px 14px',
            borderRadius: 'var(--radius-md)',
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
            fontWeight: isActive ? 600 : 500, fontSize: '0.85rem',
            position: 'relative', overflow: 'hidden',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
          whileHover={{ background: isActive ? 'rgba(37,99,235,0.15)' : 'var(--color-surface-hover)', x: collapsed ? 0 : 2 }}
          whileTap={{ scale: 0.98 }}
        >
          {isActive && (
            <motion.div layoutId="sidebar-active" style={{
              position: 'absolute', left: 0, top: '15%', bottom: '15%',
              width: 3, borderRadius: 2, background: 'var(--color-primary)',
            }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />
          )}
          <Icon size={19} style={{ flexShrink: 0 }} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }} style={{ whiteSpace: 'nowrap' }}>
                {label}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </NavLink>
    )
  }

  const sectionLabel = (text) => !collapsed && (
    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 14px 4px', marginTop: 8 }}>
      {text}
    </p>
  )

  return (
    <motion.aside
      className="glass-panel"
      style={{
        width: collapsed ? 72 : 270,
        height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
        padding: collapsed ? '16px 10px' : '16px 14px',
        borderRadius: 0, borderRight: '1px solid var(--color-border)',
        transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}
      layout
    >
      {/* Logo — pinned top */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        paddingBottom: 16, borderBottom: '1px solid var(--color-border)', minHeight: 44, flexShrink: 0 }}>
        <motion.div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, #3b82f6, #10b981)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }} whileHover={{ rotate: 5, scale: 1.05 }}>
          <Activity size={20} color="white" />
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <h1 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                {t('app.name')}
              </h1>
              <p style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {t('app.tagline')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation — scrollable middle section */}
      <nav className="sidebar-scroll" style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: 'auto', overflowX: 'hidden',
        paddingRight: 2,
      }}>
        {NAV_MAIN.map(renderNavItem)}

        {sectionLabel(t('nav.aiTools'))}
        {NAV_ADVANCED.map(renderNavItem)}

        {/* AI Tools inline */}
        {!collapsed && (
          <motion.button
            onClick={() => setAiOpen(!aiOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
              borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent',
              color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: '0.85rem',
              cursor: 'pointer', width: '100%', textAlign: 'left',
              fontFamily: 'var(--font-family)',
            }}
          >
            <Mic size={19} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t('nav.aiTools')}</span>
            <motion.span animate={{ rotate: aiOpen ? 90 : 0 }} style={{ fontSize: '0.7rem' }}>▶</motion.span>
          </motion.button>
        )}
        {collapsed && (
          <NavLink to="/add-child?mode=voice" style={{ textDecoration: 'none' }}>
            <motion.div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px', borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
            }} whileHover={{ background: 'var(--color-surface-hover)' }}>
              <Mic size={19} />
            </motion.div>
          </NavLink>
        )}

        <AnimatePresence>
          {aiOpen && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', paddingLeft: 16 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <NavLink to="/add-child?mode=voice" style={{ textDecoration: 'none' }}>
                <motion.div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }} whileHover={{ background: 'var(--color-surface-hover)', x: 2 }}>
                  <Mic size={16} /> {t('nav.voice')}
                </motion.div>
              </NavLink>
              <NavLink to="/add-child?mode=ocr" style={{ textDecoration: 'none' }}>
                <motion.div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }} whileHover={{ background: 'var(--color-surface-hover)', x: 2 }}>
                  <FileText size={16} /> {t('nav.ocr')}
                </motion.div>
              </NavLink>
              <NavLink to="/bulk-add" style={{ textDecoration: 'none' }}>
                <motion.div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }} whileHover={{ background: 'var(--color-surface-hover)', x: 2 }}>
                  <ScanLine size={16} /> Bulk Scan
                </motion.div>
              </NavLink>
              <NavLink to="/bulk-upload" style={{ textDecoration: 'none' }}>
                <motion.div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }} whileHover={{ background: 'var(--color-surface-hover)', x: 2 }}>
                  <FileText size={16} /> CSV Upload
                </motion.div>
              </NavLink>
            </motion.div>
          )}
        </AnimatePresence>

        {sectionLabel('System')}
        {NAV_SYSTEM.map(renderNavItem)}
      </nav>

      {/* Bottom section — pinned bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
        paddingTop: 12, borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>

        {/* Sync status */}
        <motion.div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 'var(--radius-md)',
            background: isOffline ? 'rgba(239,68,68,0.1)' : syncStatus === 'syncing' ? 'rgba(37,99,235,0.1)' : 'rgba(16,185,129,0.1)',
            justifyContent: collapsed ? 'center' : 'flex-start', cursor: 'pointer',
          }}
          onClick={syncNow}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isOffline ? (
            <WifiOff size={15} color="var(--color-danger)" />
          ) : syncStatus === 'syncing' ? (
            <Loader2 size={15} color="var(--color-primary)" style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Wifi size={15} color="var(--color-success)" />
          )}
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600,
                  color: isOffline ? 'var(--color-danger)' : syncStatus === 'syncing' ? 'var(--color-primary)' : 'var(--color-success)',
                }}>
                  {isOffline ? t('sync.offline') : syncStatus === 'syncing' ? t('sync.syncing') : t('sync.connected')}
                </span>
                {pendingCount > 0 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    • {pendingCount} {t('sync.pending')}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!collapsed && !isOffline && syncStatus !== 'syncing' && (
            <RefreshCw size={13} color="var(--color-text-muted)" />
          )}
        </motion.div>

        {/* Language toggle */}
        {!collapsed && (
          <div style={{ display: 'flex', gap: 4, padding: '2px', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-secondary)' }}>
            {['en', 'hi', 'mr'].map(lang => (
              <motion.button key={lang} onClick={() => setLanguage(lang)}
                style={{
                  flex: 1, padding: '4px 0', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: language === lang ? 'var(--color-primary)' : 'transparent',
                  color: language === lang ? 'white' : 'var(--color-text-muted)',
                  fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              >
                {t(`lang.${lang}`)}
              </motion.button>
            ))}
          </div>
        )}
        {collapsed && (
          <motion.button onClick={() => setLanguage(language === 'en' ? 'hi' : language === 'hi' ? 'mr' : 'en')}
            className="btn btn-icon" style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', width: 36, height: 36, margin: '0 auto',
            }}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          >
            <Globe size={15} />
          </motion.button>
        )}

        {/* Theme + collapse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'space-between' }}>
          <ThemeToggle />
          <motion.button
            onClick={() => setCollapsed(c => !c)}
            className="btn btn-icon"
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', width: 34, height: 34,
            }}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </motion.button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Thin custom scrollbar for sidebar nav */
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 4px;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--color-text-muted);
        }
        .sidebar-scroll { scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
      `}</style>
    </motion.aside>
  )
}
