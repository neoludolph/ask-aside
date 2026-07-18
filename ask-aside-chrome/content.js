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

      #panel header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border);
        font-weight: 600;
        cursor: move;
        user-select: none;
      }
      #close {
        border: none; background: none; font-size: 16px; cursor: pointer;
        color: var(--muted); border-radius: 6px; padding: 2px 7px;
      }
      #close:hover { background: var(--bubble-ai); color: var(--fg); }

      #thread {
        flex: 1; overflow-y: auto; padding: 12px 14px;
        scrollbar-width: none;
      }
      #thread:empty { display: none; }
      #thread::-webkit-scrollbar { display: none; }
      .msg { margin-bottom: 10px; padding: 8px 11px; border-radius: 12px; white-space: pre-wrap; line-height: 1.45; }
      .msg.user { background: var(--bubble-user); margin-left: 36px; }
      .msg.assistant { background: var(--bubble-ai); margin-right: 18px; }
      .msg.pending { color: var(--muted); font-style: italic; }
      .msg.error { background: var(--error-bg); color: var(--error-fg); }

      form { padding: 10px 14px; border-top: 1px solid var(--border); flex-shrink: 0; }
      .input-wrap { position: relative; display: flex; }
      textarea {
        flex: 1; resize: none;
        min-height: 56px; max-height: 180px;
        padding: 8px 46px 8px 8px; font-size: 14px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--bg); color: var(--fg);
        outline: none;
        overflow-y: auto; scrollbar-width: none;
      }
      textarea::-webkit-scrollbar { display: none; }
      textarea:focus { border-color: var(--accent); }
      form button {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        width: 30px; height: 30px; padding: 0;
        display: flex; align-items: center; justify-content: center;
        border: none; border-radius: 8px;
        background: var(--accent); color: var(--accent-fg);
        font-size: 17px; line-height: 1; cursor: pointer;
      }
      form button:disabled { opacity: .5; cursor: default; }
    </style>
    <div id="panel">
      <header><span>Follow-up thread</span><button id="close" title="Close">✕</button></header>
      <div id="thread"></div>
      <form>
        <div class="input-wrap">
          <textarea placeholder="Your follow-up about this answer … (Enter to send)"></textarea>
          <button type="submit" aria-label="Send" title="Send" disabled>↑</button>
        </div>
      </form>
    </div>
  `;

  const panel = shadow.getElementById("panel");
  const threadBox = shadow.getElementById("thread");
  const form = shadow.querySelector("form");
  const textarea = shadow.querySelector("textarea");
  const sendBtn = form.querySelector("button");

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

    panel.classList.add("open");
    positionPanel(messageEl, btn);
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

  // ---------- Drag the panel by its header ----------

  const header = shadow.querySelector("#panel header");
  let dragging = false;
  let dragDX = 0;
  let dragDY = 0;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("#close")) return; // don't use the close button as a handle
    const rect = panel.getBoundingClientRect();
    dragging = true;
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const W = panel.offsetWidth;
    const H = panel.offsetHeight;
    const left = Math.max(8, Math.min(e.clientX - dragDX, window.innerWidth - W - 8));
    const top = Math.max(8, Math.min(e.clientY - dragDY, window.innerHeight - H - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  function closePanel() {
    panel.classList.remove("open");
    thread = [];
    threadBox.innerHTML = "";
    textarea.value = "";
    autoGrow();
    // Remove stale thread data from browser storage (API key etc. stays).
    chrome.storage.local.get(null).then((all) => {
      const threadKeys = Object.keys(all).filter((k) => k.startsWith("threads:"));
      if (threadKeys.length) chrome.storage.local.remove(threadKeys);
    });
  }

  shadow.getElementById("close").addEventListener("click", closePanel);

  // Clicking outside or Escape closes the box.
  document.addEventListener("mousedown", (e) => {
    if (panel.classList.contains("open") && !host.contains(e.target)) closePanel();
  });
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
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // Gray out the send button while no text has been entered.
  function updateSendState() {
    sendBtn.disabled = textarea.value.trim() === "";
  }

  textarea.addEventListener("input", () => {
    autoGrow();
    updateSendState();
  });

  // ---------- Render / send the thread ----------

  function renderThread() {
    threadBox.innerHTML = "";
    for (const m of thread) {
      const div = document.createElement("div");
      div.className = `msg ${m.role}`;
      div.textContent = m.text;
      threadBox.appendChild(div);
    }
    threadBox.scrollTop = threadBox.scrollHeight;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = textarea.value.trim();
    if (!question || sendBtn.disabled) return;

    textarea.value = "";
    autoGrow();
    sendBtn.disabled = true;
    thread.push({ role: "user", text: question });
    renderThread();

    const pending = document.createElement("div");
    pending.className = "msg assistant pending";
    pending.textContent = "Thinking …";
    threadBox.appendChild(pending);
    threadBox.scrollTop = threadBox.scrollHeight;

    // Context: main chat up to and including the anchored answer.
    const context = adapter
      .getMessages()
      .slice(0, anchorIndex + 1)
      .map((m) => ({ role: m.role, text: m.text }));

    let reply;
    try {
      reply = await chrome.runtime.sendMessage({ type: "ask", context, thread });
    } catch (err) {
      reply = { ok: false, error: err.message };
    }
    if (!reply) {
      reply = {
        ok: false,
        error:
          "No response from the background process. Reload the extension at chrome://extensions, then reload this page.",
      };
    }

    pending.remove();
    if (reply.ok) {
      thread.push({ role: "assistant", text: reply.text });
      renderThread();
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
