import type { GraphState, UploadedFile } from '../../types/index'
import { ANALYZE_FILES_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

function parseJsonResponse(raw: string): Record<string, unknown> {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')
  return JSON.parse(jsonMatch[0])
}

function buildExcelSummary(files: UploadedFile[]): string {
  return files
    .filter(f => f.type === 'excel')
    .map(f => `[Excel：${f.name}]\n${f.content}`)
    .join('\n\n')
}

export async function analyzeFilesNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  if (state.uploadedFiles.length === 0) return { analyzedData: {} }

  const images = state.uploadedFiles
    .filter(f => f.type === 'image')
    .map(f => ({ base64: f.content, mimeType: f.mimeType, filename: f.name }))

  const excelText = buildExcelSummary(state.uploadedFiles)
  const prompt = ANALYZE_FILES_PROMPT(excelText || '（無 Excel，請從圖片中分析）')

  let raw: string
  if (images.length > 0) {
    // Send images via real clipboard paste so Gemini can visually analyze them
    raw = await tabManager.sendToTabWithImages('decision', prompt, images)
  } else {
    raw = await tabManager.sendToTab('decision', prompt)
  }

  return { analyzedData: parseJsonResponse(raw) }
}
