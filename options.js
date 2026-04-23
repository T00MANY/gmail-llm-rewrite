const $ = (id) => document.getElementById(id);
const DEFAULTS = {
  apiKey: '',
  baseUrl: 'https://api.minimax.io/v1',
  model: 'MiniMax-M2.7',
  defaultTone: 'professional',
};

function setStatus(text, isError = false) {
  const s = $('status');
  s.textContent = text;
  s.classList.toggle('err', isError);
  if (text) setTimeout(() => { s.textContent = ''; s.classList.remove('err'); }, 4000);
}

function load() {
  chrome.storage.local.get(DEFAULTS, (d) => {
    $('apiKey').value = d.apiKey;
    $('baseUrl').value = d.baseUrl;
    $('model').value = d.model;
    $('defaultTone').value = d.defaultTone;
  });
}

function save() {
  const cfg = {
    apiKey: $('apiKey').value.trim(),
    baseUrl: $('baseUrl').value.trim() || DEFAULTS.baseUrl,
    model: $('model').value.trim() || DEFAULTS.model,
    defaultTone: $('defaultTone').value,
  };
  chrome.storage.local.set(cfg, () => setStatus('Zapisano ✓'));
}

async function testConnection() {
  const apiKey = $('apiKey').value.trim();
  const baseUrl = ($('baseUrl').value.trim() || DEFAULTS.baseUrl).replace(/\/+$/, '');
  const model = $('model').value.trim() || DEFAULTS.model;
  if (!apiKey) { setStatus('Brak klucza API', true); return; }
  setStatus('Testuję…');
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Reply with OK only.' },
          { role: 'user', content: 'ping' },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });
    const text = await resp.text();
    if (!resp.ok) { setStatus(`Błąd ${resp.status}: ${text.slice(0, 120)}`, true); return; }
    setStatus('Połączenie OK ✓');
  } catch (err) {
    setStatus('Błąd: ' + (err.message || err), true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('save').addEventListener('click', save);
  $('test').addEventListener('click', testConnection);
});
