import type { PayloadFormat } from '../../models/workspace'
import { parseXml } from '../validation/payload'

export function formatXml(content: string): string {
  const document = parseXml(content)
  const elements = Array.from(document.getElementsByTagName('*'))
  if (elements.some(element => element.hasAttribute('xml:space'))) return content
  for (const element of elements) {
    const nodes = Array.from(element.childNodes)
    if (nodes.some(node => node.nodeType === 4)) return content
    if (nodes.some(node => node.nodeType === 1) && nodes.some(node => node.nodeType === 3)) return content
  }

  if (/\r|\n|>\s+</.test(content) || content !== content.trim()) return content
  const tokens = content.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g) || []
  let depth = 0
  const output: string[] = []
  tokens.forEach((token, index) => {
    const closing = token.startsWith('</')
    const special = token.startsWith('<?') || token.startsWith('<!')
    const opening = token.startsWith('<') && !closing && !special && !token.endsWith('/>')
    if (closing) depth--
    const previous = tokens[index - 1]
    const previousIsOpening = previous?.startsWith('<') && !/^<[/!?]/.test(previous) && !previous.endsWith('/>')
    const inlineClose = closing && previous && (!previous.startsWith('<') || previousIsOpening)
    const textNode = !token.startsWith('<')
    if (index && !textNode && !inlineClose) output.push('\n' + '  '.repeat(Math.max(0, depth)))
    output.push(token)
    if (opening) depth++
  })
  return output.join('')
}
export function formatPayload(content: string, format: PayloadFormat): string {
  if (!content.trim()) return content
  if (format === 'JSON') return formatJson(content)
  if (format === 'XML' || format === 'IDoc XML') return formatXml(content)
  return content
}

export function formatJson(content: string): string {
  JSON.parse(content)

  const tokens = content.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) || []
  const output: string[] = []
  let depth = 0
  const newline = () => output.push('\n' + '  '.repeat(depth))
  tokens.forEach((token, index) => {
    if (token === '{' || token === '[') {
      output.push(token); depth++
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') newline()
    } else if (token === '}' || token === ']') {
      depth--
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') newline()
      output.push(token)
    } else if (token === ',') { output.push(','); newline() }
    else if (token === ':') output.push(': ')
    else output.push(token)
  })
  return output.join('')
}
