# AskAside (Chrome extension)

Ask follow-up questions about individual AI answers in ChatGPT, Gemini, and
Perplexity as a separate thread in a side panel – without changing the linear main chat or its
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

## Configuration via `.env` (optional)

Instead of (or in addition to) the options page you can drop a `.env` file into
this folder:

1. Copy `.env.example` to `.env`
2. Fill in the values you need (`ASKASIDE_PROVIDER`, `ANTHROPIC_API_KEY`,
   `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`)
3. Reload the extension in `chrome://extensions`

The `.env` is bundled with the extension and read at runtime by the service
worker and the options page. Values act as **defaults**: anything you save in the
options page (`chrome.storage.local`) overrides the matching `.env` value. The
options fields are pre-filled from the effective config so you can see what's
active. `.env` is gitignored (it holds your keys); only `.env.example` is
committed.

## Usage

1. Open `chatgpt.com`, `gemini.google.com`, or `perplexity.ai` and have a chat
2. Under each AI answer, a **"?" button** appears in the action toolbar
   (far right, next to the other icons)
3. Alternatively, select text within an AI answer and use the floating **"?"**
   beside the selection to focus the thread on that exact passage. The passage
   appears above the input in quotation marks; its **"✕"** removes the passage
   focus for subsequent questions without closing or clearing the thread. When
   sent, the passage moves into a compact quoted header in the user bubble and
   the next question starts without a passage focus. While the thread stays
   open, selecting text in any AI answer immediately replaces the composer
   reference and makes that response the thread's current whole-answer anchor.
4. Clicking either question-mark button opens a floating thread box next to the
   answer (light/dark to
   match the page): the follow-up thread with its own input field
   (Enter sends, Shift+Enter inserts a line break, Esc closes)
   Use the color dot in the header to choose a persistent pastel accent theme.
5. Drag the panel by its header. Resize it from any edge or use the visible grip
   in the bottom-right corner. Its default size and automatic position are
   restored whenever a thread is opened.
6. As context, the main chat **up to and including** the anchored answer is sent
   to the API – later messages and the thread itself stay separate from the main
   chat. The anchored answer is not repeated in the panel (you already see it in
   the main chat)
7. Close the panel (✕ / click outside / Esc) → the main chat is exactly where it
   was. Threads are **not persisted**: they live only in memory and any leftover
   thread data in `chrome.storage.local` is cleared on close, so reopening starts
   fresh.

## Architecture

| File | Responsibility |
|---|---|
| `adapters.js` | Site adapters (selectors, conversation key) for ChatGPT, Gemini, and Perplexity. New sites: add an object + a `manifest.json` match |
| `content.js` | Toolbar and selection "?" buttons, isolated shadow-DOM thread UI, keyboard-event shielding, drag/resize behavior, and the animated waiting indicator |
| `background.js` | API call in the service worker – either the Claude API directly (`claude-opus-4-8`) or OpenRouter (OpenAI-compatible endpoint, any model); keys are kept out of the page context and sent directly to the configured API |
| `options.html/js` | Provider selection, entry, and local storage of the API keys |
| `env.js` | Reads the optional bundled `.env` and merges it under the stored settings (storage wins) |

When `OPENROUTER_BASE_URL` points to an origin other than OpenRouter, add that
origin to `host_permissions` in `manifest.json` and reload the extension.

## Known limitations

- The ChatGPT adapter relies on `[data-message-author-role]` – if OpenAI changes
  the markup, the adapter must be updated.
- The Gemini adapter's selectors (`conversation-container`, `model-response`,
  copy button) are based on Gemini's known DOM and may need adjusting if Google
  changes the markup.
- The Perplexity adapter's selectors (`[data-renderer="lm"]`, the answer copy
  button) are based on Perplexity's known DOM and may need adjusting if
  Perplexity changes the markup.
- Answers do not (yet) stream; they arrive as a whole.

## License

Licensed under the [MIT License](../LICENSE). Copyright © 2026 Neo Ludolph.
