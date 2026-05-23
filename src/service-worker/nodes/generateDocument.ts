import type { GraphState } from '../../types/index'
import { GENERATE_DOCUMENT_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

function extractBetweenMarkers(text: string, start: string, end: string): string {
  let result = text
  const startIdx = result.indexOf(start)
  if (startIdx !== -1) result = result.slice(startIdx + start.length)
  const endIdx = result.lastIndexOf(end)
  if (endIdx !== -1) result = result.slice(0, endIdx)
  return result.replace(/===(MMD|DOC)_(START|END)===\s*/g, '').trim()
}

// Gemini sometimes ignores the "list items on one line" rule and emits:
//   -
//
//   實際內容
// which marked.js then renders as <p>-</p><p>實際內容</p>, breaking layouts.
// Collapse these orphan markers back into proper list items so all downstream
// consumers (HTML generator, mermaid generator, .md download) see clean markdown.
function fixOrphanListMarkers(md: string): string {
  return md
    .replace(/^[ \t]*-[ \t]*\n+/gm, '- ')              // - on its own line
    .replace(/^[ \t]*\*[ \t]*\n+/gm, '* ')             // * on its own line
    .replace(/^[ \t]*(\d+)\.[ \t]*\n+/gm, '$1. ')      // 1. on its own line
}

export async function generateDocumentNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  notifyStatus('正在撰寫業務流程文件...')
  const raw = await tabManager.sendToTab('output', GENERATE_DOCUMENT_PROMPT(state.consolidatedJson))
  const document = fixOrphanListMarkers(extractBetweenMarkers(raw, '===DOC_START===', '===DOC_END==='))
  return { generatedDocument: document }
}
