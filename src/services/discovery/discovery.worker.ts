import { discoverFields } from './discover'
import type { PayloadFormat } from '../../models/workspace'

self.onmessage = (event: MessageEvent<{ content: string; format: PayloadFormat }>) => {
  self.postMessage(discoverFields(event.data.content, event.data.format))
}
