import type { GraphState } from '../../types/index'
import { GENERATE_MERMAID_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function generateMermaidNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const mermaid = await tabManager.sendToTab('output', GENERATE_MERMAID_PROMPT(state.generatedDocument))
  return { generatedMermaid: mermaid }
}
