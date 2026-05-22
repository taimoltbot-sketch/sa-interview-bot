import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GraphState } from '../../src/types/index'

const mockTabManager = { sendToTab: vi.fn() }

beforeEach(() => vi.resetAllMocks())

const baseState: GraphState = {
  phase: 'output',
  systemName: 'TestSystem',
  uploadedFiles: [],
  analyzedData: {},
  missingInfo: [],
  systemOverview: '',
  userRoles: [],
  featureList: [],
  currentFeatureIndex: 0,
  features: [],
  integrations: '',
  businessRules: '',
  consolidatedJson: '{"systemName":"TestSystem","features":[]}',
  generatedDocument: '',
  generatedMermaid: '',
  conversationHistory: [],
  pendingQuestion: '',
  revisionTarget: '',
}

describe('generateDocumentNode', () => {
  it('calls output tab with consolidatedJson and returns document', async () => {
    mockTabManager.sendToTab.mockResolvedValue('# 系統概述\n這是 TestSystem\n## 使用者角色\n- 管理員')
    const { generateDocumentNode } = await import('../../src/service-worker/nodes/generateDocument')
    const result = await generateDocumentNode(baseState, mockTabManager as any)
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('output', expect.stringContaining('TestSystem'))
    expect(result.generatedDocument).toContain('系統概述')
  })
})

describe('generateMermaidNode', () => {
  it('calls output tab with document and returns mermaid code', async () => {
    mockTabManager.sendToTab.mockResolvedValue('## 主業務流程\n```mermaid\nflowchart TD\nA --> B\n```')
    const { generateMermaidNode } = await import('../../src/service-worker/nodes/generateMermaid')
    const state = { ...baseState, generatedDocument: '# 系統概述\n...' }
    const result = await generateMermaidNode(state, mockTabManager as any)
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('output', expect.stringContaining('系統概述'))
    expect(result.generatedMermaid).toContain('mermaid')
  })
})
