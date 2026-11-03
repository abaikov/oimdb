# @oimdb/exodra

The [Exodra](https://exodra.org) plugin for `@oimdb/core`. It reads: one-line effects and bucket lists that keep
their nodes. Writes go through your orchestrator (cnstra), not through the view.

📖 **[Full documentation](https://oimdb.org/docs/packages/exodra)**

```bash
npm install @oimdb/exodra @oimdb/core @exodra/core @exodra/dom @exodra/context
```

## Plug it in

```ts setup
import { EXO_PORT_CHILDREN, EXO_PORT_TEXT, composeExoPlugins, createExoMachine, createExoSchema, exoPorts } from '@exodra/core';
import { ExoDomBackend, withExoChildList, withExoCompiler, type TExoChildList, type TExoDomNode } from '@exodra/dom';
import { OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService, createOIMEntityContentService, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate, type TOIMEntitySlot } from '@oimdb/core';
import { OIMExodraPlugin, withOIMBucketList, withOIMEffects } from '@oimdb/exodra';

type TTodo = { id: string; title: string; done: boolean };
type TTodoSlot = TOIMEntitySlot<TTodo, string>;
const db = new OIMDB();
const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
const filter = createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<{ shown: 'done' | 'active' }>() });
const Ports = exoPorts({ TITLE: EXO_PORT_TEXT, ITEMS: EXO_PORT_CHILDREN });
const todoMachine = createExoMachine<TExoDomNode, TTodoSlot, { todo: TTodoSlot }>(
    createExoSchema(Ports, (b) => { b.el('li', null, (li) => { li.textPort(Ports.TITLE); }); }),
    { createInitialState: (_c, todo) => ({ todo }) },
);
const listMachine = createExoMachine<TExoDomNode, unknown, { items: TExoChildList }>(
    createExoSchema(Ports, (b) => { b.el('ul', null, (ul) => { ul.childrenPort(Ports.ITEMS); }); }),
    { createInitialState: (c) => ({ items: c.childList(Ports.ITEMS) }) },
);
```


```ts
const exodraPlugin = new OIMExodraPlugin({ db });
const backend = composeExoPlugins(withExoChildList(withExoCompiler(new ExoDomBackend())), {
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

## Bucket lists

```ts
const todoView = withOIMEffects(todoMachine, (effect) => {
    effect((c) => { c.text(Ports.TITLE, c.state.todo.entity?.title ?? ''); });
});
const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
    selectKey: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
    slotContentService: new OIMPositionalArrayBucketContentService<TTodoSlot, string>({ bucketCommands: new OIMBucketCommands({}) }),
});
const listView = withOIMBucketList(listMachine, {
    selectChildList: (c) => c.state.items,
    memberMachine: todoView,
    selectBucketSlot: () => todosByDone.getSlotByKey(filter.getSingleSlot().entity?.shown ?? 'active'),
});
```

- **Give the bucket a recorder.** With `bucketCommands`, an insert builds one node and a remove detaches one.
  Without it every change rebuilds the list from the members (still keeping their nodes).
- **Switching buckets.** `selectBucketSlot(c, db)` runs tracked: a write to what it read switches the list to the
  new bucket, keeping the nodes of the members both buckets share.
- **Parked nodes.** A node that leaves the list is parked in its slot's cell with its own effects stopped (its
  child nodes keep theirs), and is reattached if the member comes back. When the engine releases the slot, or the
  list goes, the parked node is unmounted.
