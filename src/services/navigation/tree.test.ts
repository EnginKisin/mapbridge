import { describe, expect, it } from 'vitest'
import { indexFields } from './fields'
import { sourceLineStarts, sourceOffsetAt, sourcePositionAt } from './positions'
import { buildPayloadTree, treeNodePreview, treeSearch, visibleTreeNodes } from './tree'

describe('Payload tree structure', () => {
  it('preserves duplicate JSON keys, concrete array items and exact large-number previews', () => {
    const content = '{"id":9007199254740993,"id":-0,"a.b":[{"id":1}],"empty":{}}'
    const data = buildPayloadTree(indexFields(content, 'JSON'))
    expect(data.nodes[0].children).toHaveLength(4)
    const ids = data.nodes.filter(node => node.location.label === 'id')
    expect(ids.slice(0, 2).map(node => node.occurrence)).toEqual([1, 2])
    expect(treeNodePreview(ids[0], content)).toBe('9007199254740993')
    expect(treeNodePreview(ids[1], content)).toBe('-0')
    expect(data.nodes.find(node => node.location.path === '["a.b"][0]')?.location).toMatchObject({ label: '[0]', kind: 'object' })
    expect(data.nodes.find(node => node.location.path === 'empty')?.children).toEqual([])
  })
  it('keeps XML siblings, attribute values and CDATA as text with exact source ranges', () => {
    const content = '<s:Order xmlns:s="urn:test"><Item code="A"><Name><![CDATA[<hello>]]></Name></Item><Item code="B"/></s:Order>'
    const data = buildPayloadTree(indexFields(content, 'XML'))
    expect(data.nodes.filter(node => node.location.label === 'Item').map(node => node.occurrence)).toEqual([1, 2])
    const attributes = data.nodes.filter(node => node.location.kind === 'attribute')
    expect(attributes.map(node => treeNodePreview(node, content))).toEqual(['A', 'B'])
    expect(treeNodePreview(data.nodes.find(node => node.location.label === 'Name')!, content)).toBe('<hello>')
    const second = attributes[1].location
    expect(content.slice(second.start, second.end)).toBe('code="B"')
  })
  it('filters fields with ancestors and keeps expand/collapse independent from search', () => {
    const data = buildPayloadTree(indexFields('{"items":[{"sku":"A"},{"sku":"B"}],"other":true}', 'JSON'))
    const expanded = new Set(data.roots)
    expect(visibleTreeNodes(data, expanded, null).map(entry => data.nodes[entry.id].location.label)).toEqual(['$', 'items', 'other'])
    const search = treeSearch(data, 'sku')
    expect(search.matches.size).toBe(2)
    const visible = visibleTreeNodes(data, expanded, search.included)
    expect(visible.map(entry => data.nodes[entry.id].location.label)).toEqual(['$', 'items', '[0]', 'sku', '[1]', 'sku'])
    expect(visible.find(entry => data.nodes[entry.id].location.label === '[1]')).toMatchObject({ position: 2, siblings: 2 })
    expect(visibleTreeNodes(data, expanded, null)).toHaveLength(3)
    expect(visibleTreeNodes(data, expanded, treeSearch(data, 'absent').included)).toEqual([])
  })
  it('handles primitive roots, missing indexes and limited scans without partial trees', () => {
    const data = buildPayloadTree(indexFields('null', 'JSON'))
    expect(data.nodes[0].location).toMatchObject({ label: '$', kind: 'null' })
    expect(treeNodePreview(data.nodes[0], 'null')).toBe('null')
    expect(buildPayloadTree(undefined)).toEqual({ nodes: [], roots: [] })
    expect(buildPayloadTree({ state: 'limited', locations: [] })).toEqual({ nodes: [], roots: [] })
  })
  it('bounds previews without replacing actual JSON content', () => {
    const content = JSON.stringify({ text: '😀'.repeat(200) })
    const data = buildPayloadTree(indexFields(content, 'JSON'))
    const value = data.nodes[1]
    expect(treeNodePreview(value, content).length).toBeLessThanOrEqual(161)
    expect(treeNodePreview(value, content).endsWith('…')).toBe(true)
    expect(content.slice(value.location.start, value.location.end)).toBe(content.slice(1, -1))
  })
})

describe('Source positions across editor line endings', () => {
  it.each(['\n', '\r\n', '\r'])('maps exact UTF-16 field offsets with %j endings', ending => {
    const text = ['<root>', '<name>😀</name>', '<item code="B"/>', '</root>'].join(ending)
    const starts = sourceLineStarts(text)
    const offset = text.indexOf('code')
    expect(sourcePositionAt(offset, starts)).toEqual({ lineNumber: 3, column: 7 })
    expect(sourceOffsetAt(3, 7, starts)).toBe(offset)
  })
  it('handles mixed line endings and a final empty line', () => {
    const text = 'a\r\nb\rc\n'
    expect(sourceLineStarts(text)).toEqual([0, 3, 5, 7])
    expect(sourcePositionAt(text.length, sourceLineStarts(text))).toEqual({ lineNumber: 4, column: 1 })
  })
})
