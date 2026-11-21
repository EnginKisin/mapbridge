import type { PayloadFormat } from '../../models/workspace'

export type FieldKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' | 'element' | 'attribute'
export interface DiscoveredField { path: string; kind: FieldKind }
export interface FieldDiscovery {
  state: 'pending' | 'ready' | 'empty' | 'invalid' | 'unsupported' | 'limited'
  format: PayloadFormat
  fields: DiscoveredField[]
  knownPaths: string[]
  unknownDescendants: string[]
  message: string
}
export const emptyDiscovery = (format: PayloadFormat, state: FieldDiscovery['state'], message: string): FieldDiscovery => ({ state, format, fields: [], knownPaths: [], unknownDescendants: [], message })
