import { memo, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { Check, CheckCheck, Copy, FileUp, Maximize2, Minimize2, TextSelect, Trash2, TriangleAlert, WrapText } from 'lucide-react'
import { monaco } from './monaco'
import type { Payload, Side } from '../../models/workspace'
import { formats } from '../../models/workspace'
import { validatePayload } from '../../services/validation/payload'
import { formatPayload } from '../../services/formatting/format'
import { IconButton } from '../layout/IconButton'

interface Props {
  side: Side; payload: Payload; theme: 'dark' | 'light'; expanded: boolean
  onChange: (patch: Partial<Payload>) => void
  onExpand: () => void
  onNotify: (message: string, error?: boolean) => void
  onConfirm: (title: string, description: string, action: () => void) => void
  onFocus: (side: Side) => void
  formatRef: React.RefObject<Partial<Record<Side, () => void>>>
}
export const PayloadEditor = memo(function PayloadEditor({ side, payload, theme, expanded, onChange, onExpand, onNotify, onConfirm, onFocus, formatRef }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState(false)
  const [validation, setValidation] = useState(() => validatePayload(payload.content, payload.format))
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [lineCount, setLineCount] = useState(1)
  const latest = useRef({ payload, onChange, onNotify, onFocus })
  latest.current = { payload, onChange, onNotify, onFocus }
  const format = () => {
    try {
      const { payload, onChange, onNotify } = latest.current
      const formatted = formatPayload(payload.content, payload.format)
      if (formatted === payload.content) { onNotify(payload.format === 'Plain Text' || payload.format === 'SQL' ? 'This format is kept as entered.' : 'Already formatted, or whitespace preserved for safe XML formatting.'); return }
      const editor = editorRef.current
      if (editor?.getModel()) {
        editor.pushUndoStop()
        editor.executeEdits('mapbridge-format', [{ range: editor.getModel()!.getFullModelRange(), text: formatted }])
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
    monaco.editor.setModelMarkers(model, 'mapbridge', validation.state === 'invalid' ? [{ severity: monaco.MarkerSeverity.Error, message: validation.message, startLineNumber: validation.line || 1, startColumn: validation.column || 1, endLineNumber: validation.line || 1, endColumn: (validation.column || 1) + 1 }] : [])
  }, [validation])
  const mounted: OnMount = editor => {
    editorRef.current = editor
    setLineCount(editor.getModel()?.getLineCount() || 1)
    editor.onDidChangeModelContent(() => setLineCount(editor.getModel()?.getLineCount() || 1))
    editor.onDidChangeCursorPosition(event => setCursor({ line: event.position.lineNumber, column: event.position.column }))
    editor.onDidFocusEditorText(() => latest.current.onFocus(side))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => formatRef.current[side]?.())
  }
  const language = payload.format === 'JSON' ? 'json' : payload.format === 'XML' || payload.format === 'IDoc XML' ? 'xml' : payload.format === 'SQL' ? 'sql' : 'plaintext'
  const upload = async (file?: File) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { onNotify('Payload file exceeds the 20 MB limit.', true); return }
    try {
      const content = await file.text()
      const extension = file.name.split('.').pop()?.toLowerCase()
      const inferred = extension === 'json' ? 'JSON' : extension === 'xml' ? 'XML' : extension === 'sql' ? 'SQL' : undefined
      const action = () => { onChange({ content, ...(inferred ? { format: inferred } : {}) }); onNotify(`${file.name} loaded.`) }
      if (latest.current.payload.content) onConfirm('Replace payload?', `The current ${side} payload will be replaced by ${file.name}.`, action); else action()
    } catch { onNotify('Unable to read the payload file.', true) }
  }
  return <section className={`payload-panel ${side}`} aria-label={`${side} request editor`}>
    <div className="panel-caption"><span className={`side-indicator ${side}`} /><h2>{side === 'source' ? 'Source Request' : 'Target Request'}</h2><span className="caption-meta">{side === 'source' ? 'Inbound payload' : 'Outbound payload'}</span></div>
    <div className="editor-toolbar">
      <input className="system-input" aria-label={`${side} system name`} value={payload.system} onChange={event => onChange({ system: event.target.value })} spellCheck={false} />
      <span className="toolbar-divider" />
      <select aria-label={`${side} payload format`} value={payload.format} onChange={event => onChange({ format: event.target.value as Payload['format'] })}>{formats.map(format => <option key={format}>{format}</option>)}</select>
      <div className="editor-actions">
        <IconButton label={`Format ${side} (Ctrl/Cmd+Enter)`} onClick={format}><TextSelect /></IconButton>
        <IconButton label={`Copy ${side}`} disabled={!payload.content} onClick={async () => { try { await navigator.clipboard.writeText(latest.current.payload.content); setCopied(true); setTimeout(() => setCopied(false), 1500); onNotify('Copied to clipboard.') } catch { onNotify('Clipboard is unavailable. Select and copy text in the editor.', true) } }}>{copied ? <CheckCheck /> : <Copy />}</IconButton>
        <IconButton label={`Upload ${side} file`} onClick={() => fileRef.current?.click()}><FileUp /></IconButton>
        <IconButton label={`Toggle ${side} word wrap`} aria-pressed={wrap} onClick={() => setWrap(value => !value)}><WrapText /></IconButton>
        <IconButton label={`Clear ${side}`} disabled={!payload.content} onClick={() => onConfirm('Clear payload?', `Clear the ${side} payload? Export your workspace first to keep a copy.`, () => onChange({ content: '' }))}><Trash2 /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label={`${expanded ? 'Restore' : 'Expand'} ${side} editor`} aria-pressed={expanded} onClick={onExpand}>{expanded ? <Minimize2 /> : <Maximize2 />}</IconButton>
      </div>
      <input ref={fileRef} data-testid={`${side}-file`} type="file" accept=".json,.xml,.txt,.sql,.idoc" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
    </div>
    <div className="monaco-container">
      <Editor language={language} value={payload.content} theme={`mapbridge-${theme}`} onMount={mounted} onChange={content => onChange({ content: content ?? '' })} loading={<div className="editor-loading">Loading local editor…</div>}
        options={{ ariaLabel: `${side} payload`, fontSize: 12.5, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: 21, minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false, wordWrap: wrap ? 'on' : 'off', folding: true, showFoldingControls: 'mouseover', lineNumbersMinChars: 4, glyphMargin: false, padding: { top: 12, bottom: 12 }, tabSize: 2, insertSpaces: true, renderLineHighlight: 'line', overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 }, fixedOverflowWidgets: true, stickyScroll: { enabled: false }, links: false, unicodeHighlight: { ambiguousCharacters: false }, bracketPairColorization: { enabled: false }, quickSuggestions: false }} />
    </div>
    <div className="editor-status">
      <span className={`validation ${validation.state}`} title={validation.message}>{validation.state === 'invalid' ? <TriangleAlert /> : validation.state === 'valid' ? <Check /> : null}<span>{validation.state === 'invalid' ? `Invalid ${payload.format} · ${validation.message}` : validation.message}</span></span>
      <span className="cursor-position">Ln {cursor.line}, Col {cursor.column}</span><span>{lineCount.toLocaleString()} lines</span><span>UTF-8</span>
    </div>
  </section>
})
