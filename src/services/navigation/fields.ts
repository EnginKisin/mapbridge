import { SaxesParser } from 'saxes'
import type { PayloadFormat } from '../../models/workspace'
import { appendKey, canonicalPath } from '../discovery/paths'
import type { FieldKind } from '../discovery/types'

export interface FieldLocation {
  path: string
  label: string
  kind: FieldKind
  valueStart?: number
  preview?: string
  start: number
  end: number
  selectionStart: number
  selectionEnd: number
  parent: number | null
}
export interface FieldIndex { state: 'ready' | 'invalid' | 'unsupported' | 'limited'; locations: FieldLocation[] }
export interface FieldNavigationRequest { id: number; path: string }
export const NAVIGATION_LIMITS = { characters: 20 * 1024 * 1024, locations: 50_000, depth: 128, pathLength: 2048 } as const
class IndexLimit extends Error {}

export function indexFields(content: string, format: PayloadFormat): FieldIndex {
  if (format === 'SQL' || format === 'Plain Text') return { state: 'unsupported', locations: [] }
  if (content.length > NAVIGATION_LIMITS.characters) return { state: 'limited', locations: [] }
  const locations: FieldLocation[] = []
  const add = (location: FieldLocation, depth: number) => {
    if (locations.length >= NAVIGATION_LIMITS.locations || depth > NAVIGATION_LIMITS.depth || location.path.length > NAVIGATION_LIMITS.pathLength) throw new IndexLimit()
    locations.push(location)
    return locations.length - 1
  }
  try {
    if (format === 'JSON') {
      JSON.parse(content)
      let offset = 0
      const whitespace = () => { while (/\s/.test(content[offset] || '') && offset < content.length) offset++ }
      const string = () => {
        const start = offset++
        while (offset < content.length) {
          const char = content[offset++]
          if (char === '\\') offset++
          else if (char === '"') break
        }
        return { start, end: offset }
      }
      const value = (path: string, parent: number | null, depth: number, key?: { start: number; end: number }, label = path || '$') => {
        whitespace()
        const start = offset
        const char = content[start]
        const kind: FieldKind = char === '{' ? 'object' : char === '[' ? 'array' : char === '"' ? 'string' : char === 'n' ? 'null' : char === 't' || char === 'f' ? 'boolean' : 'number'
        const index = add({ path: path || '$', label, kind, valueStart: start, start: key?.start ?? start, end: content.length, selectionStart: key?.start ?? start, selectionEnd: key?.end ?? start + 1, parent }, depth)
        if (content[offset] === '{') {
          offset++; whitespace()
          if (content[offset] !== '}') {
            do {
              whitespace()
              const key = string()
              const name: string = JSON.parse(content.slice(key.start, key.end))
              whitespace(); offset++ // colon; the document was validated above
              value(appendKey(path, name), index, depth + 1, key, name)
              whitespace()
              if (content[offset] !== ',') break
              offset++
            } while (offset < content.length)
          }
          offset++
        } else if (content[offset] === '[') {
          offset++; whitespace()
          let item = 0
          if (content[offset] !== ']') {
            do {
              value(`${path || '$'}[${item}]`, index, depth + 1, undefined, `[${item++}]`)
              whitespace()
              if (content[offset] !== ',') break
              offset++
            } while (offset < content.length)
          }
          offset++
        } else if (content[offset] === '"') string()
        else { while (offset < content.length && !/[\s,}\]]/.test(content[offset])) offset++ }
        locations[index].end = offset
        if (!key && content[start] !== '{' && content[start] !== '[') locations[index].selectionEnd = offset
      }
      value('', null, 0)
    } else {
      if (/<!DOCTYPE\s|<!ENTITY\s/i.test(content)) return { state: 'invalid', locations: [] }
      const parser = new SaxesParser({ xmlns: true })
      const stack: number[] = []
      let tagStart = 0
      parser.on('error', error => { throw error })
      parser.on('opentagstart', () => { tagStart = content.lastIndexOf('<', parser.position - 1) })
      parser.on('opentag', tag => {
        const parent = stack[stack.length - 1] ?? null
        const path = appendKey(parent === null ? '' : locations[parent].path, tag.name, true)
        const index = add({ path, label: tag.name, kind: 'element', start: tagStart, end: content.length, selectionStart: tagStart + 1, selectionEnd: tagStart + 1 + tag.name.length, parent }, stack.length)
        const attributes = content.slice(tagStart + 1 + tag.name.length, parser.position)
        for (const match of attributes.matchAll(/([^\s=<>/]+)\s*=\s*(?:"[^"]*"|'[^']*')/gu)) {
          const name = match[1]
          if (name === 'xmlns' || name.startsWith('xmlns:')) continue
          const start = tagStart + 1 + tag.name.length + match.index
          const rawValue = match[0].slice(match[0].indexOf('=') + 1).trim()
          add({ path: appendKey(path, `@${name}`, true), label: `@${name}`, kind: 'attribute', preview: rawValue.slice(1, -1).slice(0, 161), start, end: start + match[0].length, selectionStart: start, selectionEnd: start + name.length, parent: index }, stack.length + 1)
        }
        stack.push(index)
      })
      const text = (value: string) => {
        const current = stack[stack.length - 1]
        if (current === undefined) return
        const previous = locations[current].preview || ''
        if (previous.length < 161) locations[current].preview = previous + value.replace(/\s+/g, ' ').slice(0, 161 - previous.length)
      }
      parser.on('text', text)
      parser.on('cdata', text)
      parser.on('closetag', () => { locations[stack.pop()!].end = parser.position })
      parser.write(content).close()
    }
    return { state: 'ready', locations }
  } catch (error) {
    return { state: error instanceof IndexLimit ? 'limited' : 'invalid', locations: [] }
  }
}

export function fieldAtOffset(index: FieldIndex | undefined, offset: number): FieldLocation | undefined {
  const locations = index?.locations
  if (!locations?.length) return
  let low = 0, high = locations.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (locations[middle].start <= offset) low = middle + 1
    else high = middle - 1
  }
  let current: number | null = high >= 0 ? high : null
  while (current !== null) {
    const location: FieldLocation = locations[current]
    if (offset < location.end || offset === location.end && location.parent === null) return location
    current = location.parent
  }
}

export function findFieldLocations(index: FieldIndex | undefined, path: string, format: PayloadFormat): FieldLocation[] {
  if (index?.state !== 'ready' || path.length > NAVIGATION_LIMITS.pathLength) return []
  const normalized = canonicalPath(path, format, true)
  if (!normalized) return []
  if (format !== 'JSON') return index.locations.filter(location => location.path === normalized)
  // Quoted keys remain literal, including keys that contain [] or regex characters.
  const pattern = normalized.split(/(\[(?:"(?:\\.|[^"\\])*"|)\])/g).map(part => part === '[]' ? '\\[\\d+\\]' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
  const matcher = new RegExp(`^${pattern}$`)
  return index.locations.filter(location => matcher.test(location.path))
}
