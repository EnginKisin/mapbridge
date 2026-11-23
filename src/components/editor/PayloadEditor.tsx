import { memo, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { Bookmark, BookmarkCheck, Check, CheckCheck, ChevronLeft, ChevronRight, Copy, Download, FileUp, ListTree, Maximize2, Minimize2, TextSelect, Trash2, TriangleAlert, WrapText, X } from 'lucide-react'
import { monaco } from './monaco'
import type { Payload, Side } from '../../models/workspace'
import { formats } from '../../models/workspace'
import { validatePayload } from '../../services/validation/payload'
import { formatPayload } from '../../services/formatting/format'
import { IconButton } from '../layout/IconButton'
import type { FieldDiscovery } from '../../services/discovery/types'
import type { FieldNavigationRequest } from '../../services/navigation/fields'
import { usePayloadNavigation } from './usePayloadNavigation'
import { PayloadTree } from './PayloadTree'
import { payloadFileInfo } from '../../services/payload/file'

interface Props {
  side: Side; payload: Payload; theme: 'dark' | 'light'; expanded: boolean
  onChange: (patch: Partial<Payload>) => void
  onExpand: () => void
  onNotify: (message: string, error?: boolean) => void
  onConfirm: (title: string, description: string, action: () => void) => void
  onFocus: (side: Side) => void
  formatRef: React.RefObject<Partial<Record<Side, () => void>>>
  discovery: FieldDiscovery
  navigationRequest?: FieldNavigationRequest
  session: number
  integrationName: string
}
export const PayloadEditor = memo(function PayloadEditor({ side, payload, theme, expanded, onChange, onExpand, onNotify, onConfirm, onFocus, formatRef, discovery, navigationRequest, session, integrationName }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [wrap, setWrap] = useState(true)
  const [copied, setCopied] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [validation, setValidation] = useState(() => validatePayload(payload.content, payload.format))
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [lineCount, setLineCount] = useState(1)
  const navigation = usePayloadNavigation({ side, payload, discovery, request: navigationRequest, session, cursor, onNotify })
  const latest = useRef({ payload, onChange, onNotify, onFocus })
  latest.current = { payload, onChange, onNotify, onFocus }
  useEffect(() => { setTreeOpen(false) }, [session])
  useEffect(() => { if (!treeOpen) editorRef.current?.focus() }, [treeOpen])
  useEffect(() => {
    if (!payload.content.trim() || payload.format === 'SQL' || payload.format === 'Plain Text') setTreeOpen(false)
  }, [payload.content, payload.format])
  useEffect(() => {
    if (navigationRequest) setTreeOpen(false)
  }, [navigationRequest?.id])
  const showCode = () => { setTreeOpen(false); requestAnimationFrame(() => editorRef.current?.focus()) }
  const downloadPayload = () => {
    const snapshot = latest.current.payload
    if (!snapshot.content) return
    try {
      const { filename, mimeType } = payloadFileInfo(integrationName || snapshot.system, side, snapshot.format)
      const url = URL.createObjectURL(new Blob([snapshot.content], { type: mimeType, endings: 'transparent' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename
      document.body.append(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      onNotify('Payload download started · UTF-8.')
    } catch { onNotify('Unable to download the payload.', true) }
  }
  const format = () => {
    try {
      const { payload, onChange, onNotify } = latest.current
      const formatted = formatPayload(payload.content, payload.format)
      if (formatted === payload.content) { onNotify(payload.format === 'Plain Text' || payload.format === 'SQL' ? 'This format is kept as entered.' : 'Already formatted, or whitespace preserved for safe XML formatting.'); return }
      const editor = editorRef.current
      if (editor?.getModel()) {
        editor.pushUndoStop()
        editor.executeEdits('maptelabridge-format', [{ range: editor.getModel()!.getFullModelRange(), text: formatted }])
        editor.pushUndoStop()
      } else onChange({ content: formatted })
      onNotify('Payload formatted.')
    } catch (error) { latest.current.onNotify(error instanceof Error ? error.message : 'Unable to format payload.', true) }
  }
  formatRef.current[side] = format
  useEffect(() => {
    const timer = setTimeout(() => setValidation(validatePayload(payload.content, payload.format)), 450)
    return () => clearTimeout(timer)
  }, [payload.content, payload.format])
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, 'maptelabridge', validation.state === 'invalid' ? [{ severity: monaco.MarkerSeverity.Error, message: validation.message, startLineNumber: validation.line || 1, startColumn: validation.column || 1, endLineNumber: validation.line || 1, endColumn: (validation.column || 1) + 1 }] : [])
  }, [validation])
  const mounted: OnMount = editor => {
    editorRef.current = editor
    navigation.mount(editor)
    setLineCount(editor.getModel()?.getLineCount() || 1)
    editor.onDidChangeModelContent(() => setLineCount(editor.getModel()?.getLineCount() || 1))
    editor.onDidChangeCursorPosition(event => setCursor({ line: event.position.lineNumber, column: event.position.column }))
    editor.onDidFocusEditorText(() => latest.current.onFocus(side))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => formatRef.current[side]?.())
  }
  const goToError = () => {
    const current = validatePayload(latest.current.payload.content, latest.current.payload.format)
    const editor = editorRef.current, model = editor?.getModel()
    if (!editor || !model || current.state !== 'invalid') return
    const position = model.validatePosition({ lineNumber: current.line || 1, column: current.column || 1 })
    setTreeOpen(false)
    requestAnimationFrame(() => { editor.setPosition(position); editor.revealPositionInCenter(position); editor.focus() })
  }
  const language = payload.format === 'JSON' ? 'json' : payload.format === 'XML' || payload.format === 'IDoc XML' ? 'xml' : payload.format === 'SQL' ? 'sql' : 'plaintext'
  const upload = async (file?: File) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { onNotify('Payload file exceeds the 20 MB limit.', true); return }
    try {
      const content = await file.text()
      const extension = file.name.split('.').pop()?.toLowerCase()
      const inferred = extension === 'json' ? 'JSON' : extension === 'xml' ? 'XML' : extension === 'sql' ? 'SQL' : undefined
      const action = () => { navigation.reset(); onChange({ content, ...(inferred ? { format: inferred } : {}) }); onNotify(`${file.name} loaded.`) }
      if (latest.current.payload.content) onConfirm('Replace payload?', `The current ${side} payload will be replaced by ${file.name}.`, action); else action()
    } catch { onNotify('Unable to read the payload file.', true) }
  }
  return <section className={`payload-panel ${side}`} aria-label={`${side} request editor`}>
    <div className="panel-caption"><span className={`side-indicator ${side}`} /><h2>{side === 'source' ? 'Source Request' : 'Target Request'}</h2><div className="panel-caption-actions"><span className="caption-meta">{side === 'source' ? 'Inbound payload' : 'Outbound payload'}</span><button type="button" className="payload-download" aria-label={`Download ${side} payload`} title="Download the current payload as a UTF-8 file" disabled={!payload.content} onClick={downloadPayload}><Download />Download</button></div></div>
    <div className="editor-toolbar">
      <input className="system-input" aria-label={`${side} system name`} placeholder={side === 'source' ? 'Source System' : 'Target System'} value={payload.system} onChange={event => onChange({ system: event.target.value })} spellCheck={false} />
      <span className="toolbar-divider" />
      <select aria-label={`${side} payload format`} value={payload.format} onChange={event => onChange({ format: event.target.value as Payload['format'] })}>{formats.map(format => <option key={format}>{format}</option>)}</select>
      <div className="editor-actions">
        <IconButton label={`Format ${side} (Ctrl/Cmd+Enter)`} onClick={format}><TextSelect /></IconButton>
        <IconButton label={`Toggle ${side} tree view`} aria-pressed={treeOpen} disabled={!payload.content.trim() || payload.format === 'SQL' || payload.format === 'Plain Text'} onClick={() => { onFocus(side); if (treeOpen) showCode(); else setTreeOpen(true) }}><ListTree /></IconButton>
        <IconButton label={`Copy ${side}`} disabled={!payload.content} onClick={async () => { try { await navigator.clipboard.writeText(latest.current.payload.content); setCopied(true); setTimeout(() => setCopied(false), 1500); onNotify('Copied to clipboard.') } catch { onNotify('Clipboard is unavailable. Select and copy text in the editor.', true) } }}>{copied ? <CheckCheck /> : <Copy />}</IconButton>
        <IconButton label={`Upload ${side} file`} onClick={() => fileRef.current?.click()}><FileUp /></IconButton>
        <IconButton label={`Toggle ${side} word wrap`} aria-pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText /></IconButton>
        <IconButton label={`Clear ${side}`} disabled={!payload.content} onClick={() => onConfirm('Clear payload?', `Clear the ${side} payload? Export your workspace first to keep a copy.`, () => onChange({ content: '' }))}><Trash2 /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label={`${expanded ? 'Restore' : 'Expand'} ${side} editor`} aria-pressed={expanded} onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</IconButton>
      </div>
      <input ref={fileRef} data-testid={`${side}-file`} type="file" accept=".json,.xml,.txt,.sql,.idoc" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
    </div>
    {!treeOpen && <div className="editor-navigation" aria-label={`${side} editor navigation`}>
      <button className="field-path-copy" aria-label={`Copy ${side} field path`} disabled={!navigation.path} title={navigation.path ? `${navigation.path}\nClick to copy field path` : discovery.state === 'pending' ? 'Scanning fields…' : payload.format === 'SQL' || payload.format === 'Plain Text' ? 'Field paths are available for JSON, XML, and IDoc XML.' : 'Place the cursor on a field to see its path.'} onClick={() => void navigation.copyPath()}><Copy /><code data-testid={`${side}-field-path`}>{navigation.path || (discovery.state === 'pending' ? 'Scanning fields…' : 'Field path')}</code></button>
      {navigation.matchCount.total > 1 && <div className="editor-match-controls"><IconButton label={`Previous ${side} field occurrence`} onClick={() => navigation.stepMatch(-1)}><ChevronLeft /></IconButton><span aria-label={`${side} field occurrence`}>{navigation.matchCount.current}/{navigation.matchCount.total}</span><IconButton label={`Next ${side} field occurrence`} onClick={() => navigation.stepMatch(1)}><ChevronRight /></IconButton></div>}
      <div className="editor-bookmarks"><IconButton label={`Toggle ${side} bookmark`} aria-pressed={navigation.bookmarks.includes(cursor.line)} onClick={navigation.toggleBookmark}>{navigation.bookmarks.includes(cursor.line) ? <BookmarkCheck /> : <Bookmark />}</IconButton>{navigation.bookmarks.length > 0 && <><span aria-label={`${side} bookmark count`}>{navigation.bookmarks.length}</span><IconButton label={`Previous ${side} bookmark`} onClick={() => navigation.stepBookmark(-1)}><ChevronLeft /></IconButton><IconButton label={`Next ${side} bookmark`} onClick={() => navigation.stepBookmark(1)}><ChevronRight /></IconButton><IconButton label={`Clear ${side} bookmarks`} onClick={navigation.clearBookmarks}><X /></IconButton></>}</div>
    </div>}
    <div className="payload-view" onFocusCapture={() => onFocus(side)}>
    <div className={`monaco-container ${treeOpen ? 'editor-code-hidden' : ''}`} aria-hidden={treeOpen}>
      <Editor language={language} value={payload.content} theme={`maptelabridge-${theme}`} onMount={mounted} onChange={content => onChange({ content: content ?? '' })} loading={<div className="editor-loading">Loading local editor…</div>}
        options={{ ariaLabel: `${side} payload`, fontSize: 12.5, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: 21, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, wordWrap: wrap ? 'on' : 'off', folding: true, showFoldingControls: 'mouseover', lineNumbersMinChars: 4, glyphMargin: false, padding: { top: 12, bottom: 12 }, tabSize: 2, insertSpaces: true, renderLineHighlight: 'line', overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 }, fixedOverflowWidgets: true, stickyScroll: { enabled: false }, links: false, unicodeHighlight: { ambiguousCharacters: false }, bracketPairColorization: { enabled: false }, quickSuggestions: false }} />
    </div>
    {treeOpen && <PayloadTree side={side} payload={payload} discovery={discovery} onClose={showCode} onLocate={location => { setTreeOpen(false); requestAnimationFrame(() => navigation.locateLocation(location)) }} />}
    </div>
    <div className="editor-status">
      {validation.state === 'invalid' ? <button type="button" className="validation invalid validation-link" aria-label={`Go to ${side} error`} title={`${validation.message}\nClick to go to the error location`} onClick={goToError}><TriangleAlert /><span>{`Invalid ${payload.format} · ${validation.message}`}</span></button> : <span className={`validation ${validation.state}`} title={validation.message}>{validation.state === 'valid' ? <Check /> : null}<span>{validation.message}</span></span>}
      {!treeOpen && <span className="cursor-position">Ln {cursor.line}, Col {cursor.column}</span>}<span>{lineCount.toLocaleString()} lines</span><span>UTF-8</span>
    </div>
  </section>
})
