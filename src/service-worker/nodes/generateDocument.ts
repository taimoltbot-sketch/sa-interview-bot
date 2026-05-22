import type { GraphState } from '../../types/index'
import { GENERATE_DOCUMENT_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function generateDocumentNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const document = await tabManager.sendToTab('output', GENERATE_DOCUMENT_PROMPT(state.consolidatedJson))
  return { generatedDocument: document }
}
