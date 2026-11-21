import { SaxesParser } from 'saxes'
import type { PayloadFormat } from '../../models/workspace'
import { appendKey } from './paths'
import { emptyDiscovery } from './types'
import type { DiscoveredField, FieldDiscovery, FieldKind } from './types'

export const DISCOVERY_LIMITS = { characters: 20 * 1024 * 1024, nodes: 200_000, paths: 20_000, fields: 10_000, depth: 128, pathLength: 2048 } as const
class ScanLimit extends Error {}
export function discoverFields(content: string, format: PayloadFormat): FieldDiscovery {
  if (format === 'Plain Text' || format === 'SQL') return emptyDiscovery(format, 'unsupported', 'Field discovery is available for JSON, XML, and IDoc XML.')
  if (!content.trim()) return emptyDiscovery(format, 'empty', 'Paste a payload to discover fields.')
  if (content.length > DISCOVERY_LIMITS.characters) return emptyDiscovery(format, 'limited', 'Payload exceeds the 20-million-character discovery limit. Manual mapping remains available.')
  const known = new Set<string>()
  const fields = new Map<string, DiscoveredField>()
  const unknown = new Set<string>()
  let nodes = 0
  const visit = (path: string, depth: number) => {
    if (++nodes > DISCOVERY_LIMITS.nodes || depth > DISCOVERY_LIMITS.depth || path.length > DISCOVERY_LIMITS.pathLength) throw new ScanLimit()
    known.add(path)
    if (known.size > DISCOVERY_LIMITS.paths) throw new ScanLimit()
  }
  const add = (path: string, kind: FieldKind) => {
    if (fields.has(path)) return
    if (fields.size >= DISCOVERY_LIMITS.fields) throw new ScanLimit()
    fields.set(path, { path, kind })
  }
  let state: FieldDiscovery['state'] = 'ready'
  let message = 'Fields are up to date.'
  try {
    if (format === 'JSON') {
      const root: unknown = JSON.parse(content)
      const walk = (value: unknown, path: string, depth: number) => {
        visit(path || '$', depth)
        if (value === null) { unknown.add(path); add(path || '$', 'null'); return }
        if (Array.isArray(value)) {
          if (!value.length) { unknown.add(`${path || '$'}[]`); add(path || '$', 'array') }
          else for (const item of value) walk(item, `${path || '$'}[]`, depth + 1)
        } else if (typeof value === 'object') {
          let count = 0
          for (const key of Object.keys(value)) {
            count++
            walk((value as Record<string, unknown>)[key], appendKey(path, key), depth + 1)
          }
          if (!count && path) add(path, 'object')
        } else add(path || '$', typeof value as FieldKind)
      }
      walk(root, '', 0)
    } else {
      if (/<!DOCTYPE\s|<!ENTITY\s/i.test(content)) return emptyDiscovery(format, 'invalid', 'DTD and entity declarations are not supported. Existing mappings are kept.')
      const stack: { path: string; children: boolean; text: boolean }[] = []
      const parser = new SaxesParser({ xmlns: true })
      parser.on('error', error => { throw error })
      parser.on('opentag', tag => {
        const parent = stack[stack.length - 1]
        if (parent) parent.children = true
        const path = appendKey(parent?.path || '', tag.name, true)
        visit(path, stack.length)
        for (const [name] of Object.entries(tag.attributes)) {
          if (name === 'xmlns' || name.startsWith('xmlns:')) continue
          const attribute = appendKey(path, `@${name}`, true)
          visit(attribute, stack.length + 1); add(attribute, 'attribute')
        }
        stack.push({ path, children: false, text: false })
      })
      parser.on('text', value => { if (value.trim() && stack.length) stack[stack.length - 1].text = true })
      parser.on('cdata', value => { if (value && stack.length) stack[stack.length - 1].text = true })
      parser.on('closetag', () => {
        const frame = stack.pop()!
        if (!frame.children || frame.text) add(frame.path, 'element')
      })
      parser.write(content).close()
    }
  } catch (error) {
    if (!(error instanceof ScanLimit)) return emptyDiscovery(format, 'invalid', 'Payload syntax is invalid. Fix it to refresh discovery; existing mappings are kept.')
    state = 'limited'; message = 'Partial scan: complexity limit reached. Showing discovered fields; missing-field warnings are paused.'
  }
  return { state, format, fields: [...fields.values()], knownPaths: [...known], unknownDescendants: [...unknown], message }
}
