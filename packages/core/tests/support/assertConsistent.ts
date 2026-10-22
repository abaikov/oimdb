import type { TOIMColumnSlot } from '../../src/engine/column/types/TOIMColumnSlot';
import type {
    TOIMBucketSlot,
    TOIMEntitySlot,
} from '../../src/index';

/**
 * Is the engine still internally consistent?
 *
 * Not "is the answer right" — that is what a test with an oracle asks, and it
 * only catches what its author thought to look at. This asks the other
 * question: are the structures still telling the same story about each other.
 * It needs no knowledge of what the caller was trying to do, so it catches
 * corruption whatever produced it, including operations nobody wrote a test
 * for.
 *
 * Call it after a flush, from any test. Hand it the entity collection under
 * test and every bucket collection built over it.
 *
 * ─── WHY IT DOES NOT RECONSTRUCT A COUNT ───────────────────────────────────
 *
 * `holdCount` is every counted reference nothing else
 * records — a hold taken by hand (`hold`), a composite-key edge
 * (`OIMKeyTreeWalkComposite`) and a slot's place in a bucket — and the first
 * two leave NO structure anywhere for a walk to find them in. So there is no
 * walk that rebuilds the number, and a reconstruction that pretended otherwise
 * would report every hand-held slot and every composite-key segment as
 * corruption.
 * See `TOIMSlot.holdCount` and `tests/which-side-of-a-slot-owns-which-part.test.ts`,
 * whose `hold` side names every file allowed to write it — that is what
 * measures the count, from the write sites, where a census can be exact.
 *
 * WHAT SURVIVES IS THE ONE-DIRECTIONAL HALF, which is sound and is still the
 * failure that mattered: a slot's place in a bucket IS a counted reference, so
 * a slot a live bucket holds must have `holdCount > 0`. That catches the lost
 * decrement's mirror — a link with no count — without claiming to know what the
 * other references are. The other direction (a count with no link) is
 * unrecoverable and is not asserted here.
 *
 * ─── AND THE CHECKS THAT NEED NO COUNT AT ALL ─────────────────────────────
 *
 * A bucket's own storage against what its collection answers about it, the
 * identity filed at a key against the identity a bucket is holding under that
 * key, and an identity nothing keeps still sitting in its store. None of those
 * needs a reconstruction; each is two structures asked the same question.
 *
 * THE PRECONDITION: the bucket collections handed over must hold slots OF the
 * collection handed over. A bucket of somebody else's slots reads here as a slot
 * the collection has dropped.
 *
 * What it deliberately does NOT check: anything requiring a model of what the
 * data ought to be. Consistency is a property of the engine alone.
 */

/**
 * `getBucketSlotByKey` takes `never` because this file never builds a key: it only ever
 * asks about one a bucket is already carrying, so the ask can never mint.
 */
export type TBucketsUnderTest = {
    readonly bucketSlots: Iterable<TOIMBucketSlot>;
    getBucketSlotByKey(key: never): TOIMBucketSlot;
    getBucketMemberSlots(bucketSlot: TOIMBucketSlot): Iterable<TOIMEntitySlot>;
    getBucketMemberSlotCount(bucketSlot: TOIMBucketSlot): number;
};

export type TEntitiesUnderTest<TKey, TEntity extends object> = {
    readonly entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>;
    getEntitySlotByKey(key: TKey): TOIMEntitySlot<TEntity, TKey>;
};

export const entitiesUnderTest = <TKey, TEntity extends object, TStoreSlot>(
    entityService: {
        getSlots(storeSlot: TStoreSlot): Iterable<TOIMEntitySlot<TEntity, TKey>>;
        getSlotByKey(storeSlot: TStoreSlot, key: TKey): TOIMEntitySlot<TEntity, TKey>;
    },
    entityStoreSlot: TStoreSlot,
): TEntitiesUnderTest<TKey, TEntity> => ({
    get entitySlots() { return Array.from(entityService.getSlots(entityStoreSlot)); },
    getEntitySlotByKey: key => entityService.getSlotByKey(entityStoreSlot, key),
});

export const bucketsUnderTest = <TKey, TBucketSlot extends TOIMBucketSlot, TStoreSlot>(
    bucketService: {
        getSlots(storeSlot: TStoreSlot): Iterable<TBucketSlot>;
        getSlotByKey(storeSlot: TStoreSlot, key: TKey): TBucketSlot;
        getBucketMemberSlots(bucketSlot: TBucketSlot): Iterable<TOIMEntitySlot>;
        getBucketMemberSlotCount(bucketSlot: TBucketSlot): number;
    },
    bucketStoreSlot: TStoreSlot,
): TBucketsUnderTest => ({
    get bucketSlots() { return Array.from(bucketService.getSlots(bucketStoreSlot)); },
    getBucketSlotByKey: key => bucketService.getSlotByKey(bucketStoreSlot, key),
    getBucketMemberSlots: bucketSlot => bucketService.getBucketMemberSlots(bucketSlot as TBucketSlot),
    getBucketMemberSlotCount: bucketSlot => bucketService.getBucketMemberSlotCount(bucketSlot as TBucketSlot),
});

/** Is anything at all pointing at this identity — `hasReference`, from outside. */
const hasReference = (entitySlot: TOIMEntitySlot): boolean =>
    entitySlot.holdCount > 0 || (entitySlot.effects !== undefined && entitySlot.effects.length > 0);

/**
 * Is a column of this slot referred to — the term
 * `OIMSlotOwnerService.isReleasable` asks beside the value, written out here
 * because that method is private.
 */
const hasReferencedColumn = (entitySlot: TOIMEntitySlot): boolean => {
    const columnSlotStore = entitySlot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined;
    if (columnSlotStore === undefined) return false;
    for (const columnSlot of columnSlotStore.values()) {
        if (columnSlot.holdCount > 0) return true;
        if (columnSlot.effects !== undefined && columnSlot.effects.length > 0) return true;
    }
    return false;
};

export const assertConsistent = <TKey, TEntity extends object>(
    entities: TEntitiesUnderTest<TKey, TEntity>,
    bucketsList: readonly TBucketsUnderTest[] = [],
    label = 'after this step',
): void => {
    const problems: string[] = [];

    for (const buckets of bucketsList) {
        const bucketContentService = buckets;
        for (const bucketSlot of Array.from(buckets.bucketSlots)) {
            // Only a bucket with a key can be looked up by that key. One minted
            // under no key — a single bucket — has none, which is the point of
            // it, and its slots are still checked below.
            if (bucketSlot.key !== undefined
                && buckets.getBucketSlotByKey(bucketSlot.key as never) !== bucketSlot) {
                problems.push(
                    `a bucket named ${String(bucketSlot.key)} is in the collection's own store but asking `
                    + 'that store for the key answers with something else. Two live buckets under one '
                    + 'name is a view that renders empty for whoever resolves it late.',
                );
            }

            const entitySlots = Array.from(bucketContentService.getBucketMemberSlots(bucketSlot));
            if (bucketContentService.getBucketMemberSlotCount(bucketSlot) !== entitySlots.length) {
                problems.push(
                    `a bucket says it holds ${bucketContentService.getBucketMemberSlotCount(bucketSlot)} slot(s) and hands back `
                    + `${entitySlots.length}. The count and the walk are the same list of slots read twice, `
                    + 'and a consumer sizing a list by one and rendering it from the other reads short for ever.',
                );
            }

            for (const entitySlot of entitySlots) {
                // A SLOT'S PLACE IN A BUCKET IS A COUNTED REFERENCE.
                if (entitySlot.holdCount <= 0) {
                    problems.push(
                        `a bucket holds the slot at ${String(entitySlot.key)} and that slot's holdCount is `
                        + `${entitySlot.holdCount}. A slot in a bucket takes a hold and gives it back when it `
                        + 'leaves, so a slot at zero is a reference the engine has already forgotten it owes.',
                    );
                }
                if (entities.getEntitySlotByKey(entitySlot.key as TKey) !== entitySlot) {
                    problems.push(
                        `a bucket holds a slot at ${String(entitySlot.key)} that the collection does not file `
                        + 'under that key. A bucket keeps the slots it holds, so a bucket can never legally '
                        + 'hold an identity its collection has let go of or replaced.',
                    );
                }
            }
        }
    }

    /** Every identity the collection is holding, and what it claims about itself. */
    for (const entitySlot of Array.from(entities.entitySlots)) {
        if (entitySlot.entity === undefined && !hasReference(entitySlot) && !hasReferencedColumn(entitySlot)) {
            problems.push(
                `the collection is still holding the identity at ${String(entitySlot.key)}, which has no value, `
                + 'no hold, no effect and no referred column. An identity lives exactly as long as its '
                + 'content, a hold or a dependent keeps it.',
            );
        }
    }

    if (problems.length > 0) {
        throw new Error(`${label}: the engine contradicts itself.\n  - ${problems.join('\n  - ')}`);
    }
};
