import type { GraphState } from '../../types/index'
import { GENERATE_MERMAID_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  const startIdx = text.indexOf(start)
  const endIdx   = text.lastIndexOf(end)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return text.trim()
  return text.slice(startIdx + start.length, endIdx).trim()
}

export async function generateMermaidNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const raw = await tabManager.sendToTab('output', GENERATE_MERMAID_PROMPT(state.generatedDocument))
  const mermaid = extractBetweenMarkers(raw, '===MMD_START===', '===MMD_END===')
  return { generatedMermaid: mermaid }
}
