import type { GraphState } from '../../types/index'
import { INITIAL_SETUP_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function parseJson(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in initial setup response')
  return JSON.parse(match[0])
}

function buildExcelText(state: GraphState): string {
  return state.uploadedFiles
    .filter(f => f.type === 'excel')
    .map(f => `[Excel：${f.name}]\n${f.content}`)
    .join('\n\n')
}

// Single Gemini call replacing analyze_files + identify_gaps + decide_next_question
export async function initialSetupNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const images = state.uploadedFiles
    .filter(f => f.type === 'image')
    .map(f => ({ base64: f.content, mimeType: f.mimeType, filename: f.name }))

  const excelText = buildExcelText(state)
  const fileContent = excelText || null
  const prompt = INITIAL_SETUP_PROMPT(fileContent)

  const raw = images.length > 0
    ? await tabManager.sendToTabWithImages('decision', prompt, images)
    : await tabManager.sendToTab('decision', prompt)

  const parsed = parseJson(raw) as {
    analyzedData?: Record<string, unknown>
    missingInfo?: string[]
    nextPhase?: string
    firstQuestion?: string
    suggestions?: string[]
    multiSelect?: boolean
  }

  return {
    analyzedData:    parsed.analyzedData ?? {},
    missingInfo:     parsed.missingInfo  ?? [],
    phase:           (parsed.nextPhase   || 'overview') as GraphState['phase'],
    pendingQuestion: parsed.firstQuestion || '請問這個系統主要是用來做什麼的？',
    pendingSuggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    pendingMultiSelect: parsed.multiSelect === true,
  }
}
