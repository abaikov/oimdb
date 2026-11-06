---
sidebar_position: 2.5
description: The Exodra plugin for OIMDB — one-line tracked effects, slot watches and bucket children that keep their nodes.
---

# Exodra

`@oimdb/exodra` is the Exodra plugin for `@oimdb/core`. It only reads: views show slots, and writes go through the
orchestrator ([OIMDB with cnstra](/docs/guides/with-cnstra)).

<InShort>

- One `OIMExodraPlugin` per database, composed into the backend; a node may be given another one through context.
- `withOIMEffects` takes one-line bodies, and each body is a tracked effect.
- `withOIMBucketChildren` applies a bucket's commands to a children port and parks the nodes that leave it.

</InShort>

```bash
npm install @oimdb/exodra @oimdb/core @exodra/core @exodra/dom @exodra/context
```

## The plugin

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

| Option | What it is |
|---|---|
| `childrenPort` | the children port the members are shown in |
| `memberMachine` | the machine each member slot is built with, the slot as its params |
| `selectBucketSlot` | `(params)`: the bucket slot in the params the node is wired with; a wire with another bucket switches to it |

The children are an Exodra params effect (`withExoParamsEffects`) keyed by `selectBucketSlot(params)`: its only
subscription is the bucket slot's own `watch`, and a `wireExoNode` with another bucket restarts it. Whoever wires
the node picks the bucket, usually a parent's tracked effect, as `boardView` does above.

The children take the bucket's commands through `OIMBucketCommandsCursor`: an insert builds one node, a remove
detaches one, a move moves one. Give the bucket's content service a `bucketCommands` recorder for that; without
one, every change is a `reset`. A `reset` — the first take, a whole-list record, a bucket that records no
commands, a switch to another bucket — detaches every node and puts the members back, reattaching each one's own
node. A node that leaves is parked in its slot's cell with its own effects stopped (its child nodes keep theirs),
reattached if the member comes back (also after a switch to another bucket and back), and destroyed
(`destroyExoNode`) when the engine releases the slot or the node's effects stop.
