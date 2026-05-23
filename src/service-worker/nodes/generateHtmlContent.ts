import type { GraphState } from '../../types/index'
import { GENERATE_HTML_REPORT_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  let result = text
  const startIdx = result.indexOf(start)
  if (startIdx !== -1) result = result.slice(startIdx + start.length)
  const endIdx = result.lastIndexOf(end)
  if (endIdx !== -1) result = result.slice(0, endIdx)
  return result.replace(/===HTML_(START|END)===\s*/g, '').trim()
}

export async function generateHtmlContentNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  notifyStatus('正在排版 HTML 報告...')
  const raw = await tabManager.sendToTab('output', GENERATE_HTML_REPORT_PROMPT(state.generatedDocument))
  const html = extractBetweenMarkers(raw, '===HTML_START===', '===HTML_END===')
  if (!html || html.length < 50) {
    console.warn('[generateHtmlContent] empty or too-short html. raw length:', raw?.length, 'snippet:', raw?.slice(0, 200))
  }
  return { generatedHtmlContent: html }
}
