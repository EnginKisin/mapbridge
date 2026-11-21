import { describe, expect, it } from 'vitest'
import { formatPayload, formatXml } from './format'
import { validatePayload } from '../validation/payload'

describe('Payload validation', () => {
  it('accepts nested JSON and reports malformed JSON without crashing', () => {
    expect(validatePayload('{"items":[{"id":"İğ😀"}]}', 'JSON').state).toBe('valid')
    expect(validatePayload('{"items":}', 'JSON').state).toBe('invalid')
    expect(() => formatPayload('{', 'JSON')).toThrow()
    expect(validatePayload('', 'JSON').state).toBe('empty')
  })
  it('validates XML and IDoc attributes, namespaces and nesting', () => {
    expect(validatePayload('<ORDERS><IDOC BEGIN="1"><E1EDP01 SEGMENT="1"><MATNR>42</MATNR></E1EDP01></IDOC></ORDERS>', 'IDoc XML').state).toBe('valid')
    expect(validatePayload('<a xmlns:x="urn:test"><x:b value="İstanbul"/></a>', 'XML').state).toBe('valid')
    expect(validatePayload('<a><b></a>', 'XML').state).toBe('invalid')
  })
  it('rejects DTD and entity declarations without fetching resources', () => {
    expect(validatePayload('<!DOCTYPE a SYSTEM "https://example.com/xxe"><a/>', 'XML').state).toBe('invalid')
  })
  it('never parses, transforms or executes SQL or plain text', () => {
    for (const format of ['SQL', 'Plain Text'] as const) {
      const text = 'DROP TABLE items; <invalid>{'
      expect(validatePayload(text, format).state).toBe('text')
      expect(formatPayload(text, format)).toBe(text)
    }
  })
})
describe('Safe formatting', () => {
  it('pretty-prints JSON', () => expect(formatPayload('{"a":[1,{"b":2}]}', 'JSON')).toBe('{\n  "a": [\n    1,\n    {\n      "b": 2\n    }\n  ]\n}'))
  it('preserves large numbers, duplicate keys and original string escapes', () => {
    const json = '{"id":9007199254740993,"id":-0,"exponent":1e+30,"text":"\\u0130\\n ","empty":[]}'
    const formatted = formatPayload(json, 'JSON')
    expect(formatted).toContain('9007199254740993')
    expect(formatted).toContain('"id": -0')
    expect(formatted).toContain('1e+30')
    expect(formatted).toContain('"\\u0130\\n "')
    expect(formatted.match(/"id"/g)).toHaveLength(2)
  })
  it('pretty-prints compact element-only XML while preserving original tokens', () => {
    expect(formatXml('<?xml version="1.0"?><root><a x=\'&amp;\'>Ö</a><b/><c></c></root>')).toBe('<?xml version="1.0"?>\n<root>\n  <a x=\'&amp;\'>Ö</a>\n  <b/>\n  <c></c>\n</root>')
  })
  it.each([
    '<p>Hello <b>world</b> !</p>',
    '<root> <a/> </root>',
    '<root xml:space="preserve"><a/><b/></root>',
    '<root><text><![CDATA[ <tag>\r\n ]]></text></root>',
    '<root>\r\n  <a> text </a>\r\n</root>\r\n',
    '<root><a> \t </a><b/></root>',
  ])('preserves whitespace/mixed content/CDATA exactly: %s', xml => expect(formatXml(xml)).toBe(xml))
  it('preserves quoted > characters and literal entities', () => {
    expect(formatXml('<a><b value="a>b">&lt;x&gt;</b></a>')).toBe('<a>\n  <b value="a>b">&lt;x&gt;</b>\n</a>')
  })
})
