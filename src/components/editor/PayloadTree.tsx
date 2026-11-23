import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ChevronDown, ChevronRight, Code2, Copy, Crosshair, FoldVertical, PanelRight, UnfoldVertical } from 'lucide-react'
import type { Payload, Side } from '../../models/workspace'
import type { FieldDiscovery } from '../../services/discovery/types'
import type { FieldLocation } from '../../services/navigation/fields'
import { buildPayloadTree, treeNodePreview, treeSearch, visibleTreeNodes } from '../../services/navigation/tree'
import { IconButton } from '../layout/IconButton'

const ROW_HEIGHT = 30
const FRAGMENT_LIMIT = 32_000

export function PayloadTree({ side, payload, discovery, onClose, onLocate }: {
  side: Side; payload: Payload; discovery: FieldDiscovery; onClose: () => void; onLocate: (location: FieldLocation) => void
}) {
  const label = side === 'source' ? 'Source' : 'Target'
  const data = useMemo(() => buildPayloadTree(discovery.navigation), [discovery.navigation])
  const [expanded, setExpanded] = useState(() => new Set(data.roots))
  const [selected, setSelected] = useState(data.roots[0] ?? -1)
  const selectionRef = useRef(selected)
  selectionRef.current = selected
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(360)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typeAhead = useRef({ value: '', time: 0 })
  const search = useMemo(() => treeSearch(data, query), [data, query])
  const visible = useMemo(() => visibleTreeNodes(data, expanded, search.included), [data, expanded, search.included])
  const positions = useMemo(() => new Map(visible.map((entry, position) => [entry.id, position])), [visible])
  const node = positions.has(selected) ? data.nodes[selected] : undefined
  const ready = discovery.state !== 'pending' && discovery.navigation?.state === 'ready'
  const waiting = discovery.state === 'pending'
  const message = waiting ? 'Scanning payload…' : discovery.state === 'empty' ? 'Paste a payload to inspect its structure.' : discovery.state === 'invalid' || discovery.navigation?.state === 'invalid' ? 'Fix the payload syntax in the editor to view its tree.' : 'Tree view is unavailable for this payload size or complexity. You can continue using the text editor.'
  const start = Math.min(visible.length, Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5))
  const end = Math.min(visible.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + 5)

  useEffect(() => {
    setExpanded(new Set(data.roots)); setSelected(data.roots[0] ?? -1); setQuery(''); setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [data])
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ready])
  useEffect(() => { setCopyState('idle') }, [selected])
  useEffect(() => { if (ready) searchRef.current?.focus({ preventScroll: true }) }, [ready])

  const choose = (id: number, focus = true) => {
    selectionRef.current = id
    setSelected(id)
    const element = scrollRef.current, position = positions.get(id)
    if (element && position !== undefined) {
      const top = position * ROW_HEIGHT
      if (top < element.scrollTop) element.scrollTop = top
      else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT - element.clientHeight
      setScrollTop(element.scrollTop)
    }
    if (focus) element?.focus({ preventScroll: true })
  }
  const toggle = (id: number) => {
    choose(id)
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const position = positions.get(selected) ?? 0
    const current = data.nodes[visible[position]?.id]
    if (!current) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) event.preventDefault()
    if (event.key === 'ArrowUp') choose(visible[Math.max(0, position - 1)].id)
    else if (event.key === 'ArrowDown') choose(visible[Math.min(visible.length - 1, position + 1)].id)
    else if (event.key === 'Home') choose(visible[0].id)
    else if (event.key === 'End') choose(visible[visible.length - 1].id)
    else if (event.key === 'ArrowRight' && current.children.length) {
      if (!expanded.has(selected) && !search.included) toggle(selected)
      else if (visible[position + 1]?.id !== undefined) choose(visible[position + 1].id)
    } else if (event.key === 'ArrowLeft') {
      if (expanded.has(selected) && !search.included) toggle(selected)
      else if (current.location.parent !== null) choose(current.location.parent)
    } else if (event.key === 'Enter') onLocate(current.location)
    else if (event.key === ' ' && current.children.length && !search.included) toggle(selected)
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      typeAhead.current = { value: (now - typeAhead.current.time < 1000 ? typeAhead.current.value : '') + event.key.toLowerCase(), time: now }
      for (let step = 1; step <= visible.length; step++) {
        const id = visible[(position + step) % visible.length].id
        if (data.nodes[id].location.label.toLowerCase().startsWith(typeAhead.current.value)) { event.preventDefault(); choose(id); break }
      }
    }
  }
  const copyPath = async () => {
    if (!node) return
    try { await navigator.clipboard.writeText(node.location.path); setCopyState('copied') }
    catch { setCopyState('failed') }
  }
  const fragment = node ? payload.content.slice(node.location.start, Math.min(node.location.end, node.location.start + FRAGMENT_LIMIT)) : ''
  return <section className="payload-tree-inline" aria-label={`${label} tree view`} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}>
    <div className="tree-toolbar"><input ref={searchRef} className="tree-search" type="search" aria-label={`Filter ${side} tree fields`} placeholder="Find field or path…" value={query} disabled={!ready} onChange={event => {
      const next = event.target.value
      setQuery(next); setScrollTop(0)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
      const filtered = treeSearch(data, next)
      setSelected(filtered.matches.values().next().value ?? data.roots[0] ?? -1)
    }} /><span aria-live="polite">{query.trim() ? `${search.matches.size} matches` : `${data.nodes.length.toLocaleString()} nodes`}</span><IconButton label="Expand all" disabled={!ready || !!query.trim()} onClick={() => setExpanded(new Set(data.nodes.flatMap((item, id) => item.children.length ? [id] : [])))}><UnfoldVertical /></IconButton><IconButton label="Collapse all" disabled={!ready || !!query.trim()} onClick={() => { setExpanded(new Set()); choose(data.roots[0]); if (scrollRef.current) scrollRef.current.scrollTop = 0; setScrollTop(0) }}><FoldVertical /></IconButton><IconButton label="Show field details" aria-pressed={detailsOpen} disabled={!ready} onClick={() => { setDetailsOpen(value => !value); requestAnimationFrame(() => choose(selectionRef.current, false)) }}><PanelRight /></IconButton></div>
    {ready ? <div className={`payload-tree-body ${detailsOpen ? 'with-details' : ''}`}>
      <div ref={scrollRef} className="payload-tree-list" role="tree" aria-label={`${label} payload tree`} tabIndex={0} aria-activedescendant={positions.has(selected) && positions.get(selected)! >= start && positions.get(selected)! < end ? `${side}-tree-node-${selected}` : undefined} onFocus={event => { if (event.target === event.currentTarget && positions.has(selectionRef.current)) choose(selectionRef.current, false) }} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} onKeyDown={onKeyDown}>
        <div role="presentation" style={{ height: start * ROW_HEIGHT }} />
        {visible.slice(start, end).map(({ id, position, siblings }) => {
          const item = data.nodes[id], opened = !!search.included || expanded.has(id)
          return <div key={id} id={`${side}-tree-node-${id}`} role="treeitem" aria-label={`${item.location.label}${item.occurrences > 1 ? ` (${item.occurrence} of ${item.occurrences})` : ''}`} aria-level={item.depth + 1} aria-posinset={position} aria-setsize={siblings} aria-expanded={item.children.length ? opened : undefined} aria-selected={selected === id} className={`payload-tree-row ${selected === id ? 'is-selected' : ''}`} style={{ paddingLeft: 6 + Math.min(item.depth, 12) * 15 }} onClick={() => choose(id)} onDoubleClick={event => { if (!(event.target as HTMLElement).closest('button')) onLocate(item.location) }}>
            {item.children.length ? <button type="button" tabIndex={-1} className="tree-expander" aria-label={`${opened ? 'Collapse' : 'Expand'} ${item.location.label}`} disabled={!!search.included} onClick={event => { event.stopPropagation(); toggle(id) }}>{opened ? <ChevronDown /> : <ChevronRight />}</button> : <span className="tree-expander-placeholder" />}
            <span className="tree-node-label" title={item.location.label}>{item.location.label || '""'}{item.occurrences > 1 && <small> [{item.occurrence}]</small>}</span><span className="tree-node-kind">{item.location.kind}</span><span className="tree-node-preview">{treeNodePreview(item, payload.content)}</span>
          </div>
        })}
        <div role="presentation" style={{ height: Math.max(0, visible.length - end) * ROW_HEIGHT }} />
        {!visible.length && <p className="tree-empty">No fields match your search.</p>}
      </div>
      {detailsOpen && <section className="payload-tree-details" aria-label="Selected tree field">{node ? <><h3>Raw fragment · {node.location.kind}</h3><pre data-testid={`${side}-tree-fragment`}>{fragment}</pre>{node.location.end - node.location.start > FRAGMENT_LIMIT && <p className="tree-fragment-note">Preview limited to 32,000 characters. Open the field in the editor to inspect all content.</p>}</> : <p>Select a field to inspect it.</p>}</section>}
    </div> : <div className="tree-empty tree-unavailable" role="status">{message}</div>}
    <div className="tree-footer"><div className="tree-selected-path"><code data-testid={`${side}-tree-selected-path`} title={node?.location.path}>{node?.location.path || 'Select a field'}</code><IconButton label="Copy selected field path" disabled={!node} onClick={() => void copyPath()}>{copyState === 'copied' ? <Check /> : <Copy />}</IconButton></div><div><button className="button small" aria-label={`Show ${side} code view`} onClick={onClose}><Code2 />Code</button><button className="button primary small" disabled={!ready || !node || !positions.has(selected)} onClick={() => node && onLocate(node.location)}><Crosshair />Show in editor</button></div></div>
    {copyState === 'failed' && <p className="tree-copy-error" role="alert">Clipboard is unavailable. Select and copy the path above.</p>}
  </section>
}
