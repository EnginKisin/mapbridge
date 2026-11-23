import { describe, expect, it } from 'vitest'
import { fieldAtOffset, findFieldLocations, indexFields, NAVIGATION_LIMITS } from './fields'
import { validatePayload } from '../validation/payload'
import { findJsonErrorOffset } from '../validation/jsonLocation'

describe('Payload field locations', () => {
  it('locates JSON keys and values with concrete array positions and wildcard queries', () => {
    const text = '{"items":[{"id":1},{"id":2}],"empty":{},"array":[]}'
    const index = indexFields(text, 'JSON')
    expect(index.state).toBe('ready')
    expect(fieldAtOffset(index, text.indexOf('2'))?.path).toBe('items[1].id')
    expect(findFieldLocations(index, '$.items[1].id', 'JSON')).toHaveLength(1)
    expect(findFieldLocations(index, 'items[].id', 'JSON').map(item => text.slice(item.start, item.end))).toEqual(['"id":1', '"id":2'])
    expect(findFieldLocations(index, 'empty', 'JSON')).toHaveLength(1)
    expect(findFieldLocations(index, 'missing', 'JSON')).toEqual([])
    expect(fieldAtOffset(index, text.length)?.path).toBe('$')
  })
  it('keeps escaped keys, literal brackets, duplicate keys and UTF-16 offsets exact', () => {
    const text = '{"emoji":"😀","a.b":{"x[]":"Ö"},"id":9007199254740993,"id":-0,"a\\"b":true}'
    const index = indexFields(text, 'JSON')
    expect(fieldAtOffset(index, text.indexOf('Ö'))?.path).toBe('["a.b"]["x[]"]')
    expect(findFieldLocations(index, '["a.b"]["x[]"]', 'JSON')).toHaveLength(1)
    expect(findFieldLocations(index, 'id', 'JSON')).toHaveLength(2)
    expect(findFieldLocations(index, '["a\\"b"]', 'JSON')).toHaveLength(1)
    expect(findFieldLocations(index, 'emoji', 'JSON')[0].selectionStart).toBe(text.indexOf('"emoji"'))
  })
  it('matches indexed root arrays and mixed wildcard paths precisely', () => {
    const text = '[{"list":[{"id":1},{"id":2}]},{"list":[{"id":3},{"id":4}]}]'
    const index = indexFields(text, 'JSON')
    expect(findFieldLocations(index, '$[].list[1].id', 'JSON').map(item => text.slice(item.start, item.end))).toEqual(['"id":2', '"id":4'])
    expect(findFieldLocations(index, '[0].list[].id', 'JSON')).toHaveLength(2)
  })
  it('finds the enclosing container between children without returning an earlier sibling', () => {
    const text = '{"first":{"name":1},\n  "second":2\n}'
    const index = indexFields(text, 'JSON')
    expect(fieldAtOffset(index, text.indexOf('\n'))?.path).toBe('$')
    expect(fieldAtOffset(index, text.indexOf('"name"'))?.path).toBe('first.name')
  })
  it('locates repeated XML elements, namespaced attributes and quoted greater-than characters', () => {
    const text = '<?xml version="1.0"?><s:Order xmlns:s="urn:test"><Item code="a>b">😀</Item><Item code=\'Ö\'><Id><![CDATA[<x>]]></Id></Item></s:Order>'
    const index = indexFields(text, 'XML')
    expect(index.state).toBe('ready')
    const attributes = findFieldLocations(index, 's:Order.Item.@code', 'XML')
    expect(attributes.map(item => text.slice(item.start, item.end))).toEqual(['code="a>b"', "code='Ö'"])
    expect(fieldAtOffset(index, text.indexOf('Ö'))?.path).toBe('s:Order.Item.@code')
    expect(fieldAtOffset(index, text.indexOf('<x>'))?.path).toBe('s:Order.Item.Id')
    expect(findFieldLocations(index, 's:Order.Item', 'XML')).toHaveLength(2)
    expect(findFieldLocations(index, 's:Order.@xmlns:s', 'XML')).toHaveLength(0)
  })
  it('handles self-closing elements, XML names with dots and CRLF without shifting offsets', () => {
    const text = '<root>\r\n<a.b code="1"/>\r\n<a.b code="2"/>\r\n</root>'
    const index = indexFields(text, 'IDoc XML')
    expect(findFieldLocations(index, 'root["a.b"].@code', 'IDoc XML')).toHaveLength(2)
    expect(fieldAtOffset(index, text.indexOf('"2"'))?.path).toBe('root["a.b"].@code')
    expect(fieldAtOffset(index, text.indexOf('</root>'))?.path).toBe('root')
  })
  it('does not offer stale or unsafe locations for malformed or unsupported payloads', () => {
    for (const [text, format] of [['{"a":}', 'JSON'], ['<root><a></root>', 'XML'], ['<!DOCTYPE root><root/>', 'XML']] as const) {
      expect(indexFields(text, format)).toEqual({ state: 'invalid', locations: [] })
    }
    for (const format of ['SQL', 'Plain Text'] as const) expect(indexFields('SELECT id FROM data', format).state).toBe('unsupported')
    expect(fieldAtOffset(undefined, 10)).toBeUndefined()
  })
  it('bounds index complexity without exposing partially indexed ranges', () => {
    expect(findFieldLocations(indexFields('{"id":1}', 'JSON'), 'x'.repeat(100_000), 'JSON')).toEqual([])
    expect(indexFields('['.repeat(130) + '0' + ']'.repeat(130), 'JSON')).toEqual({ state: 'limited', locations: [] })
    expect(indexFields('[' + Array(NAVIGATION_LIMITS.locations).fill('0').join(',') + ']', 'JSON')).toEqual({ state: 'limited', locations: [] })
  })
})

describe('Validation navigation positions', () => {
  it('reports multiline XML failures and JSON end-of-input positions', () => {
    expect(validatePayload('<root>\n  <item>\n</root>', 'XML')).toMatchObject({ state: 'invalid', line: 3 })
    expect(validatePayload('{\r\n "items": [1,2', 'JSON')).toMatchObject({ state: 'invalid', line: 2, column: 15 })
  })
})

describe('JSON error coordinates without browser-specific messages', () => {
  it.each([
    ['{\n \"a\": 1,\n \"b\": }\n', '}'],
    ['{\"items\":[1,2,]}', ']'],
    ['{\"a\": 1,}', '}'],
    ['{\"a\" 1}', '1'],
    ['[true, false, null, nope]', 'o'],
  ])('locates a malformed token in %s', (text, token) => {
    expect(text[findJsonErrorOffset(text)]).toBe(token)
  })
  it('handles end of input, string escapes, and deeply nested values iteratively', () => {
    expect(findJsonErrorOffset('{\"a\": ')).toBe(6)
    expect(findJsonErrorOffset('['.repeat(2000))).toBe(2000)
    const valid = JSON.stringify({ text: 'Ürün \"quoted\" 😃', values: [true, false, null, -1.3e20] })
    expect(findJsonErrorOffset(valid)).toBe(valid.length)
  })
})
