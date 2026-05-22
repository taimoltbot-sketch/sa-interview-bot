import { describe, it, expect, beforeEach } from 'vitest'

function createGeminiDOM() {
  document.body.innerHTML = `
    <div class="app-container">
      <div class="input-area">
        <div contenteditable="true" role="textbox" class="ql-editor"></div>
        <button aria-label="Send message"></button>
      </div>
      <div class="response-container">
        <div class="model-response-text">Previous response</div>
      </div>
    </div>
  `
}

describe('Gemini DOM selectors', () => {
  beforeEach(createGeminiDOM)

  it('finds contenteditable input element', () => {
    const el = document.querySelector('[contenteditable="true"][role="textbox"]')
    expect(el).not.toBeNull()
  })

  it('finds send button by aria-label', () => {
    const btn = document.querySelector('button[aria-label="Send message"]')
    expect(btn).not.toBeNull()
  })

  it('finds response text element', () => {
    const response = document.querySelector('.model-response-text')
    expect(response).not.toBeNull()
    expect(response?.textContent).toBe('Previous response')
  })
})
