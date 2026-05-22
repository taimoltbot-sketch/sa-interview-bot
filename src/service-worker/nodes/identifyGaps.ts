import type { GraphState } from '../../types/index'
import { IDENTIFY_GAPS_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function identifyGapsNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const analyzedStr = JSON.stringify(state.analyzedData, null, 2)
  const raw = await tabManager.sendToTab('decision', IDENTIFY_GAPS_PROMPT(analyzedStr))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { missingInfo: [] }
  const parsed = JSON.parse(jsonMatch[0]) as { missing: string[] }
  return { missingInfo: parsed.missing ?? [] }
}
