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

// Walk Gemini's response DOM and reconstruct clean markdown.
// Key trick: Mermaid blocks are rendered as SVG by Gemini, but the raw source
// is preserved on a `data-mermaid-code` attribute — we use that directly so
// the fence markers ```mermaid ... ``` come out right.
function reconstructMarkdownFromDom(root: HTMLElement): string {
  const parts: string[] = []
  const HEADINGS: Record<string, string> = { h1: '# ', h2: '## ', h3: '### ', h4: '#### ', h5: '##### ', h6: '###### ' }

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t) parts.push(t)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    // Skip rendered Mermaid SVG, copy/download buttons, style/script
    if (tag === 'svg' || tag === 'style' || tag === 'script' || tag === 'noscript') return
    if (el.classList?.contains('gv-mermaid-diagram')) return
    if (el.classList?.contains('gv-mermaid-toggle')) return
    if (el.classList?.contains('buttons')) return
    // Skip screen-reader-only / visually-hidden chrome (e.g. "Gemini said" label)
    if (el.classList?.contains('cdk-visually-hidden')) return
    if (el.classList?.contains('sr-only')) return
    if (el.classList?.contains('visually-hidden')) return
    if (el.getAttribute?.('aria-hidden') === 'true') return

    // Mermaid code block: try multiple sources for the raw source.
    // Priority: data-mermaid-code attribute (cheapest) → <code> textContent (fallback)
    if (el.hasAttribute('data-mermaid-code')) {
      const code = (el.getAttribute('data-mermaid-code') ?? '').trim()
      if (code) {
        parts.push('\n\n```mermaid\n' + code + '\n```\n\n')
        return
      }
    }
    // gv-mermaid-wrapper is Gemini's mermaid container; look inside for the raw code
    if (el.classList?.contains('gv-mermaid-wrapper')) {
      const codeEl = el.querySelector('[data-mermaid-code], code[data-test-id="code-content"]')
      const code = (codeEl?.getAttribute('data-mermaid-code') ?? codeEl?.textContent ?? '').trim()
      if (code) {
        parts.push('\n\n```mermaid\n' + code + '\n```\n\n')
        return
      }
    }

    // Non-mermaid code block (pre containing code)
    if (tag === 'pre') {
      const txt = el.textContent ?? ''
      parts.push('\n```\n' + txt + '\n```\n')
      return
    }
    if (tag === 'code') {
      parts.push('`' + (el.textContent ?? '') + '`')
      return
    }

    if (HEADINGS[tag]) {
      parts.push('\n\n' + HEADINGS[tag])
      for (const c of Array.from(el.childNodes)) walk(c)
      parts.push('\n')
      return
    }

    if (tag === 'p') {
      parts.push('\n\n')
      for (const c of Array.from(el.childNodes)) walk(c)
      parts.push('\n')
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      parts.push('\n')
      for (const c of Array.from(el.childNodes)) walk(c)
      parts.push('\n')
      return
    }
    if (tag === 'li') {
      parts.push('\n- ')
      for (const c of Array.from(el.childNodes)) walk(c)
      return
    }

    if (tag === 'br') { parts.push('\n'); return }
    if (tag === 'strong' || tag === 'b') { parts.push('**'); for (const c of Array.from(el.childNodes)) walk(c); parts.push('**'); return }
    if (tag === 'em' || tag === 'i') { parts.push('*'); for (const c of Array.from(el.childNodes)) walk(c); parts.push('*'); return }

    // Default: recurse into children
    for (const c of Array.from(el.childNodes)) walk(c)
  }

  walk(root)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

function getLastResponseText(): string {
  const els = getAllResponseElements()
  if (els.length === 0) return ''
  const text = reconstructMarkdownFromDom(els[els.length - 1] as HTMLElement)
  // Debug: leave breadcrumbs so we can diagnose extraction problems
  // (open the Gemini tab's DevTools console to see these)
  ;(window as unknown as { __saLastExtract?: string }).__saLastExtract = text
  return text
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

// Wait until the send button is no longer aria-disabled (Angular has processed the input).
// 10s is enough for visible tabs; background-throttled tabs hit this limit and trigger
// GEMINI_STUCK → tabManager wakes the tab and retries, so we still recover.
async function waitForSendButtonEnabled(timeout = 10000): Promise<HTMLButtonElement | null> {
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

// Paste an image into the Gemini editor via DataTransfer ClipboardEvent
async function injectImage(base64: string, mimeType: string, filename: string): Promise<void> {
  const editor = (await waitForElement(INPUT_SELECTORS, 15000)) as HTMLElement

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  const file = new File([blob], filename, { type: mimeType })

  const dt = new DataTransfer()
  dt.items.add(file)

  editor.focus()
  await new Promise(r => setTimeout(r, 300))

  editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
    composed: true,
  }))

  // Wait for Gemini to render the image thumbnail
  await new Promise(r => setTimeout(r, 1500))
}

async function sendPromptAndGetResponse(prompt: string): Promise<string> {
  const previousCount = countResponseElements()
  const previousText = getLastResponseText()

  await injectPrompt(prompt)
  await new Promise(r => setTimeout(r, 500))
  await clickSend()

  if (findElement(INPUT_SELECTORS)?.textContent?.trim()) {
    throw new Error('GEMINI_STUCK')
  }

  return await waitForNewResponse(previousCount, previousText)
}

async function sendPromptWithImages(
  prompt: string,
  images: Array<{ base64: string; mimeType: string; filename: string }>
): Promise<string> {
  const previousCount = countResponseElements()
  const previousText = getLastResponseText()

  // Paste all images first
  for (const img of images) {
    await injectImage(img.base64, img.mimeType, img.filename)
  }

  // Then inject the text prompt
  await injectPrompt(prompt)
  await new Promise(r => setTimeout(r, 500))
  await clickSend()

  if (findElement(INPUT_SELECTORS)?.textContent?.trim()) {
    throw new Error('GEMINI_STUCK')
  }

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
  } else if (payload.type === 'SEND_PROMPT_WITH_IMAGES') {
    try {
      const { prompt, images } = payload.payload
      const response = await sendPromptWithImages(prompt, images)
      window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { success: true, response } }, '*')
    } catch (err) {
      window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { success: false, error: (err as Error).message } }, '*')
    }
  } else if (payload.type === 'PING') {
    window.postMessage({ type: 'GEMINI_RESPONSE', requestId, payload: { alive: true } }, '*')
  }
})
