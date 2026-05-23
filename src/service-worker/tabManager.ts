import type { TabRegistry, TabRole } from '../types/index'
import {
  DECISION_BRAIN_INIT,
  UNDERSTANDING_BRAIN_INIT,
  OUTPUT_BRAIN_INIT,
} from './prompts'

const GEMINI_URL = 'https://gemini.google.com/app'
const MAX_RETRIES = 8
const isTest = (() => {
  try { return !!(import.meta as any).env?.VITEST } catch { return false }
})()

export class TabManager {
  private registry: TabRegistry = { decision: 0, understanding: 0, output: 0 }

  async init(): Promise<void> {
    const decisionTab = await chrome.tabs.create({ url: GEMINI_URL, pinned: true })
    await this.waitForTabReady(decisionTab.id!)
    const understandingTab = await chrome.tabs.create({ url: GEMINI_URL, pinned: true })
    await this.waitForTabReady(understandingTab.id!)
    const outputTab = await chrome.tabs.create({ url: GEMINI_URL, pinned: true })
    await this.waitForTabReady(outputTab.id!)

    this.registry = {
      decision: decisionTab.id!,
      understanding: understandingTab.id!,
      output: outputTab.id!,
    }

    await this.sendToTab('decision', DECISION_BRAIN_INIT)
    await this.sendToTab('understanding', UNDERSTANDING_BRAIN_INIT)
    await this.sendToTab('output', OUTPUT_BRAIN_INIT)

    chrome.tabs.onRemoved.addListener((tabId) => {
      const role = this.getRoleByTabId(tabId)
      if (role) this.reopenTab(role).catch(() => {})
    })
  }

  getTabId(role: TabRole): number {
    return this.registry[role]
  }

  // Wait for tab to finish loading AND content script to be responsive
  private async waitForTabReady(tabId: number): Promise<void> {
    if (isTest) return

    // Step 1: wait for tab status === 'complete'
    await new Promise<void>((resolve) => {
      const poll = async () => {
        const tab = await chrome.tabs.get(tabId).catch(() => null)
        if (tab?.status === 'complete') return resolve()
        setTimeout(poll, 600)
      }
      poll()
    })

    // Step 2: ping until content script responds (up to 30s)
    for (let i = 0; i < 60; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING' })
        return
      } catch {
        await new Promise(r => setTimeout(r, 500))
      }
    }
    // Content script didn't respond in time — proceed anyway, sendToTab will retry
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

        if (!response.success) {
          // Gemini UI is stuck — reload the tab, re-init the brain, then retry
          if (response.error === 'GEMINI_STUCK') {
            await this.reloadTab(role)
            continue
          }
          throw new Error(response.error ?? 'Tab returned failure')
        }
        return response.response!
      } catch (err) {
        lastError = err as Error
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1500 * attempt))
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

  async sendToTabWithImages(
    role: TabRole,
    prompt: string,
    images: Array<{ base64: string; mimeType: string; filename: string }>
  ): Promise<string> {
    const tabId = this.registry[role]
    let lastError: Error = new Error('Unknown error')

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'SEND_PROMPT_WITH_IMAGES',
          payload: { prompt, images },
        }) as { success: boolean; response?: string; error?: string }

        if (!response.success) {
          if (response.error === 'GEMINI_STUCK') {
            await this.reloadTab(role)
            continue
          }
          throw new Error(response.error ?? 'Tab returned failure')
        }
        return response.response!
      } catch (err) {
        lastError = err as Error
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1500 * attempt))
      }
    }
    throw new Error(`Tab ${role} failed after ${MAX_RETRIES} retries: ${lastError.message}`)
  }

  private async reloadTab(role: TabRole): Promise<void> {
    const tabId = this.registry[role]
    await chrome.tabs.reload(tabId)
    await this.waitForTabReady(tabId)
    const initPrompts: Record<TabRole, string> = {
      decision: DECISION_BRAIN_INIT,
      understanding: UNDERSTANDING_BRAIN_INIT,
      output: OUTPUT_BRAIN_INIT,
    }
    // Direct send (no stuck-detection loop) to restore brain context after reload
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'SEND_PROMPT',
      payload: initPrompts[role],
    }) as { success: boolean; response?: string; error?: string }
    if (!response.success) throw new Error(`Re-init after reload failed: ${response.error}`)
  }

  private async reopenTab(role: TabRole): Promise<void> {
    const tab = await chrome.tabs.create({ url: GEMINI_URL, pinned: true })
    this.registry[role] = tab.id!
    await this.waitForTabReady(tab.id!)
    const initPrompts: Record<TabRole, string> = {
      decision: DECISION_BRAIN_INIT,
      understanding: UNDERSTANDING_BRAIN_INIT,
      output: OUTPUT_BRAIN_INIT,
    }
    await this.sendToTab(role, initPrompts[role])
  }
}
