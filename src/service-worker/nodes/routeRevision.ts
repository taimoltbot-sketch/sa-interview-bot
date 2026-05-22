import type { GraphState } from '../../types/index'
import { ROUTE_REVISION_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function routeRevisionNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const stateStr = JSON.stringify({ phase: state.phase, featureCount: state.features.length }, null, 2)
  const raw = await tabManager.sendToTab('decision', ROUTE_REVISION_PROMPT(state.revisionTarget, stateStr))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { phase: 'output' }
  const parsed = JSON.parse(jsonMatch[0]) as { targetPhase: string }
  return { phase: parsed.targetPhase as GraphState['phase'] }
}
