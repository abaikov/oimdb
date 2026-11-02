import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMDefaultSlotStore } from '../../store/types/TOIMDefaultSlotStore';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type Card = { id: string; deck: string; rank: number };
type TCardRow = TOIMEntitySlot<Card, TOIMStoreKey>;
type TDeckSlots = TOIMBucketSlotsSetStore<TCardRow>;
type TDeckBucket = TOIMBucketSlot<TDeckSlots, string>;
type TCardStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<Card, TOIMStoreKey>>;

const effectService = OIMEffectService.INSTANCE;

const makeCards = (db: OIMDB) => {
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>() });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};

const makeIndex = (
    
    cardsService: ReturnType<typeof makeCards>['cardsService'],
    cards: TOIMStoreSlot<TCardStore, TOIMEntitySlot<Card, TOIMStoreKey>, Partial<Card>>,
) => {
    const byDeckService = createOIMSlotCollectionIndexService<
        Card, TOIMStoreKey, readonly ('id' | 'deck' | 'rank')[], string, TCardStore, TDeckSlots,
        OIMSetBucketContentService<TCardRow, string>
    >({
        entityService: cardsService,
        slotContentService: new OIMSetBucketContentService<TCardRow, string>(),
        keyOf: card => card.deck,
    });
    return { byDeckService, byDeck: byDeckService.createIndexStoreSlot(cards) };
};

type TByDeckService = ReturnType<typeof makeIndex>['byDeckService'];

/**
 * THE HOST FLUSHES ON THE SAME TICK. That is the whole fixture: everything else
 * here is the ordinary auto-index wiring the other suites use.
 */
const createFixture =() => {
    const db = new OIMDB({ channelScheduler: (run): void => { run(); } });
    const { cardsService, cards } = makeCards(db);
    const { byDeckService, byDeck } = makeIndex(cardsService, cards);
    return { db, cardsService, cards, byDeckService, byDeck };
};

const idsOf = (slots: readonly TCardRow[]): (string | undefined)[] =>
    slots.map((slot) => slot.entity?.id);

const readIds = (
    byDeckService: TByDeckService, bucket: TDeckBucket,
): (string | undefined)[] => idsOf(Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket)));

describe('a frame does not open in the middle of one logical change', () => {
    /**
     * The subscriber is not decoration: an effect on the derivation is what puts
     * a dependent on the COLLECTION, and a write only asks the host for a frame
     * when the identity it touched has one.
     */
    const watch = (
        db: OIMDB, byDeckService: TByDeckService, bucket: TDeckBucket,
    ): {
        seen: (string | undefined)[][];
        stop: () => void;
    } => {
        const seen: (string | undefined)[][] = [];
        const effect = effectService.createEffect(db, () => { seen.push(readIds(byDeckService, bucket)); }, [bucket]);
        db.flush();
        seen.length = 0;
        return { seen, stop: (): void => { effectService.disposeEffect(effect); } };
    };

    it('shows an index key a row inserted under a host that flushes on the same tick', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        const redSlot = byDeckService.holdSlotByKey(byDeck, 'red');
        const watcher = watch(db, byDeckService, redSlot);

        // ONE `upsert`, AND THE WHOLE FRAME HAPPENS INSIDE IT. The row's value
        // lands, the row joins the collection's bucket, and only then may a
        // frame open.
        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 });

        expect(readIds(byDeckService, redSlot)).toEqual(['a']);
        // Told once, with the row in the list: the frame ran on a settled world.
        expect(watcher.seen).toEqual([['a']]);

        watcher.stop();
        redSlot.owner.unholdSlot(redSlot);
    });

    it('does not lose the row for ever when a later write wakes the same index', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        const redSlot = byDeckService.holdSlotByKey(byDeck, 'red');
        const watcher = watch(db, byDeckService, redSlot);

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 });
        // A SECOND, UNRELATED ROW. It advances the collection, so the derivation
        // is behind its source and settles again — the settle that confirms the
        // loss rather than repairing it, because a stale 'a' sends the walk to a
        // previous answer that never named it.
        cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', deck: 'blue', rank: 2 });

        expect(readIds(byDeckService, redSlot)).toEqual(['a']);

        watcher.stop();
        redSlot.owner.unholdSlot(redSlot);
    });

    it('leaves a deferring host exactly as it was', () => {
        // THE GUARD. The change span must not swallow a frame or add one: a host
        // that defers sees the same single flush it always did.
        const pending: (() => void)[] = [];
        const db = new OIMDB({ channelScheduler: (run): void => { pending.push(run); } });
        const { cardsService, cards } = makeCards(db);
        const { byDeckService, byDeck } = makeIndex(cardsService, cards);
        const redSlot = byDeckService.holdSlotByKey(byDeck, 'red');
        const watcher = watch(db, byDeckService, redSlot);
        pending.length = 0;

        cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'red', rank: 1 });
        cardsService.writeSlotContentByKey(cards, 'c', { id: 'c', deck: 'red', rank: 3 });

        // One frame asked for, however many writes.
        expect(pending).toHaveLength(1);
        pending[0]();
        expect(readIds(byDeckService, redSlot)).toEqual(['a', 'c']);
        expect(watcher.seen).toEqual([['a', 'c']]);

        watcher.stop();
        redSlot.owner.unholdSlot(redSlot);
    });
});
