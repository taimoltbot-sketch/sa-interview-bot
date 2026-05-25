// tests/setup.ts
import '@testing-library/jest-dom'

// Mock Chrome APIs
const vi = (globalThis as any).vi
;(globalThis as any).chrome = {
  tabs: {
    create: vi.fn(),
    sendMessage: vi.fn(),
    get: vi.fn(() => Promise.resolve({ status: 'complete', url: 'https://gemini.google.com/app/abc123' })),
    update: vi.fn(() => Promise.resolve({})),
    onRemoved: { addListener: vi.fn() },
  },
  storage: { session: { get: vi.fn(), set: vi.fn() } },
  runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, sendMessage: vi.fn(() => Promise.resolve()) },
} as unknown as typeof chrome
