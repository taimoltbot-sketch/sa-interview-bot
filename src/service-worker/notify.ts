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
