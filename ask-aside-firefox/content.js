// AskAside – content script.
//
// A "?" button is added to the action toolbar of every assistant answer
// (next to "Copy") and inherits its CSS classes so it looks like a native
// button – including dark mode. The thread opens as a floating box next to
// the answer. The box lives in its own shadow-DOM overlay (position: fixed)
// so the page layout and scroll position stay untouched.

(() => {
  const adapter = getAdapter();
  if (!adapter) return;

  // Animated "thinking" indicator shown while an answer is being generated.
  // The @keyframes / animation classes it uses are defined in the shadow-DOM
  // <style> below (the page's own CSS can't reach into the shadow root).
  const THINKING_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="14" fill="#FF6363" opacity="0.2" class="anim-pulse-slow"></circle>
      <path d="M50 15 C50 35, 35 50, 15 50 C35 50, 50 65, 50 85 C50 65, 65 50, 85 50 C65 50, 50 35, 50 15 Z" fill="#FF6363" style="transform-box: fill-box; transform-origin: center; animation: bounce-custom 2s ease-in-out infinite;"></path>
      <circle cx="50" cy="50" r="38" stroke="#FF6363" stroke-width="1" stroke-dasharray="2 6" opacity="0.4" class="anim-rotate-ccw"></circle>
      <g class="anim-rotate-cw">
        <circle cx="50" cy="12" r="4" fill="#FF6363"></circle>
        <circle cx="50" cy="88" r="2.5" fill="#FF6363" opacity="0.6"></circle>
      </g>
    </svg>
    <span class="thinking-label">Thinking</span>`;

  // ---------- Overlay host with shadow DOM ----------

  const host = document.createElement("div");
  host.id = "askaside-overlay-host";
  const shadow = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, sans-serif; }

      #panel {
        position: fixed;
        z-index: 2147483647;
        width: 420px; max-width: 92vw;
        max-height: 72vh;
        display: none;
        flex-direction: column;
        background: var(--bg);
        color: var(--fg);
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.35);
        font-size: 14px;
        overflow: hidden;
      }
      #panel.open { display: flex; }
      #panel.resized {
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
      }

      #panel header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border);
        font-weight: 600;
        cursor: default;
        user-select: none;
      }
      #close {
        display: flex; align-items: center; gap: 6px;
        border: none; background: none; font-size: 16px; cursor: pointer;
        color: var(--muted); border-radius: 6px; padding: 2px 7px;
      }
      #close .close-hint { font-size: 13px; font-weight: 400; }
      #close:hover { background: var(--bubble-ai); color: var(--fg); }

      #thread {
        flex: 1; overflow-y: auto; padding: 12px 14px;
        scrollbar-width: none;
      }
      #thread:empty {
        min-height: 170px;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 10px;
        text-align: center;
      }
      #thread:empty::before {
        content: "Ask aside! Enter your follow-up question without interrupting your chatflow";
        max-width: 340px;
        color: var(--muted);
        font-size: 20px; font-weight: 600; line-height: 1.35;
      }
      #thread:empty::after {
        content: "Type /clear to clear this thread and its follow-up context.";
        color: var(--muted);
        font-size: 12px; font-weight: 400; line-height: 1.4;
      }
      #thread::-webkit-scrollbar { display: none; }
      .msg { margin-bottom: 10px; padding: 8px 11px; border-radius: 12px; white-space: pre-wrap; line-height: 1.45; }
      .msg.user { background: var(--bubble-user); margin-left: 36px; }
      .msg.assistant { background: var(--bubble-ai); margin-right: 18px; }
      .msg.pending { color: var(--muted); font-style: italic; }
      .msg.error { background: var(--error-bg); color: var(--error-fg); }

      .msg.markdown { white-space: normal; }
      .msg.markdown > *:first-child { margin-top: 0; }
      .msg.markdown > *:last-child { margin-bottom: 0; }
      .msg.markdown p { margin: 0 0 8px; }
      .msg.markdown h1, .msg.markdown h2, .msg.markdown h3,
      .msg.markdown h4, .msg.markdown h5, .msg.markdown h6 {
        margin: 12px 0 6px; line-height: 1.25; font-weight: 600;
      }
      .msg.markdown h1 { font-size: 1.3em; }
      .msg.markdown h2 { font-size: 1.2em; }
      .msg.markdown h3 { font-size: 1.1em; }
      .msg.markdown h4, .msg.markdown h5, .msg.markdown h6 { font-size: 1em; }
      .msg.markdown ul, .msg.markdown ol { margin: 0 0 8px; padding-left: 22px; }
      .msg.markdown li { margin: 2px 0; }
      .msg.markdown a { color: var(--accent); text-decoration: underline; }
      .msg.markdown code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: .88em; padding: 1px 5px; border-radius: 5px;
        background: rgba(127,127,127,.18);
      }
      .msg.markdown pre {
        margin: 0 0 8px; padding: 10px 12px; border-radius: 8px;
        background: rgba(127,127,127,.14); overflow-x: auto;
      }
      .msg.markdown pre code { padding: 0; background: none; font-size: .85em; }
      .msg.markdown blockquote {
        margin: 0 0 8px; padding: 2px 0 2px 10px;
        border-left: 3px solid var(--border); color: var(--muted);
      }
      .msg.markdown math { font-size: 1.05em; }
      .msg.markdown math[display="block"] {
        display: block; margin: 10px 0; text-align: center;
        overflow-x: auto; overflow-y: hidden;
      }

      form { margin-top: auto; padding: 10px 14px; flex-shrink: 0; }
      .input-wrap { position: relative; display: flex; }
      #command-suggestion {
        position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 2;
        display: flex; align-items: center; gap: 10px;
        padding: 7px 10px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--bg); color: var(--fg);
        box-shadow: 0 4px 14px rgba(0,0,0,.16);
        font-size: 13px;
      }
      #command-suggestion[hidden] { display: none; }
      #command-suggestion code { font-weight: 600; }
      #command-suggestion span { color: var(--muted); font-size: 12px; }
      textarea {
        flex: 1; resize: none;
        height: 46px; min-height: 46px; max-height: 180px;
        padding: 12px 46px 12px 12px;
        font-size: 14px; line-height: 20px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--bg); color: var(--fg);
        outline: none;
        overflow-y: auto; scrollbar-width: none;
      }
      textarea::-webkit-scrollbar { display: none; }
      textarea:focus { border-color: var(--accent); }
      form button {
        position: absolute; right: 8px; bottom: 8px;
        width: 30px; height: 30px; padding: 0;
        display: flex; align-items: center; justify-content: center;
        border: none; border-radius: 50%;
        background: var(--accent); color: var(--accent-fg);
        font-size: 17px; line-height: 1; cursor: pointer;
      }
      form button:disabled { opacity: .5; cursor: default; }

      .resize-handle {
        position: absolute;
        z-index: 10;
      }
      .resize-handle.n { top: 0; left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
      .resize-handle.e { top: 8px; right: 0; bottom: 8px; width: 6px; cursor: ew-resize; }
      .resize-handle.s { right: 8px; bottom: 0; left: 8px; height: 6px; cursor: ns-resize; }
      .resize-handle.w { top: 8px; bottom: 8px; left: 0; width: 6px; cursor: ew-resize; }
      .resize-handle.se {
        right: 0; bottom: 0; width: 18px; height: 18px;
        z-index: 11; cursor: nwse-resize;
        border-bottom-right-radius: 14px;
      }
      .resize-handle.se::after {
        content: "";
        position: absolute; right: 4px; bottom: 4px;
        width: 7px; height: 7px;
        border-right: 2px solid var(--muted);
        border-bottom: 2px solid var(--muted);
        border-bottom-right-radius: 14px;
        opacity: .75;
      }
      #interaction-shield {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
      }

      /* Animated one-line "thinking" indicator inside the assistant bubble. */
      .msg.pending { display: flex; align-items: center; padding: 8px 11px; }
      .msg.pending svg { display: block; width: 1.25em; height: 1.25em; flex-shrink: 0; }
      .msg.pending .thinking-label {
        margin-left: 8px; color: var(--muted); font-style: italic;
        animation: aa-text-pulse 1.6s ease-in-out infinite;
      }
      @keyframes aa-text-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
      .anim-pulse-slow  { transform-box: view-box; transform-origin: 50% 50%; animation: aa-pulse 2s ease-in-out infinite; }
      .anim-rotate-cw   { transform-box: view-box; transform-origin: 50% 50%; animation: aa-spin 6s linear infinite; }
      .anim-rotate-ccw  { transform-box: view-box; transform-origin: 50% 50%; animation: aa-spin 9s linear infinite reverse; }
      @keyframes aa-pulse  { 0%, 100% { transform: scale(.8); opacity: .15; } 50% { transform: scale(1.2); opacity: .35; } }
      @keyframes aa-spin   { to { transform: rotate(360deg); } }
      @keyframes bounce-custom { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
      /* Blinking caret appended to an assistant bubble while its text is
         being progressively revealed, faking a live token stream. */
      .msg.streaming > :last-child::after {
        content: "";
        display: inline-block;
        width: 0.5em; height: 1.05em;
        margin-left: 1px;
        vertical-align: -0.18em;
        background: currentColor;
        opacity: .7;
        border-radius: 1px;
        animation: aa-caret 1s steps(1) infinite;
      }
      @keyframes aa-caret { 0%, 50% { opacity: .7; } 50.01%, 100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) {
        .anim-pulse-slow, .anim-rotate-cw, .anim-rotate-ccw, .msg.pending svg path, .msg.pending .thinking-label { animation: none !important; }
        .msg.streaming > :last-child::after { animation: none !important; }
      }
    </style>
    <div id="panel">
      <header><span>Follow-up thread</span><button id="close" title="Close" aria-label="Close (Escape)"><span class="close-hint">(esc)</span><span aria-hidden="true">✕</span></button></header>
      <div id="thread"></div>
      <form>
        <div class="input-wrap">
          <div id="command-suggestion" role="status" aria-live="polite" hidden><code>/clear</code><span>Clear thread · Tab to complete</span></div>
          <textarea rows="1" placeholder="Your follow-up about this answer … (Enter to send)"></textarea>
          <button type="submit" aria-label="Send" title="Send" disabled>↑</button>
        </div>
      </form>
      <div class="resize-handle n" data-resize="n"></div>
      <div class="resize-handle e" data-resize="e"></div>
      <div class="resize-handle s" data-resize="s"></div>
      <div class="resize-handle w" data-resize="w"></div>
      <div class="resize-handle se" data-resize="se" aria-hidden="true"></div>
    </div>
    <div id="interaction-shield"></div>
  `;

  const panel = shadow.getElementById("panel");
  const threadBox = shadow.getElementById("thread");
  const form = shadow.querySelector("form");
  const textarea = shadow.querySelector("textarea");
  const sendBtn = form.querySelector("button");
  const commandSuggestion = shadow.getElementById("command-suggestion");
  const interactionShield = shadow.getElementById("interaction-shield");
  const FULL_PLACEHOLDER = "Your follow-up about this answer … (Enter to send)";
  const COMPACT_PLACEHOLDER = "Your follow-up";
  const placeholderMeasure = document.createElement("canvas").getContext("2d");

  function updatePlaceholder() {
    if (textarea.value || !textarea.clientWidth || !placeholderMeasure) return;
    const style = getComputedStyle(textarea);
    placeholderMeasure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const availableWidth =
      textarea.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    textarea.placeholder =
      placeholderMeasure.measureText(FULL_PLACEHOLDER).width <= availableWidth
        ? FULL_PLACEHOLDER
        : COMPACT_PLACEHOLDER;
  }

  new ResizeObserver(updatePlaceholder).observe(textarea);

  const THEMES = {
    light: {
      "--bg": "#ffffff", "--fg": "#0d0d0d", "--border": "#e3e3e3",
      "--muted": "#6b6b6b", "--bubble-user": "#e8eef9", "--bubble-ai": "#f3f3f0",
      "--accent": "#FF6363", "--accent-fg": "#ffffff",
      "--error-bg": "#fdecea", "--error-fg": "#a33a2f",
    },
    dark: {
      "--bg": "#2f2f2f", "--fg": "#ececec", "--border": "#4d4d4d",
      "--muted": "#a8a8a8", "--bubble-user": "#3b4a63", "--bubble-ai": "#3c3c3c",
      "--accent": "#FF6363", "--accent-fg": "#ffffff",
      "--error-bg": "#5c2b2b", "--error-fg": "#f2b8b5",
    },
  };

  function applyTheme() {
    const theme = THEMES[adapter.isDark() ? "dark" : "light"];
    for (const [k, v] of Object.entries(theme)) panel.style.setProperty(k, v);
  }

  // ---------- State ----------

  let anchorMsg = null;
  let anchorIndex = -1;
  let thread = [];

  // ---------- Insert the "?" button into the answer toolbar ----------

  function injectButtons() {
    for (const m of adapter.getMessages()) {
      if (m.role !== "assistant") continue;
      const copyBtn = adapter.getCopyButton(m.el);
      if (!copyBtn) continue;

      // The action-button row. Adapters may point at a wrapper further up the
      // tree than copyBtn.parentElement (Gemini nests the button inside
      // copy-button > gem-icon-button); default to the copy button's parent.
      const toolbar = adapter.getToolbar
        ? adapter.getToolbar(m.el)
        : copyBtn.parentElement;
      if (!toolbar || toolbar.querySelector("[data-askaside]")) continue;

      const btn = document.createElement("button");
      btn.setAttribute("data-askaside", "1");
      btn.setAttribute("aria-label", "Ask a follow-up");
      btn.title = "Ask a follow-up";
      // Inherit the copy button's CSS classes → native look including
      // hover effect and dark mode.
      btn.className = copyBtn.className;
      btn.textContent = "?";
      btn.style.fontWeight = "700";
      btn.style.fontSize = "15px";
      btn.style.color = "#FF6363";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openThread(m.el, btn);
      });

      // Insert directly after the copy button's own cell so the "?" lines up
      // inline with the native action buttons (right next to Copy). The cell is
      // the copy button's topmost ancestor that is still a direct child of the
      // toolbar row — copyBtn itself on ChatGPT, the <copy-button> on Gemini.
      let cell = copyBtn;
      while (cell.parentElement && cell.parentElement !== toolbar) {
        cell = cell.parentElement;
      }
      if (cell.parentElement === toolbar) {
        toolbar.insertBefore(btn, cell.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }
    }
  }

  const observerRoot = adapter.getObserverRoot();
  let scanScheduled = false;
  new MutationObserver(() => {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      injectButtons();
    });
  }).observe(observerRoot, { childList: true, subtree: true });
  injectButtons();

  // ---------- Open / position the panel ----------

  async function openThread(messageEl, btn) {
    const messages = adapter.getMessages();
    anchorIndex = messages.findIndex((m) => m.el === messageEl);
    if (anchorIndex < 0) {
      const text = messageEl.innerText.trim();
      anchorIndex = messages.findIndex(
        (m) => m.role === "assistant" && m.text === text
      );
    }
    if (anchorIndex < 0) return;
    anchorMsg = messages[anchorIndex];

    applyTheme();
    thread = [];
    renderThread();

    panel.classList.remove("resized");
    panel.style.width = "";
    panel.style.height = "";
    panel.classList.add("open");
    positionPanel(messageEl, btn);
    updatePlaceholder();
    updateSendState();
    textarea.focus();
  }

  function positionPanel(messageEl, btn) {
    const msgRect = messageEl.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const W = Math.min(420, window.innerWidth * 0.92);
    const margin = 14;

    // Prefer the right of the answer, otherwise the left, otherwise below the button.
    let left;
    if (msgRect.right + margin + W <= window.innerWidth - 8) {
      left = msgRect.right + margin;
    } else if (msgRect.left - margin - W >= 8) {
      left = msgRect.left - margin - W;
    } else {
      left = Math.max(8, Math.min(btnRect.left, window.innerWidth - W - 8));
    }

    // Reserve the maximum possible panel height (max-height: 72vh), so a long
    // answer growing downward never pushes the panel off-screen. The top stays
    // fixed from here on – the panel only moves when the user drags it.
    const H = window.innerHeight * 0.72;
    let top = Math.max(8, Math.min(msgRect.top, window.innerHeight - H - 8));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  // ---------- Drag and resize the panel ----------

  const header = shadow.querySelector("#panel header");
  const VIEWPORT_MARGIN = 8;
  const MIN_PANEL_WIDTH = 300;
  let dragging = false;
  let dragDX = 0;
  let dragDY = 0;
  let resizing = null;

  function showInteractionShield(cursor) {
    interactionShield.style.cursor = cursor;
    interactionShield.style.display = "block";
  }

  function endPointerInteraction() {
    dragging = false;
    resizing = null;
    interactionShield.style.display = "none";
  }

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("#close")) return; // don't use the close button as a handle
    if (e.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    dragging = true;
    resizing = null;
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    showInteractionShield("default");
    e.preventDefault();
  });

  for (const handle of shadow.querySelectorAll("[data-resize]")) {
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      dragging = false;
      resizing = {
        edges: handle.dataset.resize,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        minHeight: Math.ceil(
          header.offsetHeight +
            form.offsetHeight +
            (panel.offsetHeight - panel.clientHeight)
        ),
      };
      panel.classList.add("resized");
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      showInteractionShield(getComputedStyle(handle).cursor);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  document.addEventListener("mousemove", (e) => {
    if (resizing) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const rightBoundary = window.innerWidth - VIEWPORT_MARGIN;
      const bottomBoundary = window.innerHeight - VIEWPORT_MARGIN;
      let left = resizing.left;
      let top = resizing.top;
      let width = resizing.width;
      let height = resizing.height;

      if (resizing.edges.includes("e")) {
        const maxWidth = Math.max(1, rightBoundary - resizing.left);
        const minWidth = Math.min(MIN_PANEL_WIDTH, maxWidth);
        width = Math.max(minWidth, Math.min(resizing.width + dx, maxWidth));
      }
      if (resizing.edges.includes("s")) {
        const maxHeight = Math.max(1, bottomBoundary - resizing.top);
        const minHeight = Math.min(resizing.minHeight, maxHeight);
        height = Math.max(minHeight, Math.min(resizing.height + dy, maxHeight));
      }
      if (resizing.edges.includes("w")) {
        const minWidth = Math.min(
          MIN_PANEL_WIDTH,
          Math.max(1, resizing.right - VIEWPORT_MARGIN)
        );
        left = Math.max(
          VIEWPORT_MARGIN,
          Math.min(resizing.left + dx, resizing.right - minWidth)
        );
        width = resizing.right - left;
      }
      if (resizing.edges.includes("n")) {
        const minHeight = Math.min(
          resizing.minHeight,
          Math.max(1, resizing.bottom - VIEWPORT_MARGIN)
        );
        top = Math.max(
          VIEWPORT_MARGIN,
          Math.min(resizing.top + dy, resizing.bottom - minHeight)
        );
        height = resizing.bottom - top;
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      return;
    }
    if (!dragging) return;
    const W = panel.offsetWidth;
    const H = panel.offsetHeight;
    const left = Math.max(8, Math.min(e.clientX - dragDX, window.innerWidth - W - 8));
    const top = Math.max(8, Math.min(e.clientY - dragDY, window.innerHeight - H - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  document.addEventListener("mouseup", endPointerInteraction);

  function clearThread() {
    thread = [];
    renderThread();
    textarea.value = "";
    autoGrow();
    updateSendState();
  }

  function closePanel() {
    endPointerInteraction();
    panel.classList.remove("open");
    clearThread();
    // Remove stale thread data from browser storage (API key etc. stays).
    browser.storage.local.get(null).then((all) => {
      const threadKeys = Object.keys(all).filter((k) => k.startsWith("threads:"));
      if (threadKeys.length) browser.storage.local.remove(threadKeys);
    });
  }

  shadow.getElementById("close").addEventListener("click", closePanel);

  // Keep the thread open until the user explicitly closes it or presses Escape.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel();
  });

  // Shield the thread input from the host page's global keyboard handlers.
  // ChatGPT (and others) install a capture-phase key listener on document that
  // focuses the main composer as soon as you type "outside" an input – and
  // because our textarea lives in a (retargeted) shadow DOM, the page thinks
  // you are typing outside and steals the focus on the very first keystroke.
  // A capture-phase listener on window runs *before* document's, so we stop the
  // event there for anything originating in our overlay. stopPropagation does
  // not cancel the default action, so text is still typed normally – but we now
  // have to handle Enter/Escape here, as the textarea's own keydown no longer
  // fires for these events.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!panel.classList.contains("open")) return;
      if (!e.composedPath().includes(host)) return;
      e.stopPropagation();

      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      } else if (
        e.key === "Tab" &&
        shadow.activeElement === textarea &&
        !commandSuggestion.hidden
      ) {
        e.preventDefault();
        textarea.value = "/clear";
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        autoGrow();
        updateSendState();
      } else if (
        e.key === "Enter" &&
        !e.shiftKey &&
        shadow.activeElement === textarea
      ) {
        // Enter sends, Shift+Enter inserts a line break.
        e.preventDefault();
        form.requestSubmit();
      }
    },
    true
  );

  // Also stop these in the capture phase, so pages that react to key
  // press / input on document don't see our typing either.
  for (const type of ["keypress", "keyup", "beforeinput"]) {
    window.addEventListener(
      type,
      (e) => {
        if (panel.classList.contains("open") && e.composedPath().includes(host))
          e.stopPropagation();
      },
      true
    );
  }

  // Grow the height to fit the content (up to max-height, after which the
  // textarea scrolls internally – without a visible scrollbar).
  function autoGrow() {
    textarea.style.height = "46px";
    if (textarea.scrollHeight > textarea.clientHeight) {
      const borderHeight = textarea.offsetHeight - textarea.clientHeight;
      textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
    }
    updatePlaceholder();
    updateCommandSuggestion();
  }

  // Gray out the send button while no text has been entered.
  function updateSendState() {
    sendBtn.disabled = textarea.value.trim() === "";
  }

  function updateCommandSuggestion() {
    const value = textarea.value;
    commandSuggestion.hidden = !(
      value.length > 0 && value !== "/clear" && "/clear".startsWith(value)
    );
  }

  textarea.addEventListener("input", () => {
    autoGrow();
    updateSendState();
  });

  // ---------- Render / send the thread ----------

  // Minimal, self-contained Markdown -> HTML renderer. A content script can't
  // load an external library (CSP), so this covers the constructs a chat reply
  // actually uses: headings, bold/italic, inline & fenced code, lists, block-
  // quotes, links and paragraphs. All raw text is HTML-escaped up front, so the
  // only markup produced is what this function emits.
  // ---------- LaTeX -> MathML ----------
  // A content script can't pull in KaTeX/MathJax (CSP) or ship font files, so
  // math is converted to native MathML, which Chrome and Firefox render without
  // any extra assets. This covers the constructs chat answers actually use:
  // fractions, roots, super/subscripts, sums/integrals with limits, Greek
  // letters, common operators, \left/\right delimiters and accents.
  const MATH_GREEK = {
    alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",
    varepsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",vartheta:"ϑ",
    iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",
    pi:"π",varpi:"ϖ",rho:"ρ",varrho:"ϱ",sigma:"σ",
    varsigma:"ς",tau:"τ",upsilon:"υ",phi:"φ",varphi:"ϕ",
    chi:"χ",psi:"ψ",omega:"ω",Gamma:"Γ",Delta:"Δ",
    Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",
    Upsilon:"Υ",Phi:"Φ",Psi:"Ψ",Omega:"Ω"
  };
  const MATH_OPS = {
    times:"×",div:"÷",cdot:"⋅",pm:"±",mp:"∓",ast:"∗",
    star:"⋆",circ:"∘",bullet:"∙",leq:"≤",le:"≤",
    geq:"≥",ge:"≥",neq:"≠",ne:"≠",equiv:"≡",sim:"∼",
    simeq:"≃",approx:"≈",cong:"≅",propto:"∝",ll:"≪",
    gg:"≫",prec:"≺",succ:"≻",infty:"∞",partial:"∂",
    nabla:"∇",forall:"∀",exists:"∃",nexists:"∄",in:"∈",
    notin:"∉",ni:"∋",subset:"⊂",subseteq:"⊆",supset:"⊃",
    supseteq:"⊇",cup:"∪",cap:"∩",emptyset:"∅",
    varnothing:"∅",setminus:"∖",to:"→",rightarrow:"→",
    Rightarrow:"⇒",leftarrow:"←",Leftarrow:"⇐",
    leftrightarrow:"↔",Leftrightarrow:"⇔",mapsto:"↦",
    implies:"⟹",iff:"⟺",ldots:"…",dots:"…",cdots:"⋯",
    vdots:"⋮",ddots:"⋱",angle:"∠",perp:"⊥",parallel:"∥",
    mid:"∣",wedge:"∧",land:"∧",vee:"∨",lor:"∨",
    neg:"¬",lnot:"¬",oplus:"⊕",ominus:"⊖",otimes:"⊗",
    odot:"⊙",prime:"′",deg:"°",hbar:"ℏ",ell:"ℓ",
    Re:"ℜ",Im:"ℑ",aleph:"ℵ",wp:"℘",langle:"⟨",
    rangle:"⟩",lfloor:"⌊",rfloor:"⌋",lceil:"⌈",rceil:"⌉",
    vert:"|",Vert:"‖",nmid:"∤",top:"⊤",bot:"⊥",
    sum:"∑",prod:"∏",coprod:"∐",int:"∫",oint:"∮",
    bigcup:"⋃",bigcap:"⋂",bigoplus:"⨁",bigotimes:"⨂",
    bigwedge:"⋀",bigvee:"⋁"
  };
  const MATH_BIG = new Set(["sum","prod","coprod","int","oint","bigcup","bigcap",
    "bigoplus","bigotimes","bigwedge","bigvee"]);
  const MATH_LIM = new Set(["lim","limsup","liminf","max","min","sup","inf",
    "det","gcd","Pr","argmax","argmin"]);
  const MATH_FUNC = new Set(["sin","cos","tan","cot","sec","csc","arcsin",
    "arccos","arctan","sinh","cosh","tanh","coth","log","ln","exp","deg","dim",
    "ker","hom","arg"]);
  const MATH_BB = {R:"ℝ",N:"ℕ",Z:"ℤ",Q:"ℚ",C:"ℂ",H:"ℍ",P:"ℙ"};
  const MATH_ACCENT = {hat:"^",widehat:"^",tilde:"~",
    widetilde:"~",bar:"¯",overline:"¯",vec:"→",dot:"˙",
    ddot:"¨",check:"ˇ",acute:"´",grave:"`",breve:"˘"};

  function latexToMathML(latex, display) {
    const escT = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tokens =
      latex.match(/\\[a-zA-Z]+|\\.|\s+|[{}^_&[\]]|[^\\{}^_&\s[\]]/g) || [];
    let pos = 0;
    let atomBig = false; // set when the atom just parsed takes under/over limits

    const peek = () => tokens[pos];
    const isSpace = (t) => t !== undefined && /^\s+$/.test(t);
    const skipSpace = () => {
      while (isSpace(peek())) pos++;
    };

    function mapSym(name) {
      if (MATH_GREEK[name]) return { mml: `<mi>${MATH_GREEK[name]}</mi>` };
      if (MATH_OPS[name]) {
        const big = MATH_BIG.has(name);
        if (big) atomBig = true;
        return { mml: `<mo>${escT(MATH_OPS[name])}</mo>`, big };
      }
      return null;
    }

    function delimiter() {
      skipSpace();
      const t = peek();
      if (t === undefined) return "";
      pos++;
      if (t === ".") return ""; // \left. / \right. => no delimiter
      let ch = t;
      if (t[0] === "\\") {
        const n = t.slice(1);
        ch = MATH_OPS[n] || n;
      }
      return `<mo>${escT(ch)}</mo>`;
    }

    function rawGroup() {
      skipSpace();
      if (peek() !== "{") {
        let t = tokens[pos++] || "";
        return t[0] === "\\" ? t.slice(1) : t;
      }
      pos++;
      let s = "";
      while (pos < tokens.length && peek() !== "}") {
        let t = tokens[pos++];
        s += t[0] === "\\" ? t.slice(1) : t;
      }
      if (peek() === "}") pos++;
      return s;
    }

    function charAtom(c) {
      if (/[0-9.]/.test(c)) return `<mn>${c}</mn>`;
      if (/[a-zA-Z]/.test(c)) return `<mi>${c}</mi>`;
      if (c === "-") return "<mo>−</mo>";
      return `<mo>${escT(c)}</mo>`;
    }

    function command(name) {
      // Spacing
      if (name === "," || name === ":" || name === ";" || name === " ")
        return '<mspace width="0.22em"></mspace>';
      if (name === "!") return '<mspace width="-0.17em"></mspace>';
      if (name === "quad") return '<mspace width="1em"></mspace>';
      if (name === "qquad") return '<mspace width="2em"></mspace>';
      if (name === "\\") return ""; // line break: ignore inline
      // Escaped literals
      if ("{}%#&$_".indexOf(name) >= 0)
        return name === "_" ? "<mo>_</mo>" : `<mo>${escT(name)}</mo>`;

      if (name === "frac" || name === "dfrac" || name === "tfrac")
        return `<mfrac>${arg()}${arg()}</mfrac>`;
      if (name === "binom")
        return `<mrow><mo>(</mo><mfrac linethickness="0">${arg()}${arg()}</mfrac><mo>)</mo></mrow>`;
      if (name === "sqrt") {
        skipSpace();
        if (peek() === "[") {
          pos++;
          const idx = parseSeq("]");
          return `<mroot>${arg()}<mrow>${idx}</mrow></mroot>`;
        }
        return `<msqrt>${arg()}</msqrt>`;
      }
      if (name === "text" || name === "textrm" || name === "mbox")
        return `<mtext>${escT(rawGroup())}</mtext>`;
      if (name === "mathrm" || name === "operatorname" || name === "mathsf")
        return `<mi mathvariant="normal">${escT(rawGroup())}</mi>`;
      if (name === "mathbf" || name === "boldsymbol" || name === "bm")
        return `<mi mathvariant="bold">${escT(rawGroup())}</mi>`;
      if (name === "mathit")
        return `<mi mathvariant="italic">${escT(rawGroup())}</mi>`;
      if (name === "mathbb") {
        const s = rawGroup();
        return [...s].map((c) => `<mi>${MATH_BB[c] || c}</mi>`).join("");
      }
      if (name === "mathcal" || name === "mathscr")
        return `<mi mathvariant="script">${escT(rawGroup())}</mi>`;
      if (MATH_ACCENT[name])
        return `<mover accent="true">${arg()}<mo>${escT(MATH_ACCENT[name])}</mo></mover>`;
      if (name === "left" || name === "right") return delimiter();
      if (name === "big" || name === "Big" || name === "bigg" || name === "Bigg")
        return delimiter();

      if (MATH_LIM.has(name)) {
        atomBig = true;
        return `<mo movablelimits="true">${name}</mo>`;
      }
      if (MATH_FUNC.has(name)) return `<mi>${name}</mi>`;

      const sym = mapSym(name);
      if (sym) return sym.mml;

      // Unknown command: render its name literally rather than dropping it.
      return `<mi>${escT(name)}</mi>`;
    }

    // Parse a single atom (one token, a braced group, or a command with args).
    function parseAtom() {
      skipSpace();
      const t = peek();
      if (t === undefined) return null;
      if (t === "}" || t === "]" || t === "&") return null;
      if (t === "^" || t === "_") return null;
      if (t === "{") {
        pos++;
        return `<mrow>${parseSeq("}")}</mrow>`;
      }
      pos++;
      if (t[0] === "\\") return command(t.slice(1));
      return charAtom(t);
    }

    // A script/argument: the next atom, mrow-wrapped so it's a single node.
    function arg() {
      atomBig = false;
      const a = parseAtom();
      return a == null ? "<mrow></mrow>" : a;
    }

    function applyScripts(base, sub, sup, big) {
      const under = big && display;
      if (sub != null && sup != null)
        return under
          ? `<munderover>${base}${sub}${sup}</munderover>`
          : `<msubsup>${base}${sub}${sup}</msubsup>`;
      if (sup != null)
        return under ? `<mover>${base}${sup}</mover>` : `<msup>${base}${sup}</msup>`;
      if (sub != null)
        return under ? `<munder>${base}${sub}</munder>` : `<msub>${base}${sub}</msub>`;
      return base;
    }

    // Parse a sequence of atoms up to `stop` (consumed) or end/closing brace.
    function parseSeq(stop) {
      let out = "";
      while (pos < tokens.length) {
        let t = peek();
        if (stop !== undefined && t === stop) {
          pos++;
          break;
        }
        if (t === "}") {
          pos++;
          break;
        }
        if (isSpace(t) || t === "&") {
          pos++;
          continue;
        }
        atomBig = false;
        let base = parseAtom();
        if (base == null) break;
        const big = atomBig;
        let sub = null,
          sup = null;
        for (;;) {
          skipSpace();
          const s = peek();
          if (s === "^") {
            pos++;
            sup = arg();
          } else if (s === "_") {
            pos++;
            sub = arg();
          } else break;
        }
        if (sub != null || sup != null) base = applyScripts(base, sub, sup, big);
        out += base;
      }
      return out;
    }

    const bodyMml = parseSeq();
    return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${
      display ? "block" : "inline"
    }"><mrow>${bodyMml}</mrow></math>`;
  }

  // Replace $..$, \[..\], \(..\) and $..$ with rendered MathML, leaving code
  // spans untouched. Placeholders (private-use chars) survive Markdown/escaping
  // and are swapped back for the MathML after the Markdown pass.
  const MATH_RE =
    /(`{2,}[\s\S]*?`{2,})|(`[^`]*`)|(\$\$[\s\S]+?\$\$)|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))|(\$(?![\s$])[^\n$]+?(?<![\s$])\$)/g;
  function protectMath(src, store) {
    return src.replace(MATH_RE, (m, fenced, code, dd, br, par, dol) => {
      if (fenced != null || code != null) return m;
      let latex,
        display = false;
      if (dd != null) {
        latex = dd.slice(2, -2);
        display = true;
      } else if (br != null) {
        latex = br.slice(2, -2);
        display = true;
      } else if (par != null) {
        latex = par.slice(2, -2);
      } else {
        latex = dol.slice(1, -1);
      }
      let mml;
      try {
        mml = latexToMathML(latex.trim(), display);
      } catch (e) {
        return m;
      }
      store.push(mml);
      return "" + (store.length - 1) + "";
    });
  }

  function renderMarkdown(src) {
    const mathStore = [];
    src = protectMath(src, mathStore);
    const esc = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const inline = (s) =>
      esc(s)
        .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
        .replace(/\b_([^_]+)_\b/g, "<em>$1</em>")
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          (_, t, u) =>
            `<a href="${u.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${t}</a>`
        );

    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    let listType = null; // "ul" | "ol"
    // Models occasionally emit two-backtick block fences. They are not strict
    // CommonMark, but treating a standalone pair like a fence is unambiguous
    // and avoids turning a whole multi-line answer into malformed inline code.
    const parseFence = (line) => {
      const match = line.match(/^ {0,3}(`{2,}|~{3,})([^\r\n]*)$/);
      if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
      const language = (match[2].trim().split(/\s+/, 1)[0] || "").replace(
        /[^\w.+#-]/g,
        ""
      );
      return { marker: match[1], language };
    };
    const closesFence = (line, marker) => {
      const candidate = line.replace(/^ {0,3}/, "").trimEnd();
      return (
        candidate.length >= marker.length &&
        [...candidate].every((char) => char === marker[0])
      );
    };
    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      const fence = parseFence(line);
      if (fence) {
        closeList();
        const body = [];
        i++;
        while (i < lines.length && !closesFence(lines[i], fence.marker)) {
          body.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing fence when present
        const languageClass = fence.language
          ? ` class="language-${fence.language}"`
          : "";
        out.push(`<pre><code${languageClass}>${esc(body.join("\n"))}</code></pre>`);
        continue;
      }

      // Heading
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        closeList();
        out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
        i++;
        continue;
      }

      // Unordered list item
      const ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) {
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push(`<li>${inline(ul[1])}</li>`);
        i++;
        continue;
      }

      // Ordered list item
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) {
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push(`<li>${inline(ol[1])}</li>`);
        i++;
        continue;
      }

      // Blank line
      if (line.trim() === "") {
        closeList();
        i++;
        continue;
      }

      // Paragraph: gather consecutive non-blank, non-special lines
      closeList();
      const para = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !parseFence(lines[i]) &&
        !/^#{1,6}\s/.test(lines[i]) &&
        !/^>\s?/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push(`<p>${inline(para.join("\n")).replace(/\n/g, "<br>")}</p>`);
    }
    closeList();
    let html = out.join("");
    if (mathStore.length) {
      html = html.replace(/[](\d+)[]/g, (_, n) => mathStore[+n] || "");
    }
    return html;
  }

  function renderThread() {
    threadBox.innerHTML = "";
    for (const m of thread) {
      const div = document.createElement("div");
      div.className = `msg ${m.role}`;
      if (m.role === "assistant") {
        div.classList.add("markdown");
        div.innerHTML = renderMarkdown(m.text);
      } else {
        div.textContent = m.text;
      }
      threadBox.appendChild(div);
    }
    threadBox.scrollTop = threadBox.scrollHeight;
  }

  // Outputs arrive from the API in one piece (no real streaming), so we fake a
  // live token stream: reveal the assistant text progressively, re-rendering
  // the markdown as it grows, with a blinking caret trailing the last chunk.
  function streamAssistant(div, fullText) {
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !fullText) {
      div.innerHTML = renderMarkdown(fullText);
      threadBox.scrollTop = threadBox.scrollHeight;
      return Promise.resolve();
    }

    const len = fullText.length;
    // Pace the reveal: quick for short replies, capped so long ones don't drag.
    const duration = Math.min(4000, Math.max(500, len * 7));

    return new Promise((resolve) => {
      div.classList.add("streaming");
      const start = performance.now();
      const stickToBottom = () =>
        threadBox.scrollHeight - threadBox.scrollTop - threadBox.clientHeight < 40;

      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        // Ease-out so the stream slows slightly as it finishes.
        const eased = 1 - Math.pow(1 - t, 2);
        const shown = Math.max(1, Math.round(eased * len));
        const atBottom = stickToBottom();
        div.innerHTML = renderMarkdown(fullText.slice(0, shown));
        if (atBottom) threadBox.scrollTop = threadBox.scrollHeight;
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          div.classList.remove("streaming");
          div.innerHTML = renderMarkdown(fullText);
          if (atBottom) threadBox.scrollTop = threadBox.scrollHeight;
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = textarea.value.trim();
    if (!question) return;
    if (question === "/clear") {
      clearThread();
      textarea.focus();
      return;
    }
    if (sendBtn.disabled) return;

    textarea.value = "";
    autoGrow();
    sendBtn.disabled = true;
    thread.push({ role: "user", text: question });
    renderThread();

    const pending = document.createElement("div");
    pending.className = "msg assistant pending";
    pending.setAttribute("role", "status");
    pending.setAttribute("aria-label", "Thinking …");
    pending.innerHTML = THINKING_SVG;
    threadBox.appendChild(pending);
    threadBox.scrollTop = threadBox.scrollHeight;

    // Context: main chat up to and including the anchored answer.
    const context = adapter
      .getMessages()
      .slice(0, anchorIndex + 1)
      .map((m) => ({ role: m.role, text: m.text }));

    let reply;
    // Firefox unloads the non-persistent background page when idle. The first
    // message after it wakes can fail with "Receiving end does not exist"
    // because the listener isn't ready yet – so retry a few times with a short
    // delay to give the background time to spin back up.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        reply = await browser.runtime.sendMessage({ type: "ask", context, thread });
        break;
      } catch (err) {
        const wakingUp = /Receiving end does not exist|establish connection/i.test(
          err.message || ""
        );
        if (wakingUp && attempt < 3) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        reply = { ok: false, error: err.message };
      }
    }
    if (!reply) {
      reply = {
        ok: false,
        error:
          "No response from the background process. Reload the extension at about:debugging, then reload this page.",
      };
    }

    pending.remove();
    if (reply.ok) {
      thread.push({ role: "assistant", text: reply.text });
      renderThread();
      // Fake a live stream into the freshly rendered assistant bubble.
      const bubble = threadBox.lastElementChild;
      if (bubble) {
        bubble.innerHTML = "";
        await streamAssistant(bubble, reply.text);
      }
    } else {
      thread.pop(); // don't keep a failed question
      renderThread();
      const err = document.createElement("div");
      err.className = "msg error";
      err.textContent = `Error: ${reply.error}`;
      threadBox.appendChild(err);
      threadBox.scrollTop = threadBox.scrollHeight;
      textarea.value = question;
      autoGrow();
    }
    updateSendState();
    textarea.focus();
  });

})();
