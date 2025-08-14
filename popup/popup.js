/* popup.js */

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const searchEl = document.getElementById('search');
const clearBtn = document.getElementById('clearBtn');
const maxItemsSelect = document.getElementById('maxItems');
const toastEl = document.getElementById('toast');

let historyData = [];
let settings = { maxItems: 100 };

init();

async function init() {
  await loadSettings();
  await loadHistory();
  attachEvents();

  // Keep popup live-updated if new items come in while it's open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes?.clipboardHistory) {
      historyData = changes.clipboardHistory.newValue || [];
      renderFiltered();
    }
    if (area === 'local' && changes?.clipboardSettings) {
      settings = changes.clipboardSettings.newValue || settings;
      setMaxSelect(settings.maxItems);
    }
  });
}

function attachEvents() {
  searchEl.addEventListener('input', renderFiltered);

  clearBtn.addEventListener('click', async () => {
    if (!historyData.length) return;
    if (!confirm('Clear all clipboard history?')) return;
    const resp = await sendMessageAsync({ type: 'CLEAR_HISTORY' });
    if (resp?.ok) {
      historyData = [];
      renderFiltered();
      showToast('History cleared');
    }
  });

  maxItemsSelect.addEventListener('change', async () => {
    const newMax = Number(maxItemsSelect.value);
    const resp = await sendMessageAsync({ type: 'SET_MAX_ITEMS', maxItems: newMax });
    if (resp?.ok) {
      settings = resp.settings || settings;
      showToast(`Max items set to ${settings.maxItems}`);
      // background trims; we reload to reflect it
      await loadHistory();
    }
  });
}

async function loadSettings() {
  const resp = await sendMessageAsync({ type: 'GET_SETTINGS' });
  if (resp?.ok) {
    settings = resp.settings || settings;
  }
  setMaxSelect(settings.maxItems);
}

function setMaxSelect(val) {
  const options = Array.from(maxItemsSelect.options).map(o => Number(o.value));
  if (!options.includes(Number(val))) {
    // Add custom option dynamically if not present
    const opt = document.createElement('option');
    opt.value = String(val);
    opt.textContent = String(val);
    maxItemsSelect.appendChild(opt);
  }
  maxItemsSelect.value = String(val);
}

async function loadHistory() {
  const resp = await sendMessageAsync({ type: 'GET_HISTORY' });
  historyData = resp?.history || [];
  renderFiltered();
}

function renderFiltered() {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = q
    ? historyData.filter(i =>
        i.text.toLowerCase().includes(q) ||
        (i.title || '').toLowerCase().includes(q) ||
        (i.url || '').toLowerCase().includes(q)
      )
    : historyData;

  renderList(filtered);
}

function renderList(items) {
  listEl.innerHTML = '';

  if (!items.length) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'item';

    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.textContent = item.text;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'meta';
    metaDiv.textContent = formatMeta(item);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyToClipboard(item.text);
      showToast('Copied');
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Need index relative to full history, not filtered list
      const absoluteIndex = historyData.findIndex(h => h.ts === item.ts && h.text === item.text);
      if (absoluteIndex >= 0) {
        await sendMessageAsync({ type: 'DELETE_ITEM_BY_INDEX', index: absoluteIndex });
        await loadHistory();
        showToast('Deleted');
      }
    });

    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(deleteBtn);

    // Clicking anywhere on the item copies it
    li.addEventListener('click', async () => {
      await copyToClipboard(item.text);
      showToast('Copied');
    });

    li.appendChild(textDiv);
    li.appendChild(metaDiv);
    li.appendChild(actionsDiv);
    listEl.appendChild(li);
  });
}

function formatMeta(item) {
  const d = item?.ts ? new Date(item.ts) : new Date();
  const time = d.toLocaleString();
  let host = '';
  try { host = item?.url ? (new URL(item.url)).host : ''; } catch {}
  const title = item?.title ? ` • ${item.title}` : '';
  return `${time}${host ? ' • ' + host : ''}${title}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback (rarely needed in extensions when user-gestured)
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.style.display = 'none';
  }, 1200);
}

function sendMessageAsync(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, resolve);
      setTimeout(() => resolve({ ok: false, error: 'timeout' }), 2000);
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}
