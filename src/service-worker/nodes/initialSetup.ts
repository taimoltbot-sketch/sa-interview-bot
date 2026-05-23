import type { GraphState } from '../../types/index'
import { INITIAL_SETUP_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

// Find the first balanced {...} block — more robust than a greedy regex when
// surrounding text contains stray braces.
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function parseJson(raw: string): Record<string, unknown> {
  const json = extractJsonObject(raw)
  if (!json) {
    const snippet = raw.slice(0, 300).replace(/\s+/g, ' ')
    console.error('[SA Bot] No JSON found. Raw response (first 500 chars):', raw.slice(0, 500))
    throw new Error(`No JSON in initial setup response. Got: ${snippet || '(empty)'}`)
  }
  try {
    return JSON.parse(json)
  } catch (err) {
    console.error('[SA Bot] JSON.parse failed. Extracted:', json.slice(0, 500))
    throw new Error(`Invalid JSON in initial setup: ${(err as Error).message}`)
  }
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
