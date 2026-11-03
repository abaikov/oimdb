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
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMDBProvider, useOIMDB, useOIMSourceTrackingValue } from '@oimdb/react';

type TTodo = { id: string; title: string; done: boolean };

const createTodoSchema = (db: OIMDB) => ({ todos: createOIMEntitySlotCollectionStoreAggregate<TTodo>(db) });
const createAppDB = () => new OIMDB({ createSchemas: (db) => ({ default: createTodoSchema(db) }) });
const useAppDB = useOIMDB.withTypes<ReturnType<typeof createAppDB>>();

const db = createAppDB();

db.schemas.default.todos.writeSlotContentByKey('t1', { id: 't1', title: 'Buy milk', done: false });
db.schemas.default.todos.writeSlotContentByKey('t2', { id: 't2', title: 'Call mum', done: false });

function Todo({ id }: { id: string }) {
    const db = useAppDB();
    const { todos } = db.schemas.default;
    const todo = useOIMSourceTrackingValue(() => todos.getSlotByKey(id).entity, [todos, id]);
    if (todo === undefined) return null;
    const toggle = () => {
        todos.getSlotByKey(id).updateEntity({ done: !todo.done });
        db.flush();
    };
    return <li onClick={toggle}>{todo.done ? '✓ ' : ''}{todo.title}</li>;
}

export const App = () => <OIMDBProvider db={db}><ul><Todo id="t1" /><Todo id="t2" /></ul></OIMDBProvider>;
```

Clicking a todo re-renders that one `Todo` and nothing else, at the `db.flush()` the handler calls: a
database delivers only when it is flushed, every write since the last flush at once.

The database is built once with its schemas: collections, single entities, indexes, computed values, each a store
aggregate ([A database with schemas](https://oimdb.org/docs/getting-started/oimdb)). Release policies
and persistence are on the services under them: see the [Quick Start](https://oimdb.org/docs/getting-started/quick-start).

### Without React

```typescript
import { OIMDB, createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';

type TUser = { id: string; name: string };

const db = new OIMDB({ createSchemas: (db) => ({ users: createOIMEntitySlotCollectionStoreAggregate<TUser>(db) }) });
const { users } = db.schemas;
users.writeSlotContentByKey('u1', { id: 'u1', name: 'Ann' });

const stop = db.createEffect(() => {
    console.log('Ann is', users.getSlotByKey('u1').entity?.name);
});
// → Ann is Ann

users.getSlotByKey('u1').updateEntity({ name: 'Ann B.' });
db.flush();
// → Ann is Ann B.

stop();
```

## Packages

| Package | |
|---|---|
| [@oimdb/core](packages/core/README.md) | The engine |
| [@oimdb/react](packages/react/README.md) | React hooks |
| [@oimdb/redux-adapter](packages/redux-adapter/README.md) | Redux side by side |
| [@oimdb/persist](packages/persist/README.md) | Persistence, with memory, localStorage, IndexedDB, async KV and JSON backends |
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
