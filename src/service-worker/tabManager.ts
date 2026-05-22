import type { TabRegistry, TabRole } from '../types/index'
import {
  DECISION_BRAIN_INIT,
  UNDERSTANDING_BRAIN_INIT,
  OUTPUT_BRAIN_INIT,
} from './prompts'

const GEMINI_URL = 'https://gemini.google.com/app'
const MAX_RETRIES = 3
// In test environment (Vitest), VITEST env var is set — use 0 delay to keep tests fast
function getInitDelay(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (import.meta as any).env?.VITEST ? 0 : 3000
  } catch {
    return 3000
  }
}
const INIT_DELAY = getInitDelay()

export class TabManager {
  private registry: TabRegistry = { decision: 0, understanding: 0, output: 0 }

  async init(): Promise<void> {
    const [decisionTab, understandingTab, outputTab] = await Promise.all([
      chrome.tabs.create({ url: GEMINI_URL, pinned: true }),
      chrome.tabs.create({ url: GEMINI_URL, pinned: true }),
      chrome.tabs.create({ url: GEMINI_URL, pinned: true }),
    ])

    this.registry = {
      decision: decisionTab.id!,
      understanding: understandingTab.id!,
      output: outputTab.id!,
    }

    await new Promise(r => setTimeout(r, INIT_DELAY))

    await Promise.all([
      this.sendToTab('decision', DECISION_BRAIN_INIT),
      this.sendToTab('understanding', UNDERSTANDING_BRAIN_INIT),
      this.sendToTab('output', OUTPUT_BRAIN_INIT),
    ])

    chrome.tabs.onRemoved.addListener((tabId) => {
      const role = this.getRoleByTabId(tabId)
      if (role) this.reopenTab(role).catch(() => { /* suppress unhandled rejection from background listener */ })
    })
  }

  getTabId(role: TabRole): number {
    return this.registry[role]
  }

  async sendToTab(role: TabRole, prompt: string): Promise<string> {
    const tabId = this.registry[role]
    let lastError: Error = new Error('Unknown error')

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'SEND_PROMPT',
          payload: prompt,
        }) as { success: boolean; response?: string; error?: string }

        if (!response.success) throw new Error(response.error ?? 'Tab returned failure')
        return response.response!
      } catch (err) {
        lastError = err as Error
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
    throw new Error(`Tab ${role} failed after ${MAX_RETRIES} retries: ${lastError.message}`)
  }

  private getRoleByTabId(tabId: number): TabRole | null {
    for (const [role, id] of Object.entries(this.registry)) {
      if (id === tabId) return role as TabRole
    }
    return null
  }

  private async reopenTab(role: TabRole): Promise<void> {
    const tab = await chrome.tabs.create({ url: GEMINI_URL, pinned: true })
    this.registry[role] = tab.id!
    await new Promise(r => setTimeout(r, INIT_DELAY))
    const initPrompts: Record<TabRole, string> = {
      decision: DECISION_BRAIN_INIT,
      understanding: UNDERSTANDING_BRAIN_INIT,
      output: OUTPUT_BRAIN_INIT,
    }
    await this.sendToTab(role, initPrompts[role])
  }
}
