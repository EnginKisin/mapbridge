import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Braces, Check, ChevronDown, ChevronUp, CircleHelp, Columns2, Download, Ellipsis, FilePlus2, FileSpreadsheet, GripHorizontal, Keyboard, LoaderCircle, Moon, PanelBottomClose, PanelBottomOpen, Plus, Rows3, ShieldCheck, StickyNote, Sun, Trash2, Upload, X } from 'lucide-react'
import { blankWorkspace, hasWork, sampleWorkspace } from './models/workspace'
import type { Payload, Side, Workspace } from './models/workspace'
import { PayloadEditor } from './components/editor/PayloadEditor'
import { MappingTable } from './components/mapping/MappingTable'
import { AnalysisNotes } from './components/notes/AnalysisNotes'
import { IconButton } from './components/layout/IconButton'
import { Modal } from './components/layout/Modal'
import { useSplitter } from './hooks/useSplitter'
import { useFieldDiscovery } from './hooks/useFieldDiscovery'
import { exportExcel, importExcel } from './services/excel/client'
import { excelFilename } from './services/excel/filename'
import { MAX_FILE_BYTES } from './services/excel/limits'

interface Confirmation { title: string; description: string; action: () => void }
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(sampleWorkspace)
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [tab, setTab] = useState<'mapping' | 'notes'>('mapping')
  const [bottomOpen, setBottomOpen] = useState(true)
  const [expanded, setExpanded] = useState<Side | null>(null)
  const [dirty, setDirty] = useState(false)
  const [sample, setSample] = useState(true)
  const [busy, setBusy] = useState<'import' | 'export' | null>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [help, setHelp] = useState(false)
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const formatRef = useRef<Partial<Record<Side, () => void>>>({})
  const activeEditor = useRef<Side>('source')
  const busyRef = useRef(false)
  const horizontal = useSplitter('x', 50, 25, 75)
  const vertical = useSplitter('y', 65, 32, 83)
  const sourceFields = useFieldDiscovery(workspace.source)
  const targetFields = useFieldDiscovery(workspace.target)
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), [])
  const confirm = useCallback((title: string, description: string, action: () => void) => setConfirmation({ title, description, action }), [])
  const change = useCallback((updater: (current: Workspace) => Workspace) => {
    setWorkspace(updater); setDirty(true); setSample(false)
  }, [])
  const changeSource = useCallback((patch: Partial<Payload>) => change(current => ({ ...current, source: { ...current.source, ...patch } })), [change])
  const changeTarget = useCallback((patch: Partial<Payload>) => change(current => ({ ...current, target: { ...current.target, ...patch } })), [change])
  const focusEditor = useCallback((side: Side) => { activeEditor.current = side }, [])
  const getActiveSide = useCallback(() => activeEditor.current, [])
  const changeMappings = useCallback((mappings: Workspace['mappings']) => change(current => ({ ...current, mappings })), [change])
  const clear = (kind: 'new' | 'clear') => {
    if (menuRef.current) menuRef.current.open = false
    const action = () => { setWorkspace(blankWorkspace()); setDirty(false); setSample(false); setExpanded(null); notify(kind === 'new' ? 'New workspace is ready.' : 'Workspace cleared.') }
    if (hasWork(workspaceRef.current)) confirm(kind === 'new' ? 'Start a new workspace?' : 'Clear workspace?', 'Your current analysis will be removed. Export Excel first if you want to keep a copy.', action); else action()
  }
  const clearSample = () => {
    setWorkspace(blankWorkspace()); setSample(false); setDirty(false)
    notify('Sample data cleared. Your workspace is ready.')
  }
  const doExport = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true; setBusy('export')
    const snapshot = workspaceRef.current
    try {
      const buffer = await exportExcel(snapshot)
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = excelFilename(snapshot.integrationName)
      document.body.append(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      if (workspaceRef.current === snapshot) setDirty(false)
      notify('Excel exported · all four sheets included.')
    } catch (error) { notify(error instanceof Error ? error.message : 'Excel export failed.', true) }
    finally { busyRef.current = false; setBusy(null) }
  }, [notify])
  const doImport = async (file?: File) => {
    if (!file || busyRef.current) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) { notify('Select a MapBridge .xlsx file.', true); return }
    if (file.size > MAX_FILE_BYTES) { notify('Excel file exceeds the 50 MB import limit.', true); return }
    busyRef.current = true; setBusy('import')
    try {
      const loaded = await importExcel(await file.arrayBuffer())
      const apply = () => { setWorkspace(loaded); setDirty(false); setSample(false); notify('Workspace restored from Excel.') }
      if (hasWork(workspaceRef.current)) confirm('Replace current workspace?', `${file.name} is valid and ready. Importing replaces both payloads, mappings, notes, and integration details.`, apply)
      else apply()
    } catch (error) { notify(error instanceof Error ? error.message : 'Excel import failed.', true) }
    finally { busyRef.current = false; setBusy(null) }
  }
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 4500)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopPropagation()
        if (!document.querySelector('dialog[open]')) void doExport()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !(event.target as HTMLElement)?.closest('.monaco-editor') && !document.querySelector('dialog[open]')) { event.preventDefault(); formatRef.current[activeEditor.current]?.() }
      if (event.key === 'Escape' && menuRef.current) menuRef.current.open = false
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [doExport])
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="./" aria-label="MapBridge" onClick={event => event.preventDefault()}><span className="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M4 18V6l8 7 8-7v12M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span><span>MapBridge<span className="brand-period">.</span></span></a>
      <span className="header-divider" />
      <div className="integration-title"><label htmlFor="integration-name">INTEGRATION WORKSPACE</label><input id="integration-name" value={workspace.integrationName} onChange={event => change(current => ({ ...current, integrationName: event.target.value }))} spellCheck={false} /></div>
      <span className={`workspace-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? 'Unsaved changes' : sample ? 'Sample workspace' : 'In memory'}</span>
      <div className="header-actions"><button className="button import-button" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === 'import' ? <LoaderCircle className="spin" /> : <Upload />}Import Excel</button><button className="button primary" disabled={!!busy} onClick={() => void doExport()}>{busy === 'export' ? <LoaderCircle className="spin" /> : <Download />}<span>{busy === 'export' ? 'Exporting…' : 'Export Excel'}</span></button><span className="header-divider" /><IconButton label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun /> : <Moon />}</IconButton><details className="workspace-menu" ref={menuRef}><summary title="Workspace options" aria-label="Workspace options"><Ellipsis /></summary><div className="dropdown"><button onClick={() => clear('new')}><FilePlus2 />New workspace</button><button onClick={() => clear('clear')}><Trash2 />Clear workspace</button><div className="menu-divider" /><button onClick={() => { setHelp(true); if (menuRef.current) menuRef.current.open = false }}><Keyboard />Shortcuts & help</button></div></details></div>
      <input type="file" ref={fileRef} data-testid="excel-file" accept=".xlsx" hidden onChange={event => { void doImport(event.target.files?.[0]); event.target.value = '' }} />
    </header>
    <div className="app-body">
      <aside className="activity-rail" aria-label="Workspace panels"><div><IconButton label="Payload editors" aria-pressed={!bottomOpen} onClick={() => { setExpanded(null); setBottomOpen(false) }}><Columns2 /></IconButton><IconButton label="Open field mapping" aria-pressed={bottomOpen && tab === 'mapping'} onClick={() => { setTab('mapping'); setBottomOpen(true); setExpanded(null) }}><Rows3 /></IconButton><IconButton label="Open analysis notes" aria-pressed={bottomOpen && tab === 'notes'} onClick={() => { setTab('notes'); setBottomOpen(true); setExpanded(null) }}><StickyNote /></IconButton></div><div><IconButton label="Shortcuts and privacy information" onClick={() => setHelp(true)}><CircleHelp /></IconButton><span className="rail-shield" title="All processing stays in your browser"><ShieldCheck /></span></div></aside>
      <main className="main-workspace">
        <div className="workspace-strip"><div className="flow-breadcrumb"><Braces /><span className="muted">Workspace</span><span className="slash">/</span><span className="source-label">{workspace.source.system || 'Source'}</span><ArrowRight /><span className="target-label">{workspace.target.system || 'Target'}</span></div><div className="strip-right">{sample && <button className="sample-tag" onClick={clearSample} title="Clear sample workspace">Sample data<X /></button>}<span className="local-badge"><ShieldCheck />Local only</span><IconButton label={bottomOpen ? 'Hide bottom panel' : 'Show bottom panel'} onClick={() => { setBottomOpen(value => !value); setExpanded(null) }}>{bottomOpen ? <PanelBottomClose /> : <PanelBottomOpen />}</IconButton></div></div>
        <div className={`workbench ${horizontal.dragging || vertical.dragging ? 'is-resizing' : ''}`} ref={vertical.containerRef} style={{ gridTemplateRows: bottomOpen && !expanded ? `${vertical.ratio}fr 6px ${100 - vertical.ratio}fr` : 'minmax(0, 1fr)' }}>
          <div className={`editor-pair ${expanded ? `expanded-${expanded}` : ''}`} ref={horizontal.containerRef} style={{ gridTemplateColumns: expanded ? 'minmax(0, 1fr)' : `${horizontal.ratio}fr 6px ${100 - horizontal.ratio}fr` }}>
            <div className={`editor-slot ${expanded === 'target' ? 'hidden-slot' : ''}`}><PayloadEditor side="source" payload={workspace.source} theme={theme} expanded={expanded === 'source'} onChange={changeSource} onExpand={() => setExpanded(value => value === 'source' ? null : 'source')} onNotify={notify} onConfirm={confirm} onFocus={focusEditor} formatRef={formatRef} /></div>
            {!expanded && <div className="splitter vertical-splitter" aria-label="Resize source and target editors" {...horizontal.separatorProps}><span /></div>}
            <div className={`editor-slot ${expanded === 'source' ? 'hidden-slot' : ''}`}><PayloadEditor side="target" payload={workspace.target} theme={theme} expanded={expanded === 'target'} onChange={changeTarget} onExpand={() => setExpanded(value => value === 'target' ? null : 'target')} onNotify={notify} onConfirm={confirm} onFocus={focusEditor} formatRef={formatRef} /></div>
          </div>
          {bottomOpen && !expanded && <><div className="splitter horizontal-splitter" aria-label="Resize editors and analysis panel" {...vertical.separatorProps}><GripHorizontal /></div><section className="bottom-panel" aria-label="Analysis panel"><div className="bottom-tabs"><div role="tablist" aria-label="Analysis tabs"><button role="tab" id="mapping-tab" aria-controls="mapping-panel" aria-selected={tab === 'mapping'} onClick={() => setTab('mapping')}><Rows3 />Field Mapping<span className="count-badge">{workspace.mappings.length}</span></button><button role="tab" id="notes-tab" aria-controls="notes-panel" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}><StickyNote />Analysis Notes{workspace.notes && <span className="note-dot" />}</button></div><div className="bottom-panel-tools"><IconButton label="Minimize analysis panel" onClick={() => setBottomOpen(false)}><ChevronDown /></IconButton></div></div><div className="tab-content" role="tabpanel" id={tab === 'mapping' ? 'mapping-panel' : 'notes-panel'} aria-labelledby={tab === 'mapping' ? 'mapping-tab' : 'notes-tab'}>{tab === 'mapping' ? <MappingTable rows={workspace.mappings} discoveries={{ source: sourceFields, target: targetFields }} getActiveSide={getActiveSide} onChange={changeMappings} /> : <AnalysisNotes value={workspace.notes} onChange={notes => change(current => ({ ...current, notes }))} />}</div></section></>}
        </div>
        {(!bottomOpen || expanded) && <button className="restore-panel" onClick={() => { setExpanded(null); setBottomOpen(true) }}><ChevronUp /><Rows3 />Field Mapping<span>{workspace.mappings.length}</span><StickyNote />Analysis Notes<Plus /></button>}
      </main>
    </div>
    <footer className="app-status"><div><ShieldCheck /><span>Private by design</span><span className="footer-dot">·</span><span className="muted">Nothing leaves your browser</span></div><div><FileSpreadsheet /><span>Excel is your save file</span><span className="footer-dot">·</span><button onClick={() => setHelp(true)}><span className="shortcut-label">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} S</span> to export</button></div></footer>
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp /> : <Check />}<span>{toast.message}</span><IconButton label="Dismiss notification" onClick={() => setToast(null)}><X /></IconButton></div>}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.description}</p><div className="modal-actions"><button autoFocus className="button" onClick={() => setConfirmation(null)}>Cancel</button><button className="button primary" onClick={() => { const action = confirmation.action; setConfirmation(null); action() }}>Continue</button></div></Modal>}
    {help && <Modal title="Your integration workbench" onClose={() => setHelp(false)}><p>Compare payloads, document mappings, and export your entire analysis in one Excel file. Import that file to continue later.</p><div className="help-shortcuts"><span>Format active editor</span><kbd>Ctrl / ⌘ + Enter</kbd><span>Export workspace</span><kbd>Ctrl / ⌘ + S</kbd><span>Find / replace in editor</span><kbd>Ctrl / ⌘ + F / H</kbd><span>Close a dialog</span><kbd>Esc</kbd></div><p>Drag the dividers to resize panels. Double-click a divider to reset it, or use arrow keys when focused. Double-click a mapping text cell for expanded editing.</p><p className="privacy-note"><ShieldCheck />Everything runs in your browser. No accounts, uploads to servers, analytics, or browser storage. Refreshing closes unsaved work; export Excel to keep it.</p><div className="modal-actions"><button autoFocus className="button primary" onClick={() => setHelp(false)}><ArrowDownToLine />Got it</button></div></Modal>}
  </div>
}
