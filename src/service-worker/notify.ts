// Send a short status string to the side panel so the loading indicator
// can say what's currently happening instead of just pulsing dots.
export function notifyStatus(text: string): void {
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', payload: text }).catch(() => {})
}
