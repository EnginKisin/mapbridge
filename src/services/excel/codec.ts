export const CELL_LIMIT = 30_000
function encodedCharacter(character: string): string {
  if (character.length === 2) return Array.from({ length: 2 }, (_, i) => `~${character.charCodeAt(i).toString(16).padStart(4, '0')}`).join('')
  const code = character.charCodeAt(0)
  return character.length === 1 && (character === '~' || code === 13 || code === 127 || code < 32 && code !== 9 && code !== 10 || code === 0xfffe || code === 0xffff || code >= 0xd800 && code <= 0xdfff)
    ? `~${code.toString(16).padStart(4, '0')}` : character
}
export function encodeChunks(value: string): string[] {
  const chunks: string[] = []
  let current = ''
  let offset = 0
  for (const character of value) {

    const encoded = character === '_' && /^_x[0-9a-f]{4}_/i.test(value.slice(offset, offset + 7)) ? '~005f' : encodedCharacter(character)
    offset += character.length
    if (current.length + encoded.length > CELL_LIMIT) { chunks.push(current); current = '' }
    current += encoded
  }
  chunks.push(current)
  return chunks
}
export function decodeText(value: string): string {
  if (/~(?![0-9a-f]{4})/.test(value)) throw new Error('Invalid MapBridge text escape. Preserve encoded text when editing this workbook.')
  return value.replace(/~([0-9a-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}
export interface TextLine { text: string; ending: 'LF' | 'CRLF' | 'CR' | 'NONE' }
export function splitLines(value: string): TextLine[] {
  const result: TextLine[] = []
  const matcher = /([^\r\n]*)(\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(value))) {
    result.push({ text: match[1], ending: match[2] === '\r\n' ? 'CRLF' : match[2] === '\r' ? 'CR' : match[2] === '\n' ? 'LF' : 'NONE' })
    if (!match[2]) break
  }
  return result
}
export const endings: Record<TextLine['ending'], string> = { LF: '\n', CRLF: '\r\n', CR: '\r', NONE: '' }
