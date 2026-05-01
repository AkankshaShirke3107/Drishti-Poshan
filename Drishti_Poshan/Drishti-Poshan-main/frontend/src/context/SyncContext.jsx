/**
 * Drishti Poshan — SyncContext (Offline-First Sync Engine)
 * =========================================================
 * Handles:
 * 1. Online/Offline detection via browser events
 * 2. IndexedDB sync queue processing (CREATE, UPDATE, DELETE, OBSERVATION)
 * 3. Toast notifications for sync status feedback
 * 4. ID reconciliation for offline-created records
 * 5. Automatic retry on reconnection
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import toast from 'react-hot-toast'
import { offlineDB } from '../lib/db'
import { api } from '../lib/api'

const SyncContext = createContext()

// ─── Sync Action Types ─────────────────────────────────────
const SYNC_ACTIONS = {
  CREATE_CHILD: 'CREATE_CHILD',
  UPDATE_CHILD: 'UPDATE_CHILD',
  DELETE_CHILD: 'DELETE_CHILD',
  ADD_OBSERVATION: 'ADD_OBSERVATION',
  ADD_MEASUREMENT: 'ADD_MEASUREMENT',
}

export { SYNC_ACTIONS }

export function SyncProvider({ children }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | error | complete
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSynced, setLastSynced] = useState(() => {
    const saved = localStorage.getItem('drishti-last-sync')
    return saved ? new Date(saved) : null
  })
  const syncingRef = useRef(false)

  // ─── Update pending count from IndexedDB ──────────────
  const refreshPendingCount = useCallback(async () => {
    try {
      const queue = await offlineDB.getSyncQueue()
      setPendingCount(queue.length)
      return queue.length
    } catch {
      setPendingCount(0)
      return 0
    }
  }, [])

  // ─── Core sync engine ─────────────────────────────────
  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncStatus('syncing')

    try {
      const queue = await offlineDB.getSyncQueue()
      if (queue.length === 0) {
        setSyncStatus('complete')
        syncingRef.current = false
        return
      }

      // Show loading toast
      const toastId = toast.loading(
        `🌐 Connection restored. Syncing ${queue.length} record${queue.length > 1 ? 's' : ''}...`,
        { id: 'sync-progress', duration: Infinity }
      )

      let successCount = 0
      let failCount = 0
      const idMappings = JSON.parse(
        localStorage.getItem('drishti-id-mappings') || '{}'
      )

      // Process queue sequentially to maintain order
      for (const item of queue) {
        try {
          let result = null

          switch (item.type) {
            case SYNC_ACTIONS.CREATE_CHILD: {
              result = await api.createChild(item.data)
              // Store ID mapping for reconciliation
              if (item.offlineId && result?.id) {
                idMappings[String(item.offlineId)] = result.id
              }
              break
            }
            case SYNC_ACTIONS.UPDATE_CHILD: {
              const realId = idMappings[String(item.data.id)] || item.data.id
              const { id, ...updateData } = item.data
              await api.updateChild(realId, updateData)
              break
            }
            case SYNC_ACTIONS.DELETE_CHILD: {
              const realId =
                idMappings[String(item.data.id)] || item.data.id
              await api.deleteChild(realId)
              break
            }
            case SYNC_ACTIONS.ADD_OBSERVATION: {
              const realChildId =
                idMappings[String(item.data.childId)] || item.data.childId
              await api.addObservation(realChildId, item.data.observation)
              break
            }
            case SYNC_ACTIONS.ADD_MEASUREMENT: {
              const realChildId =
                idMappings[String(item.data.childId)] || item.data.childId
              await api.addMeasurement(realChildId, item.data.measurement)
              break
            }
            default:
              console.warn(`Unknown sync action: ${item.type}`)
          }

          // Remove successfully synced item
          await offlineDB.removeSyncItem(item.id)
          successCount++

          // Update progress toast
          toast.loading(
            `🌐 Syncing... ${successCount}/${queue.length} complete`,
            { id: toastId }
          )
        } catch (err) {
          console.warn(`Sync item [${item.type}] failed:`, err.message)
          failCount++
        }
      }

      // Persist ID mappings
      localStorage.setItem('drishti-id-mappings', JSON.stringify(idMappings))

      // Update state
      const remaining = await offlineDB.getSyncQueue()
      setPendingCount(remaining.length)

      const now = new Date()
      setLastSynced(now)
      localStorage.setItem('drishti-last-sync', now.toISOString())

      // Show result toast
      toast.dismiss(toastId)

      if (failCount === 0 && successCount > 0) {
        setSyncStatus('complete')
        toast.success(
          `✅ ${successCount} offline record${successCount > 1 ? 's' : ''} synced successfully!`,
          { id: 'sync-result', duration: 4000 }
        )
      } else if (failCount > 0 && successCount > 0) {
        setSyncStatus('error')
        toast.error(
          `⚠️ Synced ${successCount}, but ${failCount} failed. Will retry later.`,
          { id: 'sync-result', duration: 5000 }
        )
      } else if (failCount > 0 && successCount === 0) {
        setSyncStatus('error')
        toast.error('❌ Sync failed. Will retry when connection improves.', {
          id: 'sync-result',
          duration: 5000,
        })
      } else {
        setSyncStatus('complete')
      }
    } catch (err) {
      console.error('Sync engine error:', err)
      setSyncStatus('error')
      toast.error('❌ Sync failed. Will retry later.', {
        id: 'sync-result',
        duration: 5000,
      })
    } finally {
      syncingRef.current = false
      // Reset status to idle after 5s
      setTimeout(
        () =>
          setSyncStatus((s) =>
            s === 'complete' || s === 'error' ? 'idle' : s
          ),
        5000
      )
    }
  }, [])

  // ─── Enqueue an action for offline sync ────────────────
  const enqueueAction = useCallback(
    async (type, data, offlineId = null) => {
      await offlineDB.addToSyncQueue({ type, data, offlineId })
      await refreshPendingCount()

      // If online, sync immediately
      if (navigator.onLine) {
        syncNow()
      } else {
        toast('📱 Saved offline. Will sync when connected.', {
          icon: '📡',
          duration: 3000,
          style: {
            background: 'var(--color-surface, #1e293b)',
            color: 'var(--color-text, #e2e8f0)',
            border: '1px solid var(--color-border, #334155)',
          },
        })
      }
    },
    [refreshPendingCount, syncNow]
  )

  // ─── Online/Offline event listeners ────────────────────
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true)
      toast('📡 You are offline. Data will be saved locally.', {
        icon: '🔴',
        duration: 4000,
        style: {
          background: 'var(--color-surface, #1e293b)',
          color: 'var(--color-text, #e2e8f0)',
          border: '1px solid #ef4444',
        },
      })
    }

    const handleOnline = () => {
      setIsOffline(false)
      toast('🟢 Back online!', {
        duration: 2000,
        style: {
          background: 'var(--color-surface, #1e293b)',
          color: 'var(--color-text, #e2e8f0)',
          border: '1px solid #22c55e',
        },
      })
      // Auto-sync after a small delay to let connection stabilize
      setTimeout(() => syncNow(), 1000)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [syncNow])

  // ─── Periodic pending count refresh ────────────────────
  useEffect(() => {
    refreshPendingCount()
    const interval = setInterval(refreshPendingCount, 10000)
    return () => clearInterval(interval)
  }, [refreshPendingCount])

  // ─── Periodic auto-sync (every 60s if online with pending) ─
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        offlineDB.getSyncQueue().then((queue) => {
          if (queue.length > 0) syncNow()
        })
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [syncNow])

  return (
    <SyncContext.Provider
      value={{
        isOffline,
        syncStatus,
        pendingCount,
        lastSynced,
        syncNow,
        enqueueAction,
        SYNC_ACTIONS,
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
