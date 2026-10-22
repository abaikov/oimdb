import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { OIMEffectService } from '../../../computed/OIMEffectService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';

type Card = { id: string; rank: number };

type TCardSlot = TOIMEntitySlot<Card>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const PAGE = 1000;

const idsOf = (slots: Iterable<TCardSlot>): string[] => Array.from(slots, s => s.entity!.id);

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const makeSlot = (id: string, rank: number): TCardSlot => cardsService.slotContentService.upsertEntity(cards, { id, rank });
    const shuffledPage = (): TCardSlot[] => {
        const slots: TCardSlot[] = [];
        for (let i = 0; i < PAGE; i++) slots.push(makeSlot(`c${i}`, (i * 7919) % PAGE));
        return slots;
    };
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
    const decksService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
    >(db, { slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    return { db, effectService, makeSlot, shuffledPage, membersService, decksService, decks };
};

describe('a page re-sent with one new entity, written through the bucket store', () => {
    it('leaves every survivor holding exactly the one entry it held before', () => {
        const { makeSlot, shuffledPage, membersService, decksService, decks } = createFixture();
        const page = shuffledPage();
        const bucket = decksService.holdSlotByKey(decks, 'page-1');
        membersService.writeBucketMemberSlots(bucket, page);

        const addition = makeSlot('added', 4242);
        membersService.writeBucketMemberSlots(bucket, [...page, addition]);

        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(idsOf([...page, addition]));
        for (let i = 0; i < page.length; i++) expect(page[i].holdCount).toBe(1);
        expect(addition.holdCount).toBe(1);
    });

    it('hands a departed slot its hold back and leaves the rest alone', () => {
        const { shuffledPage, membersService, decksService, decks } = createFixture();
        const page = shuffledPage();
        const bucket = decksService.holdSlotByKey(decks, 'page-1');
        membersService.writeBucketMemberSlots(bucket, page);

        const dropped = page[0];
        membersService.writeBucketMemberSlots(bucket, page.slice(1));

        expect(dropped.holdCount).toBe(0);
        for (let i = 1; i < page.length; i++) expect(page[i].holdCount).toBe(1);
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toHaveLength(PAGE - 1);
    });
});

describe('a write through the bucket store reaches the subscriber', () => {
    it('runs an effect on the bucket it changed', () => {
        const { db, effectService, makeSlot, membersService, decksService, decks } = createFixture();
        const heldSlot = decksService.holdSlotByKey(decks, 'page-1');
        let runs = 0;
        const effect = effectService.createEffect(db, [heldSlot], [], () => { runs++; });
        db.flush();
        const before = runs;

        membersService.writeBucketMemberSlots(heldSlot, [makeSlot('a', 1), makeSlot('b', 2)]);
        db.flush();

        expect(runs).toBe(before + 1);
        effectService.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('says nothing for a write that changed nothing', () => {
        const { db, effectService, makeSlot, membersService, decksService, decks } = createFixture();
        const a = makeSlot('a', 1);
        const heldSlot = decksService.holdSlotByKey(decks, 'page-1');
        membersService.writeBucketMemberSlots(heldSlot, [a]);
        let runs = 0;
        const effect = effectService.createEffect(db, [heldSlot], [], () => { runs++; });
        db.flush();
        const before = runs;

        membersService.writeBucketMemberSlots(heldSlot, [a]);
        db.flush();

        expect(runs).toBe(before);
        effectService.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('runs the effect for the same slots re-sent in another order', () => {
        const { db, effectService, makeSlot, membersService, decksService, decks } = createFixture();
        const a = makeSlot('a', 1);
        const b = makeSlot('b', 2);
        const heldSlot = decksService.holdSlotByKey(decks, 'page-1');
        membersService.writeBucketMemberSlots(heldSlot, [a, b]);
        let runs = 0;
        const effect = effectService.createEffect(db, [heldSlot], [], () => { runs++; });
        db.flush();
        const before = runs;

        membersService.writeBucketMemberSlots(heldSlot, [b, a]);
        db.flush();

        expect(runs).toBe(before + 1);
        expect(idsOf(membersService.getBucketMemberSlots(heldSlot))).toEqual(['b', 'a']);
        effectService.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('refuses a write made while a frame is running', () => {
        const { db, effectService, makeSlot, membersService, decksService, decks } = createFixture();
        const heldSlot = decksService.holdSlotByKey(decks, 'page-1');
        let refusal: unknown;
        const first = makeSlot('a', 1);
        const second = makeSlot('b', 2);
        const effect = effectService.createEffect(db, [heldSlot], [], () => {
            try {
                membersService.writeBucketMemberSlots(heldSlot, [first]);
            } catch (thrown) {
                refusal = thrown;
            }
        });
        db.flush();
        membersService.writeBucketMemberSlots(heldSlot, [second]);
        db.flush();

        expect(refusal).toBeInstanceOf(Error);
        effectService.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
