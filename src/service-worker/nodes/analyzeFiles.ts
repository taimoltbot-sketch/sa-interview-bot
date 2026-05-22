import type { GraphState } from '../../types/index'
import { ANALYZE_FILES_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function buildFileContent(state: GraphState): string {
  return state.uploadedFiles.map(f => {
    if (f.type === 'image') return `[圖片：${f.name}]\n${f.content}`
    return `[Excel：${f.name}]\n${f.content}`
  }).join('\n\n')
}

function parseJsonResponse(raw: string): Record<string, unknown> {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')
  return JSON.parse(jsonMatch[0])
}

export async function analyzeFilesNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  if (state.uploadedFiles.length === 0) return { analyzedData: {} }
  const fileContent = buildFileContent(state)
  const prompt = ANALYZE_FILES_PROMPT(fileContent)
  const raw = await tabManager.sendToTab('decision', prompt)
  return { analyzedData: parseJsonResponse(raw) }
}
