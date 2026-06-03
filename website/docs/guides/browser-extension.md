---
sidebar_position: 3
---

# Browser Extension

The OIMDB DevTools browser extension adds an **OIMDB** panel to Chrome DevTools. It shows all registered collections, indexes, computed values, and dep resolution — live from the running page.

## Installation

The extension is not published to the Chrome Web Store. Load it as an unpacked extension:

1. Build or clone the repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select `packages/browser-extension/`

The **OIMDB** tab will appear in DevTools whenever you open it on a page that has `window.__OIMDB_DEV__` set.

## Setup on the page

```ts
// src/debug.ts
import './store/users.debug';
import './store/tasks.debug';

import { registry } from '@oimdb/devtools';

if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__OIMDB_DEV__ = registry;
}
```

Import `debug.ts` only in development — don't include it in the production bundle.

## What it shows

### Collections panel

Each registered collection is listed with:
- Entity count
- Field names and types (inferred from the first entity)
- Sample PKs
- Index names and key counts
- Foreign-key relations

Click a row to expand its detail.

### Computeds panel

Each registered computed shows:
- **FRESH** (green) — value is up to date
- **STALE** (yellow) — dependencies changed since last compute; last known value shown
- **PENDING** (gray) — never computed yet

Below each computed, its `deps` are shown as tags. Deps whose source is not registered in devtools show a **⚠ unregistered** warning — go to the debug file and register the missing source.

## Auto-refresh

Enable **Auto** in the toolbar to poll the registry every second. The panel re-renders on each poll without losing expanded-row state.

## Registering computeds

```ts
// store/tasks.debug.ts
import { registry } from '@oimdb/devtools';
import { tasksCollection, byAssignee, openTaskCount, totalPrice } from './tasks';

registry
    .collection('tasks', tasksCollection, {
        indexes: { byAssignee },
        relations: { assigneeId: 'users' },
    })
    .computed('openTaskCount', openTaskCount)
    .computed('totalPrice', totalPrice);
```
