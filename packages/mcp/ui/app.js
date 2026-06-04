/* OIMDB DevTools standalone UI — polls /api/inspect */

// ── State ──────────────────────────────────────────────────────

let autoTimer = null;
let expanded  = new Set();

// ── Elements ───────────────────────────────────────────────────

const screenWaiting    = document.getElementById('screen-waiting');
const screenMain       = document.getElementById('screen-main');
const connDot          = document.getElementById('conn-dot');
const connLabel        = document.getElementById('conn-label');
const lastUpdated      = document.getElementById('last-updated');
const badgeCollections = document.getElementById('badge-collections');
const badgeComputeds   = document.getElementById('badge-computeds');
const listCollections  = document.getElementById('list-collections');
const listComputeds    = document.getElementById('list-computeds');
const listHistory      = document.getElementById('list-history');
const btnRefresh       = document.getElementById('btn-refresh');
const chkAuto          = document.getElementById('chk-auto');

// ── Fetch ───────────────────────────────────────────────────────

async function poll() {
    try {
        const base = location.origin !== 'null' ? location.origin : '';
        const res  = await fetch(base + '/api/inspect');
        const json = await res.json();

        if (!json.connected || !json.data) {
            showWaiting();
            return;
        }

        showMain();
        setConnected(json.tab);
        render(json.data);
        lastUpdated.textContent = new Date().toLocaleTimeString();
    } catch {
        showWaiting();
    }
}

// ── Layout ──────────────────────────────────────────────────────

function showWaiting() {
    connDot.className     = 'conn-dot disconnected';
    connLabel.textContent = 'Waiting for browser…';
    screenWaiting.classList.remove('hidden');
    screenMain.classList.add('hidden');
}

function showMain() {
    screenWaiting.classList.add('hidden');
    screenMain.classList.remove('hidden');
}

function setConnected(tab) {
    connDot.className     = 'conn-dot connected';
    connLabel.textContent = tab ? tab.title : 'Connected';
}

// ── Render ──────────────────────────────────────────────────────

function render(state) {
    const collections = state.collections || {};
    const computeds   = state.computeds   || {};
    const history     = state.history     || [];

    badgeCollections.textContent = Object.keys(collections).length;
    badgeComputeds.textContent   = Object.keys(computeds).length;

    renderCollections(collections);
    renderComputeds(computeds);
    renderHistory(history);
}

// ── Collections ─────────────────────────────────────────────────

function renderCollections(cols) {
    const entries = Object.entries(cols);
    if (!entries.length) {
        listCollections.innerHTML = '<div class="empty">No collections registered.</div>';
        return;
    }
    listCollections.innerHTML = '';
    entries.forEach(([name, info]) => listCollections.appendChild(buildCollRow(name, info)));
}

function buildCollRow(name, info) {
    const row = document.createElement('div');
    row.className = 'c-row';

    const isOpen = expanded.has(name);

    const summary = document.createElement('div');
    summary.className = 'c-summary';

    const arrow = document.createElement('span');
    arrow.className = 'c-arrow' + (isOpen ? ' open' : '');
    arrow.textContent = '▶';

    const nameEl = document.createElement('span');
    nameEl.className = 'c-name';
    nameEl.textContent = name;

    const count = document.createElement('span');
    count.className = 'c-count';
    count.textContent = `${info.count} entities`;

    summary.append(arrow, nameEl, count);

    const detail = document.createElement('div');
    detail.className = 'c-detail' + (isOpen ? ' open' : '');
    detail.innerHTML = buildCollMeta(info);

    // Entity table
    const table = buildEntityTable(info);
    if (table) detail.appendChild(table);

    summary.addEventListener('click', () => {
        const opening = detail.classList.toggle('open');
        arrow.classList.toggle('open', opening);
        if (opening) expanded.add(name);
        else expanded.delete(name);
    });

    row.append(summary, detail);
    return row;
}

function buildCollMeta(info) {
    const parts = [];

    if (info.sampleEntity && typeof info.sampleEntity === 'object') {
        const tags = Object.entries(info.sampleEntity)
            .map(([k, v]) => `<span class="tag">${esc(k)}: <span style="opacity:.6">${esc(typeof v)}</span></span>`)
            .join('');
        parts.push(drow('fields', tags));
    }

    const idxEntries = Object.entries(info.indexes || {});
    if (idxEntries.length) {
        const tags = idxEntries.map(([n, idx]) =>
            `<span class="tag">${esc(n)} <span style="opacity:.6">(${idx.keyCount})</span></span>`
        ).join('');
        parts.push(drow('indexes', tags));
    }

    const relEntries = Object.entries(info.relations || {});
    if (relEntries.length) {
        const tags = relEntries.map(([f, t]) =>
            `<span class="tag">${esc(f)}<span class="tag-rel-arrow">→</span>${esc(t)}</span>`
        ).join('');
        parts.push(drow('relations', tags));
    }

    if (info.description) {
        parts.push(drow('desc', `<span style="color:var(--text-dim)">${esc(info.description)}</span>`));
    }

    return parts.join('') || '';
}

// ── Entity table ────────────────────────────────────────────────

const MAX_ENTITY_ROWS = 200;

function buildEntityTable(info) {
    const entities = info.entities;
    if (!Array.isArray(entities) || entities.length === 0) return null;

    const first = entities[0];
    if (!first || typeof first !== 'object') return null;
    const cols = Object.keys(first);
    if (cols.length === 0) return null;

    const shown = entities.slice(0, MAX_ENTITY_ROWS);

    const wrap = document.createElement('div');
    wrap.className = 'entity-wrap';

    const tableWrap = document.createElement('div');
    tableWrap.className = 'entity-table-wrap';

    const table = document.createElement('table');
    table.className = 'entity-table';

    // Head
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    cols.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    shown.forEach(entity => {
        const tr = document.createElement('tr');
        cols.forEach(col => {
            const td = document.createElement('td');
            const val = (entity)[col];
            td.textContent = fmtCell(val);
            td.title = JSON.stringify(val);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    if (entities.length > MAX_ENTITY_ROWS) {
        const note = document.createElement('div');
        note.className = 'entity-note';
        note.textContent = `showing ${MAX_ENTITY_ROWS} of ${entities.length}`;
        wrap.appendChild(note);
    }

    return wrap;
}

function fmtCell(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') {
        const s = JSON.stringify(v);
        return s.length > 40 ? s.slice(0, 40) + '…' : s;
    }
    const s = String(v);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

function drow(label, content) {
    return `<div class="d-row"><span class="d-label">${esc(label)}</span>${content}</div>`;
}

// ── Computeds ───────────────────────────────────────────────────

function renderComputeds(comps) {
    const entries = Object.entries(comps);
    if (!entries.length) {
        listComputeds.innerHTML = '<div class="empty">No computeds registered.</div>';
        return;
    }
    listComputeds.innerHTML = '';
    entries.forEach(([name, info]) => listComputeds.appendChild(buildCompRow(name, info)));
}

function buildCompRow(name, info) {
    const row = document.createElement('div');
    row.className = 'comp-row';

    let cls, label;
    if (!info.isReady) {
        cls = 'pending'; label = 'PENDING';
    } else if (info.needsRecompute) {
        cls = 'stale'; label = 'STALE';
    } else {
        cls = 'fresh'; label = 'FRESH';
    }

    const top = document.createElement('div');
    top.className = 'comp-top';

    const dot = document.createElement('span');
    dot.className = `status-dot ${cls}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'comp-name';
    nameEl.textContent = name;

    const pill = document.createElement('span');
    pill.className = `status-pill ${cls}`;
    pill.textContent = label;

    top.append(dot, nameEl, pill);

    if (info.isReady && info.currentValue !== undefined) {
        const val = document.createElement('span');
        val.className = 'comp-value';
        const prefix = info.needsRecompute ? 'last: ' : '';
        val.textContent = prefix + fmt(info.currentValue);
        val.title = JSON.stringify(info.currentValue, null, 2);
        top.appendChild(val);
    }

    row.appendChild(top);

    const deps = info.deps || [];
    if (deps.length) {
        const depsEl = document.createElement('div');
        depsEl.className = 'comp-deps';

        const lbl = document.createElement('span');
        lbl.className = 'comp-deps-label';
        lbl.textContent = 'deps:';
        depsEl.appendChild(lbl);

        deps.forEach(dep => {
            const tag = document.createElement('span');
            if (dep.name) {
                tag.className = 'tag';
                tag.textContent = dep.name;
            } else {
                tag.className = 'tag tag-warn';
                tag.textContent = '⚠ unregistered';
                tag.title = 'Register this source in your debug file';
            }
            depsEl.appendChild(tag);
        });

        row.appendChild(depsEl);
    }

    return row;
}

// ── Flush History ───────────────────────────────────────────────

function renderHistory(history) {
    if (!history.length) {
        listHistory.innerHTML = '<div class="empty">No flushes recorded yet.<br>Call <code>registry.trackFlushes(...)</code> in debug.ts.</div>';
        return;
    }
    listHistory.innerHTML = '';
    history.forEach((record, i) => {
        const prev = history[i + 1];
        listHistory.appendChild(buildFlushRow(record, prev));
    });
}

function buildFlushRow(record, prev) {
    const row = document.createElement('div');
    row.className = 'flush-row';

    const time = document.createElement('span');
    time.className = 'flush-time';
    time.textContent = new Date(record.time).toLocaleTimeString('en', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
    row.appendChild(time);

    const tags = document.createElement('span');
    tags.className = 'flush-tags';

    for (const [name, count] of Object.entries(record.counts)) {
        const prevCount = prev ? (prev.counts[name] ?? 0) : 0;
        const diff = count - prevCount;
        const tag = document.createElement('span');
        tag.className = 'flush-tag';

        if (diff === 0 && i !== 0) continue; // skip unchanged (unless first flush)
        const sign = diff > 0 ? '+' : '';
        tag.textContent = diff !== 0 ? `${name} ${sign}${diff}` : `${name} ${count}`;
        tag.className = 'flush-tag' + (diff > 0 ? ' flush-add' : diff < 0 ? ' flush-del' : '');
        tags.appendChild(tag);
    }

    if (!tags.children.length) {
        const tag = document.createElement('span');
        tag.className = 'flush-tag flush-no-change';
        tag.textContent = 'no changes';
        tags.appendChild(tag);
    }

    row.appendChild(tags);
    return row;
}

// ── Helpers ─────────────────────────────────────────────────────

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function fmt(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'object') {
        const s = JSON.stringify(v);
        return s.length > 48 ? s.slice(0, 48) + '…' : s;
    }
    return String(v);
}

// ── Auto-refresh ─────────────────────────────────────────────────

function startAuto() { stopAuto(); autoTimer = setInterval(poll, 1000); }
function stopAuto()  { if (autoTimer !== null) { clearInterval(autoTimer); autoTimer = null; } }

// ── Boot ────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', poll);
chkAuto.addEventListener('change', () => chkAuto.checked ? startAuto() : stopAuto());

poll();
startAuto();
