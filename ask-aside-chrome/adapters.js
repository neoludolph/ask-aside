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
        contentEl: el,
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
          out.push({
            el: r,
            contentEl: body,
            role: "assistant",
            text: body.innerText.trim(),
          });
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

  {
    name: "perplexity",
    hosts: ["www.perplexity.ai", "perplexity.ai"],

    // Perplexity renders each answer body in <div data-renderer="lm"> (styled as
    // Tailwind ".prose") and each user question in a
    // <div class="group/query" role="heading" aria-level="1"> above it. We match
    // both in one querySelectorAll (document order → interleaved user/assistant)
    // and, for answers, climb to the block that also holds the copy button so
    // getCopyButton() and selection checks resolve within one turn. The action
    // toolbar (Share, Download, Copy, Rewrite, …) is a sibling row just below the
    // prose, inside that block.
    getMessages() {
      const out = [];
      const seen = new Set();
      const nodes = document.querySelectorAll(
        '[data-renderer="lm"], [role="heading"][aria-level="1"], .group\\/query'
      );
      for (const node of nodes) {
        if (seen.has(node)) continue;
        seen.add(node);
        if (node.matches('[data-renderer="lm"]')) {
          let block = node;
          for (let i = 0; i < 12 && block.parentElement; i++) {
            block = block.parentElement;
            if (this.getCopyButton(block)) break;
          }
          out.push({
            el: block,
            contentEl: node,
            role: "assistant",
            text: node.innerText.trim(),
          });
        } else {
          const text = node.innerText.trim();
          if (text) out.push({ el: node, contentEl: node, role: "user", text });
        }
      }
      return out;
    },

    // Copy button in the answer toolbar – the "?" is inserted next to it. Match
    // the localized aria-label first, then fall back to the button that wraps
    // the copy icon (<use xlink:href="#pplx-icon-copy">) for language safety.
    getCopyButton(messageEl) {
      const byLabel = messageEl.querySelector(
        'button[aria-label="Copy"], button[aria-label="Kopieren"], button[aria-label="Copiar"], button[aria-label="Copier"], button[aria-label="Copia"]'
      );
      if (byLabel) return byLabel;
      for (const b of messageEl.querySelectorAll("button")) {
        const use = b.querySelector("use");
        const href =
          use && (use.getAttribute("xlink:href") || use.getAttribute("href"));
        if (href && /copy/i.test(href)) return b;
      }
      return null;
    },

    getObserverRoot() {
      return document.querySelector("main") || document.body;
    },

    // Thread URL: https://www.perplexity.ai/search/<slug> (also /page/<slug>).
    getConversationKey() {
      const m = location.pathname.match(/\/(?:search|page)\/([\w-]+)/);
      return m ? m[1] : location.pathname;
    },

    // Perplexity uses Tailwind class-based dark mode, but the exact theme flag
    // varies; fall back to sampling the page background luminance so the panel
    // always matches regardless of how the theme is signalled.
    isDark() {
      const html = document.documentElement;
      if (html.classList.contains("dark")) return true;
      if (html.classList.contains("light")) return false;
      const attr =
        html.getAttribute("data-color-scheme") ||
        html.getAttribute("data-theme") ||
        document.body.getAttribute("data-color-scheme");
      if (attr === "dark") return true;
      if (attr === "light") return false;
      const bg = getComputedStyle(document.body).backgroundColor;
      const rgb = bg && bg.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const [r, g, b] = rgb.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
      }
      return matchMedia("(prefers-color-scheme: dark)").matches;
    },
  },
];

function getAdapter() {
  return ADAPTERS.find((a) => a.hosts.includes(location.hostname)) || null;
}
