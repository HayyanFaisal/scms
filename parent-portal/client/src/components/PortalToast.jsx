import { useEffect } from 'react'

const styles = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  error: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100',
  info: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100'
}

const icons = { success: 'check_circle', error: 'error', info: 'info' }

const PortalToast = ({ message, type = 'success', onClose, duration = 5500 }) => {
  useEffect(() => {
    if (!message || !duration) return undefined
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, message, onClose])

  if (!message) return null

  return (
    <div className="pointer-events-none fixed right-5 top-24 z-[140] w-[min(26rem,calc(100vw-2.5rem))]" role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur ${styles[type] || styles.info}`}>
        <span className="material-symbols-outlined mt-0.5 text-xl">{icons[type] || icons.info}</span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-6">{message}</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" aria-label="Dismiss notification">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
    </div>
  )
}

export default PortalToast
