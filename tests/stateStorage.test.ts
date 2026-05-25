import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBaseState } from './_fixtures'

vi.resetModules()

const mockState = makeBaseState({ phase: 'overview', systemName: 'TestSystem' })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('saveState', () => {
  it('saves state to chrome.storage.session', async () => {
    const setMock = vi.mocked(chrome.storage.session.set)
    setMock.mockResolvedValue(undefined as any)
    const { saveState } = await import('../src/service-worker/stateStorage')
    await saveState(mockState)
    expect(setMock).toHaveBeenCalledWith({ graphState: mockState })
  })
})

describe('loadState', () => {
  it('returns state when saved', async () => {
    const getMock = vi.mocked(chrome.storage.session.get)
    getMock.mockResolvedValue({ graphState: mockState } as any)
    const { loadState } = await import('../src/service-worker/stateStorage')
    const result = await loadState()
    expect(result?.systemName).toBe('TestSystem')
  })

  it('returns null when no state saved', async () => {
    const getMock = vi.mocked(chrome.storage.session.get)
    getMock.mockResolvedValue({} as any)
    const { loadState } = await import('../src/service-worker/stateStorage')
    const result = await loadState()
    expect(result).toBeNull()
  })
})

describe('createInitialState', () => {
  it('returns state with phase = upload', async () => {
    const { createInitialState } = await import('../src/service-worker/stateStorage')
    const state = createInitialState()
    expect(state.phase).toBe('upload')
    expect(state.uploadedFiles).toEqual([])
    expect(state.features).toEqual([])
  })
})
