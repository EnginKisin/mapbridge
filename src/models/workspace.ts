export const formats = ['JSON', 'XML', 'IDoc XML', 'Plain Text', 'SQL'] as const
export type PayloadFormat = typeof formats[number]
export const rules = ['Direct', 'Rename', 'Constant', 'Lookup', 'Conditional', 'Transform', 'Custom'] as const
export type TransformationRule = typeof rules[number]
export type Side = 'source' | 'target'
export interface Payload { system: string; format: PayloadFormat; content: string }
export interface MappingRow {
  id: string
  source: string
  target: string
  rule: TransformationRule
  required: boolean
  defaultValue: string
  description: string
}
export interface Workspace {
  integrationName: string
  source: Payload
  target: Payload
  mappings: MappingRow[]
  notes: string
}
export function newMapping(): MappingRow {
  return { id: crypto.randomUUID(), source: '', target: '', rule: 'Direct', required: false, defaultValue: '', description: '' }
}
export function blankWorkspace(): Workspace {
  return { integrationName: '', source: { system: '', format: 'JSON', content: '' }, target: { system: '', format: 'XML', content: '' }, mappings: [], notes: '' }
}
export function sampleWorkspace(): Workspace {
  return {
    integrationName: '',
    source: { system: '', format: 'JSON', content: '{\n  "orderId": "12345",\n  "customerId": "C100",\n  "amount": 750\n}' },
    target: { system: '', format: 'XML', content: '<Order>\n  <OrderNumber>12345</OrderNumber>\n  <CustomerCode>C100</CustomerCode>\n  <Amount>750</Amount>\n</Order>' },
    mappings: [
      { ...newMapping(), source: 'orderId', target: 'Order.OrderNumber', rule: 'Rename', required: true, description: 'Unique order reference from the source system.' },
      { ...newMapping(), source: 'customerId', target: 'Order.CustomerCode', rule: 'Rename', required: true, description: 'CustomerCode is required in the target system.' },
      { ...newMapping(), source: 'amount', target: 'Order.Amount', rule: 'Transform', required: true, defaultValue: '0.00', description: 'Send the amount with two decimal places.' },
    ],
    notes: 'Order synchronization — analysis notes\n\n• CustomerCode is mandatory.\n• Send Amount with two decimal places.\n• Do not send null fields to the target.\n• Confirm the warehouse mapping with the integration team.',
  }
}
export function hasWork(workspace: Workspace): boolean {
  return Boolean(workspace.source.content || workspace.target.content || workspace.mappings.length || workspace.notes || workspace.integrationName || workspace.source.system || workspace.target.system || workspace.source.format !== 'JSON' || workspace.target.format !== 'XML')
}
