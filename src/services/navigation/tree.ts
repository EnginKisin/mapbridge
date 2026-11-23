import type { FieldIndex, FieldLocation } from './fields'

export interface PayloadTreeNode { location: FieldLocation; children: number[]; depth: number; occurrence: number; occurrences: number }
export interface PayloadTreeData { nodes: PayloadTreeNode[]; roots: number[] }
export interface VisibleTreeNode { id: number; position: number; siblings: number }

export function buildPayloadTree(index: FieldIndex | undefined): PayloadTreeData {
  const nodes: PayloadTreeNode[] = [], roots: number[] = []
  if (index?.state !== 'ready') return { nodes, roots }
  const groups = new Map<string, number[]>()
  index.locations.forEach((location, id) => {
    const parent = location.parent === null ? undefined : nodes[location.parent]
    nodes.push({ location, children: [], depth: parent ? parent.depth + 1 : 0, occurrence: 1, occurrences: 1 })
    if (parent) parent.children.push(id); else roots.push(id)
    const key = JSON.stringify([location.parent, location.label])
    const group = groups.get(key)
    if (group) group.push(id); else groups.set(key, [id])
  })
  for (const ids of groups.values()) ids.forEach((id, position) => { nodes[id].occurrence = position + 1; nodes[id].occurrences = ids.length })
  return { nodes, roots }
}

export function treeSearch(data: PayloadTreeData, query: string) {
  const matches = new Set<number>(), included = new Set<number>()
  const term = query.trim().toLowerCase()
  if (!term) return { matches, included: null }
  data.nodes.forEach((node, id) => {
    if (!node.location.label.toLowerCase().includes(term) && !node.location.path.toLowerCase().includes(term)) return
    matches.add(id)
    let ancestor: number | null = id
    while (ancestor !== null && !included.has(ancestor)) { included.add(ancestor); ancestor = data.nodes[ancestor].location.parent }
  })
  return { matches, included }
}

export function visibleTreeNodes(data: PayloadTreeData, expanded: Set<number>, included: Set<number> | null): VisibleTreeNode[] {
  const visible: VisibleTreeNode[] = []
  const entries = (ids: number[]) => {
    const siblings = included ? ids.filter(id => included.has(id)) : ids
    return siblings.map((id, position) => ({ id, position: position + 1, siblings: siblings.length }))
  }
  const stack = entries(data.roots).reverse()
  while (stack.length) {
    const entry = stack.pop()!
    visible.push(entry)
    if (included || expanded.has(entry.id)) {
      const children = entries(data.nodes[entry.id].children)
      for (let index = children.length - 1; index >= 0; index--) stack.push(children[index])
    }
  }
  return visible
}

export function treeNodePreview(node: PayloadTreeNode, content: string): string {
  if (node.location.kind === 'array') return `${node.children.length} items`
  if (node.location.kind === 'object') return `${node.children.length} fields`
  const start = node.location.valueStart
  const value = start === undefined ? node.location.preview || '' : content.slice(start, Math.min(node.location.end, start + 161))
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 160 ? text.slice(0, /[\ud800-\udbff]/.test(text[159]) ? 159 : 160) + '…' : text
}
