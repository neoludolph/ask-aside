const providerSel = document.getElementById("provider");
const anthropicFields = document.getElementById("anthropic-fields");
const openrouterFields = document.getElementById("openrouter-fields");
const keyInput = document.getElementById("key");
const orKeyInput = document.getElementById("or-key");
const orModelInput = document.getElementById("or-model");
const orBaseInput = document.getElementById("or-base");
const status = document.getElementById("status");

function updateVisibility() {
  const or = providerSel.value === "openrouter";
  anthropicFields.classList.toggle("hidden", or);
  openrouterFields.classList.toggle("hidden", !or);
}

providerSel.addEventListener("change", updateVisibility);

browser.storage.local
  .get(["provider", "apiKey", "openrouterKey", "openrouterModel", "openrouterBaseUrl"])
  .then((s) => {
    providerSel.value = s.provider || "anthropic";
    if (s.apiKey) keyInput.value = s.apiKey;
    if (s.openrouterKey) orKeyInput.value = s.openrouterKey;
    if (s.openrouterModel) orModelInput.value = s.openrouterModel;
    if (s.openrouterBaseUrl) orBaseInput.value = s.openrouterBaseUrl;
    updateVisibility();
  });

document.getElementById("save").addEventListener("click", async () => {
  await browser.storage.local.set({
    provider: providerSel.value,
    apiKey: keyInput.value.trim(),
    openrouterKey: orKeyInput.value.trim(),
    openrouterModel: orModelInput.value.trim(),
    openrouterBaseUrl: orBaseInput.value.trim(),
  });
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 2000);
});
