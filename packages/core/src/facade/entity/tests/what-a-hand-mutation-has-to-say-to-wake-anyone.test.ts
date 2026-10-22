import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotReleasePolicyAfterWrite } from '../../../engine/collector/OIMSlotReleasePolicyAfterWrite';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlotEditable } from '../../../engine/slot/types/TOIMSlotEditable';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';

type TCard = { id: string; title: string; rank: number };

const KEEP_AFTER_WRITE_MS = 60_000;

function createFixture() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one', rank: 1 });
    db.flush();
    const card = cardsService.getSlotByKey(cards, 'c1');
    const watch = (name: TOIMEntityColumnName<TCard>) => {
        let runCount = 0;
        const effect = effectService.createEffect(db, [cardsService.holdColumn(card, name)], [], () => { runCount++; });
        db.flush();
        return { seen: () => runCount, since: runCount, effect };
    };
    const byHand = (change: (entity: TCard) => void) => {
        change(card.entity as TCard);
    };
    return { db, effectService, cardsService, card,watch, byHand };
}

describe('what a hand mutation has to say to wake anyone', () => {
    it('wakes nobody on its own, because nothing was told', () => {
        const { db, effectService, watch, byHand } = createFixture();
        const title = watch('title');

        byHand(entity => { entity.title = 'two'; });
        db.flush();

        expect(title.seen()).toBe(title.since);
        effectService.disposeEffect(title.effect);
    });

    it('wakes the named column and leaves the others alone', () => {
        const { db, effectService, cardsService, card,watch, byHand } = createFixture();
        const title = watch('title');
        const rank = watch('rank');

        byHand(entity => { entity.title = 'two'; });
        cardsService.slotContentService.markEntityChanged(card, ['title']);
        db.flush();

        expect(title.seen()).toBe(title.since + 1);
        expect(rank.seen()).toBe(rank.since);
        effectService.disposeEffect(title.effect);
        effectService.disposeEffect(rank.effect);
    });

    it('with no list, wakes every column somebody watches', () => {
        const { db, effectService, cardsService, card,watch, byHand } = createFixture();
        const title = watch('title');
        const rank = watch('rank');

        byHand(entity => { entity.title = 'two'; entity.rank = 2; });
        cardsService.slotContentService.markEntityChanged(card);
        db.flush();

        expect(title.seen()).toBe(title.since + 1);
        expect(rank.seen()).toBe(rank.since + 1);
        effectService.disposeEffect(title.effect);
        effectService.disposeEffect(rank.effect);
    });

    it('wakes the row itself, so an effect on the slot sees the hand mutation', () => {
        const { db, effectService, cardsService, card,byHand } = createFixture();
        let runCount = 0;
        const watching = effectService.createEffect(db, [card], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        byHand(entity => { entity.title = 'two'; });
        cardsService.slotContentService.markEntityChanged(card, ['title']);
        db.flush();

        expect(runCount).toBe(before + 1);
        effectService.disposeEffect(watching);
    });

    it('an empty list says nothing moved, so it wakes nobody — not even the row', () => {
        const { db, effectService, cardsService, card,watch } = createFixture();
        const title = watch('title');
        let rowWoke = 0;
        const watchingTheRow = effectService.createEffect(db, [card], [], () => { rowWoke++; });
        db.flush();
        const rowBefore = rowWoke;

        cardsService.slotContentService.markEntityChanged(card, []);
        db.flush();

        expect(title.seen()).toBe(title.since);
        expect(rowWoke).toBe(rowBefore);
        effectService.disposeEffect(title.effect);
        effectService.disposeEffect(watchingTheRow);
    });

    it('defers the after-write deadline, so the clock does not evict a row somebody just edited', () => {
        let nowMs = 1_000;
        const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer: () => () => undefined });
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, {
            keyOf: card => card.id,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: KEEP_AFTER_WRITE_MS }),
        });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one', rank: 1 });
        db.flush();
        const dueAfterTheWrite = card.releaseDueAfterWriteMs;

        nowMs += KEEP_AFTER_WRITE_MS - 1;
        (card.entity as TCard).title = 'two';
        cardsService.slotContentService.markEntityChanged(card, ['title']);

        expect(card.releaseDueAfterWriteMs).toBe(nowMs + KEEP_AFTER_WRITE_MS);
        expect(card.releaseDueAfterWriteMs).toBeGreaterThan(dueAfterTheWrite);
    });

    it('re-stamps emptiness, so a hand mutation that emptied the row does not leave isEmpty lying', () => {
        const { db, cardsService, card } = createFixture();
        (card as TOIMSlotEditable<TOIMEntitySlot<TCard, string>>).entity = undefined;

        cardsService.slotContentService.markEntityChanged(card);
        db.flush();

        expect(oimIsSlotEmpty(card)).toBe(true);
    });
});
