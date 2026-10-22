import { OIMSlotContentBucketServiceSetDriven } from '../../../core/src/index';
import type {
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceGroupIndex } from './priceGroupIndex';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

/** The bucket shape every grouped row here reads, named once. */
type TGroupSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TPriceDataRow>>;
type TGroupBucket = TOIMBucketSlot<TGroupSlots, TOIMStoreKey>;

/**
 * The fixture the group-shaped rows share: a population, one bucket collection
 * over `group`, the buckets it minted, and beside them the `Map` of `Set`s and
 * the `Map` of arrays a person would have kept instead.
 *
 * Three floors rather than one: "the members of a group" has three plausible
 * hand-written shapes and they do not cost the same. The `Set` floor is the same
 * container our unordered bucket uses; the array floor is what somebody actually
 * writes, and it iterates faster. Both are printed — showing only the `Set` row
 * would be choosing the floor that flatters us.
 *
 * THE SAME SETS ARE OFFERED TWICE — in a `Map` by name and in an array parallel
 * to `buckets` — because a floor's ADDRESSING is a separate charge from the
 * thing priced, and which is honest depends on the row. A body that WALKS a
 * bucket resolves the address once per hundred-odd members, so the map is fair.
 * A body asking ONE question per address (`slotCount`) would report the
 * difference between a hash and an array load instead; that row takes the array.
 */
const groupedFixture = () => {
    const fixture = priceFixture(priceDataset.batch);
    // The membership is written, not derived — see `priceGroupIndex`. Every
    // body below READS this bucket collection and none of them writes `group`,
    // so the snapshot it builds stays correct for the life of the fixture.
    const { bucketService, bucketStoreSlot, bucketOf } = priceGroupIndex<TGroupSlots>(
        fixture.db, fixture.slots, new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
    );
    fixture.db.flush();

    const names = priceDataset.groupNames();
    const buckets: TGroupBucket[] = [];
    for (let i = 0; i < names.length; i++) {
        const bucket = bucketOf.get(names[i]);
        if (bucket === undefined) {
            throw new Error(`price: no bucket was minted for the group "${names[i]}".`);
        }
        buckets.push(bucket);
    }

    const setsByGroup = new Map<string, Set<TPriceDataRow>>();
    const arraysByGroup = new Map<string, TPriceDataRow[]>();
    // The SAME set objects, at the subscript `names` and `buckets` use. Not a
    // second copy: `sets[i]` and `setsByGroup.get(names[i])` are one container
    // reached two ways, so choosing between them changes how the floor is
    // ADDRESSED and nothing else.
    const sets: Set<TPriceDataRow>[] = [];
    for (let i = 0; i < names.length; i++) {
        const set = new Set<TPriceDataRow>();
        setsByGroup.set(names[i], set);
        sets.push(set);
        arraysByGroup.set(names[i], []);
    }
    for (let i = 0; i < fixture.held.length; i++) {
        const row = fixture.held[i];
        const set = setsByGroup.get(row.group);
        if (set !== undefined) set.add(row);
        const array = arraysByGroup.get(row.group);
        if (array !== undefined) array.push(row);
    }

    return { fixture, bucketService, bucketStoreSlot, names, buckets, sets, setsByGroup, arraysByGroup };
};


/**
 * EVERY PRICE A READER PAYS.
 *
 * The fact that governs this whole group, stated once: a read in this engine is
 * supposed to have had its lookup paid for ALREADY, at the moment the reader and
 * the data were joined. `slots.find`, `slots.hold` and a bucket address are
 * per-relationship costs that the documentation says to hold; `slot.entity` and
 * iterating a bucket are what you pay per read once you have. So the rows below
 * are deliberately split into the two, and the distance between them is the
 * whole argument for the design — a resolve priced against `map.get` looks
 * expensive precisely because it is not supposed to happen per read.
 *
 * A slot IS the observable, a read is `slot.entity`, subscribing is building an
 * effect.
 */
export const pricePairsRead: readonly TPricePair[] = [
    {
        id: 'find.vs-map-get',
        path: EPricePath.PerRead,
        ours: 'entityService.slotContentService.findEntityByKey(entityStoreSlot, id) — the entity of a key, or undefined',
        floor: 'map.get(id)',
        caveat:
            'THE CALIBRATION ROW. `slotContentService.findEntityByKey` is a `Map.get` through the slot store ' +
            'service and one `.entity` load off the slot, ' +
            'so if this reads much above 1 the instrument is measuring call overhead rather than ' +
            'the library, and every other ratio in this table should be read with that in mind. ' +
            'Every key hits — a miss is a different path on both sides and would mix two prices.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const rows = fixture.rows;
                        const entityService = fixture.entityService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const mask = rows.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = entityService.slotContentService.findEntityByKey(entityStoreSlot, rows[i & mask].id);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const rows = fixture.rows;
                        const byId = fixture.byId;
                        const mask = rows.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = byId.get(rows[i & mask].id);
                        }
                    },
                },
            };
        },
    },

    {
        id: 'hold.vs-map-get',
        path: EPricePath.PerRelationship,
        ours: 'entityService.holdSlotByKey(entityStoreSlot, id) — resolve a key to an identity and keep it, minting on a miss',
        floor: 'map.get(id)',
        caveat:
            'THE FLOOR CANNOT MINT AND CANNOT KEEP, and those are the two differences. ' +
            '`holdSlotByKey` promises an identity for a key the population has never seen, so a ' +
            'caller can subscribe to a row before it arrives; and the hold is a COUNTED ' +
            'REFERENCE, so nothing can unfile that identity while the caller still has it. Every ' +
            'key here HITS, so the minting branch never runs — what is left over the map read is ' +
            'the store call, the `=== undefined` compare that is false on every hit, and one ' +
            '`holdCount++` (`OIMSlotCollectionService.holdSlotByKey` into `slot.owner.holdSlot`). ' +
            'THE TWO ALLOCATIONS THIS CAVEAT CHARGED NO LONGER EXIST AND NOTHING REPLACES THEM. ' +
            'It read "TWO ALLOCATIONS PER CALL: the `{ slot, release }` record and the release ' +
            'closure `holdSlot` builds", and that was the charge the row was built to expose: a ' +
            'minting door that allocated where a `Map.get` does not. No door hands back such a record — ' +
            '`holdSlotByKey` returns the slot and increments one field — so the hit path allocates ' +
            'nothing on either side and what is left between the two columns is one call and one ' +
            'store. Direction: inflates our ratio, now by the store call and the increment alone. ' +
            'READ IT AGAINST `find.vs-map-get` DIRECTLY ABOVE — the gap between the two is what ' +
            'the minting door costs over the reading one, on the hit path, and that gap is the ' +
            'whole reason the documentation says to hold an identity rather than resolve it per ' +
            'read. ' +
            'THIS BODY NEVER GIVES THE HOLD BACK. The door is ' +
            '`slot.owner.unholdSlot`, which decrements the count, and nothing here calls it, so the hold count ' +
            'grows for the life of the process — one decrement per call that we do not charge ' +
            'ourselves for, and it is the only item on this row that runs in our favour. ' +
            'This row measures a minting HOLD.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const rows = fixture.rows;
                        const entityService = fixture.entityService;
                        const entityStoreSlot = fixture.entityStoreSlot;
                        const mask = rows.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = entityService.holdSlotByKey(entityStoreSlot, rows[i & mask].id);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const rows = fixture.rows;
                        const byId = fixture.byId;
                        const mask = rows.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.floor = byId.get(rows[i & mask].id);
                        }
                    },
                },
            };
        },
    },

    {
        id: 'entity.vs-held-object',
        path: EPricePath.PerRead,
        ours: 'slot.entity — the row behind an identity you already hold',
        floor: 'the object itself, held',
        caveat:
            'ONE INDIRECTION AGAINST NONE, which is the smallest thing this table can ask about ' +
            'and is close to the resolution floor — read it against the control rows before ' +
            'treating any part of it as a result. Ours answers `TPriceDataRow | undefined` because ' +
            'an identity may carry no value; the floor answers a row. This body does NOT narrow ' +
            'the undefined, so the branch a real consumer writes is charged to neither side. ' +
            'IT IS THE WHOLE VALUE-READ PATH NOW. `value.held-getValue-vs-object` and ' +
            '`value.construct-and-read-vs-object` stood below this row and priced the same read ' +
            'through an observable; there is no observable, so this is the only shape the question ' +
            'has left.',
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slots = fixture.slots;
                        const mask = slots.length - 1;
                        for (let i = 0; i < times; i++) priceSink.ours = slots[i & mask].entity;
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const held = fixture.held;
                        const mask = held.length - 1;
                        for (let i = 0; i < times; i++) priceSink.floor = held[i & mask];
                    },
                },
            };
        },
    },

    {
        id: 'buckets.find-vs-map-get',
        path: EPricePath.PerRead,
        ours: 'bucketService.getSlotByKey(bucketStoreSlot, address) — the bucket at an address, minted on a miss',
        floor: 'byGroup.get(address)',
        caveat:
            'THE ADDRESS LOOKUP ON THE BUCKET SIDE, WITHOUT THE HOLD, so a reader can see which ' +
            'part of `hold.vs-map-get` is the store call and which part is the hold. ' +
            'Every address here hits, so getSlotByKey\'s minting branch never runs; ours is `OIMSlotCollectionService.getSlotByKey` ' +
            'into its slot store service\'s get, one `Map.get` and the `=== undefined` compare ' +
            'against the floor\'s one `Map.get`. Both sides cycle ' +
            'through all sixty-four addresses. ' +
            'The store `OIMSlotStoreServiceMapDriven` reads is one `Map` and nothing else, so there is no cell to ' +
            'hit or miss.',
        build: () => {
            const grouped = groupedFixture();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const bucketService = grouped.bucketService;
                        const bucketStoreSlot = grouped.bucketStoreSlot;
                        const names = grouped.names;
                        const mask = names.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.ours = bucketService.getSlotByKey(bucketStoreSlot, names[i & mask]);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const byGroup = grouped.arraysByGroup;
                        const names = grouped.names;
                        const mask = names.length - 1;
                        for (let i = 0; i < times; i++) priceSink.floor = byGroup.get(names[i & mask]);
                    },
                },
            };
        },
    },

    {
        id: 'read.members-vs-set-iteration',
        path: EPricePath.PerRead,
        ours: 'for (const slot of slotContentService.getBucketMemberSlots(bucket)) slot.entity — per member visited',
        floor: 'for (const row of set) — per member visited, same container kind',
        caveat:
            'THE SAME CONTAINER ON BOTH SIDES: an unordered bucket holds its members in a `Set`, ' +
            'so this floor is the structural equal. Ours pays two things the floor does not — the ' +
            'read settles whatever order report is outstanding on the bucket (nothing is ' +
            'outstanding here, and an unordered bucket has no order to settle, so what is charged ' +
            'is the ASKING) and every member is a slot the consumer must dereference to reach the ' +
            'row, which this body does. The per-read costs — the settle and the iterator — are ' +
            'amortised over the hundred-odd members of a bucket, so a caller reading buckets of ' +
            'one pays far more per member than this row shows.',
        build: () => {
            const grouped = groupedFixture();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = grouped.bucketService.slotContentService;
                        const buckets = grouped.buckets;
                        const mask = buckets.length - 1;
                        let visited = 0;
                        let at = 0;
                        // AN EMPTY BUCKET WOULD NOT ADVANCE `visited`, and a benchmark that
                        // hangs is worse than one reporting a short pass. Costs one
                        // increment per BUCKET, not per member.
                        let guard = 0;
                        const mostBuckets = times + buckets.length;
                        while (visited < times && guard++ < mostBuckets) {
                            for (const slot of slotContentService.getBucketMemberSlots(buckets[at & mask])) {
                                priceSink.ours = slot.entity;
                                visited++;
                            }
                            at++;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const sets = grouped.setsByGroup;
                        const names = grouped.names;
                        const mask = names.length - 1;
                        let visited = 0;
                        let at = 0;
                        // The same guard as our side above, for the same reason.
                        let guard = 0;
                        const mostBuckets = times + names.length;
                        while (visited < times && guard++ < mostBuckets) {
                            const set = sets.get(names[at & mask]);
                            if (set !== undefined) {
                                for (const row of set) {
                                    priceSink.floor = row;
                                    visited++;
                                }
                            }
                            at++;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'read.members-vs-array-iteration',
        path: EPricePath.PerRead,
        ours: 'for (const slot of slotContentService.getBucketMemberSlots(bucket)) slot.entity — per member visited',
        floor: 'for (let i = 0; i < rows.length; i++) — per member visited',
        caveat:
            'THE SAME OUR-SIDE BODY AS THE ROW ABOVE AGAINST THE FLOOR SOMEBODY WOULD ACTUALLY ' +
            'WRITE. An indexed array walk is the fastest way there is to visit a hundred objects ' +
            'and it beats a `Set` iterator handily, so this ratio is the worse of the two and the ' +
            'more honest answer to "what does reading a group cost me". What the array cannot do ' +
            'is stay correct: nothing maintains it, nothing can be woken by it, and it holds rows ' +
            'rather than identities that outlive them. The gap between this ratio and the ' +
            '`set-iteration` one above is a property of JavaScript containers, not of either ' +
            'design.',
        build: () => {
            const grouped = groupedFixture();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = grouped.bucketService.slotContentService;
                        const buckets = grouped.buckets;
                        const mask = buckets.length - 1;
                        let visited = 0;
                        let at = 0;
                        // A BUCKET THAT CAME BACK EMPTY WOULD NOT ADVANCE `visited`, and a
                        // benchmark that hangs the machine is worse than one that reports a
                        // short pass. Every bucket here holds members by construction; this
                        // is the guard that says so out loud, and it costs one increment per
                        // BUCKET rather than per member.
                        let guard = 0;
                        const mostBuckets = times + buckets.length;
                        while (visited < times && guard++ < mostBuckets) {
                            for (const slot of slotContentService.getBucketMemberSlots(buckets[at & mask])) {
                                priceSink.ours = slot.entity;
                                visited++;
                            }
                            at++;
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        const arrays = grouped.arraysByGroup;
                        const names = grouped.names;
                        const mask = names.length - 1;
                        let visited = 0;
                        let at = 0;
                        // A BUCKET THAT CAME BACK EMPTY WOULD NOT ADVANCE `visited`, and a
                        // benchmark that hangs the machine is worse than one that reports a
                        // short pass. Every bucket here holds members by construction; this
                        // is the guard that says so out loud, and it costs one increment per
                        // BUCKET rather than per member.
                        let guard = 0;
                        const mostBuckets = times + names.length;
                        while (visited < times && guard++ < mostBuckets) {
                            const rows = arrays.get(names[at & mask]);
                            if (rows !== undefined) {
                                for (let i = 0; i < rows.length; i++) {
                                    priceSink.floor = rows[i];
                                    visited++;
                                }
                            }
                            at++;
                        }
                    },
                },
            };
        },
    },

    {
        id: 'memberCount.vs-set-size',
        path: EPricePath.PerRead,
        ours: 'slotContentService.getBucketMemberSlotCount(bucket)',
        floor: 'set.size',
        caveat:
            'Ours is one call — `slotContentService.getBucketMemberSlotCount` reads the same `Set.size` off ' +
            'the bucket slot\'s store — and that call is the whole ' +
            'difference. The floor reads a field of a container whose correctness is ' +
            'somebody else\'s problem. Both sides cycle through all sixty-four buckets rather than ' +
            'asking the same one repeatedly. ' +
            'THIS ROW ONCE READ BELOW 1.00 AND THAT NUMBER WAS A HASH, NOT A COUNT. The floor ' +
            'reached its `Set` through `sets.get(name)` — a string-keyed `Map.get` — while our ' +
            'side was handed the bucket out of an array. So the floor\'s number was very nearly ' +
            'all addressing and ours was very nearly all service hop, and the row reported the ' +
            'difference between a hash and an array load under the name of a member count. The ' +
            'floor now holds its sets in an array indexed exactly the way our side indexes its ' +
            'buckets, so both sides are addressed alike and what is left in the ratio is the ' +
            'service hop. This suite\'s standing rule is that a floor doing less ' +
            'is a lie in our favour; that rule was pointed at us here, and the reading it ' +
            'produced is withdrawn rather than qualified. ' +
            'THE CALL WAS `db.memberCount(bucket)` AND IS `slotContentService.getBucketMemberSlotCount(bucket)`, on the ' +
            'bucket content service rather than on the database — the same question through a different ' +
            'object. Nothing recorded before 2026-08-29 is re-attributed to it, and the prediction ' +
            'the old caveat carried (roughly 3.5 to 4.4, from figures in ' +
            '`measurements/2026-08-20-price/read-2`) was written for the old call and is not a ' +
            'prediction about this one.',
        build: () => {
            const grouped = groupedFixture();
            return {
                ours: {
                    reset: () => undefined,
                    run: times => {
                        const slotContentService = grouped.bucketService.slotContentService;
                        const buckets = grouped.buckets;
                        const mask = buckets.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.number = slotContentService.getBucketMemberSlotCount(buckets[i & mask]);
                        }
                    },
                },
                floor: {
                    reset: () => undefined,
                    run: times => {
                        // Indexed, not hashed — the same shape our side gets its
                        // bucket in. `sets.length` is a power of two and the mask
                        // is the one both sides use, so neither pays a lookup the
                        // other does not.
                        const sets = grouped.sets;
                        const mask = sets.length - 1;
                        for (let i = 0; i < times; i++) {
                            priceSink.number = sets[i & mask].size;
                        }
                    },
                },
            };
        },
    },
];
