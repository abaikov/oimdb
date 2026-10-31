# OIMDB — powerful state, native speed

State management for applications that outgrew a basic store: normalised entities,
indexes, sorted views, computed values and effects, at close to the cost of
hand-written code on plain `Map`s and arrays.

- **Granular subscriptions.** One entity, one column, one group. A write wakes only
  what it changed, once per flush.
- **Signals.** Computed values are recomputed on read, and only if something they read changed.
- **Memory management.** What nothing holds is released under a policy you pick.
- **Measured.** [`packages/bench`](packages/bench/) runs the same tasks against other
  state libraries and a hand-written floor.

## Install

```bash
npm install @oimdb/core @oimdb/react
```

## Example

```tsx file=todos.tsx
import { OIMDB, createOIMSlotCollectionStoreAggregate, createOIMEntityContentService } from '@oimdb/core';
import { OIMDBProvider, useOIMEntity } from '@oimdb/react';

type TTodo = { id: string; title: string; done: boolean };

const db = new OIMDB({ channelScheduler: (flush) => queueMicrotask(flush) });
const todos = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TTodo>() });

todos.writeSlotContentByKey('t1', { id: 't1', title: 'Buy milk', done: false });
todos.writeSlotContentByKey('t2', { id: 't2', title: 'Call mum', done: false });

function Todo({ id }: { id: string }) {
    const todo = useOIMEntity(todos.storeSlot, id);
    if (todo === undefined) return null;
    return <li onClick={() => todos.writeSlotContentByKey(id, { ...todo, done: !todo.done })}>{todo.done ? '✓ ' : ''}{todo.title}</li>;
}

export const App = () => <OIMDBProvider db={db}><ul><Todo id="t1" /><Todo id="t2" /></ul></OIMDBProvider>;
```

Clicking a todo re-renders that one `Todo` and nothing else. The `channelScheduler` delivers every write of a
turn in one flush on a microtask, so nothing calls `db.flush()` by hand.

Indexes, sorted views, computed values and persistence build on the same collection: see the
[Quick Start](https://oimdb.org/docs/getting-started/quick-start).

### Without React

```typescript
import { OIMDB, OIMEffectService, createOIMSlotCollectionStoreAggregate, createOIMEntityContentService } from '@oimdb/core';

type TUser = { id: string; name: string };

const db = new OIMDB();
const users = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TUser>() });

const ann = users.writeSlotContentByKey('u1', { id: 'u1', name: 'Ann' });
const watching = OIMEffectService.INSTANCE.createEffect(db, () => {
    console.log('Ann changed');
}, [ann]);

ann.updateEntity({ name: 'Ann B.' });
db.flush();   // → Ann changed

OIMEffectService.INSTANCE.disposeEffect(watching);
```

## Packages

| Package | |
|---|---|
| [@oimdb/core](packages/core/README.md) | The engine |
| [@oimdb/react](packages/react/README.md) | React hooks |
| [@oimdb/redux-adapter](packages/redux-adapter/README.md) | Redux side by side |
| [@oimdb/persist](packages/persist/README.md) | Persistence, with memory, localStorage, IndexedDB, async KV and JSON backends |
| [@oimdb/exodra](packages/exodra/README.md) | Exodra bridge |
| [@oimdb/browser](packages/browser/README.md) | Browser state as single slots: online, focus, visibility, location |
| [@oimdb/devtools](packages/devtools/README.md) | Debug registry |
| [@oimdb/cli](packages/cli/README.md) | Command line: inspect a live page, a model module or Chrome over CDP; the DevTools UI |
| [@oimdb/mcp](packages/mcp/README.md) | MCP server for assistants |

## Documentation

**[oimdb.org](https://oimdb.org/)**, sources in [`website/docs/`](website/docs/).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
