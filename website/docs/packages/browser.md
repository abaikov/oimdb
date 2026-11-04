---
sidebar_position: 7
description: How @oimdb/browser turns the network, window focus, document visibility and the location into OIMDB single slots that listen to the browser only while subscribed.
---

# Browser

`@oimdb/browser` turns browser state into single slots: the network, window focus, document visibility
and the location. An effect, a computed or a React hook reads them like any other single, and the
browser listener exists only while something is subscribed.

<InShort>

- Each factory returns an `OIMSingleSlotService`; build a store slot on your `db` and read the slot.
- The browser listener is added at the first subscriber and removed at the last.
- A write that would land during a flush is made right after it.
- `onBrowserEntityWritten` commits what an event wrote; it runs synchronously, inside the event.

</InShort>

```bash
npm install @oimdb/browser @oimdb/core
```

```ts setup
import { OIMDB, OIMEffectService } from '@oimdb/core';
import { createOIMBrowserOnlineSingleSlotService } from '@oimdb/browser';

const db = new OIMDB();
const refetchStale = (): void => undefined;
```

```ts
const onlineService = createOIMBrowserOnlineSingleSlotService();
const online = onlineService.createStoreSlot(db);
const onlineSlot = onlineService.getSingleSlot(online);

OIMEffectService.INSTANCE.createEffect(db, () => {
    if (onlineSlot.entity?.isOnline === true) refetchStale();
}, [onlineSlot]);
```

| Factory | Entity | Listens to |
|---|---|---|
| `createOIMBrowserOnlineSingleSlotService` | `{ isOnline }` | `online`, `offline` |
| `createOIMBrowserFocusSingleSlotService` | `{ isFocused }`, read from `document.hasFocus()` | `focus`, `blur` |
| `createOIMBrowserVisibilitySingleSlotService` | `{ isVisible }` | `visibilitychange` |
| `createOIMBrowserLocationSingleSlotService` | `{ href, pathname, search, hash }` | `currententrychange` of the Navigation API, else `popstate` and `hashchange` |

In React, `useOIMSelector(() => onlineService.getSingleSlot(online).entity)` from [`@oimdb/react`](/docs/packages/react)
reads the entity. `isOnline` means a network interface exists, not that the internet answers; without the Navigation API
a `history.pushState` is seen only at the next `popstate` or `hashchange`. The package's
[README](https://github.com/abaikov/oimdb/blob/master/packages/browser/README.md) has the details.

## Committing what an event wrote

A database with no `channelScheduler` delivers nothing until `db.flush()`, and a browser event is nobody's batch.
`onBrowserEntityWritten` in the factory options commits what an event wrote: it is called after each write a
browser event caused, never after the first value. It runs synchronously, inside the event's dispatch; a write
that waited out a flush calls it right after that flush, from its after-flush handler. `focus()` and `blur()` called
from your own code dispatch their events synchronously, so a `db.flush()` in it can run in the middle of the caller's
turn; defer it (`queueMicrotask`) or hand it to your orchestrator when that matters.

```ts
const committedOnlineService = createOIMBrowserOnlineSingleSlotService({ onBrowserEntityWritten: () => { db.flush(); } });
```

