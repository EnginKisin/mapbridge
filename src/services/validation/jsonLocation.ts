class JsonLocationError extends Error {
  constructor(readonly offset: number) { super('Invalid JSON') }
}

export function findJsonErrorOffset(content: string): number {
  type Frame = { kind: 'root' | 'object' | 'array'; state: 'value' | 'valueOrEnd' | 'key' | 'keyOrEnd' | 'colon' | 'commaOrEnd' | 'end' }
  const stack: Frame[] = [{ kind: 'root', state: 'value' }]
  let offset = 0
  const fail = (): never => { throw new JsonLocationError(offset) }
  const string = () => {
    offset++
    while (offset < content.length) {
      const char = content[offset]
      if (char === '"') { offset++; return }
      if (char.charCodeAt(0) < 32) fail()
      if (char === '\\') {
        offset++
        if (content[offset] === 'u') {
          for (let digit = 0; digit < 4; digit++) { offset++; if (!/[0-9a-f]/i.test(content[offset] || '')) fail() }
        } else if (!content[offset] || !'"\\/bfnrt'.includes(content[offset])) fail()
      }
      offset++
    }
    fail()
  }
  try {
    while (stack.length) {
      while (/[ \t\r\n]/.test(content[offset] || '') && offset < content.length) offset++
      const frame = stack[stack.length - 1]
      const char = content[offset]
      if (frame.state === 'end') { if (offset !== content.length) fail(); return offset }
      if (!char) fail()
      if (frame.state === 'key' || frame.state === 'keyOrEnd') {
        if (char === '}' && frame.state === 'keyOrEnd') { offset++; stack.pop(); continue }
        if (char !== '"') fail()
        string(); frame.state = 'colon'; continue
      }
      if (frame.state === 'colon') {
        if (char !== ':') fail()
        offset++; frame.state = 'value'; continue
      }
      if (frame.state === 'commaOrEnd') {
        if (char === (frame.kind === 'object' ? '}' : ']')) { offset++; stack.pop(); continue }
        if (char !== ',') fail()
        offset++; frame.state = frame.kind === 'object' ? 'key' : 'value'; continue
      }
      if (frame.state === 'valueOrEnd' && char === ']') { offset++; stack.pop(); continue }
      frame.state = frame.kind === 'root' ? 'end' : 'commaOrEnd'
      if (char === '{' || char === '[') {
        offset++; stack.push({ kind: char === '{' ? 'object' : 'array', state: char === '{' ? 'keyOrEnd' : 'valueOrEnd' }); continue
      }
      if (char === '"') { string(); continue }
      if (char === '-' || /\d/.test(char)) {
        const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(content.slice(offset))
        if (!number) fail()
        offset += number![0].length; continue
      }
      const word = char === 't' ? 'true' : char === 'f' ? 'false' : char === 'n' ? 'null' : undefined
      if (!word) fail()
      for (const letter of word!) { if (content[offset] !== letter) fail(); offset++ }
    }
  } catch (error) {
    if (error instanceof JsonLocationError) return error.offset
    throw error
  }
  return offset
}
