import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = ReturnType<typeof vi.fn<any>>

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TabManager', () => {
  it('creates three tabs on init', async () => {
    (vi.mocked(chrome.tabs.create) as AnyMock)
      .mockResolvedValueOnce({ id: 10 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 20 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 30 } as chrome.tabs.Tab)
    ;(vi.mocked(chrome.tabs.sendMessage) as AnyMock)
      .mockResolvedValue({ success: true, response: 'ok' })

    const { TabManager } = await import('../src/service-worker/tabManager')
    const manager = new TabManager()

    const initPromise = manager.init()
    await vi.runAllTimersAsync()
    await initPromise

    expect(chrome.tabs.create).toHaveBeenCalledTimes(3)
  })

  it('returns correct tabId by role', async () => {
    (vi.mocked(chrome.tabs.create) as AnyMock)
      .mockResolvedValueOnce({ id: 10 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 20 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 30 } as chrome.tabs.Tab)
    ;(vi.mocked(chrome.tabs.sendMessage) as AnyMock)
      .mockResolvedValue({ success: true, response: 'ok' })

    const { TabManager } = await import('../src/service-worker/tabManager')
    const manager = new TabManager()

    const initPromise = manager.init()
    await vi.runAllTimersAsync()
    await initPromise

    expect(manager.getTabId('decision')).toBe(10)
    expect(manager.getTabId('understanding')).toBe(20)
    expect(manager.getTabId('output')).toBe(30)
  })

  it('retries on failure and throws after MAX_RETRIES', async () => {
    expect.assertions(1)

    ;(vi.mocked(chrome.tabs.create) as AnyMock)
      .mockResolvedValueOnce({ id: 10 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 20 } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 30 } as chrome.tabs.Tab)
    // init succeeds
    ;(vi.mocked(chrome.tabs.sendMessage) as AnyMock)
      .mockResolvedValueOnce({ success: true, response: 'ok' })
      .mockResolvedValueOnce({ success: true, response: 'ok' })
      .mockResolvedValueOnce({ success: true, response: 'ok' })
      // sendToTab fails 3 times
      .mockResolvedValue({ success: false, error: 'Tab error' })

    const { TabManager } = await import('../src/service-worker/tabManager')
    const manager = new TabManager()

    const initPromise = manager.init()
    await vi.runAllTimersAsync()
    await initPromise

    // Attach rejection handler BEFORE running timers to avoid unhandled rejection warning
    const sendPromise = manager.sendToTab('decision', 'test prompt')
    const caught = sendPromise.catch((err: Error) => err)
    await vi.runAllTimersAsync()
    const result = await caught
    expect((result as Error).message).toContain('failed after 3 retries')
  })
})
