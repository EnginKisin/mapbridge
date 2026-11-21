import type { PayloadFormat } from '../../models/workspace'

export function appendKey(parent: string, key: string, xml = false): string {
  const simple = xml ? /^@?[\p{L}_][\p{L}\p{N}_:\-]*$/u : /^[\p{L}_$][\p{L}\p{N}_$]*$/u
  return simple.test(key) && (xml || key !== '$') ? `${parent ? `${parent}.` : ''}${key}` : `${parent}[${JSON.stringify(key)}]`
}

export function canonicalPath(path: string, format: PayloadFormat): string | null {
  const xml = format === 'XML' || format === 'IDoc XML'
  let input = path.trim()
  if (!input) return null
  if (input === '$') return '$'
  if (input.startsWith('$.')) input = input.slice(2)
  else if (input.startsWith('$[')) input = input.slice(1)
  let result = ''
  let offset = 0
  let expectKey = true
  while (offset < input.length) {
    const rest = input.slice(offset)
    if (rest[0] === '[') {
      const quoted = /^\[("(?:\\.|[^"\\])*")\]/.exec(rest)
      if (quoted) {
        try { result = appendKey(result, JSON.parse(quoted[1]), xml) } catch { return null }
        offset += quoted[0].length; expectKey = false; continue
      }
      const array = /^\[(?:\d+)?\]/.exec(rest)
      if (!array || expectKey && result) return null
      if (!xml) result = `${result || '$'}[]`
      else if (!result) return null
      offset += array[0].length; expectKey = false; continue
    }
    if (!expectKey) {
      if (rest[0] !== '.') return null
      offset++; expectKey = true; continue
    }
    const key = /^[^.\[\]\s]+/.exec(rest)
    if (!key) return null
    result = appendKey(result, key[0], xml)
    offset += key[0].length; expectKey = false
  }
  return expectKey ? null : result
}
