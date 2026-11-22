import type { MappingRow, Side } from '../../models/workspace'
import { newMapping } from '../../models/workspace'
import { canonicalPath } from './paths'
import type { FieldDiscovery } from './types'

export function fieldPresence(path: string, discovery: FieldDiscovery, known = new Set(discovery.knownPaths)): 'present' | 'missing' | 'unknown' {
  const canonical = canonicalPath(path, discovery.format)
  if (!canonical) return 'unknown'
  if (known.has(canonical)) return 'present'
  if (discovery.state !== 'ready') return 'unknown'
  if (discovery.unknownDescendants.some(prefix => !prefix || canonical === prefix || canonical.startsWith(`${prefix}.`) || canonical.startsWith(`${prefix}[`))) return 'unknown'
  return 'missing'
}
export function unmappedFields(rows: MappingRow[], discovery: FieldDiscovery, side: Side) {
  const mapped = new Set(rows.map(row => canonicalPath(row[side], discovery.format)))
  return discovery.fields.filter(field => !mapped.has(field.path))
}
export function addDiscoveredFields(rows: MappingRow[], discovery: FieldDiscovery, side: Side, paths: string[]): MappingRow[] {
  const requested = new Set(paths)
  const available = unmappedFields(rows, discovery, side).filter(field => requested.has(field.path))
  if (rows.length + available.length > 10_000) throw new Error('A workspace can contain at most 10,000 mapping rows.')
  if (!available.length) return rows
  return [...rows, ...available.map(field => ({ ...newMapping(), [side]: field.path }))]
}

export function matchDiscoveredFields(rows: MappingRow[], discoveries: Record<Side, FieldDiscovery>, source: string, target: string): MappingRow[] {
  const selectable = (side: Side, path: string) => {
    const discovery = discoveries[side]
    return (discovery.state === 'ready' || discovery.state === 'limited') && unmappedFields(rows, discovery, side).some(field => field.path === path)
  }
  if (!selectable('source', source) || !selectable('target', target)) return rows
  if (rows.length >= 10_000) throw new Error('A workspace can contain at most 10,000 mapping rows.')
  return [...rows, { ...newMapping(), source, target }]
}
