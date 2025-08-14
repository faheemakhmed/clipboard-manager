// background.js (MV3 service worker)

const HISTORY_KEY = 'clipboardHistory';
const SETTINGS_KEY = 'clipboardSettings';

// Default settings
const DEFAULT_SETTINGS = {
  maxItems: 100 // Changeable from popup
};

// Initialize storage on install/update
chrome.runtime.onInstalled.addListener(async () => {
  const { [HISTORY_KEY]: existingHistory, [SETTINGS_KEY]: existingSettings } =
    await chrome.storage.local.get([HISTORY_KEY, SETTINGS_KEY]);

  if (!existingHistory) {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  }
  if (!existingSettings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
});

// Helper: save an item with de-duplication and size cap
async function saveClipboardItem(item) {
  if (!item || !item.text || !item.text.trim()) return;

  const store = await chrome.storage.local.get([HISTORY_KEY, SETTINGS_KEY]);
  const history = Array.isArray(store[HISTORY_KEY]) ? store[HISTORY_KEY] : [];
  const settings = store[SETTINGS_KEY] || DEFAULT_SETTINGS;
  const maxItems = Math.max(1, settings.maxItems || DEFAULT_SETTINGS.maxItems);

  // Remove any existing identical text (case-sensitive duplicate avoidance)
  const filtered = history.filter(h => h.text !== item.text);

  // Add newest to front
  filtered.unshift(item);

  // Enforce max size
  const trimmed = filtered.slice(0, maxItems);

  await chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
}

// Messages from content scripts & popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'CLIPBOARD_CAPTURED': {
          const { text, url, title, ts } = msg.payload || {};
          await saveClipboardItem({
            text: String(text || '').trim(),
            url: String(url || ''),
            title: String(title || ''),
            ts: typeof ts === 'number' ? ts : Date.now()
          });
          sendResponse({ ok: true });
          break;
        }

        case 'GET_HISTORY': {
          const { [HISTORY_KEY]: history } = await chrome.storage.local.get(HISTORY_KEY);
          sendResponse({ ok: true, history: Array.isArray(history) ? history : [] });
          break;
        }

        case 'CLEAR_HISTORY': {
          await chrome.storage.local.set({ [HISTORY_KEY]: [] });
          sendResponse({ ok: true });
          break;
        }

        case 'DELETE_ITEM_BY_INDEX': {
          const index = Number(msg.index);
          const { [HISTORY_KEY]: history } = await chrome.storage.local.get(HISTORY_KEY);
          if (Array.isArray(history) && index >= 0 && index < history.length) {
            history.splice(index, 1);
            await chrome.storage.local.set({ [HISTORY_KEY]: history });
          }
          sendResponse({ ok: true });
          break;
        }

        case 'SET_MAX_ITEMS': {
          const newMax = Math.max(1, Math.min(1000, Number(msg.maxItems) || DEFAULT_SETTINGS.maxItems));
          const store = await chrome.storage.local.get([HISTORY_KEY, SETTINGS_KEY]);
          const settings = { ...(store[SETTINGS_KEY] || DEFAULT_SETTINGS), maxItems: newMax };

          // Trim history if needed
          const history = Array.isArray(store[HISTORY_KEY]) ? store[HISTORY_KEY] : [];
          const trimmed = history.slice(0, newMax);

          await chrome.storage.local.set({ [SETTINGS_KEY]: settings, [HISTORY_KEY]: trimmed });
          sendResponse({ ok: true, settings });
          break;
        }

        case 'GET_SETTINGS': {
          const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
          sendResponse({ ok: true, settings: settings || DEFAULT_SETTINGS });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      console.error('[Clipboard History Manager] background error:', e);
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  // Indicate async response
  return true;
});
