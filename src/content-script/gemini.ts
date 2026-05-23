const INPUT_SELECTORS = [
  'rich-textarea .ql-editor[contenteditable="true"]',  // Gemini's Quill editor inside rich-textarea
  '[aria-label="Enter a prompt for Gemini"]',           // stable aria-label
  '.ql-editor[contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
]

const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[aria-label="傳送訊息"]',    // zh-TW fallback
  'button[aria-label="傳送"]',        // shorter zh-TW variant
  '[data-test-id="send-button-container"] button',
  'gem-icon-button.send-button button',
]

// Gemini response container selectors (verified against live DOM 2025-05)
const RESPONSE_CONTAINER_SELECTORS = [
  'structured-content-container', // most precise — the actual text container
  'model-response',               // wraps each Gemini turn
  'response-container',
  '.response-container',
  '.markdown',                    // rendered markdown inside response
]

function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector)
      if (el) return el
    } catch { /* invalid selector — skip */ }
  }
  return null
}

function waitForElement(selectors: string[], timeout = 30000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const found = findElement(selectors)
    if (found) return resolve(found)

    const observer = new MutationObserver(() => {
      const el = findElement(selectors)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Element not found: ${selectors.join(', ')}`))
    }, timeout)
  })
}

function getAllResponseElements(): Element[] {
  for (const selector of RESPONSE_CONTAINER_SELECTORS) {
    try {
      const els = document.querySelectorAll(selector)
      if (els.length > 0) return Array.from(els)
    } catch { /* skip */ }
  }
  return []
}

function getLastResponseText(): string {
  const els = getAllResponseElements()
  if (els.length === 0) return ''
  return els[els.length - 1].textContent?.trim() ?? ''
}

function countResponseElements(): number {
  return getAllResponseElements().length
}

async function waitForNewResponse(previousCount: number, previousText: string, timeout = 240000): Promise<string> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    let settled = false
    const interval = setInterval(() => {
      const currentCount = countResponseElements()
      const currentText = getLastResponseText()

      // New element appeared OR text changed meaningfully
      const newElement = currentCount > previousCount
      const textChanged = currentText.length > 0 && currentText !== previousText

      if ((newElement || textChanged) && !settled) {
        settled = true
        // Wait for Gemini to finish streaming (text stabilises)
        let lastSeen = currentText
        let stableFor = 0
        const stabilityCheck = setInterval(() => {
          const now = getLastResponseText()
          if (now === lastSeen) {
            stableFor += 400
            if (stableFor >= 2000) {
              clearInterval(stabilityCheck)
              clearInterval(interval)
              resolve(getLastResponseText())
            }
          } else {
            lastSeen = now
            stableFor = 0
          }
        }, 400)
      }

      if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('Timeout waiting for Gemini response'))
      }
    }, 400)
  })
}

async function injectPrompt(text: string): Promise<void> {
  const input = (await waitForElement(INPUT_SELECTORS, 15000)) as HTMLElement
  input.focus()
  await new Promise(r => setTimeout(r, 200))

  // Clear existing content
  document.execCommand('selectAll', false)
  document.execCommand('delete', false)
  await new Promise(r => setTimeout(r, 100))

  // Fire beforeinput (Quill listens to this to update its model)
  input.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: text,
    bubbles: true,
    cancelable: true,
  }))

  // Insert the text into the DOM
  document.execCommand('insertText', false, text)

  // Fire input event (tells Quill content changed → enables send button)
  input.dispatchEvent(new InputEvent('input', {
    inputType: 'insertText',
    data: text,
    bubbles: true,
  }))

  await new Promise(r => setTimeout(r, 300))
}

// Wait until the send button is no longer aria-disabled (Angular has processed the input)
async function waitForSendButtonEnabled(timeout = 8000): Promise<HTMLButtonElement | null> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const selector of SEND_BUTTON_SELECTORS) {
      const btn = document.querySelector(selector) as HTMLButtonElement | null
      if (btn && btn.closest('[aria-disabled="true"]') === null && !btn.disabled) return btn
    }
    await new Promise(r => setTimeout(r, 100))
  }
  return null
}

function inputIsEmpty(): boolean {
  return !findElement(INPUT_SELECTORS)?.textContent?.trim()
}

async function clickSend(): Promise<void> {
  // Step 1: Enter key on the editor — most reliable for Quill (enterkeyhint="send")
  const editor = findElement(INPUT_SELECTORS) as HTMLElement | null
  if (editor) {
    const kOpts: KeyboardEventInit = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true, composed: true }
    editor.dispatchEvent(new KeyboardEvent('keydown', kOpts))
    editor.dispatchEvent(new KeyboardEvent('keypress', kOpts))
    editor.dispatchEvent(new KeyboardEvent('keyup', { ...kOpts, cancelable: false }))
    await new Promise(r => setTimeout(r, 600))
    if (inputIsEmpty()) return
  }

  // Step 2: Wait for Angular to enable the button, then click
  const btn = await waitForSendButtonEnabled()
  if (btn) {
    btn.click()
    await new Promise(r => setTimeout(r, 400))
    if (inputIsEmpty()) return

    // Step 3: PointerEvent sequence if plain click didn't register
    const rect = btn.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy }
    btn.dispatchEvent(new PointerEvent('pointerdown', { ...opts, isPrimary: true }))
    btn.dispatchEvent(new PointerEvent('pointerup', { ...opts, isPrimary: true }))
    btn.dispatchEvent(new MouseEvent('click', opts))
    await new Promise(r => setTimeout(r, 400))
  }
}

async function sendPromptAndGetResponse(prompt: string): Promise<string> {
  const previousCount = countResponseElements()
  const previousText = getLastResponseText()

  await injectPrompt(prompt)
  await new Promise(r => setTimeout(r, 500))
  await clickSend()

  return await waitForNewResponse(previousCount, previousText)
}

// Receives messages from isolated-bridge.ts via window.postMessage (MAIN world only)
window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== 'GEMINI_REQUEST') return
  const { requestId, payload } = event.data

  if (payload.type === 'SEND_PROMPT') {
    try {
      const response = await sendPromptAndGetResponse(payload.payload)
      window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { success: true, response } }, '*')
    } catch (err) {
      window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { success: false, error: (err as Error).message } }, '*')
    }
  } else if (payload.type === 'PING') {
    window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { alive: true } }, '*')
  }
})
