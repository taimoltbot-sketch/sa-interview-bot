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

const STORAGE_KEY = 'geminiSessions'

interface SessionEntry { tabId: number; sessionUrl: string }
type SessionRegistry = Record<TabRole, SessionEntry>

export class TabManager {
  private registry: TabRegistry = { decision: 0, understanding: 0, output: 0 }
  private sessionUrls: Record<TabRole, string> = { decision: GEMINI_URL, understanding: GEMINI_URL, output: GEMINI_URL }

  // Wait for Gemini to assign a session URL (URL changes from /app to /app/<id>)
  private async captureSessionUrl(tabId: number): Promise<string> {
    for (let i = 0; i < 60; i++) {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      if (tab?.url && tab.url !== GEMINI_URL && tab.url.startsWith('https://gemini.google.com/app/')) {
        return tab.url
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return GEMINI_URL // fallback if no session URL within 30s
  }

  private async saveSessions(): Promise<void> {
    const sessions: SessionRegistry = {
      decision:     { tabId: this.registry.decision,     sessionUrl: this.sessionUrls.decision },
      understanding:{ tabId: this.registry.understanding, sessionUrl: this.sessionUrls.understanding },
      output:       { tabId: this.registry.output,       sessionUrl: this.sessionUrls.output },
    }
    await chrome.storage.session.set({ [STORAGE_KEY]: sessions })
  }

  // Restore from previous lifecycle: reuse live tabs OR reopen session URLs.
  // Returns true when all three brains are ready (no init prompts needed).
  async tryRestore(): Promise<boolean> {
    if (isTest) return false
    const stored = await chrome.storage.session.get(STORAGE_KEY)
    const sessions = stored[STORAGE_KEY] as SessionRegistry | undefined
    if (!sessions) return false

    for (const role of ['decision', 'understanding', 'output'] as TabRole[]) {
      const { tabId, sessionUrl } = sessions[role]
      const existing = await chrome.tabs.get(tabId).catch(() => null)

      if (existing?.url?.includes('gemini.google.com')) {
        // Tab still alive — reuse it
        this.registry[role] = tabId
        this.sessionUrls[role] = existing.url
      } else if (sessionUrl && sessionUrl !== GEMINI_URL) {
        // Tab was closed — reopen the same conversation URL (context is preserved in history)
        const tab = await chrome.tabs.create({ url: sessionUrl, pinned: true })
        await this.waitForTabReady(tab.id!)
        this.registry[role] = tab.id!
        this.sessionUrls[role] = sessionUrl
      } else {
        return false // no session URL stored — need full init
      }
    }

    // Re-apply autoDiscardable on every restore — tabs may have been reset
    await Promise.all(
      Object.values(this.registry).map(tid =>
        chrome.tabs.update(tid, { autoDiscardable: false }).catch(() => {})
      )
    )

    await this.saveSessions()
    this.attachTabRemovedListener()
    return true
  }

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

    // Prevent Chrome from auto-discarding our brain tabs under memory pressure
    await Promise.all([
      chrome.tabs.update(decisionTab.id!,     { autoDiscardable: false }).catch(() => {}),
      chrome.tabs.update(understandingTab.id!, { autoDiscardable: false }).catch(() => {}),
      chrome.tabs.update(outputTab.id!,       { autoDiscardable: false }).catch(() => {}),
    ])

    // Init prompts run in parallel — they target different tabs, so no contention
    await Promise.all([
      this.sendToTab('decision', DECISION_BRAIN_INIT),
      this.sendToTab('understanding', UNDERSTANDING_BRAIN_INIT),
      this.sendToTab('output', OUTPUT_BRAIN_INIT),
    ])

    // Capture session URLs in parallel too
    const [decisionUrl, understandingUrl, outputUrl] = await Promise.all([
      this.captureSessionUrl(decisionTab.id!),
      this.captureSessionUrl(understandingTab.id!),
      this.captureSessionUrl(outputTab.id!),
    ])
    this.sessionUrls.decision = decisionUrl
    this.sessionUrls.understanding = understandingUrl
    this.sessionUrls.output = outputUrl

    await this.saveSessions()
    this.attachTabRemovedListener()
  }

  private attachTabRemovedListener(): void {
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

  // Wake a background-throttled tab by activating it momentarily.
  // Used as fallback when sendMessage retries — minimal user disruption.
  private async wakeTab(tabId: number): Promise<void> {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (!tab.active) {
        await chrome.tabs.update(tabId, { active: true })
        await new Promise(r => setTimeout(r, 250))
      }
    } catch { /* tab missing — sendToTab will retry */ }
  }

  async sendToTab(role: TabRole, prompt: string): Promise<string> {
    const tabId = this.registry[role]
    let lastError: Error = new Error('Unknown error')

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // On retry, wake the tab — first attempt assumed to work, only disrupt if needed
        if (attempt > 1) await this.wakeTab(tabId)

        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'SEND_PROMPT',
          payload: prompt,
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
        if (attempt > 1) await this.wakeTab(tabId)

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
    // Reload to the session URL — conversation history is preserved, no re-init needed
    const sessionUrl = this.sessionUrls[role]
    const tabId = this.registry[role]
    await chrome.tabs.update(tabId, { url: sessionUrl })
    await this.waitForTabReady(tabId)
  }

  private async reopenTab(role: TabRole): Promise<void> {
    // Reopen session URL so conversation context survives tab close
    const sessionUrl = this.sessionUrls[role] ?? GEMINI_URL
    const tab = await chrome.tabs.create({ url: sessionUrl, pinned: true })
    this.registry[role] = tab.id!
    await this.waitForTabReady(tab.id!)
    await this.saveSessions()

    // Only re-init if we couldn't restore a real session (fell back to /app)
    if (sessionUrl === GEMINI_URL) {
      const initPrompts: Record<TabRole, string> = {
        decision: DECISION_BRAIN_INIT,
        understanding: UNDERSTANDING_BRAIN_INIT,
        output: OUTPUT_BRAIN_INIT,
      }
      await this.sendToTab(role, initPrompts[role])
      this.sessionUrls[role] = await this.captureSessionUrl(tab.id!)
      await this.saveSessions()
    }
  }
}
