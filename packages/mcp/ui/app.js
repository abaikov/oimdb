/* OIMDB DevTools standalone UI — polls /api/inspect */

// ── State ──────────────────────────────────────────────────────

let autoTimer   = null;
let expanded    = new Set();

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
const btnRefresh       = document.getElementById('btn-refresh');
const chkAuto          = document.getElementById('chk-auto');

// ── Fetch ───────────────────────────────────────────────────────

async function poll() {
    try {
        const res  = await fetch('/api/inspect');
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
    connDot.className   = 'conn-dot disconnected';
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
    connLabel.textContent = tab ? `${tab.title}` : 'Connected';
}

// ── Render ──────────────────────────────────────────────────────

function render(state) {
    const collections = state.collections || {};
    const computeds   = state.computeds   || {};

    badgeCollections.textContent = Object.keys(collections).length;
    badgeComputeds.textContent   = Object.keys(computeds).length;

    renderCollections(collections);
    renderComputeds(computeds);
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
    detail.innerHTML = buildCollDetail(info);

    summary.addEventListener('click', () => {
        const opening = detail.classList.toggle('open');
        arrow.classList.toggle('open', opening);
        if (opening) expanded.add(name);
        else expanded.delete(name);
    });

    row.append(summary, detail);
    return row;
}

function buildCollDetail(info) {
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

    return parts.join('') || '<div class="d-row"><span style="color:var(--text-dim);font-size:11px">No details</span></div>';
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

function startAuto()  { stopAuto(); autoTimer = setInterval(poll, 1000); }
function stopAuto()   { if (autoTimer !== null) { clearInterval(autoTimer); autoTimer = null; } }

// ── Boot ────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', poll);
chkAuto.addEventListener('change', () => chkAuto.checked ? startAuto() : stopAuto());

poll();
startAuto();
