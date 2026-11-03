/**
 * ONE SHAPE, AND NEVER ONE OWNER — what `IOIMBucketMemberSlotsArrayService` says about the
 * class that implements it, and the much larger thing it must never be read as
 * saying.
 *
 * `OIMSubscriberStore` and `OIMSetBucketContentService` were written apart and
 * arrived at the same object: a `Set` living on a field of somebody else's
 * struct, private to its owner, with entry, exit and a count offered publicly.
 * `src/bucket/array/interfaces/IOIMBucketMemberSlotsArrayService.ts` names that, and naming
 * it is the entire change — the shape is shared and NOTHING ELSE IS.
 *
 * A slot's dependents are a plain `TOIMEffect[]` on `TOIMSlot.effects`, written
 * by `OIMEffectService`'s `createEffect` and `disposeEffect` and by nothing else. The rule
 * is asserted of the bucket service — each method is handed a carrier declaring
 * BOTH owners' fields and must come back having touched only its own — and the
 * other half is pinned STATICALLY, by the slot census in
 * `which-side-of-a-slot-owns-which-part.test.ts`, which names the files allowed
 * to write `effects` and `holdCount`.
 *
 * That distinction is the reason this file exists rather than the interface
 * being left to speak for itself. "These implement one interface" is one short
 * step from "so either may write what the other holds", and the census prices
 * that step in its header: every counted reference is one number, `holdCount`,
 * so one side permitted to move it on another side's behalf counts one
 * reference twice and pins the slot for the life of the process, with no throw
 * and no failing test.
 *
 * "MINTED LAZILY" IS NOT PART OF THE SHARED SENTENCE. The service's set comes
 * from `createStore()`, which HANDS THE STORAGE BACK and writes no field at all,
 * so a bucket is born holding it and the service mints nothing ever. That is
 * asserted below, and it is the whole of what "one shape" was never allowed to
 * imply.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OIMSetBucketContentService } from '../src/bucket/OIMSetBucketContentService';
import type { TOIMBucketSlot } from '../src/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../src/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsSetStore } from '../src/bucket/types/TOIMBucketSlotsSetStore';

class OIMBucketSlotsServiceSetDriven extends OIMSetBucketContentService<TOIMEntitySlot> {
    public createStore(): TOIMBucketSlotsSetStore<TOIMEntitySlot> { return this.createBucketMemberSlotsStore(); }

    public override addSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>>, bucketMemberSlot: TOIMEntitySlot): boolean {
        return super.addSlot(bucketSlot, bucketMemberSlot);
    }

    public override removeSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>>, bucketMemberSlot: TOIMEntitySlot): number {
        return super.removeSlot(bucketSlot, bucketMemberSlot);
    }

    public hasSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>>, bucketMemberSlot: TOIMEntitySlot): boolean {
        return this.hasBucketMemberSlot(bucketSlot, bucketMemberSlot);
    }

    public getSlotCount(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>>): number {
        return this.getBucketMemberSlotCount(bucketSlot);
    }
}

const SRC = join(__dirname, '..', 'src');
const sourceOf = (path: string): string => readFileSync(join(SRC, path), 'utf8');

/**
 * A struct declaring BOTH owners' fields, so that "touched only its own" is a
 * question with a visible answer rather than an absence.
 *
 * The second field is `effects` rather than `subscribers`: that is where a
 * slot's dependents live now, and it is the field the OTHER side of this rule
 * owns. The service never reads anything but `bucketSlotsStore`, so this stands in for a
 * bucket without a channel being built to produce one.
 */
type TBothFields = { bucketSlotsStore: unknown; effects: unknown };
const carrier = (bucketSlotsStore: unknown = undefined): TBothFields => ({ bucketSlotsStore, effects: undefined });

const asBucket = (both: TBothFields): TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>> =>
    both as unknown as TOIMBucketSlot<TOIMBucketSlotsSetStore<TOIMEntitySlot>>;
/** The unordered service never reads a slot, only files it. */
const anySlot = (): TOIMEntitySlot => ({} as unknown as TOIMEntitySlot);

describe('the shape the surviving store keeps', () => {
    it('the unordered service puts an item in, answers for it, and takes it out', () => {
        const service = new OIMBucketSlotsServiceSetDriven();
        // BORN HOLDING ITS STORAGE, which is what `createStore` handing
        // the container back means.
        const bucket = asBucket(carrier(service.createStore()));
        const slot = anySlot();

        expect(service.hasSlot(bucket, slot)).toBe(false);
        service.addSlot(bucket, slot);
        expect(service.hasSlot(bucket, slot)).toBe(true);
        service.removeSlot(bucket, slot);
        expect(service.hasSlot(bucket, slot)).toBe(false);
    });

    /**
     * `hasSlot` and the count are two questions and cannot disagree — and they are
     * asked here under the name this class keeps, `getSlotCount`, which is the
     * one member the shared role `IOIMBucketMemberSlotsArrayService` deliberately does not
     * declare: a slot no caller reaches through it does not belong on it.
     */
    it('the count agrees with the item-keyed read', () => {
        const service = new OIMBucketSlotsServiceSetDriven();
        const bucket = asBucket(carrier(service.createStore()));
        const slot = anySlot();

        service.addSlot(bucket, slot);
        expect(service.getSlotCount(bucket)).toBe(1);
        expect(service.hasSlot(bucket, slot)).toBe(true);
        service.removeSlot(bucket, slot);
        expect(service.getSlotCount(bucket)).toBe(0);
    });

    /**
     * WHO MAKES THE CONTAINER is NOT part of the shared shape, and THIS STORE
     * DOES NOT.
     *
     * `createStore()` returns a `Set` and writes nothing; whoever files the
     * bucket puts it on. So a bucket that never got one is not repaired by
     * asking a question of it: every method here reaches `bucket.bucketSlotsStore` and a
     * carrier without one throws, rather than growing a container silently and
     * answering out of it. The refusal is the ordinary one a missing container
     * gives; what is asserted is that the call did not QUIETLY make one.
     */
    it('the service makes no storage of its own, on any door', () => {
        const service = new OIMBucketSlotsServiceSetDriven();
        const untouched = carrier();

        expect(() => service.hasSlot(asBucket(untouched), anySlot())).toThrow();
        expect(() => service.addSlot(asBucket(untouched), anySlot())).toThrow();
        expect(untouched.bucketSlotsStore).toBeUndefined();

        // And what it hands back on the door that DOES make one is a container
        // and not a write: the caller is holding it, the carrier is not.
        expect(service.createStore()).toBeInstanceOf(Set);
        expect(untouched.bucketSlotsStore).toBeUndefined();
    });
});

/**
 * THE LINE. The store is handed a carrier holding both fields and must leave the
 * other's alone — the runtime half of the rule the slot census pins statically.
 */
describe('a shared shape is not a shared domain', () => {
    it('the unordered service writes into the slots it was handed and neither field', () => {
        const service = new OIMBucketSlotsServiceSetDriven();
        const bucketSlotsSetStore = service.createStore();
        const both = carrier(bucketSlotsSetStore);
        service.addSlot(asBucket(both), anySlot());

        // The container stays exactly the object it was handed, by identity:
        // the service fills it and never replaces it.
        expect(both.bucketSlotsStore).toBe(bucketSlotsSetStore);
        expect(bucketSlotsSetStore.size).toBe(1);
        expect(both.effects).toBeUndefined();
    });

    /**
     * And the accessors are not on the interface, so nothing about implementing
     * it hands anyone the container. Every member takes the store and hands
     * back a result, never the store: a new member arriving here is a decision,
     * and `storage`, `getStore`, `init` and `mint` are kept OFF on purpose.
     */
    it('the interface declares the member slots and no way to reach a field', () => {
        const declared = [...sourceOf('bucket/array/interfaces/IOIMBucketMemberSlotsArrayService.ts')
            .matchAll(/^ {4}([a-z]\w*)\(/gm)].map(match => match[1]);
        expect(declared).toEqual([
            'createBucketSlotsArrayStore', 'hasBucketMemberSlot', 'appendBucketMemberSlot', 'insertBucketMemberSlotAt',
            'removeBucketMemberSlot', 'removeBucketMemberSlotAt', 'removeBucketMemberSlotRange', 'removeBucketMemberSlots',
            'moveBucketMemberSlotRange', 'sortBucketMemberSlots', 'isSameBucketMemberSlotSequence', 'clearBucketMemberSlots',
        ]);
        expect(declared.filter(name => /^(?:storage|getStore|init|mint)/.test(name))).toEqual([]);
    });
});

/**
 * The two properties the change promised and that nothing else here would notice
 * losing.
 */
describe('what naming the shape was not allowed to cost', () => {
    /**
     * The add of a set bucket goes from the content service to the set service, the sole
     * writer of the set, and from there straight to the set: one monomorphic call more than
     * when the content service wrote the set itself, and never through an `ensure(carrier)`
     * that would own a lazy write.
     */
    it('the unordered add reaches the set through the set service, with no ensure between', () => {
        const contentSource = sourceOf('bucket/OIMSetBucketContentService.ts');
        const setSource = sourceOf('bucket/set/OIMBucketMemberSlotsSetService.ts');
                expect(contentSource).toContain('return this.bucketMemberSlotsSetService.addBucketMemberSlot(peekOIMBucketSlotsSetStore(bucketSlot), bucketMemberSlot);');
        expect(setSource).toContain('(bucketSlotsSetStore as Set<TBucketMemberSlot>).add(bucketMemberSlot);');
        expect(contentSource).not.toContain('ensure(');
        expect(setSource).not.toContain('ensure(');
    });

    /**
     * `import type` is erased; `import` is a module every consumer ships. The
     * exact-list assertion in `what-an-import-retains.test.ts` covers the entry
     * points it names; this is where the surviving implementor's half is stated,
     * because nothing else in the suite would notice it changing.
     */
    it('the array member service names the interface as a type', () => {
        expect(sourceOf('bucket/array/OIMBucketMemberSlotsArrayService.ts'))
            .toContain("import type { IOIMBucketMemberSlotsArrayService } from './interfaces/IOIMBucketMemberSlotsArrayService';");
    });
});
