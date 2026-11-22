import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Link2, LoaderCircle, Plus, ScanSearch, TriangleAlert } from 'lucide-react'
import type { MappingRow, Side } from '../../models/workspace'
import type { FieldDiscovery } from '../../services/discovery/types'
import { unmappedFields } from '../../services/discovery/reconcile'
import { Modal } from '../layout/Modal'

export function DiscoveredFields({ rows, discoveries, initialSide, onAdd, onMatch, onClose }: {
  rows: MappingRow[]
  discoveries: Record<Side, FieldDiscovery>
  initialSide: Side
  onAdd: (side: Side, paths: string[]) => void
  onMatch: (source: string, target: string) => void
  onClose: () => void
}) {
  const [side, setSide] = useState<Side>(initialSide)
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Record<Side, string>>({ source: '', target: '' })
  const available = useMemo(() => ({ source: unmappedFields(rows, discoveries.source, 'source'), target: unmappedFields(rows, discoveries.target, 'target') }), [rows, discoveries])
  const selected = (value: Side) => (discoveries[value].state === 'ready' || discoveries[value].state === 'limited') && available[value].some(field => field.path === selection[value]) ? selection[value] : ''
  const source = selected('source')
  const target = selected('target')
  useEffect(() => {
    setSelection(current => current.source === source && current.target === target ? current : { source, target })
  }, [source, target])
  const discovery = discoveries[side]
  const filtered = available[side].filter(field => field.path.toLowerCase().includes(search.toLowerCase()))
  const capacity = 10_000 - rows.length
  const canAdd = discovery.state === 'ready' || discovery.state === 'limited'
  const changeSide = (value: Side) => { setSide(value); setSearch('') }
  const select = (path: string) => {
    setSelection(current => ({ ...current, [side]: current[side] === path ? '' : path }))
    const other = side === 'source' ? 'target' : 'source'
    if (selection[side] !== path && !selected(other)) changeSide(other)
  }
  const match = () => {
    if (!source || !target || capacity <= 0) return
    onMatch(source, target)
    setSelection({ source: '', target: '' })
    setSearch('')
    setSide(initialSide)
  }
  return <Modal title="Discovered fields" onClose={onClose} className="discovery-modal">
    <p>Select a source field and a target field, then choose Match fields to add one mapping row. Use Add to add a field on its own.</p>
    <div className="discovery-sides" aria-label="Payload to review">{(['source', 'target'] as const).map(value => <button key={value} className="button" aria-pressed={side === value} onClick={() => changeSide(value)}>{value === 'source' ? 'Source' : 'Target'}<span>{available[value].length} unmapped</span></button>)}</div>
    <div className={`discovery-message discovery-${discovery.state}`} role="status">{discovery.state === 'pending' ? <LoaderCircle className="spin" /> : discovery.state === 'invalid' || discovery.state === 'limited' ? <TriangleAlert /> : <ScanSearch />}<span>{discovery.message}</span></div>
    <div className="discovery-controls"><input type="search" aria-label="Filter discovered fields" placeholder="Filter field paths…" value={search} onChange={event => setSearch(event.target.value)} /><button className="button small" aria-label={`Add all ${side} fields`} disabled={!canAdd || !filtered.length || filtered.length > capacity} onClick={() => onAdd(side, filtered.map(field => field.path))}><Plus />{search ? 'Add filtered' : 'Add all'} ({filtered.length})</button></div>
    {canAdd && filtered.length > capacity && <div className="discovery-capacity">{capacity} mapping rows available. Add individual fields or narrow the filter.</div>}
    <div className="discovery-list"><table><thead><tr><th>Field path</th><th>Type</th><th><span className="sr-only">Select or add to mapping</span></th></tr></thead><tbody>{filtered.slice(0, 100).map(field => <tr key={field.path} className={selection[side] === field.path ? 'is-selected' : undefined}><td title={field.path}><code>{field.path}</code></td><td><span className="field-kind">{field.kind}</span></td><td><div className="discovery-field-actions"><button className="button small" aria-label={`Select ${side} field ${field.path}`} aria-pressed={selection[side] === field.path} disabled={!capacity || !canAdd} onClick={() => select(field.path)}>{selection[side] === field.path && <Check />}Select</button><button className="button small" aria-label={`Add ${side} field ${field.path}`} disabled={!capacity || !canAdd} onClick={() => onAdd(side, [field.path])}><Plus />Add</button></div></td></tr>)}</tbody></table>
      {!filtered.length && <div className="discovery-empty">{discovery.state === 'pending' ? 'Waiting for the latest payload…' : discovery.state === 'invalid' || discovery.state === 'unsupported' || discovery.state === 'empty' ? 'No field suggestions available.' : search ? 'No fields match your filter.' : discovery.fields.length ? 'All discovered fields already have mappings.' : 'No fields found in this payload.'}</div>}
    </div>
    <div className="discovery-legend">{filtered.length > 100 ? `Showing 100 of ${filtered.length} fields. Filter to find more, or add all.` : `${discovery.fields.length} discovered · ${available[side].length} unmapped`}<span>Arrays use [] · XML attributes use @</span></div>
    <div className="discovery-match">
      <button className="discovery-selection" aria-label="Choose source field to match" onClick={() => changeSide('source')}><span>Source</span><code title={source}>{source || 'Select a source field'}</code></button>
      <ArrowRight aria-hidden="true" />
      <button className="discovery-selection" aria-label="Choose target field to match" onClick={() => changeSide('target')}><span>Target</span><code title={target}>{target || 'Select a target field'}</code></button>
      <button className="button primary" disabled={!source || !target || capacity <= 0} onClick={match}><Link2 />Match fields</button>
    </div>
    {capacity <= 0 && <div className="discovery-capacity">The 10,000 mapping row limit has been reached.</div>}
    <div className="modal-actions"><button autoFocus className="button" onClick={onClose}>Done</button></div>
  </Modal>
}
