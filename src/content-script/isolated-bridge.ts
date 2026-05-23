// Runs in ISOLATED world — the only place chrome.runtime messaging works in MV3.
// Bridges chrome.runtime messages to/from the MAIN world script via window.postMessage.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SEND_PROMPT' && message.type !== 'PING') return false

  const requestId = Math.random().toString(36).slice(2)

  const handler = (event: MessageEvent) => {
    if (event.source !== window) return
    if (event.data?.type === 'GEMINI_RESPONSE' && event.data?.requestId === requestId) {
      window.removeEventListener('message', handler)
      sendResponse(event.data.payload)
    }
  }
  window.addEventListener('message', handler)

  window.postMessage({ type: 'GEMINI_REQUEST', requestId, payload: message }, '*')
  return true // keep sendResponse channel open
})
