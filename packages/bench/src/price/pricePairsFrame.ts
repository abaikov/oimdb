import { OIMEffectService, createOIMComputedService, oimSameValueZeroGuard } from '../../../core/src/index';
import type { TOIMComputedSlot, TOIMEffect } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/**
 * HOW MANY IDENTITIES ONE FRAME OF THE DELIVERY ROWS MOVES.
 *
 * 1024: large enough that the frame's own fixed cost — priced by
 * `flush.empty-vs-noop` — is a small part of each delivery, small enough to be a
 * screen's worth of work. A power of two for the reason `priceDataset.batch`
 * gives.
 */
const DELIVERED_PER_FRAME = 1024;

/**
 * EVERYTHING A FRAME OF THIS ENGINE KEEPS, AS A PERSON WOULD HAVE KEPT IT — one
 * plain object, no classes, no methods.
 *
 * It exists so `flush.empty-vs-the-same-bookkeeping-by-hand` puts our empty
 * frame against the SAME reads, stores, emptiness tests and counter increment
 * rather than against a counter bump. Every field has a counterpart in
 * `OIMChannelService`, in the order the frame touches them.
 *
 * SEVEN FIELDS WENT with the engine's own: `pending`, `spare`,
 * `delivering`, `notifiedSnapshot` (the two-list delivery swap), `recording`,
 * `unheld` (the release sweep), `byLevel`/`minLevel`/`maxLevel` (the levelled
 * scheduler) and `afterFlush` (the deferred-callback queue). A floor still
 * transcribing them would do work our side does not — the one direction a floor
 * must never drift in.
 */
type TFloorFrameState = {
    number: number;
    isRunning: boolean;
    isFlushing: boolean;
    anotherFrameOwed: boolean;
    frameRequested: boolean;
    onBeforeFlush: (() => void) | undefined;
    leaves: { stampedInFrame: number; run: () => void }[];
    afterEachFrame: Set<() => void>;
    errors: unknown[];
};

/** What a memo the floor keeps looks like, when the floor has to keep one. */
type TFloorMemo = {
    readonly row: TPriceDataRow;
    dirty: boolean;
    value: number;
};

/**
 * A hand-written field subscription: the column a handler cares about, and the
 * handler. Testing `watch.column` against the name the write just moved is the
 * whole of the mechanism.
 */
type TFloorFieldWatch = {
    readonly column: string;
    readonly run: () => void;
};

type TFloorSubscribedRecord = {
    readonly row: TPriceDataRow;
    readonly subscribers: (() => void)[];
    isQueued: boolean;
};

/**
 * EVERY PRICE THAT IS PAID ONCE PER FRAME, however many rows moved in it.
 *
 * The honest difficulty of this group is that the floor for a frame is NOTHING:
 * a person writing by hand repaints once per write. What a frame buys is
 * coalescing, and coalescing pays only when a screen writes the same row more
 * than once between two paints.
 *
 * SO THESE ROWS ARE ARRANGED IN OUR DISFAVOUR: every delivery row writes each
 * identity exactly once per frame, so our coalescing saves nothing. That is our
 * worst case and the only one where the two sides do equal work. The other end
 * of the range is the scenario benchmark.
 */
export const pricePairsFrame: readonly TPricePair[] = [
    {
        id: 'flush.empty-vs-noop',
        path: EPricePath.PerFrame,
        ours: 'db.flush() with nothing marked and nobody subscribed',
        floor: 'a call that bumps a frame counter',
        caveat:
            'THE FLOOR HERE IS ESSENTIALLY ZERO AND THE RATIO IS THEREFORE NOT A READING — take ' +
            'the absolute nanoseconds on our side and ignore the multiple. A hand-written store ' +
            'has no frame to close, so the nearest thing to a floor is the bookkeeping a person ' +
            'writes instead, and V8 inlines that to almost nothing. What ours does for the money: ' +
            'runs the effect graph\'s drain, swaps the two delivery lists, walks an empty ' +
            'delivery, runs the after-flush and after-each-frame phases, sweeps identities nobody ' +
            'holds and reports errors. This number is the fixed cost every other frame row ' +
            'carries, which is what makes it worth printing even though its ratio means nothing. ' +
            'AND THE MULTIPLE IS NOT THE ONLY THING TO IGNORE HERE: the floor is timed twice ' +
            'around our side and the two timings disagree by more than the gap they bracket, ' +
            'which is what the noise column on this row says. The absolute figure on our side is ' +
            'the reading; it is split by `flush.empty-vs-the-same-bookkeeping-by-hand`, whose ' +
            'floor performs these same phases inline.',
        build: () => {
            const fixture = priceFixture(16);
            let frame = 0;
            const closeFrame = (): void => {
                frame++;
            };
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const db = fixture.db;
                        for (let i = 0; i < times; i++) db.flush();
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) closeFrame();
                        priceSink.number = frame;
                    },
                },
            };
        },
    },

    {
        id: 'flush.empty-vs-the-same-bookkeeping-by-hand',
        path: EPricePath.PerFrame,
        ours: 'db.flush() with nothing marked and nobody subscribed',
        floor:
            'the same phases written out inline over a plain object: the two guards, the ' +
            'before-flush test, the empty leaf walk, the two emptiness tests and the counter',
        caveat:
            'THIS ROW EXISTS TO SPLIT `flush.empty-vs-noop`, WHICH IS A PRICE AGAINST NOTHING. ' +
            'That row puts an empty frame against a counter bump, so its multiple prices the ' +
            'existence of a frame rather than anything inside one, and it cannot say which part ' +
            'of the absolute figure is the bookkeeping and which is the SHAPE the bookkeeping is ' +
            'written in. This floor does the same work: the same field reads, the same stores, ' +
            'the same walk of an empty leaf array, the same two emptiness tests — the ' +
            'after-each-frame set and the error list — and the same frame-counter increment, over ' +
            'a plain object with no methods. ' +
            'THE FLOOR WAS RE-TRANSCRIBED and it is a SHORTER body than the one ' +
            'this row was first measured with. It used to write out the two-list delivery swap, ' +
            'the levelled scheduler drain, the release sweep, the deferred-callback queue and the ' +
            'bound on the spare list, because `OIMDB.runFrame` did all five. `OIMChannelService.flush`' +
            'does none of them: a frame is one pass over one flat `leaves` array, then ' +
            '`dispatchAfterEachFrame`, then `reportErrors`. Keeping the old phases would have made ' +
            'this floor do MORE than the engine, which is the one direction a floor may never ' +
            'drift in — so nothing recorded against this id is a like-for-like ' +
            'continuation of what it measures now, and no earlier figure is re-attributed to it. ' +
            'WHAT IS LEFT IN THE RATIO: the call frames our side enters (`flush`, `runFrame`, ' +
            '`dispatchAfterEachFrame`, `reportErrors`), the two `try`/`finally` regions, the ' +
            '`do`/`while` a single frame still goes round once, and the difference between a class ' +
            'field and a property of an object literal. A reading at 1.00 says the phases ARE the ' +
            'price and nothing can come off without dropping a phase; a reading above it says the ' +
            'structure is worth attacking and names its size. ' +
            'Direction: this floor does MORE than any floor in this file — it is our own design ' +
            'transcribed — so the ratio understates our cost against a primitive and is not ' +
            'comparable with the rows around it. It is a decomposition instrument and not a price.',
        build: () => {
            const fixture = priceFixture(16);
            const floor: TFloorFrameState = {
                number: 0,
                isRunning: false,
                isFlushing: false,
                anotherFrameOwed: false,
                frameRequested: false,
                onBeforeFlush: undefined,
                leaves: [],
                afterEachFrame: new Set(),
                errors: [],
            };
            // One frame closed out by hand, in the order `OIMChannelService.flush`
            // closes one.
            const closeFrame = (): void => {
                if (floor.isRunning) return;
                if (floor.isFlushing) {
                    floor.anotherFrameOwed = true;
                    return;
                }
                floor.isFlushing = true;
                do {
                    floor.anotherFrameOwed = false;
                    if (floor.onBeforeFlush !== undefined) floor.onBeforeFlush();
                    floor.frameRequested = false;
                    floor.isRunning = true;
                    const leaves = floor.leaves;
                    for (let i = 0; i < leaves.length; i++) {
                        const leaf = leaves[i];
                        if (leaf.stampedInFrame !== floor.number) continue;
                        leaf.run();
                    }
                    leaves.length = 0;
                    floor.isRunning = false;
                    floor.number++;
                    if (floor.afterEachFrame.size > 0) {
                        for (const handler of floor.afterEachFrame) handler();
                    }
                    if (floor.errors.length > 0) floor.errors = [];
                } while (floor.anotherFrameOwed);
                floor.isFlushing = false;
                floor.anotherFrameOwed = false;
            };
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const db = fixture.db;
                        for (let i = 0; i < times; i++) db.flush();
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        for (let i = 0; i < times; i++) closeFrame();
                        priceSink.number = floor.number;
                    },
                },
            };
        },
    },

    {
        id: 'subscribe.deliver-vs-direct-call',
        path: EPricePath.PerFrame,
        ours: 'update the entity, flush, and the subscription fires — per identity delivered',
        floor: 'store the field and call the handler at once, with no flush',
        caveat:
            'The price of deferred delivery against none at all. The floor calls the handler inside ' +
            'the write, so a handler can see half of a frame\'s update; it is not a floor anything ' +
            'with once-per-flush delivery can reach, and `subscribe.deliver-vs-queue-at-flush` is ' +
            'the floor that is. The gap between the two pairs is what deferral itself costs by hand; ' +
            'the rest of this ratio is the identity registration, the stamp, the enlist and the frame.',
        build: () => {
            const fixture = priceFixture(DELIVERED_PER_FRAME);
            const handler = (): void => {
                priceSink.number++;
            };
            const effectService = OIMEffectService.INSTANCE;
            const effects: TOIMEffect[] = [];
            for (let i = 0; i < fixture.slots.length; i++) {
                effects.push(effectService.createEffect(fixture.db, [fixture.slots[i]], [], handler));
            }
            priceSink.flag = effects.length > 0;
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                held[i].title = title;
                                handler();
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'subscribe.deliver-vs-queue-at-flush',
        path: EPricePath.PerFrame,
        ours: 'update the entity, flush, and the subscription fires — per identity delivered',
        floor: 'each entity a record with its own subscriber list: store the field, queue the record once, and at flush call every subscriber of every queued record',
        caveat:
            'Both sides deliver once per flush, after every write of the frame has landed, so no ' +
            'handler sees half an update, and both reach an entity\'s subscribers through the entity ' +
            'itself — `slot.effects` on ours, `record.subscribers` on the floor — with no lookup by key. ' +
            'One write per identity per frame is the worst case for us: nothing is saved by coalescing. ' +
            'The fixed cost of a frame is divided by a thousand deliveries here; `flush.empty-vs-noop` ' +
            'prices it on its own. The floor holds only for a one-column write that nothing but the ' +
            'subscriber listens to: with an index, a bucket or a timer that flushes synchronously, a ' +
            'hand-written store would need the guard a subframe gives.',
        build: () => {
            const fixture = priceFixture(DELIVERED_PER_FRAME);
            const handler = (): void => {
                priceSink.number++;
            };
            const effectService = OIMEffectService.INSTANCE;
            const effects: TOIMEffect[] = [];
            for (let i = 0; i < fixture.slots.length; i++) {
                effects.push(effectService.createEffect(fixture.db, [fixture.slots[i]], [], handler));
            }
            // Kept for the life of the process; nothing here ever detaches,
            // which is what a mounted screen looks like.
            priceSink.flag = effects.length > 0;
            const floorRecords: TFloorSubscribedRecord[] = fixture.held.map(row => ({
                row, subscribers: [handler], isQueued: false,
            }));
            const floorQueue: TFloorSubscribedRecord[] = [];
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(floorRecords.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                const record = floorRecords[i];
                                record.row.title = title;
                                if (!record.isQueued) {
                                    record.isQueued = true;
                                    floorQueue.push(record);
                                }
                            }
                            for (let q = 0; q < floorQueue.length; q++) {
                                const record = floorQueue[q];
                                record.isQueued = false;
                                const subscribers = record.subscribers;
                                for (let s = 0; s < subscribers.length; s++) subscribers[s]();
                            }
                            floorQueue.length = 0;
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'subscribe.by-key.deliver-vs-changed-ids-at-flush',
        path: EPricePath.PerFrame,
        ours: 'entityService.getSlotByKey(entityStoreSlot, id) then slotContentService.updateEntity(slot, patch), flush, and the subscription fires — per key delivered',
        floor: 'map.get(id) and store the field, add the id to a Set of changed ids, and at flush call every handler a Map of id → handlers holds for each changed id',
        caveat:
            'Both sides address the entity by its string key on every write and deliver once per ' +
            'flush. Ours has no update-by-key door: each write is `getSlotByKey` and then `slotContentService.updateEntity`. Ours resolves the key to the slot and then reaches the subscribers through ' +
            '`slot.effects`; the floor resolves the key twice, once to the row and once at flush to ' +
            'its handlers. One write per key per frame, a thousand keys, one subscriber each. The ' +
            'floor holds only for a one-column write that nothing but the subscriber listens to.',
        build: () => {
            const fixture = priceFixture(DELIVERED_PER_FRAME);
            const handler = (): void => {
                priceSink.number++;
            };
            const effectService = OIMEffectService.INSTANCE;
            const effects: TOIMEffect[] = [];
            for (let i = 0; i < fixture.slots.length; i++) {
                effects.push(effectService.createEffect(fixture.db, [fixture.slots[i]], [], handler));
            }
            priceSink.flag = effects.length > 0;
            const ids = fixture.rows.map(row => row.id);
            const handlersById = new Map<string, (() => void)[]>();
            for (const id of ids) handlersById.set(id, [handler]);
            const changedIds = new Set<string>();
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const entityService = fixture.entityService;
                        const slotContentService = entityService.slotContentService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(ids.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, ids[i]), patch);
                            }
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const byId = fixture.byId;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(ids.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                const id = ids[i];
                                const row = byId.get(id);
                                if (row === undefined) continue;
                                row.title = title;
                                changedIds.add(id);
                            }
                            for (const id of changedIds) {
                                const handlers = handlersById.get(id);
                                if (handlers === undefined) continue;
                                for (let h = 0; h < handlers.length; h++) handlers[h]();
                            }
                            changedIds.clear();
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'subscribeToField.deliver-vs-filtered-queue-at-flush',
        path: EPricePath.PerFrame,
        ours: "effectService.createEffect([column slot of 'title'], [], h) — the narrowest signal the engine has",
        floor: "store the field, queue the entity once when the moved name is 'title', and call h for each queued entity at flush",
        caveat:
            'The one column that moved is the one subscribed to, on both sides, and both deliver ' +
            'once per flush after every write of the frame has landed. A column of an entity is ' +
            'its own identity in ours, minted by `holdColumn`, and a write marks only the column ' +
            'slots that exist, so a `note` write does not reach a `title` subscriber at all. The ' +
            'mint is outside the clock (one per entity, at build); inside it ours pays the write ' +
            'path, the column mark, the enlist and the frame, against the floor\'s store, string ' +
            'compare, flag test and push on the write, and flag clear and call at flush.',
        build: () => {
            const fixture = priceFixture(DELIVERED_PER_FRAME);
            const handler = (): void => {
                priceSink.number++;
            };
            const effectService = OIMEffectService.INSTANCE;
            const effects: TOIMEffect[] = [];
            for (let i = 0; i < fixture.slots.length; i++) {
                effects.push(effectService.createEffect(
                    fixture.db, [fixture.entityService.holdColumn(fixture.slots[i], 'title')], [], handler,
                ));
            }
            priceSink.flag = effects.length > 0;
            // The floor's half of the same relationship, one record per row.
            const watches: TFloorFieldWatch[] = [];
            for (let i = 0; i < fixture.held.length; i++) {
                watches.push({ column: 'title', run: handler });
            }
            const floorQueued = new Uint8Array(fixture.held.length);
            const floorQueue: number[] = [];
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(held.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                const row = held[i];
                                if (row.title === title) continue;
                                row.title = title;
                                if (watches[i].column === 'title' && floorQueued[i] === 0) {
                                    floorQueued[i] = 1;
                                    floorQueue.push(i);
                                }
                            }
                            for (let q = 0; q < floorQueue.length; q++) {
                                const at = floorQueue[q];
                                floorQueued[at] = 0;
                                watches[at].run();
                            }
                            floorQueue.length = 0;
                            done += upTo;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'computed.recompute-vs-hand-memo',
        path: EPricePath.PerFrame,
        ours: 'a held computed slot over one entity, refreshed by its OIMComputedService store slot at the read after the frame',
        floor: 'set a dirty flag on write, recompute on read if dirty',
        caveat:
            'THE FLOOR IS A REAL MEMO AND DOES THE SAME JOB: it is invalidated by the write, it ' +
            'recomputes once however many writes landed, and it answers the same number. ' +
            'ONE HALF OF THIS CAVEAT WAS TRUE OF THE OLD ENGINE AND IS NOT TRUE OF THIS ONE. It ' +
            'said the floor recomputes LAZILY at the read where ours recomputes EAGERLY during ' +
            'the frame, so a value nobody reads was free for the floor and paid for by us. A ' +
            'derivation is a slot that nothing ever marks now — it is asked, not woken — so both ' +
            'sides are lazy and a value nobody reads is free on both. WHAT THAT LEAVES IN THE ' +
            'RATIO is the settle itself: ours compares the clock stamp of every source against ' +
            'the stamp it last derived at and only then runs the body, where the floor reads one ' +
            'boolean. WHAT OURS STILL BUYS AND THE FLOOR CANNOT: the graph. A memo over another ' +
            'memo has to be invalidated by hand and in the right order; `oimRefreshComputedSlot` ' +
            'refreshes its source computeds first. The 1024 derivations are the slots of ONE ' +
            '`OIMComputedService` store slot keyed by position, each held, so the read is ' +
            '`getValueForSlot` on an identity resolved before the clock and no key is looked up. That is not exercised by the one-level derivation ' +
            'here, so it is charged to us and never credited — direction: inflates our ratio, by ' +
            'an amount a deeper graph would show and this row cannot. Ours additionally gates on ' +
            'the comparator before marking anything downstream, and the derivation here always ' +
            'changes, so that gate never saves us a wake-up.',
        build: () => {
            const fixture = priceFixture(DELIVERED_PER_FRAME);
            const entitySlots = fixture.slots;
            const titleLengthComputedService = createOIMComputedService<number, number>({
                sameValueGuard: oimSameValueZeroGuard,
            });
            const titleLengthComputedCollectionService = titleLengthComputedService.computedCollectionService;
            const titleLengthComputedStoreSlot = titleLengthComputedService.createComputedStoreSlot(
                fixture.db,
                computedSlot => {
                    const entity = entitySlots[computedSlot.key].entity;
                    return entity === undefined ? 0 : entity.title.length;
                },
                at => ({ sourceSlots: [entitySlots[at]] }),
            );
            const titleLengthSlots: TOIMComputedSlot<number, number>[] = [];
            for (let i = 0; i < entitySlots.length; i++) {
                titleLengthSlots.push(titleLengthComputedCollectionService.holdSlotByKey(titleLengthComputedStoreSlot, i));
            }
            const memos: TFloorMemo[] = [];
            for (let i = 0; i < fixture.held.length; i++) {
                memos.push({ row: fixture.held[i], dirty: true, value: 0 });
            }
            const patch: { title: string } = { title: '' };
            let round = 0;
            let floorRound = 0;
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const slotContentService = fixture.entityService.slotContentService;
                        const db = fixture.db;
                        const computedValueService = titleLengthComputedCollectionService.slotContentService;
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(slots.length, times - done);
                            patch.title = priceDataset.titles[round++ & 7];
                            for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
                            db.flush();
                            for (let i = 0; i < upTo; i++) {
                                priceSink.number = computedValueService.getValueForSlot(titleLengthSlots[i]);
                            }
                            done += upTo;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        let done = 0;
                        while (done < times) {
                            const upTo = Math.min(memos.length, times - done);
                            const title = priceDataset.titles[floorRound++ & 7];
                            for (let i = 0; i < upTo; i++) {
                                const memo = memos[i];
                                if (memo.row.title === title) continue;
                                memo.row.title = title;
                                memo.dirty = true;
                            }
                            for (let i = 0; i < upTo; i++) {
                                const memo = memos[i];
                                if (memo.dirty) {
                                    memo.value = memo.row.title.length;
                                    memo.dirty = false;
                                }
                                priceSink.number = memo.value;
                            }
                            done += upTo;
                        }
                    },
                },
            };
        },
    },
];
