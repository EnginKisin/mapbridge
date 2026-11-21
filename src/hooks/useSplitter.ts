import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

export function useSplitter(axis: 'x' | 'y', initial: number, min: number, max: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(initial)
  const [dragging, setDragging] = useState(false)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => cleanupRef.current?.(), [])
  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    cleanupRef.current?.()
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    setDragging(true)
    const previousCursor = document.body.style.cursor
    const previousSelection = document.body.style.userSelect
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    const move = (event: globalThis.PointerEvent) => {
      const position = axis === 'x' ? (event.clientX - bounds.left) / bounds.width : (event.clientY - bounds.top) / bounds.height
      setRatio(Math.min(max, Math.max(min, position * 100)))
    }
    const cleanup = () => {
      setDragging(false)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelection
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('blur', cleanup)
      cleanupRef.current = undefined
    }
    cleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('blur', cleanup)
  }, [axis, min, max])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const increase = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const decrease = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    if (![increase, decrease, 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    setRatio(value => event.key === 'Home' ? min : event.key === 'End' ? max : Math.min(max, Math.max(min, value + (event.key === increase ? 2 : -2))))
  }
  return { containerRef, ratio, dragging, separatorProps: { onPointerDown, onKeyDown, onDoubleClick: () => setRatio(initial), tabIndex: 0, role: 'separator' as const, 'aria-orientation': axis === 'x' ? 'vertical' as const : 'horizontal' as const, 'aria-valuemin': min, 'aria-valuemax': max, 'aria-valuenow': Math.round(ratio) } }
}
