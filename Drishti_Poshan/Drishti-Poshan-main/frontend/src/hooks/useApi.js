import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'

/**
 * Custom hook for API calls with offline fallback.
 */
export function useApi(apiFn, offlineFn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const execute = useCallback(async (...args) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFn(...args)
      setData(result)

      // Cache offline if we have a cache function
      if (offlineFn && result) {
        try { await offlineFn(result) } catch (e) { /* silent */ }
      }
    } catch (err) {
      console.warn('API call failed, trying offline:', err.message)
      setError(err.message)

      // Try offline fallback
      if (offlineFn) {
        try {
          const offlineData = await offlineFn()
          if (offlineData) setData(offlineData)
        } catch (e) { /* silent */ }
      }
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { execute() }, [execute])

  return { data, loading, error, refetch: execute, setData }
}
