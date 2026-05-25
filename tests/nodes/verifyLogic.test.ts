import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBaseState } from '../_fixtures'

const mockTabManager = { sendToTab: vi.fn() }
beforeEach(() => vi.resetAllMocks())

describe('verifyLogicNode', () => {
  it('parses structured JSON slice and stamps verifiedAt', async () => {
    mockTabManager.sendToTab.mockResolvedValue(`好的，整理如下：
{
  "featureName": "點工項目管理",
  "trigger": "總部經理進入點工頁面",
  "mainFlow": ["經理填寫工種與單價 → 系統校驗"],
  "decisionPoints": [{ "condition": "單價>0", "branches": [{ "case": "true", "result": "寫入" }, { "case": "false", "result": "阻擋" }] }],
  "exceptionFlow": [{ "name": "重複名稱", "trigger": "工種已存在", "handling": "阻擋並提示" }],
  "endStates": ["成功寫入", "校驗失敗"]
}`)
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const state = makeBaseState({ currentFeatureName: '點工項目管理', conversationHistory: [
      { role: 'bot', content: '單價規則?', timestamp: 1 },
      { role: 'user', content: '單價必須大於0', timestamp: 2 },
    ]})
    const result = await verifyLogicNode(state, mockTabManager as any)
    expect(result).not.toBeNull()
    expect(result!.featureName).toBe('點工項目管理')
    expect(result!.decisionPoints).toHaveLength(1)
    expect(typeof result!.verifiedAt).toBe('number')
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('點工項目管理'))
  })

  it('returns null when no JSON present', async () => {
    mockTabManager.sendToTab.mockResolvedValue('抱歉我無法處理')
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const result = await verifyLogicNode(makeBaseState({}), mockTabManager as any)
    expect(result).toBeNull()
  })

  it('returns null when JSON is malformed', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{ "featureName": "x", "trigger": ')
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const result = await verifyLogicNode(makeBaseState({}), mockTabManager as any)
    expect(result).toBeNull()
  })
})
