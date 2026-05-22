const INPUT_SELECTORS = [
  '[contenteditable="true"][role="textbox"]',
  '.ql-editor[contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  '[data-testid="rich-textarea"]',
  'textarea.message-input',
]

const SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send message"]',
  'button[data-testid="send-button"]',
  'button.send-button',
  'button[jsname="Qx7uuf"]',
]

const RESPONSE_SELECTORS = [
  '.model-response-text',
  '.response-text',
  '[data-testid="response-text"]',
  'message-content',
]

function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) return el
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
      reject(new Error(`Element not found after ${timeout}ms. Selectors: ${selectors.join(', ')}`))
    }, timeout)
  })
}

function getLastResponseText(): string {
  const responses = document.querySelectorAll(RESPONSE_SELECTORS.join(', '))
  if (responses.length === 0) return ''
  return responses[responses.length - 1].textContent?.trim() ?? ''
}

async function waitForNewResponse(previousResponse: string, timeout = 60000): Promise<string> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const current = getLastResponseText()
      if (current && current !== previousResponse) {
        setTimeout(() => {
          clearInterval(interval)
          resolve(getLastResponseText())
        }, 2000)
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('Timeout waiting for Gemini response'))
      }
    }, 500)
  })
}

async function injectPrompt(text: string): Promise<void> {
  const input = (await waitForElement(INPUT_SELECTORS)) as HTMLElement
  input.focus()
  document.execCommand('selectAll', false)
  document.execCommand('delete', false)
  document.execCommand('insertText', false, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function clickSend(): Promise<void> {
  const button = (await waitForElement(SEND_BUTTON_SELECTORS)) as HTMLButtonElement
  button.click()
}

async function sendPromptAndGetResponse(prompt: string): Promise<string> {
  const previousResponse = getLastResponseText()
  await injectPrompt(prompt)
  await new Promise(r => setTimeout(r, 300))
  await clickSend()
  return await waitForNewResponse(previousResponse)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SEND_PROMPT') {
    sendPromptAndGetResponse(message.payload)
      .then(response => sendResponse({ success: true, response }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (message.type === 'PING') {
    sendResponse({ alive: true })
    return false
  }
})
