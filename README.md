# AskAside

Ask follow-up questions about individual AI answers in **ChatGPT** and **Gemini**
as a separate thread in a side panel – without changing the linear main chat or
its scroll position.

Under each AI answer a **"?" button** appears in the action toolbar. Clicking it
opens a floating thread box next to the answer, where you can ask follow-up
questions with the main chat (up to and including that answer) as context. The
main chat is never modified and threads are not persisted.

## Repository layout

| Folder | Description |
|---|---|
| [`ask-aside-chrome/`](ask-aside-chrome/) | Chrome / Chromium build (Manifest V3, `service_worker` background) |
| [`ask-aside-firefox/`](ask-aside-firefox/) | Firefox build (Manifest V3, `scripts` background + `browser_specific_settings`) |

Both builds share the same source (`adapters.js`, `content.js`, `background.js`,
`options.html/js`) and differ only in the `manifest.json` fields required by each
browser. See each folder's `README.md` for browser-specific installation steps.

## Quick start

**Chrome** — open `chrome://extensions`, enable **Developer mode**, click
**"Load unpacked"** and select the `ask-aside-chrome/` folder.

**Firefox** — open `about:debugging#/runtime/this-firefox`, click
**"Load Temporary Add-on…"** and select `ask-aside-firefox/manifest.json`.

Then open the extension options (right-click the icon → "Options") and pick a
provider:

- **Anthropic** directly (`sk-ant-…`, from platform.claude.com), model fixed to
  `claude-opus-4-8`
- **OpenRouter** (`sk-or-…`, from openrouter.ai) with a freely chosen model ID
  from openrouter.ai/models (e.g. `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`)

## How it works

| File | Responsibility |
|---|---|
| `adapters.js` | Site adapters (selectors, conversation key) for ChatGPT and Gemini. New sites: add an object + a `manifest.json` match |
| `content.js` | "?" button in the answer toolbar + floating thread box as a `position: fixed` overlay in the shadow DOM – no interference with the chat's layout/scroll |
| `background.js` | API call in the background – either the Claude API directly (`claude-opus-4-8`) or OpenRouter (OpenAI-compatible endpoint, any model); keys never leave the extension context |
| `options.html/js` | Provider selection, entry, and local storage of the API keys |

## Privacy

AskAside has no backend of its own. The selected chat context, your follow-up
thread, and your API key are sent only to the provider you configure in the
options. Threads live only in memory and are cleared from `chrome.storage.local`
on close.

## Known limitations

- The ChatGPT and Gemini adapters rely on each site's current DOM markup and may
  need updating if OpenAI or Google change their markup.
- Answers do not (yet) stream; they arrive as a whole.
