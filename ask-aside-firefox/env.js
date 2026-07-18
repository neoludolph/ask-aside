// Optional `.env` configuration.
//
// Browser extensions can't read files off disk at runtime, but they *can*
// fetch files bundled inside the extension folder. So if a `.env` file ships
// alongside the extension, we read it here and translate it into the same
// settings the options page uses. This lets you configure the extension once
// (e.g. from a checked-out repo) without opening the options UI on every
// browser profile.
//
// Precedence: values saved via the options page (chrome.storage.local) always
// win; `.env` only fills in what storage doesn't provide.

const ENV_KEY_MAP = {
  ASKASIDE_PROVIDER: "provider",
  ANTHROPIC_API_KEY: "apiKey",
  OPENROUTER_API_KEY: "openrouterKey",
  OPENROUTER_MODEL: "openrouterModel",
  OPENROUTER_BASE_URL: "openrouterBaseUrl",
};

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Read the bundled `.env` (if any) and map it onto settings keys.
async function loadEnvSettings() {
  try {
    const res = await fetch(chrome.runtime.getURL(".env"));
    if (!res.ok) return {};
    const env = parseEnv(await res.text());
    const settings = {};
    for (const [envKey, settingKey] of Object.entries(ENV_KEY_MAP)) {
      if (env[envKey] != null && env[envKey] !== "") {
        settings[settingKey] = env[envKey];
      }
    }
    return settings;
  } catch (e) {
    return {}; // no `.env` bundled, or not readable
  }
}

// Merge stored settings over `.env` defaults (storage wins) for the given keys.
async function loadSettings(keys) {
  const [env, stored] = await Promise.all([
    loadEnvSettings(),
    chrome.storage.local.get(keys),
  ]);
  const merged = { ...env };
  for (const k of keys) {
    if (stored[k] != null && stored[k] !== "") merged[k] = stored[k];
  }
  return merged;
}

self.AskAsideEnv = { loadEnvSettings, loadSettings };
