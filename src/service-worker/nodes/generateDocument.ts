import type { GraphState } from '../../types/index'
import { GENERATE_DOCUMENT_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  const startIdx = text.indexOf(start)
  const endIdx   = text.lastIndexOf(end)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return text.trim()
  return text.slice(startIdx + start.length, endIdx).trim()
}

export async function generateDocumentNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const raw = await tabManager.sendToTab('output', GENERATE_DOCUMENT_PROMPT(state.consolidatedJson))
  const document = extractBetweenMarkers(raw, '===DOC_START===', '===DOC_END===')
  return { generatedDocument: document }
}
