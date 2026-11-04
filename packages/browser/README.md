# @oimdb/browser

Browser state as OIMDB single slots: the network, window focus, document visibility and the location.
An effect, a computed or a React hook reads them like any other slot, and the browser listener exists
only while something is subscribed.

```bash
npm install @oimdb/browser @oimdb/core
```

## A factory returns a single slot service

Each factory returns an `OIMSingleSlotService`: build a store slot on your `db` and read the slot through
the service, as with any single.

```ts setup
import { OIMDB, OIMEffectService } from '@oimdb/core';
import {
    createOIMBrowserOnlineSingleSlotService,
    createOIMBrowserFocusSingleSlotService,
    createOIMBrowserVisibilitySingleSlotService,
    createOIMBrowserLocationSingleSlotService,
} from '@oimdb/browser';

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

In React, `useOIMSelector(() => onlineService.getSingleSlot(online).entity)` from `@oimdb/react` reads the same entity.

| Factory | Entity | Listens to |
|---|---|---|
| `createOIMBrowserOnlineSingleSlotService` | `TOIMBrowserOnlineEntity` `{ isOnline }` | `online`, `offline` on `window` |
| `createOIMBrowserFocusSingleSlotService` | `TOIMBrowserFocusEntity` `{ isFocused }` | `focus`, `blur` on `window` |
| `createOIMBrowserVisibilitySingleSlotService` | `TOIMBrowserVisibilityEntity` `{ isVisible }` | `visibilitychange` on `document` |
| `createOIMBrowserLocationSingleSlotService` | `TOIMBrowserLocationEntity` `{ href, pathname, search, hash }` | `currententrychange` on `navigation`; without the Navigation API, `popstate` and `hashchange` on `window` |

Every factory takes an optional `defaults` (an `OIMDefaults` of `@oimdb/core`), passed on to the
single slot service and its entity content service.

## When the browser is listened to

The service is built with a slot subscription listener. When the slot gets its first subscriber, the
listener adds its browser listener and writes the current value; when the last subscriber goes, it
takes the browser listener off. A subscriber reached through a computed counts too: an effect on a
computed that reads the slot is enough.

A write that would land during a flush is made right after that flush ends, because a channel refuses
writes for the whole of a flush. An event that leaves the value as it was wakes nobody.

## Committing what an event wrote

A database with no `channelScheduler` delivers nothing until `db.flush()`, and a browser event is nobody's batch.
`onBrowserEntityWritten` in the factory options commits what an event wrote: it is called after each write a
browser event caused, never after the first value. It runs synchronously, inside the event's dispatch; a write
that waited out a flush calls it right after that flush, from its after-flush handler. `focus()` and `blur()` called
from your own code dispatch their events synchronously, so a `db.flush()` in it can run in the middle of the caller's
turn; defer it (`queueMicrotask`) or hand it to your orchestrator when that matters.

```ts
const onlineService = createOIMBrowserOnlineSingleSlotService({ onBrowserEntityWritten: () => { db.flush(); } });
```

## What each value means

- **`isOnline`** is `navigator.onLine`: `true` means a network interface exists, not that the internet
  answers. Without `navigator.onLine` it is `true`.
- **`isFocused`** is `document.hasFocus()`, read on every `focus` and `blur`, not taken from the event:
  focus moving into an iframe fires `blur` on the window while the page still has focus. Without
  `document.hasFocus` it is `true`.
- **`isVisible`** is `document.visibilityState !== 'hidden'`; without `document` it is `true`.
- **The location**: `history.pushState` fires no event, so only the Navigation API sees a router push.
  Without it the slot follows `popstate` and `hashchange`, and a push made by a router is seen at the next
  of those events.

Each check reads the API it needs, so the package loads under SSR and in workers and leaves the slot at
the value above.
