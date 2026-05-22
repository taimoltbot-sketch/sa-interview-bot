import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GraphState } from '../../src/types/index'

const mockTabManager = {
  sendToTab: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

const baseState: GraphState = {
  phase: 'upload',
  systemName: '',
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
  consolidatedJson: '',
  generatedDocument: '',
  generatedMermaid: '',
  conversationHistory: [],
  pendingQuestion: '',
  revisionTarget: '',
}

describe('analyzeFilesNode', () => {
  it('calls decision tab with file content and parses JSON response', async () => {
    mockTabManager.sendToTab.mockResolvedValue(
      '{"modules":["專案管理"],"fields":["專案編號"],"actions":["新增"],"systemGuess":"工程管理系統"}'
    )
    const { analyzeFilesNode } = await import('../../src/service-worker/nodes/analyzeFiles')
    const state = { ...baseState, uploadedFiles: [{ type: 'image' as const, name: 'test.png', content: 'base64abc', mimeType: 'image/png' }] }
    const result = await analyzeFilesNode(state, mockTabManager as any)
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('decision', expect.stringContaining('base64abc'))
    expect(result.analyzedData).toEqual({ modules: ['專案管理'], fields: ['專案編號'], actions: ['新增'], systemGuess: '工程管理系統' })
  })

  it('skips analysis when no files uploaded', async () => {
    const { analyzeFilesNode } = await import('../../src/service-worker/nodes/analyzeFiles')
    const result = await analyzeFilesNode(baseState, mockTabManager as any)
    expect(mockTabManager.sendToTab).not.toHaveBeenCalled()
    expect(result.analyzedData).toEqual({})
  })
})
