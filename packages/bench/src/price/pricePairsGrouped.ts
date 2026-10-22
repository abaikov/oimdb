// Prose: ./README.md#pricepairsgrouped
import {
    OIMDB,
    OIMKeyTreeWalkComposite,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceMapDriven,
    OIMSlotStoreServiceTreeDriven,
    createOIMBucketService,
    createOIMComputedServiceSorted,
    createOIMEntityService,
    createOIMIndexService,
} from '../../../core/src/index';
import type {
    TOIMBucketSlot,
    TOIMBucketSlotsSetStore,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMSlotStoreTree,
    TOIMStoreKey,
} from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';

const BUCKET_SIZE = priceDataset.batch / priceDataset.groups;
const SWAPS_PER_FRAME = 4;
const MOVERS_PER_FRAME = SWAPS_PER_FRAME * 2;
const BANDS_SWAPPED = BUCKET_SIZE >> 1;

type TRankPatch = { rank: number };

const upperBoundByRank = (rows: readonly TPriceDataRow[], rank: number): number => {
    let low = 0;
    let high = rows.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (rows[middle].rank <= rank) low = middle + 1;
        else high = middle;
    }
    return low;
};

const ORDER_CAVEAT =
    'AN ENTITY MOVES WITHIN ITS GROUP, NOTHING JOINS OR LEAVES. A frame swaps the ranks of band `m` ' +
    `and band \`m + ${BANDS_SWAPPED}\` in every one of the sixty-four groups for ${SWAPS_PER_FRAME} ` +
    `values of \`m\`, so each group of ${BUCKET_SIZE} sees ${MOVERS_PER_FRAME} movers. ` +
    'OURS IS THE SHIPPED ORDER: an index store slot over `group` (`createOIMIndexService` with `OIMSlotContentBucketServiceSetDriven`) and a ' +
    '`createOIMComputedServiceSorted` and its `createSortedStoreSlot` over it with `sortColumns: [{ column: \'rank\', direction: \'asc\' }]`, ' +
    'one sorted computed held per group. NOTHING IS REPORTED BY HAND: `updateEntity` hands the ' +
    'index the changed columns, the index writes the group\'s `rank` bucket column slot, and that ' +
    'slot is a source of the group\'s sorted computed. THE READ IS INSIDE THE TIMED BODY: the ' +
    'computed is pulled, so the sort runs at the first `getValueForSlot` of the frame and every group is ' +
    'walked once per frame on both sides. ' +
    'THE COUNT THIS PREDICTS, per group per frame: ours copies the previous order (`slice` of ' +
    `${BUCKET_SIZE}) and runs \`Array.prototype.sort\` over it with the columns comparator, each ` +
    'compare loading `entity` off two slots and reading `rank` off both; the floor does, per mover, ' +
    '`indexOf`, `splice` out, `upperBoundByRank` and `splice` in. [FIGURE STATED IN ADVANCE] ' +
    `V8's sort over ${BUCKET_SIZE} entries with ${MOVERS_PER_FRAME} displaced is on the order of ` +
    `${BUCKET_SIZE} compares plus a binary search per mover, against the floor's ` +
    `${MOVERS_PER_FRAME} scans and ${MOVERS_PER_FRAME * 2} splices. WHERE THEY ARE NOT EQUAL: ours ` +
    're-sorts the whole group however few entities moved, where the floor touches only the movers, ' +
    'which inflates our ratio; ours sorts once for all eight movers, which flatters us; and ours ' +
    'additionally walks the patch, marks the entity slot and the bucket column slot on the channel ' +
    'per `updateEntity`, which the floor\'s plain field store does not.';

const orderPair: TPricePair = {
    id: 'order.resort-within-a-bucket-vs-sorted-array-splice',
    path: EPricePath.PerRowPerWrite,
    ours: 'entityService.slotContentService.updateEntity(slot, { rank }), then sortedComputedService.computedCollectionService.slotContentService.getValueForSlot(sortedComputed) — createOIMComputedServiceSorted createSortedStoreSlot over an index store slot (createIndexStoreSlot), sortColumns [rank asc]',
    floor: 'swap the ranks, then indexOf/splice out and upperBound/splice in, on a sorted array',
    caveat: ORDER_CAVEAT,
    build: () => {
        const rows = priceDataset.makeRows(priceDataset.batch);
        const held: TPriceDataRow[] = rows.map(row => ({ ...row }));
        const db = new OIMDB();
        const entityService = createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id });
        const entityStoreSlot = entityService.createStoreSlot(db);
        const slots: TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>[] = [];
        for (let i = 0; i < rows.length; i++) slots.push(entityService.slotContentService.upsertEntity(entityStoreSlot, rows[i]));
        const indexService = createOIMIndexService(db, {
            entityService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
            keyOf: (row: TPriceDataRow) => row.group,
        });
        const indexStoreSlot = indexService.createIndexStoreSlot(entityStoreSlot);
        const sortedComputedService = createOIMComputedServiceSorted({
            indexService,
            sortColumns: [{ column: 'rank', direction: 'asc' }],
        });
        const sortedComputedStoreSlot = sortedComputedService.createSortedStoreSlot(indexStoreSlot);
        const names = priceDataset.groupNames();
        const computedCollectionService = sortedComputedService.computedCollectionService;
        const sortedComputeds = names.map(name => computedCollectionService.holdSlotByKey(sortedComputedStoreSlot, name));
        db.flush();
        const sortedByGroup: TPriceDataRow[][] = names.map(() => []);
        for (let i = 0; i < held.length; i++) sortedByGroup[i % names.length].push(held[i]);
        const computedValueService = computedCollectionService.slotContentService;
        for (let g = 0; g < sortedComputeds.length; g++) {
            const order = computedValueService.getValueForSlot(sortedComputeds[g]);
            if (order.length !== sortedByGroup[g].length) {
                throw new Error(`price: group ${names[g]} orders ${order.length} entities, its floor ${sortedByGroup[g].length}.`);
            }
            for (let at = 0; at < order.length; at++) {
                if (order[at].entity?.id !== sortedByGroup[g][at].id) {
                    throw new Error(`price: group ${names[g]} and its floor disagree at position ${at}.`);
                }
            }
        }
        const groups = names.length;
        const slotContentService = entityService.slotContentService;
        const leftPatch: TRankPatch = { rank: 0 };
        const rightPatch: TRankPatch = { rank: 0 };
        let frame = 0;
        let floorFrame = 0;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    let done = 0;
                    while (done < times) {
                        frame++;
                        for (let s = 0; s < SWAPS_PER_FRAME; s++) {
                            const band = (frame * SWAPS_PER_FRAME + s) & (BANDS_SWAPPED - 1);
                            for (let g = 0; g < groups; g++) {
                                const left = slots[band * groups + g];
                                const right = slots[(band + BANDS_SWAPPED) * groups + g];
                                const leftRank = left.entity?.rank ?? 0;
                                leftPatch.rank = right.entity?.rank ?? 0;
                                rightPatch.rank = leftRank;
                                slotContentService.updateEntity(left, leftPatch);
                                slotContentService.updateEntity(right, rightPatch);
                            }
                        }
                        db.flush();
                        for (let g = 0; g < groups; g++) {
                            const order = computedValueService.getValueForSlot(sortedComputeds[g]);
                            for (let i = 0; i < order.length; i++) priceSink.ours = order[i];
                        }
                        done += MOVERS_PER_FRAME * groups;
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    let done = 0;
                    while (done < times) {
                        floorFrame++;
                        for (let s = 0; s < SWAPS_PER_FRAME; s++) {
                            const band = (floorFrame * SWAPS_PER_FRAME + s) & (BANDS_SWAPPED - 1);
                            for (let g = 0; g < groups; g++) {
                                const list = sortedByGroup[g];
                                const left = held[band * groups + g];
                                const right = held[(band + BANDS_SWAPPED) * groups + g];
                                const leftRank = left.rank;
                                left.rank = right.rank;
                                right.rank = leftRank;
                                list.splice(list.indexOf(left), 1);
                                list.splice(list.indexOf(right), 1);
                                list.splice(upperBoundByRank(list, left.rank), 0, left);
                                list.splice(upperBoundByRank(list, right.rank), 0, right);
                            }
                        }
                        for (let g = 0; g < groups; g++) {
                            const list = sortedByGroup[g];
                            for (let i = 0; i < list.length; i++) priceSink.floor = list[i];
                        }
                        done += MOVERS_PER_FRAME * groups;
                    }
                },
            },
        };
    },
};

type TSegmentRow = { id: string };
type TChainKey = readonly TOIMEntitySlot[];
type TUnorderedSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TPriceDataRow>>;
type TChainBucket = TOIMBucketSlot<TUnorderedSlots, TChainKey>;
const SEGMENTS_PER_LEVEL = 8;

const chainPair: TPricePair = {
    id: 'chain-address.resolve-vs-nested-map-get',
    path: EPricePath.PerRead,
    ours: 'bucketService.getSlotByKey(bucketStoreSlot, [deckSlot, shelfSlot]) on a tree-driven bucket store',
    floor: 'byDeck.get(deck).get(shelf)',
    caveat:
        'AN ADDRESS OF TWO IDENTITIES AGAINST AN ADDRESS OF TWO STRINGS. Ours walks the composite ' +
        'key tree `OIMSlotStoreServiceTreeDriven` keeps: one `Map.get` keyed by the deck slot, one ' +
        'keyed by the shelf slot, then the bucket on the node — object-keyed hashes, no string ' +
        'hashing. The floor makes two string-keyed `Map.get`s and an `undefined` test. The key ' +
        'arrays are built outside the clock, as a caller holding the two segment identities would ' +
        'hold the pair. Every address hits a held bucket, so `getSlotByKey` never mints; it adds the ' +
        'store call and the `found !== undefined` test over the floor. Sixty-four combinations, ' +
        'eight decks by eight shelves, cycled on both sides. It replaces ' +
        '`chain-address.resolve-and-hold-vs-nested-map-get`, which held per call; no reading was ' +
        'ever recorded under either id.',
    build: () => {
        const fixture = priceFixture(SEGMENTS_PER_LEVEL);
        const db = fixture.db;
        const segmentEntityService = () =>
            createOIMEntityService<TSegmentRow>(db, {
                keyOf: row => row.id,
                columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
            });
        const deckEntityService = segmentEntityService();
        const deckEntityStoreSlot = deckEntityService.createStoreSlot(db);
        const shelfEntityService = segmentEntityService();
        const shelfEntityStoreSlot = shelfEntityService.createStoreSlot(db);
        const bucketSlotStoreService = new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TChainBucket>(
            OIMKeyTreeWalkComposite.INSTANCE,
        );
        const bucketService = createOIMBucketService<
            TOIMEntitySlot<TPriceDataRow>, TChainKey, TUnorderedSlots,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>,
            TOIMSlotStoreTree<TChainBucket, TOIMEntitySlot>
        >(db, {
            bucketSlotStoreService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TPriceDataRow>>(),
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
        });
        const bucketStoreSlot = bucketService.createStoreSlot(db);
        const chainKeys: TChainKey[] = [];
        const heldBuckets: TChainBucket[] = [];
        const deckNames: string[] = [];
        const shelfNames: string[] = [];
        const byDeck = new Map<string, Map<string, Set<TPriceDataRow>>>();
        for (let d = 0; d < SEGMENTS_PER_LEVEL; d++) {
            const deck = `deck-${d}`;
            const deckSlot = deckEntityService.slotContentService.upsertEntity(deckEntityStoreSlot, { id: deck });
            const byShelf = new Map<string, Set<TPriceDataRow>>();
            byDeck.set(deck, byShelf);
            for (let s = 0; s < SEGMENTS_PER_LEVEL; s++) {
                const shelf = `shelf-${s}`;
                const shelfSlot = shelfEntityService.slotContentService.upsertEntity(shelfEntityStoreSlot, { id: shelf });
                const chainKey: TChainKey = [deckSlot, shelfSlot];
                chainKeys.push(chainKey);
                heldBuckets.push(bucketService.holdSlotByKey(bucketStoreSlot, chainKey));
                deckNames.push(deck);
                shelfNames.push(shelf);
                byShelf.set(shelf, new Set<TPriceDataRow>());
            }
        }
        db.flush();
        for (let i = 0; i < chainKeys.length; i++) {
            if (bucketService.getSlotByKey(bucketStoreSlot, chainKeys[i]) !== heldBuckets[i]) {
                throw new Error(`price: the chain address ${deckNames[i]}/${shelfNames[i]} did not resolve to its bucket.`);
            }
        }
        const mask = chainKeys.length - 1;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    for (let i = 0; i < times; i++) priceSink.ours = bucketService.getSlotByKey(bucketStoreSlot, chainKeys[i & mask]);
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    for (let i = 0; i < times; i++) {
                        const at = i & mask;
                        priceSink.floor = byDeck.get(deckNames[at])?.get(shelfNames[at]);
                    }
                },
            },
        };
    },
};

export const pricePairsGrouped: readonly TPricePair[] = [orderPair, chainPair];
