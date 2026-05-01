/**
 * Drishti Poshan — Sync Queue Hooks
 * ===================================
 * Re-exports the core sync utilities + ID reconciliation hook.
 */
import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { isPendingId } from '../lib/api'
import { useSync } from '../context/SyncContext'

// Re-export the offline sync hook and queue function
export { default as useOfflineSync, queueOfflineAction } from './useOfflineSync'

/**
 * useIdReconciliation
 *
 * If the current route uses a pending (offline) ID, this hook periodically
 * checks whether the record has been synced and received a real server ID.
 * Once reconciled, it navigates to the canonical URL.
 */
export function useIdReconciliation(id) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!id || !isPendingId(id)) return

    const checkReconciled = () => {
      try {
        const mappings = JSON.parse(localStorage.getItem('drishti-id-mappings') || '{}')
        const realId = mappings[String(id)]
        if (realId) {
          delete mappings[String(id)]
          localStorage.setItem('drishti-id-mappings', JSON.stringify(mappings))
          navigate(`/children/${realId}`, { replace: true })
        }
      } catch {
        // Ignore parse errors
      }
    }

    checkReconciled()
    const interval = setInterval(checkReconciled, 5000)
    return () => clearInterval(interval)
  }, [id, navigate])
}

/**
 * useOfflineSyncHelpers
 *
 * Convenience hook wrapping SyncContext for components that
 * need to check online status and pending count.
 */
export function useOfflineSyncHelpers() {
  const { isOffline, pendingCount, syncNow } = useSync()

  const saveChildOffline = useCallback(
    async (childData, offlineId = null) => {
      const { queueOfflineAction } = await import('./useOfflineSync')
      queueOfflineAction('CREATE_CHILD', childData, offlineId)
    },
    []
  )

  const deleteChildOffline = useCallback(
    async (childId) => {
      const { queueOfflineAction } = await import('./useOfflineSync')
      queueOfflineAction('DELETE_CHILD', { id: childId })
    },
    []
  )

  const addObservationOffline = useCallback(
    async (childId, observation) => {
      const { queueOfflineAction } = await import('./useOfflineSync')
      queueOfflineAction('ADD_OBSERVATION', { childId, observation })
    },
    []
  )

  return {
    isOffline,
    pendingCount,
    syncNow,
    saveChildOffline,
    deleteChildOffline,
    addObservationOffline,
  }
}
