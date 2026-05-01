import { createContext, useContext, useState, useCallback } from 'react'
import en from '../i18n/en.json'
import hi from '../i18n/hi.json'
import mr from '../i18n/mr.json'

const translations = { en, hi, mr }
const LanguageContext = createContext()

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('drishti-lang') || 'en'
  })

  const changeLang = useCallback((lang) => {
    setLanguage(lang)
    localStorage.setItem('drishti-lang', lang)
  }, [])

  const t = useCallback((key, replacements = {}) => {
    let text = getNestedValue(translations[language], key)
      || getNestedValue(translations.en, key)
      || key
    // Replace {placeholder} patterns
    Object.entries(replacements).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
    return text
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
