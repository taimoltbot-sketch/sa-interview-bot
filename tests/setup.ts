// tests/setup.ts
import '@testing-library/jest-dom'

// Mock Chrome APIs
const vi = (globalThis as any).vi
global.chrome = {
  tabs: { create: vi.fn(), sendMessage: vi.fn(), onRemoved: { addListener: vi.fn() } },
  storage: { session: { get: vi.fn(), set: vi.fn() } },
  runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() }, sendMessage: vi.fn() },
} as unknown as typeof chrome
