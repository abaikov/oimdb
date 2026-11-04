---
sidebar_position: 0.5
description: How OIMDB and cnstra fit together — the database handed to cnstra as its global, every write made inside a domain neuron, one db.flush() per turn from a drain listener, and a view that replays its list from the frame's commands.
---

# OIMDB with cnstra

cnstra decides what happens; OIMDB holds the state it happens to. Two lines join them. The database is handed to
the `CNS` as its global, so every neuron reads and writes it through `{ global }` with no import. And a drain
listener calls `db.flush()` at the end of every synchronous turn, so the orchestrator, not a timer, decides when
a frame is delivered.

<InShort>

- Build the database once and pass it as the third argument of `new CNS(neurons, undefined, db)`; neurons typed with `withCNSGlobal<TTodoDb>()` read it as `{ global }`.
- Every write happens inside a domain neuron. The view stimulates and subscribes, and never writes.
- `cns.addDrainListener(() => db.flush())` is the one commit point: one frame per synchronous turn.
- `OIMDB` has no default scheduler on purpose; without cnstra, a scheduler is chosen at construction.

</InShort>

This page needs a release of `@cnstra/core` after 3.0.0, the one that exports `withCNSGlobal` and `collateral`.
cnstra is not installed in this repository, so the setup block below is a hand-written stand-in for the three cnstra
names the example uses; it lets the OIMDB side of the example be type-checked, and it is not checked against cnstra.

```ts setup
import { OIMBucketCommands, OIMDB, OIMPositionalArrayBucketContentService, createOIMEntityContentService, createOIMEntitySlotCollectionStoreAggregate, createOIMSingleSlotStoreAggregate, createOIMSlotCollectionIndexStoreAggregate } from '@oimdb/core';
import type { TOIMEntitySlot, TOIMSlot } from '@oimdb/core';

type TCNSSignal = { readonly collateral: unknown };
type TCNSCollateral<TPayload> = { createSignal(): TCNSSignal; createSignal(payload: TPayload): TCNSSignal };
declare function collateral<TPayload = undefined>(): TCNSCollateral<TPayload>;
declare function withCNSGlobal<TGlobal>(): {
    neuron(axon: Record<string, TCNSCollateral<never>>): {
        bind<TFollowAxon extends Record<string, TCNSCollateral<never>>>(
            axon: TFollowAxon,
            dendrites: {
                [K in keyof TFollowAxon]: (
                    payload: TFollowAxon[K] extends TCNSCollateral<infer TPayload> ? TPayload : never,
                    axon: unknown,
                    ctx: { global: TGlobal },
                ) => void
            },
        ): unknown;
    };
};
declare class CNS {
    constructor(neurons: unknown[], options: undefined, global: unknown);
    addDrainListener(listener: () => void): () => void;
    stimulate(signal: TCNSSignal): unknown;
}

type TTodo = { id: string; title: string; done: boolean };
declare function fetchTodos(): Promise<TTodo[]>;
```

## The database is cnstra's global

A todo list, whole. The database is built by one function, as in
[Dependency injection](/docs/guides/dependency-injection). Its schema holds a collection of todos, an index that
splits them into `active` and `done` buckets, a single slot for the loading state, and the id counter the neurons
need. The buckets are positional and record each frame's changes with `OIMBucketCommands`, so the view can patch
its list instead of rebuilding it. The `OIMDB` itself is the cnstra global:

```ts
const createTodoSchema = (db: OIMDB) => {
    const todos = createOIMEntitySlotCollectionStoreAggregate<TTodo>(db);
    const todosByDone = createOIMSlotCollectionIndexStoreAggregate(todos, {
        selectKey: (todo: TTodo): 'done' | 'active' => (todo.done ? 'done' : 'active'),
        slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TTodo>, string>({
            bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }),
        }),
    });
    const loading = createOIMSingleSlotStoreAggregate(db, {
        slotContentService: createOIMEntityContentService<{ isLoading: boolean }>(),
    });
    let lastTodoId = 0;
    const nextTodoId = (): string => String(++lastTodoId);
    return { todos, todosByDone, loading, nextTodoId };
};

const createTodoDb = () => new OIMDB({ createSchemas: (db) => ({ default: createTodoSchema(db) }) });

type TTodoDb = ReturnType<typeof createTodoDb>;

const TodoUiAxon = {
    newTodoEntered: collateral<{ title: string }>(),
    toggleClicked: collateral<{ id: string; done: boolean }>(),
    destroyClicked: collateral<{ id: string }>(),
    clearCompletedClicked: collateral(),
    todosRequested: collateral(),
};

const { neuron } = withCNSGlobal<TTodoDb>();

const todoNeuron = neuron({}).bind(TodoUiAxon, {
    newTodoEntered: ({ title }, _axon, { global }) => {
        const { todos, nextTodoId } = global.schemas.default;
        const id = nextTodoId();
        todos.writeSlotContentByKey(id, { id, title, done: false });
    },
    toggleClicked: ({ id, done }, _axon, { global }) => {
        global.schemas.default.todos.getSlotByKey(id).updateEntity({ done });
    },
    destroyClicked: ({ id }, _axon, { global }) => {
        global.schemas.default.todos.getSlotByKey(id).clearSlotContent();
    },
    clearCompletedClicked: (_payload, _axon, { global }) => {
        const { todos, todosByDone } = global.schemas.default;
        for (const todo of todosByDone.getEntitiesByKey('done')) todos.getSlotByKey(todo.id).clearSlotContent();
    },
    todosRequested: async (_payload, _axon, { global }) => {
        const { todos, loading } = global.schemas.default;
        loading.writeSingleSlotContent({ isLoading: true });
        const fetchedTodos = await fetchTodos();
        todos.writeInBatch(() => {
            for (const todo of fetchedTodos) todos.writeSlotContentByKey(todo.id, todo);
        });
        loading.clearSingleSlotContent();
    },
});

const createTodoCns = (db: TTodoDb) => {
    const cns = new CNS([todoNeuron], undefined, db);
    cns.addDrainListener(() => db.flush());
    return cns;
};

const db = createTodoDb();
const cns = createTodoCns(db);

const mountActiveList = (renderedActiveSlots: TOIMSlot[]) => {
    const activeBucketSlot = db.schemas.default.todosByDone.holdSlotByKey('active');
    renderedActiveSlots.splice(0, renderedActiveSlots.length, ...activeBucketSlot.getBucketMemberSlots());
    const stopActiveList = db.createEffect(() => {
        if (activeBucketSlot.isWholeListRecorded) {
            renderedActiveSlots.splice(0, renderedActiveSlots.length, ...activeBucketSlot.getBucketMemberSlots());
            return;
        }
        for (const command of activeBucketSlot.commands ?? []) {
            switch (command.type) {
                case 'insert': renderedActiveSlots.splice(command.index, 0, command.slot); break;
                case 'remove': renderedActiveSlots.splice(command.index, 1); break;
                case 'move': renderedActiveSlots.splice(command.to, 0, ...renderedActiveSlots.splice(command.from, 1)); break;
            }
        }
    }, [activeBucketSlot]);
    return () => {
        stopActiveList();
        activeBucketSlot.unholdSlot();
    };
};

const renderedActiveSlots: TOIMSlot[] = [];
const unmountActiveList = mountActiveList(renderedActiveSlots);
cns.stimulate(TodoUiAxon.newTodoEntered.createSignal({ title: 'Buy milk' }));
cns.stimulate(TodoUiAxon.todosRequested.createSignal());
```

`unmountActiveList` is what the view calls when it goes away; until then the fetched todos land in
`renderedActiveSlots` at the drain after `fetchTodos` settles.

`withCNSGlobal<TTodoDb>()` types `{ global }` in every dendrite of the neurons it makes, and
`new CNS(neurons, undefined, db)` hands the database to them; cnstra carries it and never reads it. A dendrite
reaches the schema the same way the rest of the application does, `global.schemas.default.todos`. No neuron
imports the database, so a test builds its own with `createTodoDb()` and its own `CNS` around it.

The view gets `db` and `cns` from the entry point through its own context, and does two things with them. It
**subscribes**: `db.createEffect(…)` on the slots it shows, or the React hooks under `<OIMDBProvider db={db}>`. And
it **stimulates**: a click becomes `cns.stimulate(TodoUiAxon.toggleClicked.createSignal({ id, done }))`. It never
writes a slot itself.

`mountActiveList` is a view's list. It holds the `active` bucket slot for as long as it is mounted, and its
teardown gives that hold back with `unholdSlot()` after stopping the effect: the view that holds a slot is the one
that unholds it. The effect runs once per frame in which the bucket changed and replays that frame's `commands` —
`insert`, `remove`, `move` — onto the list it rendered, so a frame costs the changes in it, not the length of the
list. When the bucket gave up on a script (`isWholeListRecorded`), it reads the members and starts over. The fields are described under [buckets](/docs/core/indexes); read them inside the
frame, since they are reset after it.

## One flush per turn

cnstra calls a drain listener at the end of every synchronous turn of every stimulation. The one line in
`createTodoCns`, `cns.addDrainListener(() => db.flush())`, makes that the one commit point of the whole
application. Application code carries no other `flush()` call.

## What it buys

- **One frame per turn.** Every write a stimulation makes in one synchronous turn
  lands in one frame; each effect runs at most once for it, synchronously, at the
  end of the turn. No microtask, no timer, no frame split in the middle of a
  logical change.
- **Loading first, data later, with the same line.** A turn that awaits ends
  early, and the drain flushes what it wrote so far. When the promise settles, the
  next turn writes the result and the next drain flushes that. The `todosRequested`
  dendrite above reads as plain code: the first drain delivers `{ isLoading: true }`;
  the second delivers the fetched todos and the cleared loading slot. Nothing in the
  neuron or the view handles the two frames: the drains already are them.

## The rule this rests on

**Every mutation goes through a domain neuron.** A write made outside cnstra — from
a click handler, a socket callback, a timer — is not something the engine papers
over with a fallback scheduler. It is the mistake cnstra exists to prevent. Route
the event into a stimulation and let the neuron write.

## Why not a default scheduler

A scheduler in the engine decides on its own when to deliver, so it cuts a
stimulation's turn into frames wherever its clock happens to fire. Manual `flush()`
leaves that decision to the one party that knows where a unit of work ends. Tests
call `db.flush()` themselves; applications hand it to the drain.

The mechanism is in the core, not in an integration: a write asks the channel
for a flush, and with no `channelScheduler` there is nothing to carry that request,
so the pending effects wait. `flush()` then runs them all in one frame, whenever it
is called.

## Without cnstra: a scheduler, chosen at construction

When there is no orchestrator to own the turn, give the channel a scheduler
instead. A `TOIMChannelScheduler` is `(flush: () => void) => void`: the channel
calls it once when the first write of a frame asks for a flush, and the scheduler
decides when `flush` runs. A microtask gives one frame per synchronous turn of
plain JavaScript:

```ts
const scheduledDb = new OIMDB({ channelScheduler: flush => queueMicrotask(flush) });
```

That is the other arm of the same fork. It is picked once, when the database
is built, and the write path does not ask which arm it is on. The scheduler arm
costs what was named above: it ends a frame wherever its own clock
fires, which for a microtask is at the first `await`, so a logical change that
spans an `await` is delivered as two frames. Under cnstra the same split happens,
but the orchestrator's turn boundary decides it, not a timer. A
`flush()` called while a scheduled one is pending runs the frame at once; when the
scheduled call comes, it finds nothing left to flush and does nothing.

If `flush()` runs from a scheduler callback, an `OIMThrowAtOnceErrorPolicy`
throw has no synchronous caller to land in — see
[Error handling](/docs/guides/error-handling).
