import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { monaco } from './monaco'
import type { Payload, Side } from '../../models/workspace'
import type { FieldDiscovery } from '../../services/discovery/types'
import { fieldAtOffset, findFieldLocations } from '../../services/navigation/fields'
import type { FieldLocation, FieldNavigationRequest } from '../../services/navigation/fields'

export function usePayloadNavigation({ side, payload, discovery, request, session, cursor, onNotify }: {
  side: Side; payload: Payload; discovery: FieldDiscovery; request?: FieldNavigationRequest; session: number
  cursor: { line: number; column: number }; onNotify: (message: string, error?: boolean) => void
}) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const bookmarkIds = useRef<string[]>([])
  const highlight = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const matches = useRef<{ locations: FieldLocation[]; current: number }>({ locations: [], current: 0 })
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [matchCount, setMatchCount] = useState({ current: 0, total: 0 })
  const [mounted, setMounted] = useState(0)
  const handled = useRef<number | undefined>(undefined)
  const disposables = useRef<monaco.IDisposable[]>([])
  const latest = useRef({ payload, discovery, onNotify })
  latest.current = { payload, discovery, onNotify }

  const path = useMemo(() => {
    const model = editorRef.current?.getModel()
    return model ? fieldAtOffset(discovery.navigation, model.getOffsetAt({ lineNumber: cursor.line, column: cursor.column }))?.path : undefined
  }, [discovery, cursor, mounted])
  const currentPath = useRef(path)
  currentPath.current = path
  const clearBookmarks = useCallback(() => {
    const model = editorRef.current?.getModel()
    if (model && !model.isDisposed()) model.deltaDecorations(bookmarkIds.current, [])
    bookmarkIds.current = []
    setBookmarks([])
  }, [])
  const syncBookmarks = useCallback(() => {
    const model = editorRef.current?.getModel()
    setBookmarks([...new Set(bookmarkIds.current.flatMap(id => {
      const range = model?.getDecorationRange(id)
      return range ? [range.startLineNumber] : []
    }))].sort((a, b) => a - b))
  }, [])
  const toggleBookmark = useCallback(() => {
    const editor = editorRef.current, model = editor?.getModel(), position = editor?.getPosition()
    if (!model || !position) return
    const lines = new Set(bookmarkIds.current.flatMap(id => {
      const range = model.getDecorationRange(id)
      return range ? [range.startLineNumber] : []
    }))
    if (lines.has(position.lineNumber)) lines.delete(position.lineNumber); else lines.add(position.lineNumber)
    bookmarkIds.current = model.deltaDecorations(bookmarkIds.current, [...lines].map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: { isWholeLine: true, firstLineDecorationClassName: 'payload-bookmark', linesDecorationsTooltip: 'Temporary bookmark — use the bookmark button to remove', lineNumberClassName: 'payload-bookmark-number', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
    })))
    syncBookmarks()
  }, [syncBookmarks])
  const stepBookmark = useCallback((direction: number) => {
    const editor = editorRef.current, model = editor?.getModel()
    if (!editor || !model) return
    const lines = [...new Set(bookmarkIds.current.flatMap(id => { const range = model.getDecorationRange(id); return range ? [range.startLineNumber] : [] }))].sort((a, b) => a - b)
    if (!lines.length) return
    const current = editor.getPosition()?.lineNumber || 1
    const line = direction > 0 ? lines.find(line => line > current) ?? lines[0] : [...lines].reverse().find(line => line < current) ?? lines[lines.length - 1]
    editor.setPosition({ lineNumber: line, column: 1 }); editor.revealLineInCenter(line); editor.focus()
  }, [])
  const copyPath = useCallback(async () => {
    if (!currentPath.current) { latest.current.onNotify("Place the cursor on a JSON, XML, or IDoc XML field to copy its path."); return }
    try { await navigator.clipboard.writeText(currentPath.current); latest.current.onNotify('Field path copied.') }
    catch { latest.current.onNotify('Clipboard is unavailable. The field path is shown above the editor.', true) }
  }, [])
  const showMatch = useCallback((location: FieldLocation) => {
    const editor = editorRef.current, model = editor?.getModel()
    if (!editor || !model) return
    const start = model.getPositionAt(location.selectionStart), end = model.getPositionAt(location.selectionEnd)
    const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
    highlight.current?.set([{ range, options: { inlineClassName: 'payload-field-match' } }])
    editor.setSelection(range); editor.revealRangeInCenter(range); editor.focus()
  }, [])
  const stepMatch = useCallback((direction: number) => {
    const state = matches.current
    if (!state.locations.length) return
    state.current = (state.current + direction + state.locations.length) % state.locations.length
    showMatch(state.locations[state.current])
    setMatchCount({ current: state.current + 1, total: state.locations.length })
  }, [showMatch])
  const reset = useCallback(() => {
    clearBookmarks(); highlight.current?.clear()
    matches.current = { locations: [], current: 0 }; setMatchCount({ current: 0, total: 0 })
  }, [clearBookmarks])
  useEffect(() => { reset() }, [session, reset])
  useEffect(() => {
    highlight.current?.clear(); matches.current = { locations: [], current: 0 }; setMatchCount({ current: 0, total: 0 })
  }, [payload.format])
  useEffect(() => {
    if (!request || request.id === handled.current || !editorRef.current || discovery.state === 'pending') return
    handled.current = request.id
    highlight.current?.clear()
    const locations = findFieldLocations(discovery.navigation, request.path, payload.format)
    matches.current = { locations, current: 0 }; setMatchCount({ current: locations.length ? 1 : 0, total: locations.length })
    if (locations.length) showMatch(locations[0])
    else onNotify(discovery.state === 'invalid' ? 'Fix the payload syntax before locating a field.' : discovery.navigation?.state === 'limited' || discovery.state === 'limited' ? 'Field navigation is unavailable for this payload size or complexity.' : `Field not found in ${side} payload: ${request.path.length > 160 ? request.path.slice(0, 157) + "…" : request.path}`, true)
  }, [request, discovery, mounted, payload.format, side, onNotify, showMatch])
  useEffect(() => () => { disposables.current.forEach(item => item.dispose()); disposables.current = []; editorRef.current = null }, [])

  const mount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor
    highlight.current = editor.createDecorationsCollection()
    let previousLength = editor.getModel()?.getValueLength() || 0
    disposables.current.push(editor.onDidChangeModelContent(event => {
      if (event.isFlush || event.changes.some(change => change.rangeLength >= previousLength && previousLength > 0)) clearBookmarks()
      else syncBookmarks()
      previousLength = editor.getModel()?.getValueLength() || 0
      highlight.current?.clear(); matches.current = { locations: [], current: 0 }; setMatchCount({ current: 0, total: 0 })
    }))
    disposables.current.push(editor.onMouseDown(event => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS && event.target.position && !event.target.element?.closest('[class*="codicon-folding-"]')) {
        editor.setPosition(event.target.position); toggleBookmark()
      }
    }))
    for (const action of [
      { id: `maptelabridge.${side}.bookmark.toggle`, label: 'Toggle bookmark', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F2], run: toggleBookmark },
      { id: `maptelabridge.${side}.bookmark.next`, label: 'Next bookmark', keybindings: [monaco.KeyCode.F2], run: () => stepBookmark(1) },
      { id: `maptelabridge.${side}.bookmark.previous`, label: 'Previous bookmark', keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F2], run: () => stepBookmark(-1) },
      { id: `maptelabridge.${side}.bookmark.clear`, label: 'Clear bookmarks', run: clearBookmarks },
      { id: `maptelabridge.${side}.path.copy`, label: 'Copy field path', run: () => { void copyPath() } },
    ]) disposables.current.push(editor.addAction({ ...action, contextMenuGroupId: 'navigation' }))
    setMounted(value => value + 1)
  }
  return { mount, reset, path, bookmarks, toggleBookmark, stepBookmark, clearBookmarks, copyPath, matchCount, stepMatch }
}
