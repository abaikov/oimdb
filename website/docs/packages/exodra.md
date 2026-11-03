---
sidebar_position: 2.5
description: The Exodra plugin for OIMDB — one-line tracked effects, slot watches and bucket lists that keep their nodes.
---

# Exodra

`@oimdb/exodra` is the Exodra plugin for `@oimdb/core`. It only reads: views show slots, and writes go through the
orchestrator ([OIMDB with cnstra](/docs/guides/with-cnstra)).

<InShort>

- One `OIMExodraPlugin` per database, composed into the backend; a node may be given another one through context.
- `withOIMEffects` takes one-line bodies, and each body is a tracked effect.
- `withOIMBucketList` applies a bucket's commands to a child list and parks the nodes that leave it.

</InShort>

```bash
npm install @oimdb/exodra @oimdb/core @exodra/core @exodra/dom @exodra/context
```

## The plugin

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

`OIMExodraPlugin` holds the database, one `slot.data` cell it claims on it with `db.claimSlotDataCell()`, and a
listener on the slots the engine releases (`db.addSlotReleaseListener`); `dispose()` removes the listener.
`resolveOIMExodraPlugin(c)` is how every helper finds it: the plugin provided above the node under
`OIM_EXODRA_PLUGIN_CONTEXT_TOKEN` wins, and the backend's `exodraPlugin` is the default. A second database is a
second plugin, built once next to that database and provided above the subtree that shows it.

## One-line effects

```ts
const todoView = withOIMEffects(todoMachine, (effect) => {
    effect((c) => { c.text(Ports.TITLE, c.state.todo.entity?.title ?? ''); });
});
```

A body is a tracked `db.createEffect` that starts with the node and stops with it, and is handed the node's
database as its second argument. What it reads is what wakes it; read a column slot's `value` to wake on that
column alone.

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

| Option | What it is |
|---|---|
| `selectChildList` | the Exodra child list the members are shown in |
| `memberMachine` | the machine each member slot is built with, the slot as its params |
| `selectBucketSlot` | `(c, db)`: the bucket to show; run tracked, so a write to what it read switches buckets |

The list takes the bucket's commands through `OIMBucketCommandsCursor`: an insert builds one node, a remove
detaches one, a move moves one. Give the bucket's content service a `bucketCommands` recorder for that; without
one, every change is a `reset`. A `reset` — the first take, a whole-list record, a bucket that records no
commands, a switch to another bucket — detaches every node and puts the members back, reattaching each one's own
node. A node that leaves is parked in its slot's cell with its own effects stopped (its child nodes keep theirs),
reattached if the member comes back, and unmounted when the engine releases the slot or the list goes.
