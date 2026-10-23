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
npm install @oimdb/core
```

## Example

```typescript
import { OIMDB, OIMEffectService, createOIMEntityService } from '@oimdb/core';

type TUser = { id: string; name: string };

const db = new OIMDB();
const userService = createOIMEntityService<TUser>(db, { keyOf: (user) => user.id });
const users = userService.createStoreSlot(db);

userService.slotContentService.upsertEntities(users, [{ id: 'u1', name: 'Ann' }]);

const ann = userService.getSlotByKey(users, 'u1');
const watching = OIMEffectService.INSTANCE.createEffect(db, [ann], [], () => {
    console.log('Ann changed');
});

userService.slotContentService.updateEntity(ann, { name: 'Ann B.' });
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
| [@oimdb/devtools](packages/devtools/README.md) | Debug registry |
| [@oimdb/mcp](packages/mcp/README.md) | MCP server for assistants |

## Documentation

**[oimdb.org](https://oimdb.org/)**, sources in [`website/docs/`](website/docs/).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
