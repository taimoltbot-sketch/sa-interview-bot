import type { GraphState } from '../../types/index'
import { GENERATE_MERMAID_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  let result = text
  const startIdx = result.indexOf(start)
  if (startIdx !== -1) result = result.slice(startIdx + start.length)
  const endIdx = result.lastIndexOf(end)
  if (endIdx !== -1) result = result.slice(0, endIdx)
  // Strip any stray markers that Gemini may have left inside the last code block
  return result.replace(/===(MMD|DOC)_(START|END)===\s*/g, '').trim()
}

export async function generateMermaidNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  notifyStatus('正在繪製詳細流程圖與決策圖...')
  const raw = await tabManager.sendToTab('output', GENERATE_MERMAID_PROMPT(state.generatedDocument))
  const mermaid = extractBetweenMarkers(raw, '===MMD_START===', '===MMD_END===')
  if (!mermaid || !mermaid.includes('```mermaid')) {
    console.warn('[generateMermaid] empty or missing mermaid fences. raw length:', raw?.length, 'snippet:', raw?.slice(0, 200))
  }
  return { generatedMermaid: mermaid }
}
