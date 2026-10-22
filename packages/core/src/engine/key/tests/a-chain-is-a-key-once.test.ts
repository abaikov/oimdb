import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceTreeDriven } from '../../store/OIMSlotStoreServiceTreeDriven';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import { oimSameSlotSequence } from '../../bucket/utils/oimSameSlotSequence';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMSlotStoreTree } from '../../store/types/TOIMSlotStoreTree';

type TCard = { id: string; deckId: string; day: string; title: string };
type TNamed = { id: string };
type TChain = readonly TOIMEntitySlot[];
type TCardSlot = TOIMEntitySlot<TCard>;
type TChainBucket = TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TChain>;
type TChainBucketStore = TOIMSlotStoreTree<TChainBucket, TOIMEntitySlot>;
type TTallySlot = TOIMEntitySlot<TTally, TScalarChain>;
type TTallyStore = TOIMSlotStoreTree<TTallySlot, TOIMStoreKey>;

/** The other arm's key, and the row it addresses. */
type TScalarChain = readonly TOIMStoreKey[];
type TTally = { deck: TOIMStoreKey; day: TOIMStoreKey; count: number };

const createNamedService = (db: OIMDB) => createOIMEntityService<TNamed>(db, { keyOf: (item) => item.id });
type TNamedService = ReturnType<typeof createNamedService>;
type TNamedStoreSlot = ReturnType<TNamedService['createStoreSlot']>;

const createFixture =() => {
    const db = new OIMDB();
    const decksService = createNamedService(db);
    const decks = decksService.createStoreSlot(db);
    const daysService = createNamedService(db);
    const days = daysService.createStoreSlot(db);
    // THE HOLD IS KEPT: a segment with no value and nothing keyed by it yet goes
    // the moment nothing points at it, and these cases compare chains by identity.
    const segment = (
        collectionService: TNamedService,
        collection: TNamedStoreSlot,
        id: string,
    ): TOIMEntitySlot<TNamed, TOIMStoreKey> => collectionService.holdSlotByKey(collection, id);
    /** The key built by hand, which is how a screen resolves its group. */
    const chain = (deckId: string, day: string): TChain =>
        [segment(decksService, decks, deckId), segment(daysService, days, day)];
    return { db, decksService, decks, daysService, days, segment, chain };
};

/**
 * The bucket collection over the tree store; its `buckets` field is the
 * aggregate every keyed question is asked of.
 */
const chainBucketsOver = (db: OIMDB) => {
    const indexService = createOIMBucketService<
        TCardSlot, TChain, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>, TChainBucketStore
    >(db, {
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMEntitySlot, TChainBucket>(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue()),
    });
    const index = indexService.createStoreSlot(db);
    // Kept for the reason `segment` keeps its own: an empty bucket nothing holds
    // is unfiled the moment it is made.
    const bucketFor = (key: TChain): TChainBucket => indexService.holdSlotByKey(index, key);
    return { indexService, index, bucketFor };
};

describe('a chain is a key once', () => {
    /**
     * The claim the memo was only ever a fast path for: a list rebuilt from the
     * same identities arrives at the same bucket, however many other keys were
     * asked about in between.
     */
    it('answers with the same bucket for a list rebuilt from the same identities', () => {
        const { db, chain } = createFixture();
        const { bucketFor, indexService, index } = chainBucketsOver(db);

        const first = bucketFor(chain('spades', 'mon'));
        expect(bucketFor(chain('spades', 'mon'))).toBe(first);

        const other = bucketFor(chain('hearts', 'mon'));
        expect(other).not.toBe(first);

        expect(bucketFor(chain('spades', 'mon'))).toBe(first);
        expect(indexService.getSlotCount(index)).toBe(2);
    });

    /**
     * A PREFIX IS NOT THE CHAIN. `[deck]` and `[deck, day]` are two keys,
     * because the descent gives what sits at a key a field of its own rather
     * than a place among the children, and because the comparison starts by
     * comparing lengths. This is the assertion an encoding fails; see the
     * header.
     */
    it('keeps a chain and its prefix apart', () => {
        const { db, decksService, decks, segment, chain } = createFixture();
        const { bucketFor, indexService, index } = chainBucketsOver(db);

        const pair = bucketFor(chain('spades', 'mon'));
        const prefix = bucketFor([segment(decksService, decks,'spades')]);
        expect(prefix).not.toBe(pair);
        expect(bucketFor(chain('spades', 'mon'))).toBe(pair);
        expect(bucketFor([segment(decksService, decks,'spades')])).toBe(prefix);
        expect(indexService.getSlotCount(index)).toBe(2);
    });

    /**
     * THE COPY IS WHAT MAKES THE TWO RULES ASK ABOUT THE SAME THING.
     *
     * A composite key arrives as an ARRAY, and an array is the caller's — a hot
     * loop hoists one and refills it. The tree is descended with the caller's
     * array at mint time and the slot keeps its OWN copy, so a later descent is
     * still answering about the key the first one filed. Kept rather than
     * copied, the bucket would be filed at a chain that changes under it.
     */
    it('is not moved by a caller refilling the array it was resolved from', () => {
        const { db, decksService, decks, daysService, days, segment } = createFixture();
        const { bucketFor } = chainBucketsOver(db);

        const buffer: TOIMEntitySlot[] = [segment(decksService, decks,'spades'), segment(daysService, days,'mon')];
        const onMonday = bucketFor(buffer);

        // The caller reuses their buffer, which is the supported thing to do.
        buffer[1] = segment(daysService, days,'tue');
        const onTuesday = bucketFor(buffer);
        expect(onTuesday).not.toBe(onMonday);

        expect(bucketFor([segment(decksService, decks,'spades'), segment(daysService, days,'mon')])).toBe(onMonday);
    });

    // The comparison is asked directly, against the bucket's OWN copy of its
    // chain, so a divergence between descent and comparison shows up here.
    it('agrees with the descent about which chain a bucket is at', () => {
        const { db, decksService, decks, daysService, days, segment, chain } = createFixture();
        const { indexService, index, bucketFor } = chainBucketsOver(db);

        const onMonday = bucketFor(chain('spades', 'mon'));
        const rebuilt = [segment(decksService, decks,'spades'), segment(daysService, days,'mon')];

        expect(oimSameSlotSequence(onMonday.key, rebuilt)).toBe(true);
        expect(indexService.getSlotByKey(index,rebuilt)).toBe(onMonday);

        // The three ways a chain can fail to be this one.
        for (const other of [
            chain('spades', 'tue'),
            chain('hearts', 'mon'),
            [segment(decksService, decks,'spades')],
        ]) {
            expect(oimSameSlotSequence(onMonday.key, other)).toBe(false);
            expect(indexService.getSlotByKey(index,other)).not.toBe(onMonday);
        }
    });
});

/**
 * A CHAIN OF SCALARS IS AN ADDRESS ONCE — the OTHER arm of the same fork, asked
 * the same questions.
 *
 * `OIMSlotStoreServiceTreeDriven` over `OIMDefaults.KEY_TREE_WALK_SCALAR` files a key made of VALUES,
 * `['spades', 'mon']`, and it is a second WALK rather than a widening of the
 * first because the two differ in what keeps a branch: an identity segment is
 * HELD, because another collection owns it and may forget it, and a value
 * segment cannot be held and needs no holding. Everything ABOVE that difference
 * is the same descent — it is literally the same class, handed the other
 * singleton — so the four claims of the block above have to hold here too and
 * are re-asked rather than assumed.
 *
 * AND ONE CLAIM IS ONLY THIS ARM'S. The block above rests on a sentence that is
 * FALSE here: "the comparison and the descent cannot disagree, because a `Map`
 * files by SameValueZero, which for objects IS reference equality, and no object
 * is `NaN`." A value segment can be `NaN`, so a positional comparison written
 * with `!==` — which is what `oimSameSlotSequence` is, and is entitled to be — answers "a
 * different address" for the address the tree is looking at. That is the SCALAR
 * defect, and it shipped once: a key compared that way orphaned a bucket.
 *
 * So the last case below asks the descent about a key containing `NaN` — the one
 * input at which a wrong comparison here would be silent.
 *
 * A ROW IS KEPT BY ITS CONTENT throughout, which is why these cases `upsert`
 * where the block above holds: `hold` mints and the give-back asks the owner, so
 * a held-and-released address with nothing in it is gone by the next line. Only
 * the prefix case needs an address with no content, and it keeps its hold open
 * for exactly as long as it is asserting about it.
 */
describe('a chain of scalars is a key once', () => {
    /**
     * `oimSameSlotSequence`' body, spelled out. It cannot be CALLED with a scalar chain —
     * its element type refuses one, and `a-segment-that-is-not-an-object.type-test.ts`
     * is what keeps that true — so the rule it applies is written here instead,
     * to show what this arm would have concluded under it.
     */
    const byReference = (prev: readonly unknown[], next: readonly unknown[]): boolean => {
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) return false;
        return true;
    };

    const tallies = () => {
        const db = new OIMDB();
        const rowsService = createOIMEntityService<TTally, TOIMEntityColumnName<TTally>, TScalarChain, TTallyStore>(db, {
            entitySlotStoreService:
                new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMEntitySlot<TTally, TScalarChain>>(
                    OIMDefaults.KEY_TREE_WALK_SCALAR.getValue(),
                ),
            keyOf: (tally: TTally) => [tally.deck, tally.day],
        });
        return { rowsService, rows: rowsService.createStoreSlot(db) };
    };

    it('answers with the same slot for a list rebuilt from the same values', () => {
        const { rowsService, rows } = tallies();
        const first = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: 'mon', count: 1 });

        // A freshly built list of the same values — no interning anywhere.
        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(first);

        const other = rowsService.slotContentService.upsertEntity(rows, { deck: 'hearts', day: 'mon', count: 1 });
        expect(other).not.toBe(first);
        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(first);
        expect(rowsService.getSlotCount(rows)).toBe(2);
    });

    /**
     * A PREFIX IS NOT THE CHAIN, and each segment keeps its own type: `1` and
     * `'1'` are two segments, which no encoding of a list into one value gets
     * right without an argument about what a caller may produce.
     */
    it('keeps a chain, its prefix and a same-looking segment apart', () => {
        const { rowsService, rows } = tallies();
        const pair = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: 'mon', count: 1 });
        const numbered = rowsService.slotContentService.upsertEntity(rows, { deck: 1, day: 'mon', count: 1 });
        const stringy = rowsService.slotContentService.upsertEntity(rows, { deck: '1', day: 'mon', count: 1 });

        expect(numbered).not.toBe(stringy);

        // The prefix has no row to keep it, so the hold stays open across the
        // assertions that are about it.
        const prefixSlot = rowsService.holdSlotByKey(rows,['spades']);
        expect(prefixSlot).not.toBe(pair);
        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(pair);
        expect(rowsService.getSlotByKey(rows,['spades'])).toBe(prefixSlot);
        prefixSlot.owner.unholdSlot(prefixSlot);

        expect(oimIsSlotReleased(prefixSlot)).toBe(true);
        expect(rowsService.getSlotCount(rows)).toBe(3);
        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(pair);
    });

    it('is not moved by a caller refilling the array it was resolved from', () => {
        const { rowsService, rows } = tallies();
        const buffer: TOIMStoreKey[] = ['spades', 'mon'];
        const onMonday = rowsService.slotContentService.insertEntity(rows, buffer, { deck: 'spades', day: 'mon', count: 1 });

        // The caller reuses their buffer, which is the supported thing to do.
        buffer[1] = 'tue';
        const onTuesday = rowsService.slotContentService.insertEntity(rows, buffer, { deck: 'spades', day: 'tue', count: 1 });
        expect(onTuesday).not.toBe(onMonday);

        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(onMonday);
        expect(onMonday.key).toEqual(['spades', 'mon']);
    });

    it('finds a slot only at the chain it is at', () => {
        const { rowsService, rows } = tallies();
        const onMonday = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: 'mon', count: 1 });

        expect(rowsService.getSlotByKey(rows,['spades', 'mon'])).toBe(onMonday);

        for (const other of [['spades', 'tue'], ['hearts', 'mon'], ['spades']]) {
            expect(rowsService.getSlotByKey(rows,other)).not.toBe(onMonday);
        }
    });

    /**
     * THE ONE INPUT THE OTHER ARM'S ARGUMENT DOES NOT COVER.
     *
     * `NaN` arrives from `Number(undefined)`, from `Date.parse` on a string a
     * server sent, from a division whose denominator was missing — nobody writes
     * it on purpose, which is exactly why an address containing one has to
     * behave. The `Map` under each level files it like any other value, so the
     * descent finds the row; and the rule `oimSameSlotSequence` is entitled to use over identities
     * — reference equality, asserted here as the bare fact rather than by calling
     * it, since its element type refuses a scalar — says the opposite.
     */
    it('files a NaN segment where a reference comparison would lose it', () => {
        const { rowsService, rows } = tallies();
        const unknownDay = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: Number.NaN, count: 1 });

        expect(rowsService.getSlotByKey(rows,['spades', Number.NaN])).toBe(unknownDay);
        expect(byReference(unknownDay.key, ['spades', Number.NaN])).toBe(false);
        expect(unknownDay.key[1]).toBeNaN();

        // And `-0` is `0` here, as it is to a `Map` — the value `Object.is`
        // would have separated, trading this defect for the same one elsewhere.
        const zeroDay = rowsService.slotContentService.upsertEntity(rows, { deck: 'clubs', day: 0, count: 1 });
        expect(rowsService.getSlotByKey(rows,['clubs', -0])).toBe(zeroDay);
    });

    // Node pruning is not reachable through the aggregate, which keeps its store
    // private; it is measured on the service in what-a-composite-key-resolves-to.
    it('keeps a shared prefix while a sibling needs it, and lets the last key go', () => {
        const { rowsService, rows } = tallies();
        const monday = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: 'mon', count: 1 });
        const tuesday = rowsService.slotContentService.upsertEntity(rows, { deck: 'spades', day: 'tue', count: 1 });
        expect(rowsService.getSlotCount(rows)).toBe(2);

        rowsService.slotContentService.deleteEntity(monday);
        expect(oimIsSlotReleased(monday)).toBe(true);
        // The shared prefix is still standing, because the other key needs it.
        expect(rowsService.getSlotByKey(rows,['spades', 'tue'])).toBe(tuesday);
        expect(rowsService.getSlotCount(rows)).toBe(1);

        rowsService.slotContentService.deleteEntity(tuesday);
        expect(oimIsSlotReleased(tuesday)).toBe(true);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });
});
