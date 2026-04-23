(() => {
  const LOG = (...a) => console.log('[gmail-llm]', ...a);
  const WARN = (...a) => console.warn('[gmail-llm]', ...a);
  const INJECTED_ATTR = 'data-llm-rewrite-injected';

  const SEND_WORDS = ['send', 'wyślij', 'wyslij', 'senden', 'odeslat', 'odoslať', 'odoslat', 'envoyer', 'inviar', 'enviar', 'invia'];
  const SCHEDULE_WORDS = ['schedule', 'planuj', 'zaplanuj', 'planen', 'später'];

  const TONE_LABELS = {
    professional: 'Formalny',
    direct: 'Bezpośredni',
    friendly: 'Przyjazny',
    apologetic: 'Przepraszam',
  };

  LOG('content script loaded', location.href);

  function firstLabelWord(el) {
    const raw = ((el.getAttribute('data-tooltip') || '') + ' ' + (el.getAttribute('aria-label') || '')).trim().toLowerCase();
    if (!raw) return '';
    return raw.split(/[\s(（]/, 1)[0] || '';
  }

  function findSendButtonIn(root) {
    const candidates = root.querySelectorAll('[role="button"]');
    for (const el of candidates) {
      const label = ((el.getAttribute('data-tooltip') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      if (!label.trim()) continue;
      if (SCHEDULE_WORDS.some(w => label.includes(w))) continue;
      const first = firstLabelWord(el);
      if (SEND_WORDS.includes(first)) return el;
    }
    return null;
  }

  function findComposeCtx(editor) {
    let el = editor;
    while (el && el !== document.body) {
      const sendBtn = findSendButtonIn(el);
      if (sendBtn) return { container: el, sendBtn };
      el = el.parentElement;
    }
    return null;
  }

  function findEditors() {
    const sel = [
      'div[aria-label="Message Body"][contenteditable="true"]',
      'div[aria-label="Treść wiadomości"][contenteditable="true"]',
      'div[g_editable="true"][contenteditable="true"]',
    ].join(',');
    return document.querySelectorAll(sel);
  }

  function cloneStyleFrom(sendBtn) {
    const cs = window.getComputedStyle(sendBtn);
    return {
      height: cs.height,
      minHeight: cs.minHeight,
      padding: cs.padding,
      borderRadius: cs.borderRadius,
      background: cs.backgroundColor,
      color: cs.color,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      boxShadow: cs.boxShadow,
      textTransform: cs.textTransform,
      marginLeft: cs.marginLeft,
      marginRight: cs.marginRight,
    };
  }

  function makeSplitButton(sendBtn) {
    const s = cloneStyleFrom(sendBtn);

    const wrap = document.createElement('span');
    wrap.className = 'llm-rewrite-wrap';
    Object.assign(wrap.style, {
      display: 'inline-flex',
      alignItems: 'stretch',
      verticalAlign: 'middle',
      margin: '0',
      background: s.background,
      color: s.color,
      borderRadius: s.borderRadius,
      borderTopLeftRadius: '0',
      borderBottomLeftRadius: '0',
      overflow: 'hidden',
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      letterSpacing: s.letterSpacing,
      lineHeight: s.lineHeight,
      textTransform: s.textTransform,
      boxShadow: s.boxShadow,
      userSelect: 'none',
      height: s.height,
      minHeight: s.minHeight,
      boxSizing: 'border-box',
    });

    const horiz = (s.padding || '0px').split(' ').slice(-1)[0] || '16px';
    const vert = (s.padding || '0px').split(' ')[0] || '0px';

    const main = document.createElement('div');
    main.setAttribute('role', 'button');
    main.setAttribute('tabindex', '0');
    main.className = 'llm-rewrite-main';
    main.textContent = '✨ Popraw';
    Object.assign(main.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: `${vert} 10px ${vert} ${horiz}`,
      cursor: 'pointer',
      transition: 'background 0.12s',
    });

    const caret = document.createElement('div');
    caret.setAttribute('role', 'button');
    caret.setAttribute('tabindex', '0');
    caret.className = 'llm-rewrite-caret';
    caret.textContent = '▾';
    Object.assign(caret.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: `${vert} ${horiz} ${vert} 6px`,
      cursor: 'pointer',
      fontSize: '11px',
      transition: 'background 0.12s',
    });

    const hoverOn = (el) => () => { el.style.background = 'rgba(0,0,0,0.14)'; };
    const hoverOff = (el) => () => { el.style.background = ''; };
    main.addEventListener('mouseenter', hoverOn(main));
    main.addEventListener('mouseleave', hoverOff(main));
    caret.addEventListener('mouseenter', hoverOn(caret));
    caret.addEventListener('mouseleave', hoverOff(caret));

    wrap.appendChild(main);
    wrap.appendChild(caret);
    return { wrap, main, caret };
  }

  function injectInto(editor) {
    if (editor.getAttribute(INJECTED_ATTR)) return;

    const ctx = findComposeCtx(editor);
    if (ctx) {
      editor.setAttribute(INJECTED_ATTR, '1');
      attachToToolbar(editor, ctx);
      LOG('button attached to toolbar');
      return;
    }

    // Fallback — send button not found; attach floating button near the editor
    editor.setAttribute(INJECTED_ATTR, 'floating');
    attachFloating(editor);
    WARN('send button not found — using floating fallback for this editor');
  }

  function attachToToolbar(editor, { container, sendBtn }) {
    const { wrap, main, caret } = makeSplitButton(sendBtn);
    wireButtons(editor, container, main, caret);
    sendBtn.parentElement.insertBefore(wrap, sendBtn.nextSibling);
  }

  function attachFloating(editor) {
    const container = editor.closest('[role="dialog"]') || editor.closest('form') || editor.closest('table') || editor.parentElement || document.body;
    const fakeSendBtn = document.createElement('div');
    fakeSendBtn.style.cssText = 'height:36px; padding:0 24px; border-radius:18px; background:#1a73e8; color:#fff; font:500 14px "Google Sans",Roboto,Arial,sans-serif;';
    document.body.appendChild(fakeSendBtn);
    const { wrap, main, caret } = makeSplitButton(fakeSendBtn);
    fakeSendBtn.remove();
    wrap.style.position = 'absolute';
    wrap.style.zIndex = '9999';
    wrap.style.margin = '0';
    wireButtons(editor, container, main, caret);

    const reposition = () => {
      const r = editor.getBoundingClientRect();
      wrap.style.left = `${window.scrollX + r.right - 180}px`;
      wrap.style.top = `${window.scrollY + r.top - 40}px`;
    };
    document.body.appendChild(wrap);
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    const observer = new MutationObserver(reposition);
    observer.observe(editor, { attributes: true, childList: true, subtree: true });
  }

  function wireButtons(editor, container, main, caret) {
    main.addEventListener('click', async () => {
      const { defaultTone = 'professional' } = await chrome.storage.local.get({ defaultTone: 'professional' });
      runRewrite(editor, container, main, defaultTone);
    });
    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      showToneMenu(caret, (tone) => runRewrite(editor, container, main, tone));
    });
  }

  function showToneMenu(anchor, onPick) {
    document.querySelectorAll('.llm-rewrite-menu').forEach(n => n.remove());
    const menu = document.createElement('div');
    menu.className = 'llm-rewrite-menu';
    menu.style.cssText = `
      position: fixed; z-index: 2147483647;
      background: #fff; border: 1px solid #dadce0; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: 'Google Sans', Roboto, Arial, sans-serif; font-size: 13px;
      min-width: 160px; padding: 6px 0;
    `;
    Object.entries(TONE_LABELS).forEach(([key, label]) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.cssText = 'padding: 8px 14px; cursor: pointer; color: #202124;';
      item.addEventListener('mouseenter', () => { item.style.background = '#f1f3f4'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => { menu.remove(); onPick(key); });
      menu.appendChild(item);
    });
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - 180)}px`;
    menu.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(menu);
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('mousedown', close, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }

  function readableText(element) {
    if (!element) return '';
    // If element is rendered and visible, innerText is best (respects <br>)
    const visible = (element.innerText || '').trim();
    if (visible) return element.innerText;
    // Gmail hides the quote by default (display:none inside collapsed ajR) — render a clone off-screen
    const clone = element.cloneNode(true);
    clone.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach(el => {
      el.style.display = '';
    });
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute; left:-99999px; top:0; width:640px; visibility:hidden;';
    host.appendChild(clone);
    document.body.appendChild(host);
    const text = clone.innerText || clone.textContent || '';
    host.remove();
    return text;
  }

  function extractDraftText(editor) {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.gmail_signature, .gmail_quote, blockquote, .gmail_quote_container').forEach(el => el.remove());
    return (clone.innerText || '').trim();
  }

  function trimContext(text) {
    const t = text.replace(/\n{3,}/g, '\n\n').trim();
    return t.length > 4000 ? t.slice(0, 4000) + '…' : t;
  }

  function extractThreadContext(container) {
    const inCompose = container.querySelector('.gmail_quote, blockquote, [data-smartmail="gmail_quote"]');
    if (inCompose) {
      const text = readableText(inCompose).trim();
      if (text.length > 20) {
        LOG('thread context from compose quote, len:', text.length);
        return trimContext(text);
      }
    }
    const bodies = document.querySelectorAll('.a3s.aiL, .ii.gt div[dir="ltr"], .ii.gt');
    if (bodies.length > 0) {
      const last = bodies[bodies.length - 1];
      const text = (last.innerText || last.textContent || '').trim();
      if (text.length > 20) {
        LOG('thread context from last rendered message, len:', text.length);
        return trimContext(text);
      }
    }
    WARN('no thread context found — nothing in compose quote nor visible messages');
    return '';
  }

  function extractSubject(container) {
    const input = container.querySelector('input[name="subjectbox"]');
    if (input && input.value) return input.value.trim();
    const h = document.querySelector('h2[data-thread-perm-id], h2.hP');
    return h ? (h.textContent || '').trim() : '';
  }

  function buildParagraph(text) {
    const div = document.createElement('div');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(line));
    });
    return div;
  }

  function buildBlankLine() {
    const div = document.createElement('div');
    div.appendChild(document.createElement('br'));
    return div;
  }

  function replaceEditorContent(editor, newText) {
    const sig = editor.querySelector('.gmail_signature');
    const quote = editor.querySelector('.gmail_quote') || editor.querySelector('blockquote');

    while (editor.firstChild) editor.removeChild(editor.firstChild);

    const paragraphs = newText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
      editor.appendChild(buildBlankLine());
    } else {
      paragraphs.forEach((p, idx) => {
        if (idx > 0) editor.appendChild(buildBlankLine());
        editor.appendChild(buildParagraph(p));
      });
    }
    if (sig) {
      editor.appendChild(buildBlankLine());
      editor.appendChild(sig);
    }
    if (quote) editor.appendChild(quote);
  }

  async function runRewrite(editor, container, btn, tone) {
    const draft = extractDraftText(editor);
    const threadContext = extractThreadContext(container);
    if (!draft && !threadContext) { flash(btn, 'Brak treści i wątku'); return; }

    const originalText = btn.textContent;
    btn.textContent = `⏳ ${TONE_LABELS[tone] || ''}…`;
    btn.style.opacity = '0.75';
    btn.style.pointerEvents = 'none';

    const payload = {
      type: 'rewrite',
      draft,
      subject: extractSubject(container),
      threadContext,
      tone,
    };

    try {
      const response = await chrome.runtime.sendMessage(payload);
      if (!response || response.error) {
        WARN('rewrite error:', response && response.error);
        flash(btn, '❌ ' + ((response && response.error) || 'błąd'));
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.pointerEvents = '';
        return;
      }
      replaceEditorContent(editor, response.text);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      btn.textContent = '✓ Gotowe';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.pointerEvents = '';
      }, 1400);
    } catch (err) {
      WARN('rewrite exception:', err);
      flash(btn, '❌ ' + (err.message || 'błąd'));
      btn.textContent = originalText;
      btn.style.opacity = '1';
      btn.style.pointerEvents = '';
    }
  }

  function flash(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 2200);
  }

  function scan() {
    const editors = findEditors();
    if (editors.length) LOG(`scan: found ${editors.length} editor(s)`);
    editors.forEach(injectInto);
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  window.addEventListener('load', scan);
  setTimeout(scan, 2000);

  window.__gmailLlmDiag = () => {
    const editors = findEditors();
    console.group('[gmail-llm] diagnostic');
    console.log('editors found:', editors.length);
    editors.forEach((e, i) => {
      const ctx = findComposeCtx(e);
      console.log(`editor #${i}:`, e, 'ctx:', ctx);
      if (ctx) console.log('  send button label:', ctx.sendBtn.getAttribute('aria-label') || ctx.sendBtn.getAttribute('data-tooltip'));
    });
    console.groupEnd();
    return editors;
  };

  document.addEventListener('keydown', (e) => {
    if (!(e.altKey && e.key && e.key.toLowerCase() === 'r')) return;
    const active = document.activeElement;
    if (!active || active.getAttribute('contenteditable') !== 'true') return;
    const container = active.closest('[role="dialog"]') || active.closest('form') || active.closest('table');
    if (!container) return;
    const ourBtn = container.querySelector('.llm-rewrite-main') || document.querySelector('.llm-rewrite-main');
    if (ourBtn) { e.preventDefault(); ourBtn.click(); }
  });
})();
