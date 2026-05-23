import type { GraphState } from '../../types/index'
import { PREVIEW_FLOWCHART_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

// Returns the mermaid code (no fences) for inline chat confirmation
export async function generatePreviewFlowchart(
  state: GraphState,
  tabManager: TabManager
): Promise<string> {
  const stateStr = JSON.stringify({
    systemName: state.systemName,
    systemOverview: state.systemOverview,
    userRoles: state.userRoles,
    featureList: state.featureList,
    features: state.features,
    integrations: state.integrations,
    businessRules: state.businessRules,
    analyzedData: state.analyzedData,
  }, null, 2)

  // Conversation is the real source of truth — structured fields often empty
  const conversation = state.conversationHistory
    .map((m, i) => `[${i + 1}] ${m.role === 'bot' ? 'AI' : 'SA'}: ${m.content}`)
    .join('\n\n')

  const raw = await tabManager.sendToTab('output', PREVIEW_FLOWCHART_PROMPT(stateStr, conversation))
  return extractBetweenMarkers(raw, '===MMD_START===', '===MMD_END===')
}

function extractBetweenMarkers(text: string, start: string, end: string): string {
  let result = text
  const startIdx = result.indexOf(start)
  if (startIdx !== -1) result = result.slice(startIdx + start.length)
  const endIdx = result.lastIndexOf(end)
  if (endIdx !== -1) result = result.slice(0, endIdx)
  return result.replace(/===(MMD|DOC)_(START|END)===\s*/g, '').trim()
}
