import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app confirm dialog (native Popover API) replacing window.confirm so the
 * look matches the rest of the app on both desktop and mobile.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const decided = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.showPopover()
    const handleToggle = (e: Event) => {
      // Light-dismiss / Esc counts as cancel (unless we already confirmed).
      if ((e as ToggleEvent).newState === 'closed' && !decided.current) onCancel()
    }
    el.addEventListener('toggle', handleToggle)
    return () => el.removeEventListener('toggle', handleToggle)
  }, [onCancel])

  const confirm = () => {
    decided.current = true
    ref.current?.hidePopover()
    onConfirm()
  }

  return (
    <div ref={ref} popover="auto" className="edja-confirm" role="alertdialog" aria-label={title}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => ref.current?.hidePopover()}
          className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={confirm}
          className={
            danger
              ? 'flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700'
              : 'flex-1 rounded-xl bg-lake-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-lake-700'
          }
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
