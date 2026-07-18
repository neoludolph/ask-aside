# AskAside (Chrome extension)

Ask follow-up questions about individual AI answers in ChatGPT and Gemini as a
separate thread in a side panel – without changing the linear main chat or its
scroll position.

## Installation (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** in the top right
3. **"Load unpacked"** → select this folder
4. In the extension options (right-click the icon → "Options"), choose the
   provider and enter the matching key:
   - **Anthropic** directly (`sk-ant-…`, from platform.claude.com), model fixed to `claude-opus-4-8`
   - **OpenRouter** (`sk-or-…`, from openrouter.ai) with a freely chosen model ID
     from openrouter.ai/models (e.g. `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`)

## Usage

1. Open `chatgpt.com` or `gemini.google.com` and have a chat
2. Under each AI answer, a **"?" button** appears in the action toolbar
   (far right, next to the other icons)
3. Clicking it opens a floating thread box next to the answer (light/dark to
   match the page): the follow-up thread with its own input field
   (Enter sends, Shift+Enter inserts a line break, Esc closes)
4. As context, the main chat **up to and including** the anchored answer is sent
   to the API – later messages and the thread itself stay separate from the main
   chat. The anchored answer is not repeated in the panel (you already see it in
   the main chat)
5. Close the panel (✕ / click outside / Esc) → the main chat is exactly where it
   was. Threads are **not persisted**: they live only in memory and any leftover
   thread data in `chrome.storage.local` is cleared on close, so reopening starts
   fresh.

## Architecture

| File | Responsibility |
|---|---|
| `adapters.js` | Site adapters (selectors, conversation key) for ChatGPT and Gemini. New sites: add an object + a `manifest.json` match |
| `content.js` | "?" button in the answer toolbar (inherits the copy button's CSS classes → native look) + floating thread box as a `position: fixed` overlay in the shadow DOM – no interference with the chat's layout/scroll |
| `background.js` | API call in the service worker – either the Claude API directly (`claude-opus-4-8`) or OpenRouter (OpenAI-compatible endpoint, any model); keys never leave the extension context |
| `options.html/js` | Provider selection, entry, and local storage of the API keys |

## Known limitations

- The ChatGPT adapter relies on `[data-message-author-role]` – if OpenAI changes
  the markup, the adapter must be updated.
- The Gemini adapter's selectors (`conversation-container`, `model-response`,
  copy button) are based on Gemini's known DOM and may need adjusting if Google
  changes the markup.
- Answers do not (yet) stream; they arrive as a whole.
