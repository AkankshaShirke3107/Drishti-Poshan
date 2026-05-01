/**
 * Drishti Poshan — useOfflineSync Hook
 * ======================================
 * A production-grade offline-first sync manager that:
 * 1. Queues data in localStorage when offline
 * 2. Listens for the 'online' event
 * 3. Pushes queued records to FastAPI sequentially
 * 4. Shows Loading → Success/Error toast transitions (Google Docs pattern)
 *
 * Usage: Call useOfflineSync() once in App.jsx — it runs globally.
 * Components use queueOfflineAction() to save data while offline.
 */
import { useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { offlineDB } from '../lib/db'

const LS_QUEUE_KEY = 'drishti_offline_queue'

// ─── Queue Helpers ──────────────────────────────────────────

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue))
}

function clearQueue() {
  localStorage.removeItem(LS_QUEUE_KEY)
}

// ─── Public: Add an item to the offline queue ───────────────

/**
 * Queue an action for later sync.
 * Call this from any component when navigator.onLine is false.
 *
 * @param {'CREATE_CHILD'|'UPDATE_CHILD'|'DELETE_CHILD'|'ADD_OBSERVATION'} type
 * @param {object} data - The payload to send to the server
 * @param {string|null} offlineId - Temporary ID for reconciliation
 */
export function queueOfflineAction(type, data, offlineId = null) {
  const queue = getQueue()
  queue.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    offlineId,
    timestamp: new Date().toISOString(),
  })
  saveQueue(queue)

  // Also save to IndexedDB for redundancy
  offlineDB.addToSyncQueue({ type, data, offlineId }).catch(() => {})

  toast('📱 Saved offline. Will sync when connected.', {
    icon: '📡',
    duration: 3000,
    style: {
      background: '#0f172a',
      color: '#e2e8f0',
      border: '1px solid #334155',
      borderRadius: '12px',
      fontSize: '14px',
    },
  })
}

// ─── The Hook ───────────────────────────────────────────────

export default function useOfflineSync() {
  const syncingRef = useRef(false)

  // ── Core sync logic ────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (syncingRef.current) return
    const queue = getQueue()
    if (queue.length === 0) return

    syncingRef.current = true

    // Step 1: Show loading toast
    const toastId = toast.loading(
      `🌐 Connection restored. Syncing ${queue.length} record${queue.length > 1 ? 's' : ''}...`,
      { duration: Infinity }
    )

    let successCount = 0
    let failCount = 0
    const failedItems = []
    const idMappings = JSON.parse(
      localStorage.getItem('drishti-id-mappings') || '{}'
    )

    // Step 2: Process queue sequentially
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]

      try {
        switch (item.type) {
          case 'CREATE_CHILD': {
            const result = await api.createChild(item.data)
            // Store ID mapping so offline pages can redirect
            if (item.offlineId && result?.id) {
              idMappings[String(item.offlineId)] = result.id
            }
            break
          }
          case 'UPDATE_CHILD': {
            const realId = idMappings[String(item.data.id)] || item.data.id
            const { id, ...updateData } = item.data
            await api.updateChild(realId, updateData)
            break
          }
          case 'DELETE_CHILD': {
            const realId = idMappings[String(item.data.id)] || item.data.id
            await api.deleteChild(realId)
            break
          }
          case 'ADD_OBSERVATION': {
            const realChildId =
              idMappings[String(item.data.childId)] || item.data.childId
            await api.addObservation(realChildId, item.data.observation)
            break
          }
          case 'ADD_MEASUREMENT': {
            const realChildId =
              idMappings[String(item.data.childId)] || item.data.childId
            await api.addMeasurement(realChildId, item.data.measurement)
            break
          }
          default:
            console.warn(`Unknown sync action: ${item.type}`)
        }

        successCount++

        // Update progress in loading toast
        toast.loading(
          `🌐 Syncing... ${successCount}/${queue.length} complete`,
          { id: toastId }
        )
      } catch (err) {
        console.warn(`Sync failed for [${item.type}]:`, err.message)
        failCount++
        failedItems.push(item)
      }
    }

    // Step 3: Persist ID mappings
    localStorage.setItem('drishti-id-mappings', JSON.stringify(idMappings))

    // Step 4: Also clear IndexedDB sync queue for successful items
    try {
      if (failCount === 0) {
        await offlineDB.clearSyncQueue()
      }
    } catch {}

    // Step 5: Update localStorage queue
    if (failedItems.length > 0) {
      // Keep only failed items for retry
      saveQueue(failedItems)
    } else {
      // All succeeded — clear the queue
      clearQueue()
    }

    // Step 6: Show result toast (Loading → Success/Error transition)
    if (failCount === 0 && successCount > 0) {
      // ✅ SUCCESS — The critical "Sync Completed" message
      toast.success(
        `✅ Sync Completed! All ${successCount} offline record${successCount > 1 ? 's' : ''} saved to server.`,
        { id: toastId, duration: 5000 }
      )

      // Update last sync timestamp
      localStorage.setItem('drishti-last-sync', new Date().toISOString())
    } else if (failCount > 0 && successCount > 0) {
      // ⚠️ PARTIAL — Some succeeded, some failed
      toast.error(
        `⚠️ Partially synced: ${successCount} saved, ${failCount} failed. Will retry later.`,
        { id: toastId, duration: 6000 }
      )
    } else if (failCount > 0 && successCount === 0) {
      // ❌ FAILURE — All items failed
      toast.error(
        '❌ Sync failed. Will retry when connection improves.',
        { id: toastId, duration: 6000 }
      )
    } else {
      // Edge case: empty queue processed
      toast.dismiss(toastId)
    }

    syncingRef.current = false
  }, [])

  // ── Listen for 'online' event ──────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      toast('🟢 Back online!', {
        duration: 2000,
        style: {
          background: '#0f172a',
          color: '#e2e8f0',
          border: '1px solid #22c55e',
          borderRadius: '12px',
        },
      })
      // Delay sync slightly to let connection stabilize
      setTimeout(() => processQueue(), 1500)
    }

    const handleOffline = () => {
      toast('🔴 You are offline. Data will be saved locally.', {
        duration: 4000,
        style: {
          background: '#0f172a',
          color: '#e2e8f0',
          border: '1px solid #ef4444',
          borderRadius: '12px',
        },
      })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Also run on mount — in case the app loaded offline and is now online
    if (navigator.onLine) {
      const queue = getQueue()
      if (queue.length > 0) {
        setTimeout(() => processQueue(), 2000)
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [processQueue])

  // ── Periodic retry (every 60s if online with pending items) ─
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        const queue = getQueue()
        if (queue.length > 0) processQueue()
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [processQueue])

  return { processQueue, getQueue, queueOfflineAction }
}
