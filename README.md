# Gmail LLM Rewrite

Chrome extension that rewrites your Gmail draft — or generates a reply from scratch — using MiniMax or any OpenAI-compatible LLM endpoint.

Adds a native-looking **✨ Popraw ▾** button next to **Send** in Gmail's compose toolbar. One click polishes your draft into a professional message; picks up thread context automatically.

![Button in Gmail toolbar](https://via.placeholder.com/640x120?text=Send+%E2%9C%A8+Popraw+%E2%96%BE)

## Features

- **Polish a draft** → LLM rewrites while keeping your intent. It won't invent facts, dates, prices, or commitments that aren't in the draft.
- **No draft, just thread** → LLM writes a reply from scratch based on the last message in the thread.
- **4 tones** — *Formal*, *Direct*, *Friendly*, *Apologetic* — pick from dropdown or set a default.
- **Native look** — the button clones computed style from Gmail's Send (height, padding, radius, color, font). Looks like part of Gmail.
- **Auto-detect language** — reply comes back in the same language as the thread (PL / EN / DE / CS / …).
- **Thread-aware** — reads the last rendered message even when Gmail has collapsed the quote.
- **Preserves signature** — your Gmail signature stays untouched.
- **Keyboard shortcut** — `Alt+R` while cursor is in the reply body.
- **Privacy** — API key sits in `chrome.storage.local` (local to this profile, not synced via Google). Requests go **directly** from the extension's service worker to the LLM provider. No middle server.

## Installation

```bash
git clone https://github.com/T00MANY/gmail-llm-rewrite.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and pick the cloned folder
4. Click the extension icon in the toolbar → **Options**
5. Paste your API key → click **Test connection** → **Save**

## Configuration

| Field | Default | Notes |
|-------|---------|-------|
| API key | *(empty)* | Required. Never leaves your browser except to call the LLM endpoint. |
| Endpoint | `https://api.minimax.io/v1` | Any OpenAI-compatible `/chat/completions` base URL |
| Model | `MiniMax-M2.5` | Any chat model available at the endpoint |
| Default tone | Formal | Used when you click the main button without opening the menu |

### Using providers other than MiniMax

The extension speaks the OpenAI chat-completions format, so any compatible endpoint works:

| Provider | Base URL | Example model |
|---|---|---|
| **MiniMax** (default) | `https://api.minimax.io/v1` | `MiniMax-M2.5` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

For local endpoints, add the URL to `host_permissions` in `manifest.json` and reload the extension.

## Usage

Open any email thread → click **Reply** → type (or don't).

- Click **✨ Popraw** — rewrite with your default tone
- Click **▾** — pick a specific tone for this message
- `Alt+R` — rewrite with default tone (cursor must be in the reply field)

You'll get a loading state on the button (`⏳ Formalny…`), then the draft is replaced with the LLM's version. Signature and quoted content are preserved.

## How it works

```
Gmail compose
     │
     ▼
 content.js  ─── extract draft + subject + thread context
     │
     ▼
chrome.runtime.sendMessage
     │
     ▼
background.js (service worker)
     │
     ▼
  LLM endpoint  ── /chat/completions
     │
     ▼
  cleaned response ─── back into editor via safe DOM APIs
```

1. `content.js` watches for Gmail's compose panel and walks up the DOM from the editor (`[contenteditable="true"][aria-label="Message Body"]`) to find Send. It then injects a split button that clones Send's computed style.
2. On click, it extracts the draft text (minus signature and quoted content) and the last message in the thread (handling Gmail's collapsed-quote case by rendering a clone off-screen).
3. `background.js` sends the request to the LLM endpoint. Doing this in the service worker avoids CORS issues that would hit a direct fetch from `mail.google.com`.
4. The response is cleaned — MiniMax-M2.5 wraps reasoning in `<think>...</think>` which gets stripped, plus leading *"Here is the polished version:"*-style prefixes.
5. The editor content is rewritten with `textContent` + `createElement` (no `innerHTML`), preserving the Gmail signature and the quoted part below.

## Privacy

- API key stored in `chrome.storage.local` — local to this Chrome profile, **not** synced via Google's account sync.
- Network requests go **directly** from the extension's service worker to the configured LLM endpoint. No relay, no backend, no telemetry.
- The extension reads content only inside `mail.google.com` compose areas. It never sends anything unless you click the button.
- The LLM provider sees: your draft, the subject, and up to 4000 chars of the last thread message. No email metadata, no addresses, no headers.

## Development

```
.
├── manifest.json     # MV3 manifest
├── content.js        # Button injection + DOM extraction/replacement
├── background.js     # Service worker: LLM fetch + response cleanup
├── options.html      # Settings page
├── options.js
└── .gitignore
```

After editing:

1. `chrome://extensions` → reload icon on the extension tile
2. `Ctrl+Shift+R` on the Gmail tab (content scripts otherwise stay cached)

**Debugging:**

- F12 → Console on Gmail — look for logs prefixed `[gmail-llm]`
- `__gmailLlmDiag()` in Gmail's console — lists detected compose editors and whether the Send button was found
- `chrome://extensions` → *Inspect views: service worker* under the extension — for errors in `background.js`

## Tone definitions

System prompts live in `background.js`. Current tones:

- **Formal** — uprzejmy, rzeczowy, bez zbędnej kurtuazji *(polite, matter-of-fact, no unnecessary flourishes)*
- **Direct** — konkretny, krótki, bez lania wody *(specific, short, no filler)*
- **Friendly** — ciepły ale profesjonalny *(warm but professional)*
- **Apologetic** — empatyczny, uznaje problem, proponuje rozwiązanie *(empathic, acknowledges the issue, offers a path forward)*

Add more by extending `TONES` in `background.js` and `TONE_LABELS` in `content.js`.

## License

MIT
