/* global chrome */

const EVAL_SCRIPT = `
(function() {
  if (!window.__OIMDB_DEV__) return null;
  try {
    var result = window.__OIMDB_DEV__.inspect();
    return JSON.parse(JSON.stringify(result));
  } catch(e) {
    return { __error: e.message };
  }
})()
`;

// ── State ──────────────────────────────────────────────

let autoRefreshTimer = null;
let expandedCollections = new Set();

// ── Elements ───────────────────────────────────────────

const screenWaiting   = document.getElementById('screen-waiting');
const screenMain      = document.getElementById('screen-main');
const btnRefresh      = document.getElementById('btn-refresh');
const btnRetry        = document.getElementById('btn-retry');
const chkAuto         = document.getElementById('chk-auto');
const lastUpdated     = document.getElementById('last-updated');
const badgeCollections = document.getElementById('badge-collections');
const badgeComputeds  = document.getElementById('badge-computeds');
const listCollections = document.getElementById('list-collections');
const listComputeds   = document.getElementById('list-computeds');

// ── Fetch & render ─────────────────────────────────────

function fetch() {
  chrome.devtools.inspectedWindow.eval(EVAL_SCRIPT, function(result, isException) {
    if (isException || !result || result.__error) {
      showWaiting();
      return;
    }
    render(result);
  });
}

function showWaiting() {
  screenWaiting.classList.remove('hidden');
  screenMain.classList.add('hidden');
}

function showMain() {
  screenWaiting.classList.add('hidden');
  screenMain.classList.remove('hidden');
}

function render(state) {
  showMain();

  const collections = state.collections || {};
  const computeds   = state.computeds   || {};

  badgeCollections.textContent = Object.keys(collections).length;
  badgeComputeds.textContent   = Object.keys(computeds).length;

  renderCollections(collections);
  renderComputeds(computeds);

  const now = new Date();
  lastUpdated.textContent = 'Updated ' + now.toLocaleTimeString();
}

// ── Collections ────────────────────────────────────────

function renderCollections(collections) {
  const entries = Object.entries(collections);

  if (entries.length === 0) {
    listCollections.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:11px;">No collections registered.</div>';
    return;
  }

  listCollections.innerHTML = '';

  for (const [name, info] of entries) {
    listCollections.appendChild(buildCollectionRow(name, info));
  }
}

function buildCollectionRow(name, info) {
  const row = document.createElement('div');
  row.className = 'collection-row';

  const isExpanded = expandedCollections.has(name);

  const summary = document.createElement('div');
  summary.className = 'collection-summary';

  const arrow = document.createElement('span');
  arrow.className = 'expand-arrow' + (isExpanded ? ' open' : '');
  arrow.textContent = '▶';

  const nameEl = document.createElement('span');
  nameEl.className = 'collection-name';
  nameEl.textContent = name;

  const count = document.createElement('span');
  count.className = 'collection-count';
  count.textContent = info.count + ' entities';

  summary.appendChild(arrow);
  summary.appendChild(nameEl);
  summary.appendChild(count);

  const detail = document.createElement('div');
  detail.className = 'collection-detail' + (isExpanded ? ' visible' : '');
  detail.innerHTML = buildCollectionDetail(info);

  summary.addEventListener('click', function() {
    const open = detail.classList.toggle('visible');
    arrow.classList.toggle('open', open);
    if (open) expandedCollections.add(name);
    else expandedCollections.delete(name);
  });

  row.appendChild(summary);
  row.appendChild(detail);
  return row;
}

function buildCollectionDetail(info) {
  const lines = [];

  // Fields from sample entity
  if (info.sampleEntity && typeof info.sampleEntity === 'object') {
    const fields = Object.keys(info.sampleEntity).map(function(f) {
      const val = info.sampleEntity[f];
      const type = Array.isArray(val) ? 'array' : typeof val;
      return '<span class="tag">' + esc(f) + ': ' + esc(type) + '</span>';
    }).join('');
    lines.push(detailRow('fields', fields));
  }

  // Sample PKs
  if (info.samplePks && info.samplePks.length > 0) {
    const pks = info.samplePks.map(function(pk) {
      return '<span class="tag">' + esc(String(pk)) + '</span>';
    }).join('');
    lines.push(detailRow('sample pks', pks));
  }

  // Indexes
  const indexEntries = Object.entries(info.indexes || {});
  if (indexEntries.length > 0) {
    const tags = indexEntries.map(function(entry) {
      return '<span class="tag">' + esc(entry[0]) + ' <span style="opacity:.6">(' + entry[1].keyCount + ' keys)</span></span>';
    }).join('');
    lines.push(detailRow('indexes', tags));
  }

  // Relations
  const relEntries = Object.entries(info.relations || {});
  if (relEntries.length > 0) {
    const tags = relEntries.map(function(entry) {
      return '<span class="tag">' + esc(entry[0]) + ' <span class="relation-arrow">→</span> ' + esc(entry[1]) + '</span>';
    }).join('');
    lines.push(detailRow('relations', tags));
  }

  // Description
  if (info.description) {
    lines.push(detailRow('desc', '<span class="detail-value">' + esc(info.description) + '</span>'));
  }

  return lines.join('');
}

function detailRow(label, content) {
  return '<div class="detail-row"><span class="detail-label">' + esc(label) + '</span>' + content + '</div>';
}

// ── Computeds ──────────────────────────────────────────

function renderComputeds(computeds) {
  const entries = Object.entries(computeds);

  if (entries.length === 0) {
    listComputeds.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:11px;">No computeds registered.</div>';
    return;
  }

  listComputeds.innerHTML = '';

  for (const [name, info] of entries) {
    listComputeds.appendChild(buildComputedRow(name, info));
  }
}

function buildComputedRow(name, info) {
  const row = document.createElement('div');
  row.className = 'computed-row';

  // Status
  let statusClass, statusLabel;
  if (!info.isReady) {
    statusClass = 'pending';
    statusLabel = 'PENDING';
  } else if (info.needsRecompute) {
    statusClass = 'stale';
    statusLabel = 'STALE';
  } else {
    statusClass = 'fresh';
    statusLabel = 'FRESH';
  }

  // Top row
  const top = document.createElement('div');
  top.className = 'computed-top';

  const dot = document.createElement('span');
  dot.className = 'status-dot ' + statusClass;

  const nameEl = document.createElement('span');
  nameEl.className = 'computed-name';
  nameEl.textContent = name;

  const badge = document.createElement('span');
  badge.className = 'status-badge ' + statusClass;
  badge.textContent = statusLabel;

  top.appendChild(dot);
  top.appendChild(nameEl);
  top.appendChild(badge);

  // Value
  if (info.isReady && info.currentValue !== undefined) {
    const valueEl = document.createElement('span');
    valueEl.className = 'computed-value';
    const prefix = info.needsRecompute ? 'last: ' : '';
    valueEl.textContent = prefix + formatValue(info.currentValue);
    valueEl.title = JSON.stringify(info.currentValue, null, 2);
    top.appendChild(valueEl);
  }

  row.appendChild(top);

  // Deps
  const deps = info.deps || [];
  if (deps.length > 0) {
    const depsEl = document.createElement('div');
    depsEl.className = 'computed-deps';

    const label = document.createElement('span');
    label.className = 'computed-deps-label';
    label.textContent = 'deps:';
    depsEl.appendChild(label);

    for (const dep of deps) {
      const tag = document.createElement('span');
      if (dep.name) {
        tag.className = 'tag';
        tag.textContent = dep.name;
      } else {
        tag.className = 'tag tag-warn';
        tag.textContent = '⚠ unregistered';
        tag.title = 'Register this dependency source in your debug file';
      }
      depsEl.appendChild(tag);
    }

    row.appendChild(depsEl);
  }

  return row;
}

// ── Helpers ────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatValue(val) {
  if (val === null) return 'null';
  if (typeof val === 'string') return '"' + val + '"';
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return str.length > 40 ? str.slice(0, 40) + '…' : str;
  }
  return String(val);
}

// ── Auto-refresh ───────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(fetch, 1000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer !== null) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// ── Event listeners ────────────────────────────────────

btnRefresh.addEventListener('click', fetch);
btnRetry.addEventListener('click', fetch);

chkAuto.addEventListener('change', function() {
  if (chkAuto.checked) startAutoRefresh();
  else stopAutoRefresh();
});

// Start
fetch();
