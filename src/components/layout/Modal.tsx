import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function Modal({ title, children, onClose, className = '', initialFocus }: { title: string; children: ReactNode; onClose: () => void; className?: string; initialFocus?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    if (initialFocus) dialog.querySelector<HTMLElement>(initialFocus)?.focus({ preventScroll: true })
    return () => dialog.close()
  }, [initialFocus])
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose() } }}><h2>{title}</h2>{children}</dialog>
}
