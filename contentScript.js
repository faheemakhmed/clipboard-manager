// contentScript.js
// Listens to user 'copy' and 'cut' events and reports text to the background service worker.

(function () {
  // Some pages use shadow DOM; capture phase ensures we see the event early.
  ['copy', 'cut'].forEach(evt =>
    document.addEventListener(evt, handleCopyCut, true)
  );

  function handleCopyCut(e) {
    try {
      const text = (getSelectedText() || getClipboardEventText(e) || '').trim();
      if (!text) return;

      chrome.runtime.sendMessage({
        type: 'CLIPBOARD_CAPTURED',
        payload: {
          text,
          url: location.href,
          title: document.title,
          ts: Date.now()
        }
      });
    } catch (err) {
      // Fail silently to avoid disrupting page behavior
      // console.warn('[Clipboard History Manager] content error:', err);
    }
  }

  function getClipboardEventText(e) {
    try {
      // During a copy/cut event, clipboardData may contain text/plain
      const data = e?.clipboardData?.getData?.('text/plain');
      return typeof data === 'string' ? data : '';
    } catch {
      return '';
    }
  }

  function getSelectedText() {
    // Prioritize selection in inputs/textarea/contenteditable
    const activeEl = document.activeElement;

    // Inputs and Textareas
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        return (activeEl.value || '').slice(start, end);
      }
      return activeEl.value || '';
    }

    // ContentEditable or generic selection
    if (activeEl && activeEl.isContentEditable) {
      const selection = window.getSelection();
      return selection ? selection.toString() : '';
    }

    const selection = window.getSelection();
    return selection ? selection.toString() : '';
  }
})();
