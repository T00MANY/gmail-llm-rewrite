const TONES = {
  professional: 'formalny biznesowy — uprzejmy, rzeczowy, bez zbędnej kurtuazji',
  direct: 'bezpośredni — konkretny, krótki, bez lania wody',
  friendly: 'przyjazny — ciepły ale profesjonalny, z naturalnym językiem',
  apologetic: 'przepraszający — empatyczny, uznaje problem, proponuje rozwiązanie',
};

function buildSystemPrompt(tone, hasDraft) {
  const toneDesc = TONES[tone] || TONES.professional;
  const task = hasDraft
    ? `Przekształcasz szkic odpowiedzi w dopracowaną, profesjonalną wiadomość.`
    : `Piszesz krótką, profesjonalną odpowiedź na otrzymaną wiadomość.`;

  const rules = hasDraft
    ? [
        '- Zachowaj intencję i treść autora. NIE wymyślaj faktów, dat, kwot, zobowiązań, cen ani ustaleń, których nie ma w szkicu.',
        '- Jeśli dołączona jest poprzednia wiadomość — odnieś się do niej, ale tylko w ramach tego, co autor napisał w szkicu.',
      ]
    : [
        '- Odpowiedz rzeczowo, krótko, w duchu dobrej obsługi klienta / profesjonalnej korespondencji biznesowej.',
        '- NIE wymyślaj faktów, ustaleń, kwot, terminów, których nie ma w otrzymanej wiadomości. Jeśli wymagana jest decyzja/informacja której nie znasz — napisz, że zweryfikujesz i wrócisz z odpowiedzią.',
        '- Odpowiedz na konkretne pytania/prośby zawarte w wiadomości.',
      ];

  const lang = hasDraft
    ? '- Odpowiedz w tym samym języku co szkic (wykryj automatycznie).'
    : '- Odpowiedz w tym samym języku co otrzymana wiadomość (wykryj automatycznie).';

  return `Jesteś asystentem e-mailowym. ${task}

Zasady:
${rules.join('\n')}
- Dostosuj ton: ${toneDesc}.
${lang}
- Zwróć WYŁĄCZNIE treść wiadomości. Bez nagłówków typu "Temat:", bez podpisu (Gmail doda automatycznie), bez cudzysłowów wokół całości, bez komentarzy typu "Oto odpowiedź:".
- Możesz zacząć krótkim powitaniem ("Dzień dobry,"/"Hello,") i zakończyć krótkim zwrotem ("Pozdrawiam,"/"Best regards,") — ale bez wpisywania nazwiska.
- Akapity rozdzielaj pustą linią. Krótkie, naturalne zdania.`;
}

function buildUserMessage({ draft, subject, threadContext }) {
  const hasDraft = !!(draft && draft.trim());
  let s = '';
  if (subject) s += `Temat wątku: ${subject}\n\n`;
  if (threadContext) {
    s += `=== OTRZYMANA WIADOMOŚĆ (do której odpowiadam) ===\n${threadContext}\n=== KONIEC ===\n\n`;
  }
  if (hasDraft) {
    s += `=== MÓJ SZKIC ODPOWIEDZI (do poprawy) ===\n${draft}\n=== KONIEC SZKICU ===`;
  } else {
    s += `Brak szkicu — napisz proszę propozycję odpowiedzi.`;
  }
  return s;
}

function cleanResponse(content) {
  let t = content || '';
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/^\s*(?:oto|here is|here's)[^\n]*:\s*/i, '');
  t = t.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('„') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

async function callMiniMax({ apiKey, baseUrl, model, systemPrompt, userMessage }) {
  const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${bodyText.slice(0, 300)}`);
  }
  let data;
  try { data = JSON.parse(bodyText); } catch { throw new Error(`Nieparsowalna odpowiedź: ${bodyText.slice(0, 200)}`); }
  const content = data?.choices?.[0]?.message?.content ?? '';
  const cleaned = cleanResponse(content);
  if (!cleaned) throw new Error('Pusta odpowiedź z modelu');
  return cleaned;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'rewrite') return;
  (async () => {
    try {
      const cfg = await chrome.storage.local.get({
        apiKey: '',
        baseUrl: 'https://api.minimax.io/v1',
        model: 'MiniMax-M2.5',
      });
      if (!cfg.apiKey) {
        sendResponse({ error: 'Brak klucza API. Kliknij ikonę rozszerzenia → Opcje.' });
        return;
      }
      const hasDraft = !!(msg.draft && msg.draft.trim());
      const text = await callMiniMax({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        systemPrompt: buildSystemPrompt(msg.tone, hasDraft),
        userMessage: buildUserMessage(msg),
      });
      sendResponse({ text });
    } catch (err) {
      sendResponse({ error: err?.message || String(err) });
    }
  })();
  return true;
});
