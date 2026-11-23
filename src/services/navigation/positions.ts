export function sourceLineStarts(content: string): number[] {
  const starts = [0]
  for (let offset = 0; offset < content.length; offset++) {
    const code = content.charCodeAt(offset)
    if (code === 13) {
      if (content.charCodeAt(offset + 1) === 10) offset++
      starts.push(offset + 1)
    } else if (code === 10) starts.push(offset + 1)
  }
  return starts
}

export function sourcePositionAt(offset: number, starts: number[]) {
  let low = 0, high = starts.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (starts[middle] <= offset) low = middle + 1
    else high = middle - 1
  }
  const line = Math.max(0, high)
  return { lineNumber: line + 1, column: offset - starts[line] + 1 }
}

export function sourceOffsetAt(line: number, column: number, starts: number[]) {
  return (starts[Math.max(0, Math.min(line - 1, starts.length - 1))] || 0) + column - 1
}
