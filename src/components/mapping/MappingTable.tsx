import { memo, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, CopyPlus, LoaderCircle, Plus, Rows3, ScanSearch, Trash2, TriangleAlert } from 'lucide-react'
import type { MappingRow, Side } from '../../models/workspace'
import { newMapping, rules } from '../../models/workspace'
import { IconButton } from '../layout/IconButton'
import { Modal } from '../layout/Modal'
import { DiscoveredFields } from './DiscoveredFields'
import type { FieldDiscovery } from '../../services/discovery/types'
import { addDiscoveredFields, fieldPresence, unmappedFields } from '../../services/discovery/reconcile'

interface Props { rows: MappingRow[]; discoveries: Record<Side, FieldDiscovery>; getActiveSide: () => Side; onChange: (rows: MappingRow[]) => void }
export const MappingTable = memo(function MappingTable({ rows, discoveries, getActiveSide, onChange }: Props) {
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [reviewSide, setReviewSide] = useState<Side | null>(null)
  const [editing, setEditing] = useState<{ id: string; key: 'source' | 'target' | 'defaultValue' | 'description'; draft: string } | null>(null)
  const update = (id: string, patch: Partial<MappingRow>) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  const move = (index: number, direction: number) => {
    const next = [...rows]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    onChange(next)
  }
  const status = useMemo(() => {
    const knownSource = new Set(discoveries.source.knownPaths)
    const knownTarget = new Set(discoveries.target.knownPaths)
    return rows.map((row, index) => ({ row, index, source: fieldPresence(row.source, discoveries.source, knownSource), target: fieldPresence(row.target, discoveries.target, knownTarget) }))
  }, [rows, discoveries])
  const newSource = useMemo(() => unmappedFields(rows, discoveries.source, 'source').length, [rows, discoveries.source])
  const newTarget = useMemo(() => unmappedFields(rows, discoveries.target, 'target').length, [rows, discoveries.target])
  const missing = status.filter(item => item.source === 'missing' || item.target === 'missing').length
  const scanning = discoveries.source.state === 'pending' || discoveries.target.state === 'pending'
  const issues = [discoveries.source, discoveries.target].some(result => result.state === 'invalid' || result.state === 'limited')
  const visible = status.filter(item => (!onlyMissing || item.source === 'missing' || item.target === 'missing') && [item.row.source, item.row.target, item.row.description, item.row.rule, item.row.defaultValue].some(value => value.toLowerCase().includes(search.toLowerCase())))
  const filtering = Boolean(search || onlyMissing)
  const openReview = () => {
    const active = getActiveSide()
    setReviewSide(discoveries[active].state !== 'ready' ? active : newSource ? 'source' : newTarget ? 'target' : active)
  }
  const add = (side: Side, paths: string[]) => {
    setSearch(''); setOnlyMissing(false)
    onChange(addDiscoveredFields(rows, discoveries[side], side, paths))
  }
  return <div className="mapping-pane">
    <div className="mapping-toolbar"><div className="mapping-discovery-summary"><button className="discovery-trigger" aria-label="Review payload fields" title={`Source: ${discoveries.source.message}\nTarget: ${discoveries.target.message}`} onClick={openReview}>{scanning ? <LoaderCircle className="spin" /> : <ScanSearch />}Fields{newSource + newTarget > 0 && <span className="discovery-new-count">{newSource + newTarget} new</span>}{issues && <TriangleAlert className="discovery-issue" />}</button>{(missing > 0 || onlyMissing) && <button className="missing-summary" aria-label="Show missing mappings" aria-pressed={onlyMissing} title={`${missing} mappings reference fields not found in the current payloads. Click to filter.`} onClick={() => setOnlyMissing(value => !value)}><TriangleAlert />{missing} missing</button>}</div><div className="mapping-tools"><input type="search" aria-label="Filter mappings" placeholder="Filter mappings…" value={search} onChange={event => setSearch(event.target.value)} /><button className="button small" disabled={rows.length >= 10_000} onClick={() => { setSearch(''); setOnlyMissing(false); onChange([...rows, newMapping()]) }}><Plus />Add mapping</button></div></div>
    <div className="table-scroll">
      <table className="mapping-table"><colgroup><col style={{ width: 46 }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} /><col style={{ width: 156 }} /><col style={{ width: 78 }} /><col style={{ width: '12%' }} /><col style={{ width: '26%' }} /><col style={{ width: 112 }} /></colgroup>
        <thead><tr><th className="row-number">No</th><th>Source Field</th><th>Target Field</th><th>Transformation Rule</th><th className="center">Required</th><th>Default Value</th><th>Description</th><th className="center">Actions</th></tr></thead>
        <tbody>{visible.map(({ row, index, source, target }) => <tr key={row.id}>
          <td className="row-number">{String(index + 1).padStart(2, '0')}</td>
          {(['source', 'target'] as const).map(key => {
            const missing = (key === 'source' ? source : target) === 'missing'
            return <td key={key}><div className={`path-cell-wrap ${missing ? 'is-missing' : ''}`}><input className="path-cell" aria-label={`${key} field ${index + 1}`} aria-invalid={missing || undefined} placeholder={key === 'source' ? 'source.field' : 'target.field'} title={`${row[key]}\n${missing ? 'Not found in the current payload. Mapping retained.\n' : ''}Double-click to expand`} value={row[key]} onChange={event => update(row.id, { [key]: event.target.value })} onDoubleClick={() => setEditing({ id: row.id, key, draft: row[key] })} />{missing && <span className="field-missing" role="img" aria-label={`${key === 'source' ? 'Source' : 'Target'} field not found: ${row[key]}`} title="Not found in the current payload. Your mapping is retained."><TriangleAlert aria-hidden="true" /></span>}</div></td>
          })}
          <td><div className={`rule-select rule-${row.rule.toLowerCase()}`}><select aria-label={`Transformation rule ${index + 1}`} value={row.rule} onChange={event => update(row.id, { rule: event.target.value as MappingRow['rule'] })}>{rules.map(rule => <option key={rule}>{rule}</option>)}</select><ChevronDown /></div></td>
          <td className="center"><input type="checkbox" aria-label={`Required ${index + 1}`} checked={row.required} onChange={event => update(row.id, { required: event.target.checked })} /></td>
          {(['defaultValue', 'description'] as const).map(key => <td key={key}><textarea rows={1} aria-label={`${key === 'defaultValue' ? 'Default value' : 'Description'} ${index + 1}`} placeholder="—" title={`${row[key]}\nDouble-click to expand`} value={row[key]} onChange={event => update(row.id, { [key]: event.target.value })} onDoubleClick={() => setEditing({ id: row.id, key, draft: row[key] })} /></td>)}
          <td><div className="row-actions"><IconButton label={`Move mapping ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton><IconButton label={`Move mapping ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton><IconButton label={`Delete mapping ${index + 1}`} onClick={() => onChange(rows.filter(item => item.id !== row.id))}><Trash2 /></IconButton></div></td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <div className="mapping-empty"><Rows3 /><span>{filtering ? 'No mappings match your filter.' : 'Connect your first pair of fields.'}</span>{!filtering && <button className="button small" onClick={() => onChange([newMapping()])}><Plus />Add mapping</button>}</div>}
      {visible.length > 0 && !filtering && <button className="add-row" disabled={rows.length >= 10_000} onClick={() => onChange([...rows, newMapping()])}><Plus />Add mapping<span>Double-click a text cell for expanded editing</span></button>}
    </div>
    <div className="mapping-footer"><span><CopyPlus />{rows.length} field {rows.length === 1 ? 'mapping' : 'mappings'}<span className="footer-dot">·</span>{rows.filter(row => row.required).length} required</span><span>Documentation only · no transformations are executed</span></div>
    {editing && <CellDialog key={`${editing.id}-${editing.key}`} value={editing.draft} label={editing.key === 'description' ? 'Edit description' : 'Edit mapping value'} onClose={() => setEditing(null)} onSave={value => { update(editing.id, { [editing.key]: value }); setEditing(null) }} />}
    {reviewSide && <DiscoveredFields rows={rows} discoveries={discoveries} initialSide={reviewSide} onAdd={add} onClose={() => setReviewSide(null)} />}
  </div>
})

function CellDialog({ value, label, onClose, onSave }: { value: string; label: string; onClose: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  return <Modal title={label} onClose={onClose} className="cell-modal"><textarea autoFocus aria-label="Expanded mapping value" value={draft} onChange={event => setDraft(event.target.value)} /><div className="modal-actions"><button className="button" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onSave(draft)}>Save value</button></div></Modal>
}
