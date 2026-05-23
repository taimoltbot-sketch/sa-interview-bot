import type { GraphState } from '../../types/index'
import { PREVIEW_FLOWCHART_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  const startIdx = text.indexOf(start)
  const endIdx   = text.lastIndexOf(end)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return text.trim()
  return text.slice(startIdx + start.length, endIdx).trim()
}

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
  }, null, 2)

  const raw = await tabManager.sendToTab('output', PREVIEW_FLOWCHART_PROMPT(stateStr))
  return extractBetweenMarkers(raw, '===MMD_START===', '===MMD_END===')
}
