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
import * as oim from '@oimdb/core/oim';
import { OIMDBProvider, useOIMSourceTrackingValue } from '@oimdb/react';

type TTodo = { id: string; title: string; done: boolean };

const todos = oim.entities<TTodo>();

todos.upsertEntityByKey('t1', { id: 't1', title: 'Buy milk', done: false });
todos.upsertEntityByKey('t2', { id: 't2', title: 'Call mum', done: false });

function Todo({ id }: { id: string }) {
    const todo = useOIMSourceTrackingValue(() => todos.getEntityByKey(id), [todos, id]);
    if (todo === undefined) return null;
    return <li onClick={() => todos.updateEntityByKey(id, { done: !todo.done })}>{todo.done ? '✓ ' : ''}{todo.title}</li>;
}

export const App = () => <OIMDBProvider db={oim.db()}><ul><Todo id="t1" /><Todo id="t2" /></ul></OIMDBProvider>;
```

Clicking a todo re-renders that one `Todo` and nothing else. `oim.db()` delivers every write of a turn in one
flush on a microtask, so nothing calls `db.flush()` by hand.

`@oimdb/core/oim` is the short API: collections, single entities, indexes, sorted indexes, computed values and
effects over one default database ([The short API](https://oimdb.org/docs/getting-started/oim)). Release policies
and persistence are on the full API under it: see the [Quick Start](https://oimdb.org/docs/getting-started/quick-start).

### Without React

```typescript
import * as oim from '@oimdb/core/oim';

type TUser = { id: string; name: string };

const users = oim.entities<TUser>();
users.upsertEntityByKey('u1', { id: 'u1', name: 'Ann' });

const stop = oim.effect(() => {
    console.log('Ann is', users.getEntityByKey('u1')?.name);
});
// → Ann is Ann

users.updateEntityByKey('u1', { name: 'Ann B.' });
// → Ann is Ann B., on the next microtask

stop();
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
