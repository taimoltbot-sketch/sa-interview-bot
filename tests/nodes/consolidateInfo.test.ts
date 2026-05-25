import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBaseState } from '../_fixtures'

const mockTabManager = { sendToTab: vi.fn() }
beforeEach(() => vi.resetAllMocks())

describe('consolidateInfoNode', () => {
  it('includes verified_logics in the payload sent to understanding tab', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{"systemName":"X","systemOverview":"y"}')
    const { consolidateInfoNode } = await import('../../src/service-worker/nodes/consolidateInfo')
    const state = makeBaseState({
      verified_logics: [{
        featureName: '點工項目管理', trigger: 't', mainFlow: ['a'],
        decisionPoints: [], exceptionFlow: [], endStates: ['s'], verifiedAt: 1,
      }],
    })
    await consolidateInfoNode(state, mockTabManager as any)
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('點工項目管理'))
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('verifiedLogics'))
  })

  it('extracts systemName from response into state', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{"systemName":"ThmLineBot","systemOverview":"y"}')
    const { consolidateInfoNode } = await import('../../src/service-worker/nodes/consolidateInfo')
    const result = await consolidateInfoNode(makeBaseState({}), mockTabManager as any)
    expect(result.systemName).toBe('ThmLineBot')
  })
})
