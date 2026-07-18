// Site adapter: encapsulates everything that differs per chat web app.
// New sites (Gemini, Perplexity, ...) only need another object with the same
// fields plus an entry in manifest.json.

const ADAPTERS = [
  {
    name: "chatgpt",
    hosts: ["chatgpt.com", "chat.openai.com"],

    // Returns all messages of the main chat in document order.
    getMessages() {
      return Array.from(
        document.querySelectorAll("[data-message-author-role]")
      ).map((el) => ({
        el,
        role:
          el.getAttribute("data-message-author-role") === "assistant"
            ? "assistant"
            : "user",
        text: el.innerText.trim(),
      }));
    },

    // Copy button in the action toolbar of an assistant answer – the "?"
    // button is inserted next to it. Multiple fallbacks because ChatGPT
    // changes its markup regularly.
    getCopyButton(messageEl) {
      const turn =
        messageEl.closest("article") ||
        messageEl.closest('[data-testid^="conversation-turn"]') ||
        messageEl.parentElement;
      if (!turn) return null;
      return (
        turn.querySelector('button[data-testid="copy-turn-action-button"]') ||
        turn.querySelector(
          'button[aria-label="Copy"], button[aria-label="Kopieren"], button[aria-label="Copiar"], button[aria-label="Copier"]'
        )
      );
    },

    // Element whose children change when new messages arrive (for the observer).
    getObserverRoot() {
      return document.querySelector("main") || document.body;
    },

    // Stable key for the current conversation (for thread storage).
    getConversationKey() {
      const m = location.pathname.match(/\/c\/([\w-]+)/);
      return m ? m[1] : location.pathname;
    },

    // Dark-mode detection: ChatGPT sets "dark"/"light" on <html>.
    isDark() {
      const c = document.documentElement.classList;
      if (c.contains("dark")) return true;
      if (c.contains("light")) return false;
      return matchMedia("(prefers-color-scheme: dark)").matches;
    },
  },

  {
    name: "gemini",
    hosts: ["gemini.google.com"],

    // Gemini structures each dialog turn as <div.conversation-container>
    // with a <user-query> and a <model-response>.
    getMessages() {
      const out = [];
      for (const c of document.querySelectorAll("div.conversation-container")) {
        const u = c.querySelector("user-query");
        if (u) out.push({ el: u, role: "user", text: u.innerText.trim() });
        const r = c.querySelector("model-response");
        if (r) {
          const body =
            r.querySelector(".model-response-text, message-content") || r;
          out.push({ el: r, role: "assistant", text: body.innerText.trim() });
        }
      }
      return out;
    },

    // Action toolbar in the footer of an answer. Gemini wraps each action in
    // a custom element (copy-button > gem-icon-button > button); the styled
    // <button> is returned so the "?" can inherit its native classes. Note the
    // data-test-id="copy-button" sits on the gem-icon-button wrapper, not the
    // <button>, so we reach the inner button via "copy-button button".
    getCopyButton(messageEl) {
      return (
        messageEl.querySelector("copy-button button") ||
        messageEl.querySelector('[data-test-id="copy-button"] button') ||
        messageEl.querySelector(
          'button[aria-label="Copy"], button[aria-label="Copy response"], button[aria-label="Antwort kopieren"], button[aria-label="Kopieren"]'
        ) ||
        messageEl.querySelector("message-actions button") ||
        messageEl.querySelector(".response-container-footer button") ||
        messageEl.querySelector("button[mat-icon-button]")
      );
    },

    // Flex row that holds the action buttons (Regenerate, Copy, More). The "?"
    // is inserted here as a sibling of the copy button's cell so it lines up
    // with the native buttons instead of nesting inside the copy wrapper.
    getToolbar(messageEl) {
      return (
        messageEl.querySelector(".buttons-container-v2") ||
        messageEl.querySelector(".actions-container-v2") ||
        messageEl.querySelector("message-actions")
      );
    },

    getObserverRoot() {
      return (
        document.querySelector("chat-window") ||
        document.querySelector("main") ||
        document.body
      );
    },

    getConversationKey() {
      const m = location.pathname.match(/\/app\/([\w-]+)/);
      return m ? m[1] : location.pathname;
    },

    // Gemini sets "dark-theme"/"light-theme" on <body> or <html>.
    isDark() {
      const b = document.body.classList;
      const h = document.documentElement.classList;
      if (b.contains("dark-theme") || h.contains("dark-theme")) return true;
      if (b.contains("light-theme") || h.contains("light-theme")) return false;
      return matchMedia("(prefers-color-scheme: dark)").matches;
    },
  },
];

function getAdapter() {
  return ADAPTERS.find((a) => a.hosts.includes(location.hostname)) || null;
}
