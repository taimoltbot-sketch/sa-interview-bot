import type { GraphState } from '../../types/index'
import { GENERATE_DOCUMENT_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  let result = text
  const startIdx = result.indexOf(start)
  if (startIdx !== -1) result = result.slice(startIdx + start.length)
  const endIdx = result.lastIndexOf(end)
  if (endIdx !== -1) result = result.slice(0, endIdx)
  return result.replace(/===(MMD|DOC)_(START|END)===\s*/g, '').trim()
}

export async function generateDocumentNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const raw = await tabManager.sendToTab('output', GENERATE_DOCUMENT_PROMPT(state.consolidatedJson))
  const document = extractBetweenMarkers(raw, '===DOC_START===', '===DOC_END===')
  return { generatedDocument: document }
}
