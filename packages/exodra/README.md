# @oimdb/exodra

The [Exodra](https://exodra.org) plugin for `@oimdb/core`. It reads: one-line effects and bucket children that keep
their nodes. Writes go through your orchestrator (cnstra), not through the view.

📖 **[Full documentation](https://oimdb.org/docs/packages/exodra)**

```bash
npm install @oimdb/exodra @oimdb/core @exodra/core @exodra/dom @exodra/context
```

## Plug it in

```ts setup
import { EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts, wireExoNode } from '@exodra/core';
import { ExoDomBackend, withExoCompiler, type TExoDomNode } from '@exodra/dom';
import { OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService, createOIMEntityContentService, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate, type TOIMBucketContentSlot, type TOIMBucketSlotsArrayStore, type TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin, withOIMBucketChildren, withOIMEffects } from '@oimdb/exodra';

type TTodo = { id: string; title: string; done: boolean };
type TTodoSlot = TOIMEntitySlot<TTodo, string>;
type TTodosParams = { readonly todosSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TTodoSlot>, TTodoSlot> };
const db = new OIMDB();
const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
const filter = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ shown: 'done' | 'active' }>() });
const Ports = exoPorts({ TITLE: EXO_PORT_TEXT, ITEMS: EXO_PORT_CHILDREN });
const todoMachine = createExoMachine<TExoDomNode, TTodoSlot, { todo: TTodoSlot }>(
    createExoSchema(Ports, (b) => { b.el('li', null, (li) => { li.textPort(Ports.TITLE); }); }),
    { createInitialState: (_c, todo) => ({ todo }) },
);
const listMachine = createExoMachine<TExoDomNode, TTodosParams, Record<string, never>>(
    createExoSchema(Ports, (b) => { b.el('ul', null, (ul) => { ul.childrenPort(Ports.ITEMS); }); }),
    {},
);
```


```ts
const exodraPlugin = new OIMExodraPlugin({ db });
const backend = composeExoPlugins(withExoCompiler(new ExoDomBackend()), {
    exodraPlugin: () => exodraPlugin,
});
```

The plugin holds the database, one `slot.data` cell it claimed on it (`db.claimSlotDataCell()`) and a release
listener; `exodraPlugin.dispose()` removes the listener. A node takes the plugin provided above it under
`OIM_EXODRA_PLUGIN_CONTEXT_TOKEN`, and the backend's one otherwise. A second database is a second plugin, built
once next to that database and provided above the subtree that shows it:
`c.provide(OIM_EXODRA_PLUGIN_CONTEXT_TOKEN, …)`.

## One-line effects

```ts
const todoView = withOIMEffects(todoMachine, (effect) => {
    effect((c) => { c.text(Ports.TITLE, c.state.todo.entity?.title ?? ''); });
});
```

Each body is a tracked `db.createEffect` on the node's database, which it is handed as the second argument:
whatever it reads (`slot.entity`, a column slot's `value`, a computed's `value`, a bucket's members) is what wakes
it, and it stops with the node.

## Bucket children

```ts
const todoView = withOIMEffects(todoMachine, (effect) => {
    effect((c) => { c.text(Ports.TITLE, c.state.todo.entity?.title ?? ''); });
});
const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
    selectKey: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
    slotContentService: new OIMPositionalArrayBucketContentService<TTodoSlot, string>({ bucketCommands: new OIMBucketCommands({}) }),
});
const listView = withOIMBucketChildren(listMachine, {
    childrenPort: Ports.ITEMS,
    memberMachine: todoView,
    selectBucketSlot: (params) => params.todosSlot,
});
const BoardPorts = exoPorts({ LIST: EXO_PORT_CHILDREN });
const boardView = withOIMEffects(
    createExoMachine<TExoDomNode, unknown, { list: TExoDomNode }>(
        createExoSchema(BoardPorts, (b) => { b.el('main', null, (main) => { main.childrenPort(BoardPorts.LIST); }); }),
        { createInitialState: (c) => { const list = c.createExoNode(listView as never); c.appendChild(BoardPorts.LIST, list); return { list }; } },
    ),
    (effect) => {
        effect((c) => { wireExoNode(c.state.list, { todosSlot: todosByDone.getSlotByKey(filter.getSingleSlot().entity?.shown ?? 'active') }); });
    },
);
```

- **Give the bucket a recorder.** With `bucketCommands`, an insert builds one node and a remove detaches one.
  Without it every change rebuilds the list from the members (still keeping their nodes).
- **The bucket comes in params.** `selectBucketSlot(params)` picks the bucket slot out of the params the node is
  wired with, and is the key of an Exodra params effect (`withExoParamsEffects`): a `wireExoNode` with another
  bucket restarts it, a wire with the same one does nothing. Whoever wires the node chooses the bucket, typically
  a parent's tracked effect, as `boardView` does above. The only subscription the children hold is the bucket
  slot's own `watch`.
- **Parked nodes.** A node that leaves the children is parked in its slot's cell with its own effects stopped (its
  child nodes keep theirs), and is reattached if the member comes back, also after a switch to another bucket and
  back. When the engine releases the slot, or the node's effects stop (it is disconnected or destroyed), the
  parked node is destroyed (`destroyExoNode`).
