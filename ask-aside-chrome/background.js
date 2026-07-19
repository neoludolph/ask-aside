// Service worker: receives follow-up questions from the content script and
// answers them either via the Claude API (directly) or OpenRouter.
// Runs in the background so the API key never reaches the page context and
// CORS is a non-issue (host_permissions cover both endpoints).

try {
  // Chrome service worker: pull in the `.env` helper.
  importScripts("env.js");
} catch (e) {
  // Firefox loads env.js via the manifest `scripts` array instead.
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-4-8";
const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";

const SYSTEM_PROMPT = `You answer follow-up questions about a specific answer from an
AI chat the user is having with another assistant. You receive the prior
conversation up to and including the answer the follow-up refers to. Ground your
response in exactly that answer and the conversation before it. Always answer in
the same language as the user's current follow-up question. For the first turn,
use the language of the text after "Follow-up:", not the language of the quoted
conversation. If the question has no discernible language, use the language of
the preceding follow-up. Answer clearly and in a way that helps the user learn,
without continuing the main chat. When a follow-up includes a selected passage,
focus that turn on the passage while using the full conversation for context. A
later follow-up without a selected passage refers to the whole last assistant
answer; do not retroactively change the focus of earlier turns.`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "ask") return;
  handleAsk(msg).then(sendResponse);
  return true; // async response
});

async function handleAsk({ context, thread }) {
  const settings = await AskAsideEnv.loadSettings([
    "provider",
    "apiKey",
    "openrouterKey",
    "openrouterModel",
    "openrouterBaseUrl",
  ]);
  const provider = settings.provider || "anthropic";

  // Pack the main-chat context as a transcript into the first user message,
  // then the thread turns as a real conversation.
  const transcript = context
    .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`)
    .join("\n\n");

  const serializeUserTurn = (turn) => {
    const passage =
      typeof turn.selectedPassage === "string" && turn.selectedPassage.trim()
        ? turn.selectedPassage
        : null;
    const focus = passage
      ? `This follow-up specifically refers to the following selected passage ` +
        `from the last assistant answer:\nSelected passage: ${JSON.stringify(passage)}\n\n`
      : "";
    return `${focus}Follow-up: ${turn.text}`;
  };

  const [firstQuestion, ...rest] = thread;
  const messages = [
    {
      role: "user",
      content:
        `<conversation>\n${transcript}\n</conversation>\n\n` +
        `The follow-up refers to the last assistant answer in the conversation.\n\n` +
        serializeUserTurn(firstQuestion),
    },
    ...rest.map((m) => ({
      role: m.role,
      content: m.role === "user" ? serializeUserTurn(m) : m.text,
    })),
  ];

  try {
    return provider === "openrouter"
      ? await askOpenRouter(settings, messages)
      : await askAnthropic(settings, messages);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function askAnthropic({ apiKey }, messages) {
  if (!apiKey) {
    return {
      ok: false,
      error: "No Anthropic API key set. Open the extension's options.",
    };
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, error: data.error?.message || `HTTP ${res.status}` };
  }
  if (data.stop_reason === "refusal") {
    return { ok: false, error: "The request was declined for safety reasons." };
  }
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { ok: true, text };
}

async function askOpenRouter(
  { openrouterKey, openrouterModel, openrouterBaseUrl },
  messages
) {
  if (!openrouterKey) {
    return {
      ok: false,
      error: "No OpenRouter API key set. Open the extension's options.",
    };
  }
  if (!openrouterModel) {
    return {
      ok: false,
      error:
        "No OpenRouter model specified. Enter a model ID in the options (see openrouter.ai/models).",
    };
  }
  if (/^https?:\/\//i.test(openrouterModel)) {
    return {
      ok: false,
      error:
        "The model field contains a URL. It should hold a model ID (e.g. anthropic/claude-sonnet-4.5); the base URL has its own field in the options.",
    };
  }
  const base = (openrouterBaseUrl || OPENROUTER_DEFAULT_BASE).replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openrouterKey}`,
      // Optional attribution headers for OpenRouter:
      "HTTP-Referer": "https://github.com/askaside",
      "X-Title": "AskAside",
    },
    body: JSON.stringify({
      model: openrouterModel,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return {
      ok: false,
      error: data.error?.message || `HTTP ${res.status}`,
    };
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return { ok: false, error: "Empty response from OpenRouter." };
  }
  return { ok: true, text };
}
