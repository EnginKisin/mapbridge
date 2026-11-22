import { describe, expect, it } from 'vitest'
import { blankWorkspace, newMapping, sampleWorkspace } from '../../models/workspace'
import { exportWorkbook, importWorkbook } from '../excel/workbook'
import { discoverFields, DISCOVERY_LIMITS } from './discover'
import { addDiscoveredFields, fieldPresence, matchDiscoveredFields, unmappedFields } from './reconcile'
import { canonicalPath } from './paths'

describe('JSON field discovery', () => {
  it('finds nested leaf fields, nulls and empty containers without mutating text', () => {
    const content = '{ "customer": {"id": "C1", "address": {"city": "İstanbul"}}, "active": true, "amount": 0, "optional": null, "empty": {}, "items": [] }\r\n'
    const result = discoverFields(content, 'JSON')
    expect(result.state).toBe('ready')
    expect(result.fields).toEqual([
      { path: 'customer.id', kind: 'string' }, { path: 'customer.address.city', kind: 'string' },
      { path: 'active', kind: 'boolean' }, { path: 'amount', kind: 'number' },
      { path: 'optional', kind: 'null' }, { path: 'empty', kind: 'object' }, { path: 'items', kind: 'array' },
    ])
    expect(fieldPresence('customer', result)).toBe('present')
    expect(fieldPresence('customer.address', result)).toBe('present')
    expect(fieldPresence('customer.removed', result)).toBe('missing')
    expect(fieldPresence('optional.id', result)).toBe('unknown')
    expect(fieldPresence('items[0].materialCode', result)).toBe('unknown')
    expect(content.endsWith('\r\n')).toBe(true)
  })
  it('unions all array item shapes and collapses positions into structural paths', () => {
    const result = discoverFields('{"items":[{"id":1},{"id":2,"materialCode":"X","nested":[{"x":1}]}]}', 'JSON')
    expect(result.fields.map(field => field.path)).toEqual(['items[].id', 'items[].materialCode', 'items[].nested[].x'])
    expect(fieldPresence('items[0].id', result)).toBe('present')
    expect(fieldPresence('$.items[123].materialCode', result)).toBe('present')
    expect(fieldPresence('items[].nested[0].x', result)).toBe('present')
    expect(fieldPresence('items[].absent', result)).toBe('missing')
    const root = discoverFields('[{"id":1},{"name":"X"}]', 'JSON')
    expect(root.fields.map(field => field.path)).toEqual(['$[].id', '$[].name'])
    expect(fieldPresence('[0].id', root)).toBe('present')
    expect(fieldPresence('$[0].name', root)).toBe('present')
  })
  it('keeps special keys, Unicode, literal array notation and reserved root names distinct', () => {
    const result = discoverFields(JSON.stringify({ 'a.b': { 'x[0]': 1 }, a: { b: 2 }, müşteri: 'Ö', '$': { id: 3 }, 'a"b': 4, '': 5, '__proto__': 6 }), 'JSON')
    expect(result.fields.map(field => field.path)).toContain('["a.b"]["x[0]"]')
    expect(result.fields.map(field => field.path)).toContain('["$"]' + '.id')
    expect(fieldPresence('["a.b"]["x[0]"]', result)).toBe('present')
    expect(fieldPresence('a.b', result)).toBe('present')
    expect(fieldPresence('["a"]["b"]', result)).toBe('present')
    expect(fieldPresence('müşteri', result)).toBe('present')
    expect(fieldPresence('["$"].id', result)).toBe('present')
    expect(fieldPresence('["a.b"].x[0]', result)).toBe('missing')
  })
  it('handles root primitives and empty objects', () => {
    expect(discoverFields('42', 'JSON').fields).toEqual([{ path: '$', kind: 'number' }])
    expect(discoverFields('{}', 'JSON').fields).toEqual([])
    expect(fieldPresence('oldField', discoverFields('{}', 'JSON'))).toBe('missing')
  })
  it('treats invalid, empty or unsupported input as unverified, never as removed fields', () => {
    for (const result of [discoverFields('{', 'JSON'), discoverFields('', 'JSON'), discoverFields('SELECT id FROM data', 'SQL'), discoverFields('hello', 'Plain Text')]) {
      expect(result.fields).toEqual([])
      expect(fieldPresence('existing.path', result)).toBe('unknown')
    }
  })
})

describe('XML and IDoc field discovery', () => {
  it('finds text elements, attributes, empty elements and IDoc segments', () => {
    const result = discoverFields('<ORDERS><IDOC BEGIN="1"><E1EDP01 SEGMENT="1"><MATNR>A</MATNR></E1EDP01><E1EDP01 SEGMENT="1"><MATNR>B</MATNR><MENGE>2</MENGE></E1EDP01><EMPTY/></IDOC></ORDERS>', 'IDoc XML')
    expect(result.state).toBe('ready')
    expect(result.fields.map(field => field.path)).toEqual(['ORDERS.IDOC.@BEGIN', 'ORDERS.IDOC.E1EDP01.@SEGMENT', 'ORDERS.IDOC.E1EDP01.MATNR', 'ORDERS.IDOC.E1EDP01.MENGE', 'ORDERS.IDOC.EMPTY'])
    expect(fieldPresence('ORDERS.IDOC.E1EDP01[0].MATNR', result)).toBe('present')
    expect(fieldPresence('ORDERS.IDOC.E1EDP01', result)).toBe('present')
    expect(fieldPresence('ORDERS.IDOC.E1EDP01.MISSING', result)).toBe('missing')
  })
  it('preserves namespace prefixes and skips namespace declarations', () => {
    const result = discoverFields('<s:Order xmlns:s="urn:order" xmlns:x="urn:attr" x:id="Ö"><s:Code>42</s:Code></s:Order>', 'XML')
    expect(result.state).toBe('ready')
    expect(result.fields).toEqual([{ path: 's:Order.@x:id', kind: 'attribute' }, { path: 's:Order.s:Code', kind: 'element' }])
    expect(fieldPresence('s:Order.@x:id', result)).toBe('present')
    expect(discoverFields('<s:Order/>', 'XML').state).toBe('invalid')
  })
  it('recognizes mixed content, CDATA and element names containing dots', () => {
    const result = discoverFields('<root><p>Hello <b>world</b> !</p><data><![CDATA[<value>]]></data><a.b id="1"/></root>', 'XML')
    expect(result.fields.map(field => field.path)).toEqual(['root.p.b', 'root.p', 'root.data', 'root["a.b"].@id', 'root["a.b"]'])
    expect(fieldPresence('root["a.b"].@id', result)).toBe('present')
  })
  it.each(['<a><b></a>', '<a/><b/>', '<!DOCTYPE a SYSTEM "https://example.com/xxe"><a/>', '<a>&unknown;</a>'])('discards suggestions and missing warnings for invalid/unsafe XML: %s', xml => {
    const result = discoverFields(xml, 'XML')
    expect(result.state).toBe('invalid')
    expect(result.fields).toEqual([])
    expect(fieldPresence('a.old', result)).toBe('unknown')
  })
})

describe('Conservative reconciliation', () => {
  it('matches selected JSON and XML fields in one row without changing existing analysis', () => {
    const original = sampleWorkspace()
    const snapshot = structuredClone(original)
    const discoveries = {
      source: discoverFields('{"warehouseCode":"W1"}', 'JSON'),
      target: discoverFields('<Order><WarehouseCode>W1</WarehouseCode></Order>', 'XML'),
    }
    const added = matchDiscoveredFields(original.mappings, discoveries, 'warehouseCode', 'Order.WarehouseCode')
    expect(added).toHaveLength(4)
    expect(added.slice(0, 3)).toEqual(original.mappings)
    expect(added[3]).toMatchObject({ source: 'warehouseCode', target: 'Order.WarehouseCode', rule: 'Direct', required: false })
    expect(unmappedFields(added, discoveries.source, 'source')).toEqual([])
    expect(unmappedFields(added, discoveries.target, 'target')).toEqual([])
    expect(matchDiscoveredFields(added, discoveries, 'warehouseCode', 'Order.WarehouseCode')).toBe(added)
    expect(original).toEqual(snapshot)
  })
  it('rejects stale, missing or already mapped selections on either side', () => {
    const discoveries = { source: discoverFields('{"items":[{"id":1}]}', 'JSON'), target: discoverFields('{"id":1}', 'JSON') }
    const rows = [{ ...newMapping(), source: 'items[0].id' }]
    expect(matchDiscoveredFields(rows, discoveries, 'items[].id', 'id')).toBe(rows)
    const targetRows = [{ ...newMapping(), target: '["id"]' }]
    expect(matchDiscoveredFields(targetRows, discoveries, 'items[].id', 'id')).toBe(targetRows)
    const empty: typeof rows = []
    expect(matchDiscoveredFields(empty, discoveries, '', 'id')).toBe(empty)
    expect(matchDiscoveredFields(empty, discoveries, 'items[].id', 'removed')).toBe(empty)
    expect(matchDiscoveredFields(empty, { ...discoveries, target: { ...discoveries.target, state: 'pending' } }, 'items[].id', 'id')).toBe(empty)
    expect(matchDiscoveredFields(empty, { ...discoveries, source: { ...discoveries.source, state: 'limited' } }, 'items[].id', 'id')).toHaveLength(1)
  })
  it('allows a pair in the last available row and rejects exceeding the limit', () => {
    const rows = Array.from({ length: 9_999 }, newMapping)
    const discoveries = { source: discoverFields('{"id":1}', 'JSON'), target: discoverFields('{"code":1,"other":2}', 'JSON') }
    const added = matchDiscoveredFields(rows, discoveries, 'id', 'code')
    expect(added).toHaveLength(10_000)
    expect(() => matchDiscoveredFields([...rows, newMapping()], discoveries, 'id', 'other')).toThrow('10,000')
    expect(rows).toHaveLength(9_999)
  })
  it('adds one-sided rows only on request, avoids duplicates, and preserves manual analysis', () => {
    const original = sampleWorkspace()
    const snapshot = structuredClone(original)
    const discovery = discoverFields('{"orderId":"12345","customerId":"C100","amount":750,"warehouseCode":"WH1"}', 'JSON')
    expect(unmappedFields(original.mappings, discovery, 'source').map(field => field.path)).toEqual(['warehouseCode'])
    const added = addDiscoveredFields(original.mappings, discovery, 'source', ['warehouseCode', 'orderId', 'warehouseCode', 'nonexistent'])
    expect(added).toHaveLength(4)
    expect(added.slice(0, 3)).toEqual(original.mappings)
    expect(added[3]).toMatchObject({ source: 'warehouseCode', target: '', rule: 'Direct', required: false, defaultValue: '', description: '' })
    expect(addDiscoveredFields(added, discovery, 'source', ['warehouseCode'])).toBe(added)
    expect(original).toEqual(snapshot)
  })
  it('recognizes existing indexed, quoted and container mappings without duplicates', () => {
    const rows = [{ ...newMapping(), source: 'items[0].id' }, { ...newMapping(), source: '["name"]' }]
    const discovery = discoverFields('{"items":[{"id":1},{"id":2}],"name":"A"}', 'JSON')
    expect(unmappedFields(rows, discovery, 'source')).toEqual([])
    expect(fieldPresence('items', discovery)).toBe('present')
  })
  it('retains removed and renamed mappings, and clears warnings when their paths return', () => {
    const original = sampleWorkspace()
    const snapshot = structuredClone(original.mappings)
    const changed = discoverFields('{"orderId":"12345","clientId":"C100","amount":750}', 'JSON')
    expect(fieldPresence(original.mappings[1].source, changed)).toBe('missing')
    expect(unmappedFields(original.mappings, changed, 'source').map(field => field.path)).toEqual(['clientId'])
    expect(original.mappings).toEqual(snapshot)
    expect(fieldPresence('customerId', discoverFields(original.source.content, 'JSON'))).toBe('present')
  })
  it('restores added mappings and recomputes discovery after an Excel round trip', async () => {
    const original = blankWorkspace()
    original.source.content = '{"ürün":{"kod":"Ü1"},"items":[{"id":1}]}'
    const discovery = discoverFields(original.source.content, 'JSON')
    original.mappings = addDiscoveredFields([], discovery, 'source', discovery.fields.map(field => field.path))
    original.mappings[0].description = 'Manuel açıklama korunacak.'
    const restored = await importWorkbook(await exportWorkbook(original))
    expect(restored.source.content).toBe(original.source.content)
    expect(restored.mappings.map(({ id: _id, ...row }) => row)).toEqual(original.mappings.map(({ id: _id, ...row }) => row))
    expect(unmappedFields(restored.mappings, discoverFields(restored.source.content, restored.source.format), 'source')).toEqual([])
  })
  it('enforces the mapping row limit without truncating or changing rows', () => {
    const rows = Array.from({ length: 10_000 }, newMapping)
    expect(() => addDiscoveredFields(rows, discoverFields('{"id":1}', 'JSON'), 'source', ['id'])).toThrow('10,000')
    expect(rows).toHaveLength(10_000)
  })
})

describe('Bounded discovery and path parsing', () => {
  it('reports a partial scan and suppresses missing warnings at complexity limits', () => {
    const content = JSON.stringify(Object.fromEntries(Array.from({ length: DISCOVERY_LIMITS.fields + 1 }, (_, i) => [`f${i}`, i])))
    const result = discoverFields(content, 'JSON')
    expect(result.state).toBe('limited')
    expect(result.fields).toHaveLength(DISCOVERY_LIMITS.fields)
    expect(fieldPresence('notScanned', result)).toBe('unknown')
    expect(fieldPresence('f0', result)).toBe('present')
  })
  it('bounds deeply nested JSON and XML', () => {
    const json = '{"a":'.repeat(140) + '1' + '}'.repeat(140)
    const xml = '<a>'.repeat(140) + '1' + '</a>'.repeat(140)
    expect(discoverFields(json, 'JSON').state).toBe('limited')
    expect(discoverFields(xml, 'XML').state).toBe('limited')
  })
  it('bounds long paths and large inputs', () => {
    expect(discoverFields(JSON.stringify({ ['x'.repeat(2050)]: 1 }), 'JSON').state).toBe('limited')
    expect(discoverFields(' '.repeat(DISCOVERY_LIMITS.characters) + '{}', 'JSON').state).toBe('limited')
  })
  it('parses indexed/quoted paths without modifying bracket-looking property names', () => {
    expect(canonicalPath('$.items[5][0].id', 'JSON')).toBe('items[][].id')
    expect(canonicalPath('["items"]["x[0]"]', 'JSON')).toBe('items["x[0]"]')
    expect(canonicalPath('Order.Items[0].Item[1].@id', 'XML')).toBe('Order.Items.Item.@id')
    expect(canonicalPath('items[bad].id', 'JSON')).toBe(null)
    expect(canonicalPath('items.', 'JSON')).toBe(null)
    expect(canonicalPath('', 'JSON')).toBe(null)
  })
})
