---
sidebar_position: 1
title: Storing data
description: Load API responses, patch or replace entities, delete them, model one-to-many and many-to-many relations, key by several fields and soft-delete.
---

# Storing data

How to put data into entity store slots and keep it in shape: loading a server response,
patching versus replacing an entity, dropping a column, deleting, one-to-many and
many-to-many relations, composite keys, a single settings record, soft delete, and
choosing between the in-place and the replacing writer.

```ts setup
import { OIMDB, OIMDefaults, OIMEffectService, OIMSlotNeverReleasePolicy, OIMSlotTreeStoreService, createOIMReplacingEntityWriter, createOIMSlotCollectionIndexService, createOIMSlotCollectionService, createOIMEntityContentService, type IOIMSlotEmptinessPolicy, type TOIMEntitySlot, type TOIMSlotStoreTree, type TOIMStoreKey, createOIMSingleSlotService, OIMScalarKeyTreeWalk } from '@oimdb/core';

type User = { id: string; name: string };
type Message = { id: string; chatId: string; text: string; pinned?: boolean };

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const userService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<User>() });
const users = userService.createStoreSlot(db);
const messageService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Message>() });
const messages = messageService.createStoreSlot(db);
const messageContentService = messageService.slotContentService;

declare function render(value: unknown): void;
declare function fetchMessages(chatId: string): Promise<readonly Message[]>;
```

## Load an API response into an entity store slot

Take: a loop of `writeSlotContentByKey(storeSlot, key, entity)` inside `writeInBatch(storeSlot, …)` for any
response: the batch tells indexes once for the whole response.

```ts
async function loadChat(chatId: string): Promise<void> {
    const response = await fetchMessages(chatId);

    const changed: TOIMEntitySlot<Message, TOIMStoreKey>[] = [];
    const slots = messageService.writeInBatch(messages, () => (response).map(entity => messageService.writeSlotContentByKey(messages, entity.id, entity, changed)));

    render(slots.length);    // every message of the response, in response order
    render(changed.length);  // only the ones whose content differed from what was stored
    db.flush();
}

const seeded = userService.createStoreSlot(db);
userService.writeInBatch(seeded, () => ([
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
]).map(entity => userService.writeSlotContentByKey(seeded, entity.id, entity)));
```

Why this way: each content-change listener (an index) is called once with every slot of the batch, when
the batch closes. `writeInBatch` returns what its function returns — here the slot of every entity in
input order, so the result can go straight into a bucket. The optional array collects only the slots whose
content actually changed — re-sent, unchanged entities wake nobody and are not in it.

Reference: [Writing — the writes](/docs/core/writing#the-writes),
[Which entities actually changed](/docs/core/writing#which-entities-actually-changed),
[A load is a loop in a batch](/docs/core/writing#a-load-is-a-loop-in-a-batch).

## Update part of an entity, replace it whole, or drop a column

Take: `updateEntityColumn(slot, columnName, value)` to change one column,
`updateEntity(slot, patch)` (PATCH) to change several named columns;
`writeSlotContentByKey(storeSlot, entity)` (PUT) to make the stored entity exactly the value given — a
column the new value does not carry is taken away. To take named columns out
without restating the rest, `deleteEntityColumns(slot, columnNames)`.

```ts
const slot = messageService.writeSlotContentByKey(messages, 'm1', { id: 'm1', chatId: 'c1', text: 'Hi', pinned: true });

slot.updateEntityColumn('text', 'Hello');      // text moves, pinned stays
const byKey = messageService.peekSlotByKey(messages, 'm1');           // a key arriving from outside
if (byKey !== undefined) byKey.updateEntity({ text: 'Hello!' });

messageService.writeSlotContentByKey(messages, 'm1', { id: 'm1', chatId: 'c1', text: 'Hello!' });   // pinned is taken away
slot.entity?.pinned;                                                  // undefined
db.flush();
```

Why this way: PATCH and PUT are two writer calls, `patchEntity` and
`putEntity`, and both report the columns that actually moved, so a column
subscriber of `text` is not woken by a change to `pinned`. Take `updateEntity`
or `updateEntityColumn` on the slot you hold — the write that returned it already paid for the
lookup; a key arriving from outside is resolved once with `peekSlotByKey` (which mints nothing) or
`getSlotByKey`. The one by-key write is the whole-value `writeSlotContentByKey`. A dropped column is set to
`undefined` under both writers rather than deleted, so every entity of a kind
keeps one object shape; the key stays in `Object.keys`, reads `undefined`, and
counts as absent.

Reference: [Writing — which write to take](/docs/core/writing#which-door-to-take),
[The two writers](/docs/core/writing#the-two-writers).

## Delete an entity, and what happens to its subscribers

Take: `clearSlotContent(slot)` on the slot, a loop of it inside `writeInBatch` for many. There is no call that
destroys an identity: a delete takes the value away, and the slot goes only when
nothing refers to it.

```ts
const watched = messageService.writeSlotContentByKey(messages, 'm2', { id: 'm2', chatId: 'c1', text: 'Draft' });
const onMessage = effectService.createEffect(db, () => render(watched.entity), [watched]);
db.flush();

watched.clearSlotContent();
db.flush();                        // onMessage runs; watched.entity is undefined

messageService.writeSlotContentByKey(messages, 'm2', { id: 'm2', chatId: 'c1', text: 'Back' });
db.flush();                        // the same slot is filled; onMessage runs again

effectService.disposeEffect(onMessage);
const gone = ['m2', 'm3'].flatMap((id) => messageService.peekSlotByKey(messages, id) ?? []);
messageService.writeInBatch(messages, () => { for (const entitySlot of gone) entitySlot.clearSlotContent(); });   // a key with no slot is simply not in the list
```

Why this way: a subscription takes a hold on the slot it watches, so a deleted
entity's subscriber stays subscribed to the same identity, is woken by the delete
(the slot had a value), and is woken again when a later upsert under the same key
lands on that slot. Once nothing holds it and it has no value, the default
`OIMSlotAtEmptyReleasePolicy` releases it; a released slot throws on every call that takes it,
and the next read of the key mints a new one. An index drops the entity from its
bucket on delete, because the delete reaches it through the content-change hook; a
manual bucket store slot does not — the caller who put a slot in a bucket takes it
out.

Reference: [Lifecycle](/docs/core/lifecycle),
[A removal leaves a bucket's slots standing](/docs/core/writing#a-removal-leaves-a-buckets-slots-standing).

## One-to-many: messages by chat

Take: an index on the foreign key — `createOIMSlotCollectionIndexService({ entityService, selectKey })`,
then `createIndexStoreSlot(entityStoreSlot)` for the store slot it files.
Do not keep an array of message ids on the chat entity: nothing would keep it in
step with writes to messages.

```ts
const messagesByChatService = createOIMSlotCollectionIndexService({
    entityService: messageService,
    selectKey: (message: Message) => message.chatId,
});
const messagesByChat = messagesByChatService.createIndexStoreSlot(messages);

const chatBucket = messagesByChatService.holdSlotByKey(messagesByChat, 'c1');
const onChat = effectService.createAndRunEffect(db, () => {
    for (const messageSlot of chatBucket.getBucketMemberSlots()) render(messageSlot.entity);
}, [chatBucket]);

const joining = messageService.writeSlotContentByKey(messages, 'm4', { id: 'm4', chatId: 'c1', text: 'Joins c1' });
joining.updateEntity({ chatId: 'c2' });   // leaves c1's bucket, joins c2's
db.flush();

effectService.disposeEffect(onChat);
chatBucket.unholdSlot();
```

Why this way: membership is a function of the entity, so every write can decide
it: the index files the entity's slot under `selectKey(entity)` through the source's
content-change hook, and moves it when the key changes. The bucket wakes on
membership only — an edit to a message that stays in the chat does not wake it;
each message is read or subscribed through its own slot. A key nobody minted a
bucket for is not maintained at all: a write under it costs one `selectKey`, one
comparison and, when the key changed, one write of the entity's index-key cell. The buckets keep arrival
order; for messages sorted by a column see [Lists](/docs/recipes/lists).

Reference: [Indexes](/docs/core/oimindex),
[Why an index looks like this](/docs/core/index-shape).

## Many-to-many: users and groups

Take: a join entity type whose entity names both sides, plus one index per side.
Do not store arrays of ids on either entity: each side would need its own write to
stay in step, and nothing ties the two writes together.

```ts
type Group = { id: string; title: string };
type Membership = { id: string; userId: string; groupId: string };

const groupService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Group>() });
const groups = groupService.createStoreSlot(db);
const membershipService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Membership>() });
const memberships = membershipService.createStoreSlot(db);
const membershipsByUserService = createOIMSlotCollectionIndexService({
    entityService: membershipService,
    selectKey: (membership: Membership) => membership.userId,
});
const membershipsByUser = membershipsByUserService.createIndexStoreSlot(memberships);
const membershipsByGroupService = createOIMSlotCollectionIndexService({
    entityService: membershipService,
    selectKey: (membership: Membership) => membership.groupId,
});
const membershipsByGroup = membershipsByGroupService.createIndexStoreSlot(memberships);

groupService.writeInBatch(groups, () => ([{ id: 'g1', title: 'Admins' }, { id: 'g2', title: 'Editors' }]).map(entity => groupService.writeSlotContentByKey(groups, entity.id, entity)));
const [, secondMembership] = membershipService.writeInBatch(memberships, () => ([
    { id: 'ms1', userId: 'u1', groupId: 'g1' },
    { id: 'ms2', userId: 'u1', groupId: 'g2' },
]).map(entity => membershipService.writeSlotContentByKey(memberships, entity.id, entity)));

const userMemberships = membershipsByUserService.holdSlotByKey(membershipsByUser, 'u1');
const onUserGroups = effectService.createAndRunEffect(db, () => {
    for (const membershipSlot of userMemberships.getBucketMemberSlots()) {
        const membership = membershipSlot.entity;
        if (membership !== undefined) render(groupService.peekSlotByKey(groups, membership.groupId)?.entity);
    }
}, [userMemberships]);

secondMembership.clearSlotContent();     // u1 leaves g2: both indexes drop it
membershipsByGroupService.getEntitiesByKey(membershipsByGroup, 'g1');
db.flush();

effectService.disposeEffect(onUserGroups);
userMemberships.unholdSlot();
```

Why this way: the relation is one entity per pair, so joining or leaving is one
write, and both indexes re-file it from that write. Each side is then the
one-to-many case above. The effect wakes when a membership of the user joins or
leaves; a group being renamed does not wake it — subscribe to the group slots
themselves where the title is rendered.

Reference: [Indexes](/docs/core/oimindex).

## Key an entity by more than one field

Take: an entity collection over `OIMSlotTreeStoreService`,
handed `OIMScalarKeyTreeWalk.INSTANCE`, with `selectKey` returning the parts in
order. Do not join the parts into one string: an encoding has to be injective, and
a join on a separator is not.

```ts
type TScalarChain = readonly TOIMStoreKey[];
type ReadMark = { userId: string; chatId: string; lastReadAt: number };
type TReadMarkStore = TOIMSlotStoreTree<TOIMEntitySlot<ReadMark, TScalarChain>, TOIMStoreKey>;

const readMarkService = createOIMSlotCollectionService<ReturnType<typeof createOIMEntityContentService<ReadMark, TScalarChain>>, TReadMarkStore>({
    slotContentService: createOIMEntityContentService<ReadMark, TScalarChain>(),
    slotStoreService: new OIMSlotTreeStoreService<TOIMStoreKey, TOIMEntitySlot<ReadMark, TScalarChain>>(
        OIMScalarKeyTreeWalk.INSTANCE,
    ),
});
const readMarks = readMarkService.createStoreSlot(db);

readMarkService.writeSlotContentByKey(readMarks, ['u1', 'c1'], { userId: 'u1', chatId: 'c1', lastReadAt: 1 });
readMarkService.peekSlotByKey(readMarks, ['u1', 'c1'])?.entity?.lastReadAt;   // 1: a rebuilt array finds the same slot
```

Why this way: the tree store descends one `Map` lookup per key part and files a
copy of the array, so a rebuilt array of the same parts resolves to the same slot,
order matters, and `[a]` and `[a, b]` are different keys. The walk is picked once at
construction. The scalar walk holds nothing: deleting user `u1` does not touch keys
that start with `'u1'`. When a key part is itself an entity whose identity the key
must keep, key by slots instead and hand the store
`OIMCompositeKeyTreeWalk.INSTANCE` — each edge then holds the entity slot it is
keyed by.

Reference: [Composite keys come in two strategies](/docs/core/collections#composite-keys-come-in-two-strategies-and-you-pick-one).

## A single record: settings or the session

Take: `createOIMSingleSlotService({ slotReleasePolicy })`, here with `OIMSlotNeverReleasePolicy`; make
its store slot with `createStoreSlot(db)`, give it its first value with
`writeSlotContentByKey(settings, entity)`, and read its one slot through the single doors:
`holdSingleSlot(settings)` (or `getSingleSlot`, or `peekSingleSlot` when nothing should be minted). Do not use a
Map-backed collection with one invented key: a Map store files identities per key, and a record has no key.

```ts
type Settings = { theme: 'light' | 'dark'; fontSize: number; token?: string };

const settingsService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<Settings>(), slotReleasePolicy: OIMSlotNeverReleasePolicy.INSTANCE });
const settings = settingsService.createStoreSlot(db);
const settingsContentService = settingsService.slotContentService;
settingsService.writeSingleSlotContent(settings, { theme: 'dark', fontSize: 14, token: 'abc' });
const settingsSlot = settingsService.holdSingleSlot(settings);

const themeColumn = settingsSlot.holdColumnSlot('theme');
const onTheme = effectService.createEffect(db, () => render(settingsSlot.entity?.theme), [themeColumn]);

settingsSlot.updateEntity({ fontSize: 16 });                 // PATCH; onTheme is not woken
settingsSlot.deleteEntityColumns(['token']);                 // a column out, which a patch cannot say
settingsSlot.writeSlotContent({ theme: 'light', fontSize: 16 }); // PUT; onTheme is woken
db.flush();

effectService.disposeEffect(onTheme);
themeColumn.unholdSlot();
```

Why this way: a single is a store slot that holds one slot under no key, so there is no lookup to pay.
`createStoreSlot(db)` mints nothing: the slot is minted on the first get or hold, and the first value arrives
through `writeSlotContentByKey`, an ordinary announced write. Its slot is released like any slot of its type; this one is
built with `OIMSlotNeverReleasePolicy`, so the slot minted here is never released.
Under the default policy an unheld slot is released and the next get mints a fresh
one. A write that moved no column reaches no channel. `writeSlotContent`
is what restoring a saved state needs: a patch alone would leave behind columns that
were deleted before the snapshot.

Reference: [Standalone records](/docs/core/object),
[Writing a standalone record](/docs/core/writing#writing-a-standalone-record).

## Soft delete: an archived entity counts as empty

Take: an `IOIMSlotEmptinessPolicy` passed as `slotEmptinessPolicy` to the entity factory, together with
`OIMSlotNeverReleasePolicy` (or a hold on the keys you still read). Do not keep the default release policy with
it: under `OIMSlotAtEmptyReleasePolicy` an unheld slot your emptiness calls empty is released,
and the archived entity with it.

```ts
type Post = { id: string; title: string; archived: boolean };
type PostSlot = TOIMEntitySlot<Post, TOIMStoreKey>;

const archivedIsEmpty: IOIMSlotEmptinessPolicy<PostSlot> = {
    isEmpty: (slot) => slot.entity === undefined || slot.entity.archived,
};

const postService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Post>({ slotEmptinessPolicy: archivedIsEmpty }), slotReleasePolicy: OIMSlotNeverReleasePolicy.INSTANCE });
const posts = postService.createStoreSlot(db);

const oldPost = postService.writeSlotContentByKey(posts, 'p1', { id: 'p1', title: 'Old', archived: true });
db.flush();
postService.hasSlotContentByKey(posts, 'p1');                              // false
postService.peekSlotByKey(posts, 'p1')?.entity?.title;        // 'Old': the value is still stored
oldPost.updateEntity({ archived: false });
postService.hasSlotContentByKey(posts, 'p1');                              // true
```

Why this way: the slot's EMPTY flag is settled once per write by the injected checker,
and `hasSlotContentByKey`, the population walk over `getSlots` and the release policy all
read that one flag, so no reader re-tests the archived column. Emptiness decides
lifetime and leaves the write path alone: an upsert onto an archived entity replaces
it like any PUT. An index files by whether the slot has an entity and ignores
emptiness, so an archived post stays in its bucket; to keep it out of a list, make the archived
column part of the index key.

Reference: [Emptiness is a strategy](/docs/core/collections#emptiness-is-a-strategy),
[How long an identity stays](/docs/core/collections#how-long-an-identity-stays).

## Choose the in-place or the replacing writer

Take: `createOIMReplacingEntityWriter()` when a reader decides "did it change?"
by comparing the entity object to the last one it saw — a memoised component, a
shallow-equality selector. Keep the default, `createOIMInPlaceEntityWriter()`, when
every reader is an effect.

```ts
const replacingDefaults = new OIMDefaults({ entityWriter: createOIMReplacingEntityWriter() });
const contactService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<User>({ defaults: replacingDefaults }) });
const contacts = contactService.createStoreSlot(db);

const alice = contactService.writeSlotContentByKey(contacts, 'u1', { id: 'u1', name: 'Alice' });
const before = alice.entity;
alice.updateEntity({ name: 'Alicia' });
alice.entity !== before;   // true: a new object per write that changed something

const draftService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Message>({ entityWriter: createOIMReplacingEntityWriter() }) });
```

Why this way: under the in-place writer the stored object keeps its reference
across writes, so `slot.entity` before and after an update is `===` and a
reference comparison never sees the change — what tells you is your effect
running. The replacing writer builds a spread copy for each write that changed
something and keeps the old object for a write that changed nothing. The writer is
one object chosen at construction — on the `OIMDB` for every collection its
factories build, or per collection through `entityWriter` — so no write path branches on it.

Reference: [Which strategy to pick](/docs/core/writing#which-strategy-to-pick).
