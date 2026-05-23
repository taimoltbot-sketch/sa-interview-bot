// Status updates are layered:
//   - context : the high-level intent (e.g. "正在理解您的回答")
//   - sub     : a finer breakdown that appends after the context
// The side panel always shows "{context} · {sub}" (or just {context} when sub is empty).

let currentContext = ''
let currentSub = ''

function push(): void {
  const text = currentSub ? `${currentContext} · ${currentSub}` : currentContext
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', payload: text }).catch(() => {})
}

// High-level step. Also clears any lingering sub-status.
export function notifyStatus(text: string): void {
  currentContext = text
  currentSub = ''
  push()
}

// Low-level progress within a step. Appended after the context.
export function notifySubStatus(text: string): void {
  currentSub = text
  push()
}

export function clearSubStatus(): void {
  if (currentSub) {
    currentSub = ''
    push()
  }
}

// ── Debug logging ──────────────────────────────────────────────────────
// All logs go to the Service Worker console (chrome://extensions → click
// "Service Worker" / "Inspect views"). Both prompts and responses are
// logged in full so the user can copy + paste them without reading HTML.

function ts(): string { return new Date().toISOString().slice(11, 23) }

export function logSent(scope: string, payload: { prompt?: string; imageCount?: number; [k: string]: unknown }): void {
  const head = payload.prompt ? payload.prompt.slice(0, 120).replace(/\s+/g, ' ') : '(no prompt)'
  console.log(`[SA ${ts()}] → ${scope} :: ${head}${(payload.prompt?.length ?? 0) > 120 ? '…' : ''}`, payload)
}

export function logReceived(scope: string, raw: string, parsed?: unknown): void {
  const head = raw.slice(0, 200).replace(/\s+/g, ' ')
  console.log(`[SA ${ts()}] ← ${scope} (${raw.length} chars) :: ${head}${raw.length > 200 ? '…' : ''}`, { raw, parsed })
}

export function logEvent(scope: string, msg: string, data?: unknown): void {
  if (data !== undefined) console.log(`[SA ${ts()}] ${scope} :: ${msg}`, data)
  else console.log(`[SA ${ts()}] ${scope} :: ${msg}`)
}
